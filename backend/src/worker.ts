/**
 * Standalone worker entry — run workers in a separate container when the
 * queue depth demands scale-out:
 *   bun run src/worker.ts
 */
import { prisma } from "./config/db";
import { env, isDemoMode } from "./config/env";
import { ensurePineconeIndex } from "./config/pinecone";
import { ensureDemoWorkspace } from "./services/workspace.service";
import { logger } from "./utils/logger";
import { startIngestWorker } from "./workers/ingest.worker";
import { startExtractWorker } from "./workers/extract.worker";
import { startGenerateWorker } from "./workers/generate.worker";
import { startGradeWorker } from "./workers/grade.worker";

await prisma.$connect();
await ensureDemoWorkspace();
await ensurePineconeIndex();

startIngestWorker();
startExtractWorker();
startGenerateWorker();
startGradeWorker();

logger.info(`Quill workers running (${isDemoMode ? "demo" : "live"} mode)`);
setInterval(() => {}, 1 << 30); // keep alive
