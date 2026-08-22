import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis";
import { prisma } from "../config/db";
import { startStage, completeStage, failStage, succeedJob } from "../services/job.service";
import { gradeSubmission } from "../services/grade.service";
import { SocketManager, SOCKET_EVENTS } from "../socket/socket";
import { logger } from "../utils/logger";

interface GradeData {
  docId: string;
  jobId: string;
  submissionId: string;
}

export function startGradeWorker() {
  const worker = new Worker<GradeData>(
    "grade",
    async (job: Job<GradeData>) => {
      const { docId, jobId, submissionId } = job.data;
      await prisma.submission.update({ where: { id: submissionId }, data: { status: "GRADING" } });
      await startStage(jobId, "grade");
      SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "grade", status: "running" });
      SocketManager.broadcast(SOCKET_EVENTS.stage, { jobId, docId, stage: "grade", status: "running" });
      try {
        await gradeSubmission(submissionId);
        await completeStage(jobId, "grade");
        await succeedJob(jobId);
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "grade", status: "done" });
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.jobDone, { jobId, docId, type: "GRADE" });
        SocketManager.broadcast(SOCKET_EVENTS.jobDone, { jobId, docId, type: "GRADE" });
      } catch (err) {
        await failStage(jobId, "grade", String(err));
        await prisma.submission.update({ where: { id: submissionId }, data: { status: "UPLOADED" } });
        SocketManager.emitToDoc(docId, SOCKET_EVENTS.stage, { jobId, docId, stage: "grade", status: "failed" });
        throw err;
      }
    },
    { connection: redis, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    logger.error("Grade job failed", { jobId: job?.data.jobId, error: err.message });
    if (job?.data.docId) {
      SocketManager.emitToDoc(job.data.docId, SOCKET_EVENTS.jobFailed, {
        jobId: job.data.jobId,
        docId: job.data.docId,
        error: err.message,
      });
      SocketManager.broadcast(SOCKET_EVENTS.jobFailed, {
        jobId: job.data.jobId,
        docId: job.data.docId,
        error: err.message,
      });
    }
  });
  worker.on("error", (err) => logger.error("Grade worker error", { error: err.message }));
  return worker;
}
