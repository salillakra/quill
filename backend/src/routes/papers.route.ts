import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { ok } from "../utils/response";
import { generateDocxBuffer } from "../services/docx-exporter.service";
import { generateLatexString } from "../services/latex-exporter.service";
import { updatePaperSchema, regenerateQuestionSchema } from "../validators/paper.validator";
import { demoRegenerateQuestion } from "../services/demo-ai.service";
import type { SessionUser } from "../services/auth.service";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";
import { downloadObject, paperObjectKey } from "../services/storage.service";

export const papersRouter = new Hono();
papersRouter.use("*", authMiddleware);

// GET /api/papers — every generated paper across documents (workspace-filtered)
papersRouter.get("/", async (c) => {
  const user = c.get("user") as SessionUser;
  if (!user.workspaceId) throw new HTTPException(403, { message: "No workspace access" });

  const papers = await prisma.questionPaper.findMany({
    where: {
      document: { workspaceId: user.workspaceId }
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { document: { select: { id: true, title: true } } },
  });
  return c.json(ok(papers));
});

// GET /api/papers/:id — single paper detail (workspace-verified)
papersRouter.get("/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  if (!user.workspaceId) throw new HTTPException(403, { message: "No workspace access" });

  const paper = await prisma.questionPaper.findUnique({
    where: { id: c.req.param("id") },
    include: { document: { select: { id: true, title: true, ocrText: true, workspaceId: true } } },
  });
  if (!paper) throw new HTTPException(404, { message: "Paper not found" });

  // Verify workspace ownership
  if (paper.document.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Paper not found" });
  }

  return c.json(ok(paper));
});

// GET /api/papers/:id/export?format=pdf|docx|latex|md
papersRouter.get("/:id/export", async (c) => {
  const user = c.get("user") as SessionUser;
  if (!user.workspaceId) throw new HTTPException(403, { message: "No workspace access" });

  const format = (c.req.query("format") || "pdf").toLowerCase();
  const paper = await prisma.questionPaper.findUnique({
    where: { id: c.req.param("id") },
    include: { document: { select: { workspaceId: true } } },
  });
  if (!paper) throw new HTTPException(404, { message: "Paper not found" });

  // Verify workspace ownership
  if (paper.document.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Paper not found" });
  }

  const includeAnswerKey = c.req.query("answerKey") !== "false";
  await auditLog({
    action: AuditAction.PAPER_EXPORT,
    entity: "paper",
    entityId: paper.id,
    user,
    ip: getClientIp(c),
    metadata: { format, includeAnswerKey },
  });

  if (format === "docx") {
    const buffer = await generateDocxBuffer(paper, includeAnswerKey);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, "_")}.docx"`,
      },
    });
  }

  if (format === "latex" || format === "tex") {
    const latexText = generateLatexString(paper, includeAnswerKey);
    return new Response(latexText, {
      headers: {
        "Content-Type": "text/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, "_")}.tex"`,
      },
    });
  }

  if (format === "md" || format === "markdown") {
    const sections: any[] = (paper.sections as any) || [];
    let md = `# ${paper.title}\n\n**Total Marks:** ${paper.totalMarks}\n\n`;
    for (const sec of sections) {
      md += `## ${sec.title}\n*${sec.instruction || ""}*\n\n`;
      let qn = 1;
      for (const q of sec.questions) {
        md += `### Q${qn}. ${q.question} **[${q.marks} Marks]** ${q.bloomsLevel ? `*(Bloom's: ${q.bloomsLevel})*` : ""}\n`;
        if (q.options?.length) {
          q.options.forEach((opt: string, i: number) => {
            md += `- (${String.fromCharCode(65 + i)}) ${opt}\n`;
          });
        }
        md += `\n`;
        qn++;
      }
    }
    if (includeAnswerKey) {
      md += `\n---\n# MASTER ANSWER KEY & MARKING SCHEME\n\n`;
      for (const sec of sections) {
        for (const q of sec.questions) {
          md += `#### Q: ${q.question}\n- **Answer:** ${q.answer || "N/A"}\n- **Solution:** ${q.solution || "N/A"}\n\n`;
        }
      }
    }
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
      },
    });
  }

  const pdf = await downloadObject(paperObjectKey(paper.id));
  if (!pdf) throw new HTTPException(404, { message: "PDF not found" });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, "_")}.pdf"`,
    },
  });
});

// PATCH /api/papers/:id — Paper Studio Update (Inline question & header edits)
papersRouter.patch("/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  if (!user.workspaceId) throw new HTTPException(403, { message: "No workspace access" });

  const id = c.req.param("id");
  const body = updatePaperSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid update payload" });

  const existing = await prisma.questionPaper.findUnique({
    where: { id },
    include: { document: { select: { workspaceId: true } } },
  });
  if (!existing) throw new HTTPException(404, { message: "Paper not found" });

  // Verify workspace ownership
  if (existing.document.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Paper not found" });
  }

  const updatedConfig = {
    ...(existing.config as object),
    ...(body.data.institution ? { institution: body.data.institution } : {}),
    ...(body.data.courseCode ? { courseCode: body.data.courseCode } : {}),
    ...(body.data.durationMinutes ? { durationMinutes: body.data.durationMinutes } : {}),
    ...(body.data.instructions ? { instructions: body.data.instructions } : {}),
  };

  const updated = await prisma.questionPaper.update({
    where: { id },
    data: {
      ...(body.data.title ? { title: body.data.title } : {}),
      ...(body.data.sections ? { sections: body.data.sections as unknown as object } : {}),
      config: updatedConfig as object,
    },
  });

  await auditLog({
    action: AuditAction.PAPER_GENERATE, // Reusing for updates
    entity: "paper",
    entityId: updated.id,
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(body.data) },
  });

  return c.json(ok(updated));
});

// POST /api/papers/:id/regenerate-question — Single question regeneration
papersRouter.post("/:id/regenerate-question", async (c) => {
  const user = c.get("user") as SessionUser;
  if (!user.workspaceId) throw new HTTPException(403, { message: "No workspace access" });

  const id = c.req.param("id");
  const body = regenerateQuestionSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid input" });

  const paper = await prisma.questionPaper.findUnique({
    where: { id },
    include: { document: { select: { ocrText: true, workspaceId: true } } },
  });
  if (!paper) throw new HTTPException(404, { message: "Paper not found" });

  // Verify workspace ownership
  if (paper.document.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Paper not found" });
  }

  const sections: any[] = JSON.parse(JSON.stringify(paper.sections || []));
  const { sectionIndex, questionIndex, type, difficulty, bloomsLevel } = body.data;

  if (!sections[sectionIndex] || !sections[sectionIndex].questions[questionIndex]) {
    throw new HTTPException(400, { message: "Specified section or question index out of bounds" });
  }

  const ocrText = paper.document.ocrText || "Syllabus concepts and computational fundamentals.";
  const newQuestion = demoRegenerateQuestion(ocrText, type, difficulty, bloomsLevel);

  sections[sectionIndex].questions[questionIndex] = newQuestion;

  const updated = await prisma.questionPaper.update({
    where: { id },
    data: { sections: sections as unknown as object },
  });

  await auditLog({
    action: AuditAction.PAPER_REGENERATE_QUESTION,
    entity: "paper",
    entityId: updated.id,
    user,
    ip: getClientIp(c),
    metadata: { sectionIndex, questionIndex, type, difficulty, bloomsLevel },
  });

  return c.json(ok({ newQuestion, paper: updated }));
});

