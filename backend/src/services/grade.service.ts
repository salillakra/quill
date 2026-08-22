import { prisma } from "../config/db";
import { isDemoMode } from "../config/env";
import { validatedJson } from "../utils/gemini-call";
import { GRADE_SYSTEM_PROMPT, buildGradeUserPrompt } from "../prompts";
import { gradeResultSchema } from "../validators/assessment.validator";
import { demoGrade } from "../lib/demo";
import { logger } from "../utils/logger";

type RubricItem = { id: string; criterion: string; maxMarks: number };

export async function gradeSubmission(submissionId: string) {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      assignment: { include: { questionPaper: true } },
      document: true,
      student: true,
    },
  });

  const rubric = (sub.assignment.rubric as RubricItem[]) ?? [];
  const ocrText = sub.document.ocrText ?? "";
  const paper = sub.assignment.questionPaper;
  const paperExcerpt = paper ? JSON.stringify(paper.sections).slice(0, 8000) : "";

  let result: { scores: { id: string; criterion: string; maxMarks: number; score: number; comment?: string }[]; total: number; feedback: string };

  if (isDemoMode) {
    result = demoGrade(ocrText || sub.student.name, rubric);
  } else {
    const { data } = await validatedJson(
      GRADE_SYSTEM_PROMPT,
      buildGradeUserPrompt({ rubric, paperTitle: paper?.title, paperExcerpt, ocrText }),
      gradeResultSchema,
    );
    result = data;
  }

  const grade = await prisma.grade.upsert({
    where: { submissionId },
    create: {
      submissionId,
      aiScores: result.scores as object,
      finalScores: result.scores as object,
      total: result.total,
      feedback: result.feedback,
    },
    update: {
      aiScores: result.scores as object,
      finalScores: result.scores as object,
      total: result.total,
      feedback: result.feedback,
    },
  });

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "GRADED" } });
  logger.info("Submission graded", { submissionId, total: result.total, demo: isDemoMode });
  return grade;
}
