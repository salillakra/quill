import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const ingestQueue = new Queue("ingest", { connection: redis });
export const extractQueue = new Queue("extract", { connection: redis });
export const generateQueue = new Queue("generate", { connection: redis });
export const gradeQueue = new Queue("grade", { connection: redis });

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: 200,
};

export function enqueueIngest(docId: string, jobId: string) {
  return ingestQueue.add("ingest-document", { docId, jobId }, JOB_OPTS);
}

export function enqueueExtract(docId: string, jobId: string, kind: string) {
  return extractQueue.add("extract-document", { docId, jobId, kind }, JOB_OPTS);
}

export function enqueueGenerate(docId: string, jobId: string, paperId: string) {
  return generateQueue.add("generate-paper", { docId, jobId, paperId }, JOB_OPTS);
}

export function enqueueGrade(docId: string, jobId: string, submissionId: string) {
  return gradeQueue.add("grade-submission", { docId, jobId, submissionId }, JOB_OPTS);
}
