import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis";
import { prisma } from "../config/db";
import { generatePaperSections, savePaperSections } from "../services/generator.service";
import { renderPaperPdf } from "../services/pdf-render.service";
import { startStage, completeStage, failStage, succeedJob } from "../services/job.service";
import { SocketManager, SOCKET_EVENTS } from "../socket/socket";
import { logger } from "../utils/logger";

interface GenerateData {
  docId: string;
  jobId: string;
  paperId: string;
}

export function startGenerateWorker() {
  const worker = new Worker<GenerateData>(
    "generate",
    async (job: Job<GenerateData>) => {
      const { docId, jobId, paperId } = job.data;
      const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
      const paper = await prisma.questionPaper.findUniqueOrThrow({ where: { id: paperId } });
      logger.info("Generate job started", { docId, jobId, paperId });

      // ── generate ─────────────────────────────────────────────
      await startStage(jobId, "generate");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "generate", status: "running" });
      try {
        const content = doc.ocrText ?? doc.title;
        const { sections, demo } = await generatePaperSections(content, paper.config as Parameters<typeof generatePaperSections>[1]);
        await savePaperSections(paperId, sections);
        await completeStage(jobId, "generate");
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "generate", status: "done", demo });
      } catch (err) {
        await prisma.questionPaper.update({ where: { id: paperId }, data: { status: "FAILED" } });
        await failStage(jobId, "generate", String(err));
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "generate", status: "failed" });
        throw err;
      }

      // ── render ───────────────────────────────────────────────
      await startStage(jobId, "render");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "render", status: "running" });
      try {
        const fresh = await prisma.questionPaper.findUniqueOrThrow({ where: { id: paperId } });
        const pdfKey = await renderPaperPdf(fresh as any);
        await prisma.questionPaper.update({
          where: { id: paperId },
          data: { status: "COMPLETED", pdfUrl: pdfKey, completedAt: new Date() },
        });
        await completeStage(jobId, "render");
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "render", status: "done" });
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.paperDone, { paperId, docId, pdfKey });
      } catch (err) {
        await prisma.questionPaper.update({ where: { id: paperId }, data: { status: "FAILED" } });
        await failStage(jobId, "render", String(err));
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "render", status: "failed" });
        throw err;
      }

      await succeedJob(jobId);
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.jobDone, { jobId, docId, type: "GENERATE" });
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Generate job failed", { jobId: job?.data.jobId, error: err.message });
    if (job?.data.docId) {
      SocketManager.emitToDoc(job.data.docId, SOCKET_EVENTS.jobFailed, {
        jobId: job.data.jobId,
        docId: job.data.docId,
        error: err.message,
      });
    }
  });
  worker.on("error", (err) => logger.error("Generate worker error", { error: err.message }));
  return worker;
}
