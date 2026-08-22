import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { createJob } from "../services/job.service";
import { enqueueIngest } from "../queues";
import { saveUpload, deleteDocFiles, isR2Enabled } from "../services/storage.service";
import { scanBufferDirect } from "../services/virus-scan.service";
import { ok } from "../utils/response";
import type { SessionUser } from "../services/auth.service";
import { assignmentInput, studentInput, studentPatch, parentLinkInput, gradeOverride } from "../validators/assessment.validator";
import { logger } from "../utils/logger";
import { toCsv, csvHeaders } from "../utils/csv";
import { rateLimit } from "../middleware/rate-limit";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const assessmentRouter = new Hono();
assessmentRouter.use("*", authMiddleware);

// Rate limiting for assessment write operations
const assessmentWriteLimit = rateLimit({ prefix: "assessment-write", limit: 50, windowSec: 300, by: "user" });
const mutateAssessment = requireRole("ADMIN", "EDUCATOR");

function staffSeesGrades(role: SessionUser["role"]) {
  return role === "ADMIN" || role === "EDUCATOR" || role === "ANALYST";
}

function redactGrade<T extends { status: string; grade: unknown }>(row: T, role: SessionUser["role"]): T {
  if (staffSeesGrades(role) || row.status === "REVIEWED") return row;
  return { ...row, grade: null };
}

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

assessmentRouter.get("/students", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.student.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: [{ section: "asc" }, { rollNo: "asc" }],
    include: {
      user: { select: { id: true, email: true, role: true } },
      parentLinks: { include: { parent: { select: { id: true, email: true, name: true, role: true } } } },
    },
  });
  return c.json(ok(rows));
});

assessmentRouter.post("/students", assessmentWriteLimit, mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = studentInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid student" });
  const row = await prisma.student.create({ data: { ...parsed.data, workspaceId: user.workspaceId } });

  await auditLog({
    action: AuditAction.USER_CREATE,
    entity: "student",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { name: row.name, section: row.section, rollNo: row.rollNo },
  });

  return c.json(ok(row), 201);
});

assessmentRouter.delete("/students/:id", mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const student = await prisma.student.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!student) throw new HTTPException(404, { message: "Student not found" });
  if (user.workspaceId && student.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Student not found" });
  }
  await prisma.student.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.USER_DELETE,
    entity: "student",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});

assessmentRouter.patch("/students/:id", mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = studentPatch.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid student" });
  const id = c.req.param("id");
  const student = await prisma.student.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!student) throw new HTTPException(404, { message: "Student not found" });
  if (user.workspaceId && student.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Student not found" });
  }
  if (parsed.data.userId) {
    await prisma.student.updateMany({
      where: { userId: parsed.data.userId, NOT: { id } },
      data: { userId: null },
    });
  }
  const row = await prisma.student.update({
    where: { id },
    data: parsed.data,
    include: {
      user: { select: { id: true, email: true, role: true } },
      parentLinks: { include: { parent: { select: { id: true, email: true, name: true, role: true } } } },
    },
  });
  return c.json(ok(row));
});

assessmentRouter.post("/students/:id/parents", assessmentWriteLimit, mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = parentLinkInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid parent link" });
  const student = await prisma.student.findUnique({ where: { id: c.req.param("id") }, select: { id: true, workspaceId: true } });
  if (!student) throw new HTTPException(404, { message: "Student not found" });
  if (user.workspaceId && student.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Student not found" });
  }
  const parent = await prisma.user.findUnique({ where: { id: parsed.data.parentUserId }, select: { id: true, role: true, workspaceId: true } });
  if (!parent || parent.role !== "PARENT") throw new HTTPException(400, { message: "User is not a parent account" });
  if (user.workspaceId && parent.workspaceId !== user.workspaceId) {
    throw new HTTPException(400, { message: "Parent is not in this workspace" });
  }
  const link = await prisma.parentLink.upsert({
    where: { parentUserId_studentId: { parentUserId: parent.id, studentId: student.id } },
    update: {},
    create: { parentUserId: parent.id, studentId: student.id },
  });
  return c.json(ok(link), 201);
});

