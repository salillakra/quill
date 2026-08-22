import { z } from "zod";

export const rubricItem = z.object({
  id: z.string().min(1),
  criterion: z.string().min(1),
  maxMarks: z.number().positive(),
});

export const assignmentInput = z.object({
  title: z.string().min(1),
  rubric: z.array(rubricItem).min(1),
  dueAt: z.string().nullable().optional(),
  questionPaperId: z.string().nullable().optional(),
});

export const studentInput = z.object({
  name: z.string().min(1),
  section: z.string().min(1),
  rollNo: z.string().min(1),
});

export const studentPatch = studentInput.partial().extend({
  userId: z.string().nullable().optional(),
});

export const parentLinkInput = z.object({
  parentUserId: z.string().min(1),
});

export const gradeOverride = z.object({
  finalScores: z.array(
    z.object({
      id: z.string(),
      criterion: z.string(),
      maxMarks: z.number(),
      score: z.number().min(0),
      comment: z.string().optional(),
    }),
  ),
  feedback: z.string().nullable().optional(),
});

export const gradeResultSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      criterion: z.string(),
      maxMarks: z.number(),
      score: z.number().min(0),
      comment: z.string().optional(),
    }),
  ),
  total: z.number(),
  feedback: z.string(),
});
