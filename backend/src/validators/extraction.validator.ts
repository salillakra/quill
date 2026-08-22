import { z } from "zod";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export const timetableRowSchema = z.object({
  day: z.union([
    z.number().int().min(0).max(4),
    z.string().refine(
      (s) => DAY_NAME_TO_INDEX[s.trim().toLowerCase()] !== undefined,
      { message: "Unknown day name (expected Monday..Friday)" },
    ),
  ]),
  period: z.number().int().min(1).max(12),
  course: z.string().min(1),
  code: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
  faculty: z.string().optional().nullable(),
});

export const timetableSchema = z.object({
  branch: z.string().min(1),
  semester: z.number().int().min(1).max(12),
  section: z.string().optional().nullable(),
  rows: z.array(timetableRowSchema).min(1),
});

export type TimetableData = z.infer<typeof timetableSchema>;

export const genericExtractionSchema = z.object({
  summary: z.string().optional().nullable(),
  entities: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export type GenericExtractionData = z.infer<typeof genericExtractionSchema>;

export const extractRequestSchema = z.object({
  kind: z.enum(["timetable", "generic"]),
});

export const DAY_NAME_TO_INDEX: Record<string, number> = {
  monday: 0, mon: 0, tuesday: 1, tue: 1, wednesday: 2, wed: 2,
  thursday: 3, thu: 3, friday: 4, fri: 4,
};
