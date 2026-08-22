import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { enqueueIngest, enqueueExtract, enqueueGenerate, enqueueGrade } from "../queues";
import { createJob, markRunning } from "../services/job.service";
import { ok } from "../utils/response";
import { logger } from "../utils/logger";
import type { SessionUser } from "../services/auth.service";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const jobsRouter = new Hono();
jobsRouter.use("*", authMiddleware);

// GET /api/jobs — pipeline explorer (workspace-filtered)
jobsRouter.get("/", async (c) => {
  const user = c.get("user") as SessionUser;
  const jobs = await prisma.job.findMany({
    where: user.workspaceId ? { document: { workspaceId: user.workspaceId } } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { document: { select: { id: true, title: true } } },
  });
  return c.json(ok(jobs));
});

// POST /api/jobs/:id/retry — re-queue a failed job with fresh attempts
jobsRouter.post("/:id/retry", rateLimit({ prefix: "job-retry", limit: 20, windowSec: 300, by: "user" }), async (c) => {
  const user = c.get("user") as SessionUser;

  const job = await prisma.job.findUnique({
    where: { id: c.req.param("id") },
    include: { document: { select: { workspaceId: true } } }
  });
  if (!job) throw new HTTPException(404, { message: "Job not found" });

  // Verify workspace ownership
  if (user.workspaceId && job.document.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Job not found" });
  }

  if (job.status !== "FAILED") throw new HTTPException(409, { message: "Only failed jobs can be retried" });

  await markRunning(job.id, "QUEUED");
  const params = (job.params as Record<string, string> | null) ?? {};
  if (job.type === "INGEST") await enqueueIngest(job.documentId, job.id);
  else if (job.type === "EXTRACT") await enqueueExtract(job.documentId, job.id, params.kind ?? "generic");
  else if (job.type === "GRADE") await enqueueGrade(job.documentId, job.id, params.submissionId ?? "");
  else await enqueueGenerate(job.documentId, job.id, params.paperId ?? "");
  logger.info("Job retried", { jobId: job.id, type: job.type });

  await auditLog({
    action: AuditAction.JOB_RETRY,
    entity: "job",
    entityId: job.id,
    user,
    ip: getClientIp(c),
    metadata: { type: job.type, documentId: job.documentId },
  });

  return c.json(ok({ retried: job.id }));
});
