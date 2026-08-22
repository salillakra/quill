import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis";
import { prisma } from "../config/db";
import { runExtraction } from "../services/extractor.service";
import { integrateTimetable } from "../services/integrate.service";
import { startStage, completeStage, failStage, succeedJob } from "../services/job.service";
import { SocketManager, SOCKET_EVENTS } from "../socket/socket";
import { logger } from "../utils/logger";

interface ExtractData {
  docId: string;
  jobId: string;
  kind: "timetable" | "generic";
}

export function startExtractWorker() {
  const worker = new Worker<ExtractData>(
    "extract",
    async (job: Job<ExtractData>) => {
      const { docId, jobId, kind } = job.data;
      logger.info("Extract job started", { docId, jobId, kind });

      // ── parse ────────────────────────────────────────────────
      await startStage(jobId, "parse");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "parse", status: "running" });
      const { extractionId, data, demo } = await runExtraction(docId, kind);
      await completeStage(jobId, "parse");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "parse", status: "done", demo });

      // ── validate ─────────────────────────────────────────────
      await startStage(jobId, "validate");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "validate", status: "running" });
      // Validation happened inside runExtraction (Zod + corrective retry);
      // the extraction row is the validated artifact.
      await completeStage(jobId, "validate");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "validate", status: "done" });

      // ── integrate (timetables only) ──────────────────────────
      if (kind === "timetable") {
        await startStage(jobId, "integrate");
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "integrate", status: "running" });
        const timetable = await integrateTimetable(extractionId, data as Parameters<typeof integrateTimetable>[1]);
        await completeStage(jobId, "integrate");
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "integrate", status: "done" });
        logger.info("Timetable integrated", { docId, timetableId: timetable.id });
      }

      await succeedJob(jobId);
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.jobDone, { jobId, docId, type: "EXTRACT", kind });
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Extract job failed", { jobId: job?.data.jobId, error: err.message });
    if (job?.data.docId) {
      SocketManager.emitToDoc(job.data.docId, SOCKET_EVENTS.jobFailed, {
        jobId: job.data.jobId,
        docId: job.data.docId,
        error: err.message,
      });
    }
  });
  worker.on("error", (err) => logger.error("Extract worker error", { error: err.message }));
  return worker;
}
