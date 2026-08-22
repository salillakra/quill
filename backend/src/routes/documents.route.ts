import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { createJob } from "../services/job.service";
import { enqueueIngest } from "../queues";
import { saveUpload, deleteDocFiles, uploadObject, downloadObject, deleteObject, docObjectKey, isR2Enabled } from "../services/storage.service";
import { deleteDocumentVectors } from "../services/pinecone.service";
import { scanBufferDirect } from "../services/virus-scan.service";
import { ok } from "../utils/response";
import type { SessionUser } from "../services/auth.service";
import { logger } from "../utils/logger";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const documentsRouter = new Hono();
documentsRouter.use("*", authMiddleware);

const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "text/plain": "TEXT",
  "text/markdown": "TEXT",
};

function sourceKind(mime: string, filename: string): string | null {
  if (ALLOWED[mime]) return ALLOWED[mime];
  if (/\.(pdf)$/i.test(filename)) return "PDF";
  if (/\.(png|jpe?g)$/i.test(filename)) return "IMAGE";
  if (/\.(txt|md|markdown)$/i.test(filename)) return "TEXT";
  return null;
}

// POST /api/documents — multipart upload, starts the ingest pipeline
documentsRouter.post("/", rateLimit({ prefix: "upload", limit: 20, windowSec: 300, by: "user" }), async (c) => {
  const user = c.get("user") as SessionUser;
  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Missing file field" });
  if (file.size > MAX_SIZE) throw new HTTPException(413, { message: "File exceeds 25MB limit" });

  const kind = sourceKind(file.type, file.name);
  if (!kind) throw new HTTPException(415, { message: "Unsupported file type (PDF, PNG, JPG, TXT, MD)" });

  const title = (formData.get("title") as string)?.trim() || file.name.replace(/\.[^.]+$/, "");

  const doc = await prisma.document.create({
    data: {
      title,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      sourceKind: kind,
      filePath: "", // will store object key for R2
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });

  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  // Virus scan BEFORE uploading to storage
  const scanResult = await scanBufferDirect(fileBuffer);
  if (!scanResult.safe) {
    await prisma.document.delete({ where: { id: doc.id } });
    logger.warn("Infected file rejected before storage", { docId: doc.id, threat: scanResult.threat });
    await auditLog({
      action: AuditAction.DOCUMENT_UPLOAD,
      entity: "document",
      entityId: doc.id,
      user,
      ip: getClientIp(c),
      metadata: { title: doc.title, filename: doc.filename, size: file.size, kind, virus: true, threat: scanResult.threat },
    });
    throw new HTTPException(400, { message: "File rejected: malware detected" });
  }

  // Upload to R2 (or local fallback) - saveUpload now returns object key
  const objectKey = await saveUpload(doc.id, file.name, fileBuffer);
  await prisma.document.update({ where: { id: doc.id }, data: { filePath: objectKey } });

  const job = await createJob("INGEST", doc.id);
  await enqueueIngest(doc.id, job.id);
  logger.info("Document uploaded", { docId: doc.id, kind, size: file.size, userId: user.id, scanned: scanResult.scanned, r2: isR2Enabled() });

  await auditLog({
    action: AuditAction.DOCUMENT_UPLOAD,
    entity: "document",
    entityId: doc.id,
    user,
    ip: getClientIp(c),
    metadata: { title: doc.title, filename: doc.filename, size: file.size, kind, scanned: scanResult.scanned },
  });

  return c.json(ok({ document: doc, job }), 201);
});

// GET /api/documents
documentsRouter.get("/", async (c) => {
  const user = c.get("user") as SessionUser;
  const docs = await prisma.document.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { chunks: true, extractions: true, papers: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return c.json(ok(docs));
});

// GET /api/documents/:id
documentsRouter.get("/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  const doc = await prisma.document.findFirst({
    where: { id: c.req.param("id"), ...(user.workspaceId ? { workspaceId: user.workspaceId } : { userId: user.id }) },
    include: {
      jobs: { orderBy: { createdAt: "desc" } },
      chunks: { orderBy: { index: "asc" }, take: 500 },
      extractions: { orderBy: { createdAt: "desc" }, include: { timetable: { include: { slots: true } } } },
      papers: { orderBy: { createdAt: "desc" } },
      _count: { select: { chunks: true, queries: true } },
    },
  });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });
  return c.json(ok(doc));
});

// DELETE /api/documents/:id
documentsRouter.delete("/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  const doc = await prisma.document.findFirst({ where: { id: c.req.param("id"), ...(user.workspaceId ? { workspaceId: user.workspaceId } : { userId: user.id }) } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });
  await deleteDocumentVectors(doc.id);
  await deleteDocFiles(doc.id);
  await prisma.document.delete({ where: { id: doc.id } });

  await auditLog({
    action: AuditAction.DOCUMENT_DELETE,
    entity: "document",
    entityId: doc.id,
    user,
    ip: getClientIp(c),
    metadata: { title: doc.title },
  });

  return c.json(ok({ deleted: doc.id }));
});

documentsRouter.post("/:id/reingest", async (c) => {
  const user = c.get("user") as SessionUser;
  const doc = await prisma.document.findFirst({ where: { id: c.req.param("id"), ...(user.workspaceId ? { workspaceId: user.workspaceId } : { userId: user.id }) } });
  if (!doc) throw new HTTPException(404, { message: "Document not found" });
  await prisma.document.update({ where: { id: doc.id }, data: { status: "UPLOADED" } });
  const job = await createJob("INGEST", doc.id);
  await enqueueIngest(doc.id, job.id);
  logger.info("Document re-ingest queued", { docId: doc.id, jobId: job.id });

  await auditLog({
    action: AuditAction.DOCUMENT_REINGEST,
    entity: "document",
    entityId: doc.id,
    user,
    ip: getClientIp(c),
    metadata: { title: doc.title },
  });

  return c.json(ok({ document: { ...doc, status: "UPLOADED" }, job }), 202);
});
