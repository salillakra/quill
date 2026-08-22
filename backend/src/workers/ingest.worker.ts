import { Worker, type Job } from "bullmq";
import { readdir, rm } from "node:fs/promises";
import { redis } from "../config/redis";
import { prisma } from "../config/db";
import { downloadDocumentToFile, uploadDocumentPages, downloadDocumentPages, pagesDir, docFilePath, isR2Enabled, downloadObjectToFile } from "../services/storage.service";
import { pdfToImages } from "../services/pdf-convert.service";
import { ocrPages, ocrImage } from "../services/ocr.service";
import { chunkText } from "../services/chunker.service";
import { startStage, completeStage, failStage, succeedJob, createJob } from "../services/job.service";
import { embedChunks } from "../services/embedder.service";
import { enqueueGrade } from "../queues";
import { SocketManager, SOCKET_EVENTS } from "../socket/socket";
import { logger } from "../utils/logger";

interface IngestData {
  docId: string;
  jobId: string;
}

function emitStage(docId: string, jobId: string, stage: string, status: string) {
  SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage, status });
}

/**
 * Ingest pipeline: convert → ocr → chunk → embed. Each stage is a job
 * step so a failure retries the stage, not the document; each records its
 * duration for the analytics dashboard.
 */
export function startIngestWorker() {
  const worker = new Worker<IngestData>(
    "ingest",
    async (job: Job<IngestData>) => {
      const { docId, jobId } = job.data;
      const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });

      // Download document from R2 to local temp if R2 is enabled
      const inputPath = isR2Enabled()
        ? await downloadDocumentToFile(docId, doc.filename)
        : docFilePath(docId, doc.filename);
      if (!inputPath) throw new Error(`Document file not found for ${docId}`);
      const isTempInput = isR2Enabled(); // track if inputPath is a temp file

      await prisma.document.update({ where: { id: docId }, data: { status: "PROCESSING" } });
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.docStatus, { docId, status: "PROCESSING" });
      SocketManager.broadcast(SOCKET_EVENTS.docStatus, { docId, status: "PROCESSING" });
      logger.info("Ingest started", { docId, jobId });

      // ── convert ──────────────────────────────────────────────
      await startStage(jobId, "convert");
      emitStage(docId, jobId, "convert", "running");
      try {
        if (doc.sourceKind === "PDF") {
          // Convert PDF to images locally
          const { pageCount, imagePaths } = await pdfToImages(inputPath, pagesDir(docId));
          await prisma.document.update({ where: { id: docId }, data: { pageCount } });
          doc.pageCount = pageCount;

          // Upload page images to R2 if enabled
          if (isR2Enabled() && pageCount > 0) {
            await uploadDocumentPages(docId, pagesDir(docId));
          }
        }
        await completeStage(jobId, "convert");
        emitStage(docId, jobId, "convert", "done");
      } catch (err) {
        if (isTempInput) {
          try { await rm(inputPath, { force: true }); } catch { /* ignore */ }
        }
        await failStage(jobId, "convert", String(err));
        emitStage(docId, jobId, "convert", "failed");
        throw err;
      }

      // ── ocr ──────────────────────────────────────────────────
      await startStage(jobId, "ocr");
      emitStage(docId, jobId, "ocr", "running");
      let downloadedPaths: string[] = []; // track temp files to clean up
      try {
        let ocrText = "";
        if (doc.sourceKind === "TEXT") {
          const textPath = isR2Enabled()
            ? await downloadDocumentToFile(docId, doc.filename)
            : docFilePath(docId, doc.filename);
          if (!textPath) throw new Error(`Document file not found for ${docId}`);
          if (isR2Enabled()) downloadedPaths.push(textPath);
          ocrText = await Bun.file(textPath).text();
        } else if (doc.sourceKind === "IMAGE") {
          const imagePath = isR2Enabled()
            ? await downloadDocumentToFile(docId, doc.filename)
            : docFilePath(docId, doc.filename);
          if (!imagePath) throw new Error(`Document file not found for ${docId}`);
          if (isR2Enabled()) downloadedPaths.push(imagePath);
          ocrText = await ocrImage(imagePath);
        } else {
          // For PDF: use locally converted pages (they were created in convert stage)
          // or download from R2 if needed
          let imagePaths: string[];
          if (isR2Enabled()) {
            // Download all page images from R2 to local temp
            imagePaths = await downloadDocumentPages(docId);
            downloadedPaths = imagePaths; // all downloaded pages are temp files
          } else {
            imagePaths = (await readdir(pagesDir(docId)))
              .filter((f) => f.endsWith(".png"))
              .sort()
              .map((f) => `${pagesDir(docId)}/${f}`);
          }
          ocrText = await ocrPages(imagePaths);
        }
        await prisma.document.update({ where: { id: docId }, data: { ocrText } });
        doc.ocrText = ocrText; // keep the in-memory copy fresh — chunking reads it below
        await completeStage(jobId, "ocr");
        emitStage(docId, jobId, "ocr", "done");
      } catch (err) {
        await failStage(jobId, "ocr", String(err));
        emitStage(docId, jobId, "ocr", "failed");
        throw err;
      } finally {
        // Clean up downloaded temp files from R2
        for (const p of downloadedPaths) {
          try { await rm(p, { force: true }); } catch { /* ignore */ }
        }
      }

      // ── chunk ────────────────────────────────────────────────
      await startStage(jobId, "chunk");
      emitStage(docId, jobId, "chunk", "running");
      const source = doc.ocrText ?? "";
      const chunks = chunkText(source);
      await completeStage(jobId, "chunk");
      emitStage(docId, jobId, "chunk", "done");

      // ── embed ────────────────────────────────────────────────
      await startStage(jobId, "embed");
      emitStage(docId, jobId, "embed", "running");
      try {
        await embedChunks(docId, chunks);
        await completeStage(jobId, "embed");
        emitStage(docId, jobId, "embed", "done");
      } catch (err) {
        await failStage(jobId, "embed", String(err));
        emitStage(docId, jobId, "embed", "failed");
        throw err;
      }

      await prisma.document.update({ where: { id: docId }, data: { status: "READY" } });
      await succeedJob(jobId);
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.docStatus, { docId, status: "READY" });
      SocketManager.broadcast(SOCKET_EVENTS.docStatus, { docId, status: "READY" });
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.jobDone, { jobId, docId, type: "INGEST" });
      SocketManager.broadcast(SOCKET_EVENTS.jobDone, { jobId, docId, type: "INGEST" });
      logger.info("Ingest complete", { docId, jobId, chunks: chunks.length });

      // Clean up temp input file if downloaded from R2
      if (isTempInput) {
        try { await rm(inputPath, { force: true }); } catch { /* ignore */ }
      }
      // Clean up local pages directory if R2 is enabled (pages were uploaded)
      if (isR2Enabled() && doc.sourceKind === "PDF") {
        try { await rm(pagesDir(docId), { recursive: true, force: true }); } catch { /* ignore */ }
      }

      const submission = await prisma.submission.findFirst({ where: { documentId: docId } });
      if (submission) {
        const gradeJob = await createJob("GRADE", docId, { submissionId: submission.id });
        await enqueueGrade(docId, gradeJob.id, submission.id);
        logger.info("Grade job queued after ingest", { submissionId: submission.id, gradeJobId: gradeJob.id });
      }
    },
    { connection: redis, concurrency: 2 },
  );

  worker.on("failed", async (job, err) => {
    logger.error("Ingest job failed", { jobId: job?.data.jobId, error: err.message });
    if (!job?.data.docId) return;
    await prisma.document.update({ where: { id: job.data.docId }, data: { status: "FAILED" } }).catch(() => undefined);
    SocketManager.emitToDoc(job.data.docId, SOCKET_EVENTS.docStatus, { docId: job.data.docId, status: "FAILED" });
    SocketManager.broadcast(SOCKET_EVENTS.docStatus, { docId: job.data.docId, status: "FAILED" });
    SocketManager.emitToDoc(job.data.docId, SOCKET_EVENTS.jobFailed, {
      jobId: job.data.jobId,
      docId: job.data.docId,
      error: err.message,
    });
  });

  worker.on("error", (err) => logger.error("Ingest worker error", { error: err.message }));
  return worker;
}
