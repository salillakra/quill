import { z } from "zod";

export const facultyInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  userId: z.string().nullable().optional(),
});

export const roomInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().positive().nullable().optional(),
});

export const courseInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const extraClassInput = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  facultyId: z.string().min(1),
  courseId: z.string().nullable().optional(),
  roomId: z.string().nullable().optional(),
});

export const slotPatch = z.object({
  day: z.number().int().min(0).max(6).optional(),
  period: z.number().int().min(1).max(12).optional(),
  course: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  faculty: z.string().nullable().optional(),
  facultyId: z.string().nullable().optional(),
  roomId: z.string().nullable().optional(),
  courseId: z.string().nullable().optional(),
});

export const timetablePatch = z.object({
  branch: z.string().min(1).optional(),
  semester: z.number().int().min(1).optional(),
  section: z.string().nullable().optional(),
});

export const timetableGenerate = z.object({
  branch: z.string().min(1),
  semester: z.number().int().min(1),
  section: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  offerings: z
    .array(
      z.object({
        courseId: z.string().min(1),
        facultyId: z.string().min(1),
        roomId: z.string().nullable().optional(),
        periodsPerWeek: z.number().int().min(1).max(12),
      }),
    )
    .min(1),
});

export const invigilationInput = z.object({
  date: z.string().min(1),
  periods: z.array(z.number().int().min(1).max(12)).min(1),
  roomIds: z.array(z.string()).optional(),
});
