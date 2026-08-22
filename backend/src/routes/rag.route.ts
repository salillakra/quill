import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { prisma } from "../config/db";
import { isDemoMode } from "../config/env";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  askDocument,
  askModelLabel,
  persistAskLog,
  retrieveChunks,
  streamAnswerText,
  toAskSources,
} from "../services/rag.service";
import { ok } from "../utils/response";
import { AppError } from "../middleware/error";
import type { SessionUser } from "../services/auth.service";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const ragRouter = new Hono();
ragRouter.use("*", authMiddleware);

const askLimit = rateLimit({ prefix: "ask", limit: 30, windowSec: 60, by: "user" });
const askSchema = z.object({ question: z.string().min(3).max(1000) });

// Helper function to verify document ownership
async function verifyDocumentAccess(docId: string, workspaceId: string | null) {
  const doc = await prisma.document.findUnique({ where: { id: docId }, select: { workspaceId: true } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  if (workspaceId && doc.workspaceId !== workspaceId) {
    throw new HTTPException(404, { message: "Document not found" });
  }
}

// POST /api/documents/:id/ask — grounded RAG answer with citations
ragRouter.post("/:docId/ask", askLimit, async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");

  // Verify workspace access
  await verifyDocumentAccess(docId, user.workspaceId);

  const body = askSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: "Question must be 3–1000 characters" });
  const result = await askDocument(docId, body.data.question);

  await auditLog({
    action: AuditAction.DOCUMENT_ASK,
    entity: "document",
    entityId: docId,
    user,
    ip: getClientIp(c),
    metadata: { questionLength: body.data.question.length },
  });

  return c.json(ok(result));
});

// POST /api/documents/:id/ask/stream — SSE token stream
ragRouter.post("/:docId/ask/stream", askLimit, async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");

  // Verify workspace access
  await verifyDocumentAccess(docId, user.workspaceId);

  const body = askSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: "Question must be 3–1000 characters" });
  const question = body.data.question;

  return streamSSE(c, async (stream) => {
    const t0 = performance.now();
    try {
      const top = await retrieveChunks(docId, question);
      const sources = toAskSources(top);
      const model = askModelLabel();
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ sources, model, demo: isDemoMode }) });

      let answer = "";
      for await (const text of streamAnswerText(question, top)) {
        answer += text;
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
      }
      if (!answer) answer = "No answer generated.";

      const latencyMs = Math.round(performance.now() - t0);
      await persistAskLog({ docId, question, answer, sources, latencyMs, model });
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ answer, sources, latencyMs, model, demo: isDemoMode }),
      });
    } catch (err) {
      const message = err instanceof AppError || err instanceof HTTPException ? err.message : String(err);
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message }) });
    }
  });
});

// GET /api/documents/:id/queries — ask history
ragRouter.get("/:docId/queries", async (c) => {
  const user = c.get("user") as SessionUser;
  const docId = c.req.param("docId");

  // Verify workspace access
  await verifyDocumentAccess(docId, user.workspaceId);

  const queries = await prisma.queryLog.findMany({
    where: { documentId: docId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return c.json(ok(queries));
});
