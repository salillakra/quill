import { prisma } from "../config/db";
import type { JobType, JobStatus } from "@prisma/client";

export interface Stage {
  name: string;
  status: "pending" | "running" | "done" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export const STAGES: Record<JobType, string[]> = {
  INGEST: ["convert", "ocr", "chunk", "embed"],
  EXTRACT: ["parse", "validate", "integrate"],
  GENERATE: ["generate", "render"],
  GRADE: ["grade"],
};

export async function createJob(type: JobType, documentId: string, params?: Record<string, unknown>) {
  const stages: Stage[] = STAGES[type].map((name) => ({ name, status: "pending" }));
  return prisma.job.create({
    data: { type, documentId, stages: stages as unknown as object, ...(params ? { params: params as object } : {}) },
  });
}

function readStages(job: { stages: unknown }): Stage[] {
  return Array.isArray(job.stages) ? (job.stages as Stage[]) : [];
}

async function writeStage(jobId: string, stages: Stage[]) {
  await prisma.job.update({
    where: { id: jobId },
    data: { stages: stages as unknown as object },
  });
}

export async function startStage(jobId: string, name: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const stages = readStages(job).map((s) =>
    s.name === name ? { ...s, status: "running" as const, startedAt: new Date().toISOString() } : s,
  );
  await writeStage(jobId, stages);
  await prisma.job.update({ where: { id: jobId }, data: { status: "RUNNING", currentStage: name } });
}

export async function completeStage(jobId: string, name: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const stages = readStages(job).map((s) => {
    if (s.name !== name) return s;
    const started = s.startedAt ? new Date(s.startedAt).getTime() : Date.now();
    return {
      ...s,
      status: "done" as const,
      completedAt: new Date().toISOString(),
      durationMs: Math.round(Date.now() - started),
    };
  });
  await writeStage(jobId, stages);
}

export async function failStage(jobId: string, name: string, error: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const stages = readStages(job).map((s) =>
    s.name === name ? { ...s, status: "failed" as const, completedAt: new Date().toISOString() } : s,
  );
  await writeStage(jobId, stages);
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "FAILED", error, currentStage: name, completedAt: new Date() },
  });
}

export async function succeedJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", completedAt: new Date() },
  });
}

export async function markRunning(jobId: string, status: JobStatus = "RUNNING") {
  await prisma.job.update({ where: { id: jobId }, data: { status } });
}