assessmentRouter.delete("/students/:id/parents/:parentUserId", mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const student = await prisma.student.findUnique({ where: { id: c.req.param("id") }, select: { id: true, workspaceId: true } });
  if (!student) throw new HTTPException(404, { message: "Student not found" });
  if (user.workspaceId && student.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Student not found" });
  }
  await prisma.parentLink.deleteMany({
    where: { studentId: student.id, parentUserId: c.req.param("parentUserId") },
  });
  return c.json(ok({ deleted: true }));
});

assessmentRouter.get("/assignments", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.assignment.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      questionPaper: { select: { id: true, title: true, totalMarks: true, status: true, documentId: true } },
      _count: { select: { submissions: true } },
    },
  });
  return c.json(ok(rows));
});

assessmentRouter.post("/assignments", assessmentWriteLimit, mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = assignmentInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid assignment" });
  const row = await prisma.assignment.create({
    data: {
      title: parsed.data.title,
      rubric: parsed.data.rubric as object,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      questionPaperId: parsed.data.questionPaperId ?? null,
      workspaceId: user.workspaceId,
    },
  });

  await auditLog({
    action: AuditAction.ASSIGNMENT_CREATE,
    entity: "assignment",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { title: row.title, dueAt: row.dueAt },
  });

  return c.json(ok(row), 201);
});

assessmentRouter.get("/assignments/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  const row = await prisma.assignment.findFirst({
    where: { id: c.req.param("id"), ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}) },
    include: {
      questionPaper: true,
      submissions: {
        include: { student: true, document: { select: { id: true, title: true, status: true } }, grade: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!row) throw new HTTPException(404, { message: "Assignment not found" });
  if (user.role === "STUDENT") {
    const me = await prisma.student.findFirst({ where: { userId: user.id, ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}) } });
    const mine = row.submissions.filter((s) => s.studentId === me?.id).map((s) => redactGrade(s, user.role));
    return c.json(ok({ ...row, submissions: mine }));
  }
  if (user.role === "PARENT") {
    return c.json(ok({ ...row, submissions: row.submissions.map((s) => redactGrade(s, user.role)) }));
  }
  return c.json(ok(row));
});

assessmentRouter.post("/assignments/:id/submissions", assessmentWriteLimit, async (c) => {
  const user = c.get("user") as SessionUser;
  const assignmentId = c.req.param("id");
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new HTTPException(404, { message: "Assignment not found" });

  const formData = await c.req.formData();
  let studentId = String(formData.get("studentId") ?? "");
  if (user.role === "STUDENT") {
    const me = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!me) throw new HTTPException(403, { message: "Student account is not linked to a roster row" });
    if (studentId && studentId !== me.id) throw new HTTPException(403, { message: "Cannot submit as another student" });
    studentId = me.id;
  } else if (user.role !== "ADMIN" && user.role !== "EDUCATOR") {
    throw new HTTPException(403, { message: "Requires role: ADMIN or EDUCATOR" });
  }
  if (!studentId) throw new HTTPException(400, { message: "Missing studentId" });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new HTTPException(404, { message: "Student not found" });

  const file = formData.get("file");
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Missing file field" });
  const kind = sourceKind(file.type, file.name);
  if (!kind) throw new HTTPException(415, { message: "Unsupported file type" });

  const doc = await prisma.document.create({
    data: {
      title: `${assignment.title} — ${student.rollNo}`,
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
    logger.warn("Infected submission rejected before storage", { docId: doc.id, threat: scanResult.threat });
    await auditLog({
      action: AuditAction.SUBMISSION_UPLOAD,
      entity: "submission",
      entityId: doc.id,
      user,
      ip: getClientIp(c),
      metadata: { assignmentId, studentId: student.id, documentId: doc.id, filename: file.name, virus: true, threat: scanResult.threat },
    });
    throw new HTTPException(400, { message: "File rejected: malware detected" });
  }

  // Upload to R2 (or local fallback) - saveUpload now returns object key
  const objectKey = await saveUpload(doc.id, file.name, fileBuffer);
  await prisma.document.update({ where: { id: doc.id }, data: { filePath: objectKey } });

  const submission = await prisma.submission.create({
    data: { assignmentId, studentId: student.id, documentId: doc.id, status: "UPLOADED" },
    include: { student: true, document: { select: { id: true, title: true, status: true } } },
  });

  const job = await createJob("INGEST", doc.id, { submissionId: submission.id });
  await enqueueIngest(doc.id, job.id);
  logger.info("Submission uploaded", { submissionId: submission.id, docId: doc.id, scanned: scanResult.scanned, r2: isR2Enabled() });

  await auditLog({
    action: AuditAction.SUBMISSION_UPLOAD,
    entity: "submission",
    entityId: submission.id,
    user,
    ip: getClientIp(c),
    metadata: { assignmentId, studentId: student.id, documentId: doc.id, filename: file.name, scanned: scanResult.scanned },
  });

  return c.json(ok({ submission, job }), 201);
});

assessmentRouter.get("/grading", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.submission.findMany({
    where: user.workspaceId ? { assignment: { workspaceId: user.workspaceId } } : {},
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      student: true,
      assignment: { select: { id: true, title: true } },
      document: { select: { id: true, title: true, status: true } },
      grade: true,
    },
  });
  return c.json(ok(rows.map((r) => redactGrade(r, user.role))));
});

