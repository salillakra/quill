import { z } from "zod";

export const QUESTION_TYPES = [
  "MCQ",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "NUMERICAL",
  "DIAGRAM",
  "TRUE_FALSE",
  "FILL_BLANK",
  "CASE_STUDY",
] as const;

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export const BLOOMS_LEVELS = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
] as const;

export const paperConfigSchema = z.object({
  title: z.string().min(1).max(200),
  questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1),
  numberOfQuestions: z.number().int().min(1).max(50),
  totalMarks: z.number().int().min(1).max(500),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  institution: z.string().optional().default("School of Computer Science & Artificial Intelligence"),
  courseCode: z.string().optional().default("CS-301"),
  durationMinutes: z.number().int().min(15).max(600).optional().default(180),
  instructions: z.string().optional().default("1. All questions are compulsory. 2. Figures to the right indicate full marks. 3. Use of scientific calculators is allowed."),
  includeAnswerKey: z.boolean().optional().default(true),
  targetBloomsLevel: z.enum(BLOOMS_LEVELS).optional().default("APPLY"),
});

export type PaperConfig = {
  title: string;
  questionTypes: readonly (typeof QUESTION_TYPES)[number][] | (typeof QUESTION_TYPES)[number][];
  numberOfQuestions: number;
  totalMarks: number;
  difficulty: (typeof DIFFICULTIES)[number];
  institution?: string;
  courseCode?: string;
  durationMinutes?: number;
  instructions?: string;
  includeAnswerKey?: boolean;
  targetBloomsLevel?: (typeof BLOOMS_LEVELS)[number];
};

export const questionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  marks: z.number().int().min(1).max(100),
  type: z.enum(QUESTION_TYPES).optional().default("SHORT_ANSWER"),
  bloomsLevel: z.enum(BLOOMS_LEVELS).optional().default("UNDERSTAND"),
  options: z.array(z.string()).optional(),
  answer: z.string().optional(),
  solution: z.string().optional(),
  rubric: z.array(z.string()).optional(),
});

export type QuestionItem = z.infer<typeof questionSchema>;

export const paperOutputSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string().min(1),
      instruction: z.string().optional().nullable(),
      questions: z.array(questionSchema).min(1),
    }),
  ).min(1),
});

export type PaperOutput = z.infer<typeof paperOutputSchema>;

export const updatePaperSchema = z.object({
  title: z.string().min(1).optional(),
  institution: z.string().optional(),
  courseCode: z.string().optional(),
  durationMinutes: z.number().int().optional(),
  instructions: z.string().optional(),
  sections: z.array(
    z.object({
      title: z.string().min(1),
      instruction: z.string().optional().nullable(),
      questions: z.array(questionSchema).min(1),
    }),
  ).optional(),
});

export type UpdatePaperPayload = z.infer<typeof updatePaperSchema>;

export const regenerateQuestionSchema = z.object({
  sectionIndex: z.number().int().min(0),
  questionIndex: z.number().int().min(0),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  bloomsLevel: z.enum(BLOOMS_LEVELS).optional(),
});

export type RegenerateQuestionPayload = z.infer<typeof regenerateQuestionSchema>;

