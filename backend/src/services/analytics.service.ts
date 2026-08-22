import { prisma } from "../config/db";
import { isDemoMode } from "../config/env";
import type { Job } from "@prisma/client";

type Stage = { name: string; status: string; startedAt?: string; completedAt?: string; durationMs?: number };

export async function analyticsSummary(workspaceId?: string | null) {
  const whereWorkspace = workspaceId ? { workspaceId } : {};

  const [docs, chunks, papers, queries, users, failedJobs] = await Promise.all([
    prisma.document.count({ where: whereWorkspace }),
    prisma.chunk.count({ where: { document: whereWorkspace } }),
    prisma.questionPaper.count({ where: { status: "COMPLETED", document: whereWorkspace } }),
    prisma.queryLog.count({ where: { document: whereWorkspace } }),
    prisma.user.count({ where: whereWorkspace }),
    prisma.job.count({ where: { status: "FAILED", ...whereWorkspace } }),
  ]);

  const recentJobs = await prisma.job.findMany({
    where: { status: "SUCCEEDED", ...whereWorkspace },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { stages: true },
  });
  const jobDurations = recentJobs
    .map((j) => (j.stages as Stage[]).reduce((s, st) => s + (st.durationMs ?? 0), 0))
    .filter((d) => d > 0);
  const avgPipelineMs = jobDurations.length
    ? Math.round(jobDurations.reduce((a, b) => a + b, 0) / jobDurations.length)
    : 0;

  return { docs, chunks, papers, queries, users, failedJobs, avgPipelineMs, demo: isDemoMode };
}

/** Average duration per pipeline stage over recent succeeded jobs. */
export async function pipelineLatency(workspaceId?: string | null) {
  const whereWorkspace = workspaceId ? { workspaceId } : {};

  const jobs = await prisma.job.findMany({
    where: { status: "SUCCEEDED", ...whereWorkspace },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { stages: true },
  });
  const buckets = new Map<string, number[]>();
  for (const job of jobs) {
    for (const stage of job.stages as Stage[]) {
      if (!stage.durationMs) continue;
      const arr = buckets.get(stage.name) ?? [];
      arr.push(stage.durationMs);
      buckets.set(stage.name, arr);
    }
  }
  return [...buckets.entries()]
    .map(([name, durations]) => ({
      stage: name,
      runs: durations.length,
      avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
}

export async function activityLast30Days(workspaceId?: string | null) {
  const whereWorkspace = workspaceId ? { workspaceId } : {};
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [docs, queries] = await Promise.all([
    prisma.document.findMany({ where: { createdAt: { gte: since }, ...whereWorkspace }, select: { createdAt: true } }),
    prisma.queryLog.findMany({ where: { createdAt: { gte: since }, document: whereWorkspace }, select: { createdAt: true } }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const docBuckets = new Map<string, number>();
  const queryBuckets = new Map<string, number>();
  for (const d of docs) docBuckets.set(day(d.createdAt), (docBuckets.get(day(d.createdAt)) ?? 0) + 1);
  for (const q of queries) queryBuckets.set(day(q.createdAt), (queryBuckets.get(day(q.createdAt)) ?? 0) + 1);
  return {
    documents: [...docBuckets.entries()].map(([date, count]) => ({ date, count })),
    queries: [...queryBuckets.entries()].map(([date, count]) => ({ date, count })),
  };
}
