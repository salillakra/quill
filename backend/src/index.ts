import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import { env, isDemoMode } from "./config/env";
import { prisma } from "./config/db";
import { redis } from "./config/redis";
import { ensurePineconeIndex } from "./config/pinecone";
import { ensureDemoWorkspace } from "./services/workspace.service";
import { prometheusText } from "./services/metrics.service";
import { metricsAuthDenied } from "./middleware/metrics-auth";
import { correlationMiddleware } from "./middleware/correlation";
import { metricsMiddleware } from "./middleware/metrics";
import { errorHandler } from "./middleware/error";
import { logger } from "./utils/logger";
import { SocketManager } from "./socket/socket";
import { authRouter } from "./routes/auth.route";
import { documentsRouter } from "./routes/documents.route";
import { jobsRouter } from "./routes/jobs.route";
import { extractionRouter } from "./routes/extraction.route";
import { generationRouter } from "./routes/generation.route";
import { ragRouter } from "./routes/rag.route";
import { papersRouter } from "./routes/papers.route";
import { analyticsRouter } from "./routes/analytics.route";
import { healthRouter } from "./routes/health.route";
import { campusRouter } from "./routes/campus.route";
import { assessmentRouter } from "./routes/assessment.route";
import { startIngestWorker } from "./workers/ingest.worker";
import { startExtractWorker } from "./workers/extract.worker";
import { startGenerateWorker } from "./workers/generate.worker";
import { startGradeWorker } from "./workers/grade.worker";
import { isR2Enabled } from "./services/storage.service";

const app = new Hono();
const io = new Server({ cors: { origin: env.FRONTEND_URL, methods: ["GET", "POST"], credentials: true } });
const engine = new Engine();
io.bind(engine);
SocketManager.init(io);

app.use("*", correlationMiddleware);
app.use("*", metricsMiddleware);
app.use("*", cors({ origin: env.FRONTEND_URL, credentials: true }));
app.onError(errorHandler);

app.get("/", (c) =>
  c.json({
    service: "quill-api",
    status: "ok",
    mode: isDemoMode ? "demo (no GEMINI_API_KEY)" : "live (Gemini)",
    time: new Date().toISOString(),
  }),
);

// Secure /metrics endpoint with basic auth (for Prometheus scraper)
app.get("/metrics", async (c) => {
  const denied = metricsAuthDenied(c);
  if (denied) return denied;
  const body = await prometheusText();
  return c.body(body, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
});

app.route("/api/auth", authRouter);
app.route("/api/documents", documentsRouter);
app.route("/api/jobs", jobsRouter);
app.route("/api/documents", extractionRouter);
app.route("/api/documents", generationRouter);
app.route("/api/documents", ragRouter);
app.route("/api/analytics", analyticsRouter);
app.route("/api/papers", papersRouter);
app.route("/api/campus", campusRouter);
app.route("/api/assessment", assessmentRouter);
app.route("/api", healthRouter);

// Store worker references for graceful shutdown
let ingestWorker: ReturnType<typeof startIngestWorker>;
let extractWorker: ReturnType<typeof startExtractWorker>;
let generateWorker: ReturnType<typeof startGenerateWorker>;
let gradeWorker: ReturnType<typeof startGradeWorker>;

async function main() {
  await prisma.$connect();
  await ensureDemoWorkspace();
  await ensurePineconeIndex();

  if (!isDemoMode) logger.info("AI provider: Gemini (live mode)");
  else logger.warn("AI provider: DEMO MODE — no GEMINI_API_KEY; extraction/generation/embeddings are deterministic offline stand-ins");

  ingestWorker = startIngestWorker();
  extractWorker = startExtractWorker();
  generateWorker = startGenerateWorker();
  gradeWorker = startGradeWorker();

  logger.info(
    isR2Enabled()
      ? `Object storage: R2 bucket ${env.R2_BUCKET_NAME}`
      : `Object storage: local ${env.UPLOAD_DIR}`,
  );
  logger.info(`Quill API ready on :${env.PORT} (${env.NODE_ENV})`);
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Close BullMQ workers (wait for in-progress jobs to complete, then force close after 30s)
  const shutdownTimeout = 30000;
  const workerPromises = [
    ingestWorker?.close().then(() => logger.info("Ingest worker closed")).catch((e: unknown) => logger.error("Error closing ingest worker", { error: (e as Error).message })),
    extractWorker?.close().then(() => logger.info("Extract worker closed")).catch((e: unknown) => logger.error("Error closing extract worker", { error: (e as Error).message })),
    generateWorker?.close().then(() => logger.info("Generate worker closed")).catch((e: unknown) => logger.error("Error closing generate worker", { error: (e as Error).message })),
    gradeWorker?.close().then(() => logger.info("Grade worker closed")).catch((e: unknown) => logger.error("Error closing grade worker", { error: (e as Error).message })),
  ];

  // Close Socket.IO
  const socketPromise = new Promise<void>((resolve) => {
    io.close(() => {
      logger.info("Socket.IO closed");
      resolve();
    });
  });

  // Close Prisma
  const prismaPromise = prisma.$disconnect().then(() => logger.info("Prisma disconnected")).catch((e: unknown) => logger.error("Error disconnecting Prisma", { error: (e as Error).message }));

  // Close Redis
  const redisPromise = (async () => {
    try {
      await redis.quit();
      logger.info("Redis disconnected");
    } catch (e) {
      logger.error("Error disconnecting Redis", { error: (e as Error).message });
    }
  })();

  // Wait for all to complete with timeout
  await Promise.race([
    Promise.all([...workerPromises, socketPromise, prismaPromise, redisPromise]),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Shutdown timeout")), shutdownTimeout)),
  ]).catch((err) => {
    logger.error("Shutdown error", { error: err instanceof Error ? err.message : String(err) });
  });

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  logger.error("Fatal boot error", { error: err.message, stack: err.stack });
  process.exit(1);
});

const { websocket } = engine.handler();

export default {
  port: env.PORT,
  idleTimeout: 60,
  fetch(req: Request, server: any) {
    const url = new URL(req.url);
    if (url.pathname === "/socket.io" || url.pathname.startsWith("/socket.io/")) {
      return engine.handleRequest(req, server);
    }
    return app.fetch(req, server);
  },
  websocket,
};