assessmentRouter.patch("/grades/:id", mutateAssessment, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = gradeOverride.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid override" });
  const total = parsed.data.finalScores.reduce((s, x) => s + x.score, 0);
  const grade = await prisma.grade.update({
    where: { id: c.req.param("id") },
    data: {
      finalScores: parsed.data.finalScores as object,
      total,
      feedback: parsed.data.feedback ?? undefined,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
  await prisma.submission.update({ where: { id: grade.submissionId }, data: { status: "REVIEWED" } });
  return c.json(ok(grade));
});

assessmentRouter.get("/assignments/:id/analytics", async (c) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: c.req.param("id") },
    include: { submissions: { include: { grade: true, student: true } } },
  });
  if (!assignment) throw new HTTPException(404, { message: "Assignment not found" });
  const grades = assignment.submissions.map((s) => s.grade).filter(Boolean) as { total: number; finalScores: unknown }[];
  const totals = grades.map((g) => g.total).sort((a, b) => a - b);
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const median = totals.length ? totals[Math.floor(totals.length / 2)] : 0;
  const rubric = assignment.rubric as { id: string; criterion: string; maxMarks: number }[];
  const perCriterion = rubric.map((r) => {
    const scores = grades.map((g) => {
      const items = (g.finalScores as { id: string; score: number }[]) ?? [];
      return items.find((i) => i.id === r.id)?.score ?? 0;
    });
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { ...r, avg };
  });
  return c.json(
    ok({
      assignmentId: assignment.id,
      title: assignment.title,
      submissionCount: assignment.submissions.length,
      gradedCount: grades.length,
      mean,
      median,
      perCriterion,
    }),
  );
});

assessmentRouter.get("/assignments/:id/analytics.csv", async (c) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: c.req.param("id") },
    include: { submissions: { include: { grade: true, student: true } } },
  });
  if (!assignment) throw new HTTPException(404, { message: "Assignment not found" });
  const rubric = assignment.rubric as { id: string; criterion: string; maxMarks: number }[];
  const header = ["student", "section", "rollNo", "status", "total", ...rubric.map((r) => r.criterion)];
  const rows = assignment.submissions.map((s) => {
    const scores = (s.grade?.finalScores as { id: string; score: number }[] | undefined) ?? [];
    return [
      s.student?.name,
      s.student?.section,
      s.student?.rollNo,
      s.status,
      s.grade?.total ?? "",
      ...rubric.map((r) => scores.find((i) => i.id === r.id)?.score ?? ""),
    ];
  });
  return c.body(toCsv(header, rows), 200, csvHeaders(`analytics-${assignment.id}.csv`));
});

assessmentRouter.get("/parent/grades", async (c) => {
  const user = c.get("user") as SessionUser;
  if (user.role !== "PARENT" && user.role !== "ADMIN") {
    throw new HTTPException(403, { message: "Requires role: PARENT" });
  }
  const links = await prisma.parentLink.findMany({
    where: { parentUserId: user.id },
    include: {
      student: {
        include: {
          submissions: {
            include: {
              assignment: { select: { id: true, title: true, dueAt: true } },
              grade: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
  return c.json(
    ok(
      links.map((l) => ({
        student: { id: l.student.id, name: l.student.name, section: l.student.section, rollNo: l.student.rollNo },
        submissions: l.student.submissions.map((s) => redactGrade(s, user.role)),
      })),
    ),
  );
});
