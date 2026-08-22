import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { extractRequestSchema } from "../validators/extraction.validator";
import { createJob } from "../services/job.service";
import { enqueueExtract } from "../queues";
import { ok } from "../utils/response";
import { analyzeTimetable } from "../services/timetable-analytics.service";
import type { SessionUser } from "../services/auth.service";
import { rateLimit } from "../middleware/rate-limit";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const extractionRouter = new Hono();
extractionRouter.use("*", authMiddleware, requireRole("ADMIN", "EDUCATOR"));

// POST /api/documents/:id/extract
extractionRouter.post("/:docId/extract", rateLimit({ prefix: "extract", limit: 10, windowSec: 300, by: "user" }), async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");
  const body = extractRequestSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid input" });

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  // Verify workspace ownership
  if (user.workspaceId && doc.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Document not found" });
  }

  if (doc.status !== "READY") throw new HTTPException(409, { message: `Document must be READY (currently ${doc.status})` });

  const job = await createJob("EXTRACT", docId, { kind: body.data.kind });
  await enqueueExtract(docId, job.id, body.data.kind);

  await auditLog({
    action: AuditAction.EXTRACTION_START,
    entity: "extraction",
    entityId: job.id,
    user,
    ip: getClientIp(c),
    metadata: { documentId: docId, kind: body.data.kind },
  });

  return c.json(ok({ job }), 202);
});

// GET /api/documents/:id/extractions
extractionRouter.get("/:docId/extractions", async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");

  // Verify document ownership first
  const doc = await prisma.document.findUnique({ where: { id: docId }, select: { workspaceId: true } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  if (user.workspaceId && doc.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Document not found" });
  }

  const extractions = await prisma.extraction.findMany({
    where: { documentId: docId },
    orderBy: { createdAt: "desc" },
    include: { timetable: { include: { slots: true } } },
  });
  return c.json(ok(extractions));
});

// GET /api/extractions/:id/timetable/analytics
extractionRouter.get("/extractions/:id/timetable/analytics", async (c) => {
  const extraction = await prisma.extraction.findUnique({
    where: { id: c.req.param("id") },
    include: { timetable: { include: { slots: true } } },
  });
  if (!extraction || !extraction.timetable) {
    throw new HTTPException(404, { message: "Timetable extraction not found" });
  }

  const analysis = analyzeTimetable(extraction.timetable.slots);
  return c.json(
    ok({
      timetableId: extraction.timetable.id,
      branch: extraction.timetable.branch,
      semester: extraction.timetable.semester,
      section: extraction.timetable.section,
      ...analysis,
    }),
  );
});

