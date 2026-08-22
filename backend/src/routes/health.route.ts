import { Hono } from "hono";
import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { pineconeStats } from "../services/pinecone.service";
import { prometheusText } from "../services/metrics.service";
import { metricsAuthDenied } from "../middleware/metrics-auth";
import { EMBED_DIM } from "../lib/demo";
import { ok } from "../utils/response";

export const healthRouter = new Hono();

// Liveness probe - minimal check, just confirms process is running
healthRouter.get("/health/live", (c) => c.json(ok({ status: "ok", uptime: process.uptime() })));

// Readiness probe - checks all dependencies
healthRouter.get("/health/ready", async (c) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "down";
  }
  try {
    const stats = await pineconeStats();
    checks.pinecone = stats.dimension && stats.dimension !== EMBED_DIM ? "dim-mismatch" : "ok";
  } catch {
    checks.pinecone = "down";
  }
  const ready = checks.database === "ok" && checks.redis === "ok" && checks.pinecone === "ok";
  return c.json(ok({ ready, checks }), ready ? 200 : 503);
});

// Legacy endpoint for backwards compatibility
healthRouter.get("/health", (c) => c.json(ok({ status: "ok", uptime: process.uptime() })));

healthRouter.get("/metrics", async (c) => {
  const denied = metricsAuthDenied(c);
  if (denied) return denied;
  const body = await prometheusText();
  return c.body(body, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
});

// Legacy endpoint for backwards compatibility
healthRouter.get("/ready", async (c) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "down";
  }
  try {
    const stats = await pineconeStats();
    checks.pinecone = stats.dimension && stats.dimension !== EMBED_DIM ? "dim-mismatch" : "ok";
  } catch {
    checks.pinecone = "down";
  }
  const ready = checks.database === "ok" && checks.redis === "ok" && checks.pinecone === "ok";
  return c.json(ok({ ready, checks }), ready ? 200 : 503);
});
