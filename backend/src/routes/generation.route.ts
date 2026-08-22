import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { paperConfigSchema } from "../validators/paper.validator";
import { createJob } from "../services/job.service";
import { enqueueGenerate } from "../queues";
import { createPaper } from "../services/generator.service";
import { ok } from "../utils/response";
import type { SessionUser } from "../services/auth.service";
import { rateLimit } from "../middleware/rate-limit";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const generationRouter = new Hono();
generationRouter.use("*", authMiddleware, requireRole("ADMIN", "EDUCATOR"));

// POST /api/documents/:id/generate-paper
generationRouter.post("/:docId/generate-paper", rateLimit({ prefix: "generate", limit: 5, windowSec: 300, by: "user" }), async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");
  const body = paperConfigSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid input" });

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  // Verify workspace ownership
  if (user.workspaceId && doc.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Document not found" });
  }

  if (doc.status !== "READY") throw new HTTPException(409, { message: `Document must be READY (currently ${doc.status})` });

  const paper = await createPaper(docId, body.data);
  const job = await createJob("GENERATE", docId, { paperId: paper.id });
  await enqueueGenerate(docId, job.id, paper.id);

  await auditLog({
    action: AuditAction.PAPER_GENERATE,
    entity: "paper",
    entityId: paper.id,
    user,
    ip: getClientIp(c),
    metadata: { documentId: docId, config: body.data },
  });

  return c.json(ok({ paper, job }), 202);
});

// GET /api/documents/:id/papers
generationRouter.get("/:docId/papers", async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");

  // Verify document ownership first
  const doc = await prisma.document.findUnique({ where: { id: docId }, select: { workspaceId: true } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  if (user.workspaceId && doc.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Document not found" });
  }

  const papers = await prisma.questionPaper.findMany({
    where: { documentId: docId },
    orderBy: { createdAt: "desc" },
  });
  return c.json(ok(papers));
});
