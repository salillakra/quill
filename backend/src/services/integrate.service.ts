import { prisma } from "../config/db";
import { DAY_NAME_TO_INDEX, type TimetableData } from "../validators/extraction.validator";
import { logger } from "../utils/logger";
import { resolveSlotFks } from "./master-data.service";

export function normalizeDay(day: number | string): number {
  if (typeof day === "number") return day;
  const hit = DAY_NAME_TO_INDEX[day.trim().toLowerCase()];
  if (hit === undefined) throw new Error(`Unknown day: ${day}`);
  return hit;
}

/**
 * Pure: normalize day names → indices and dedupe (day, period) collisions
 * by keeping the first occurrence — LLMs occasionally emit overlapping rows.
 */
export function normalizeSlots(rows: TimetableData["rows"]) {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = `${normalizeDay(row.day)}:${row.period}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      day: normalizeDay(row.day),
      period: row.period,
      course: row.course,
      code: row.code ?? null,
      room: row.room ?? null,
      faculty: row.faculty ?? null,
    }));
}

/**
 * Validated JSON → relational Timetable + TimetableSlot rows.
 */
export async function integrateTimetable(extractionId: string, data: TimetableData) {
  const existing = await prisma.timetable.findUnique({ where: { extractionId } });
  if (existing) return existing;

  const extraction = await prisma.extraction.findUnique({
    where: { id: extractionId },
    select: { document: { select: { workspaceId: true } } },
  });

  const slots = normalizeSlots(data.rows);
  const withFks = await Promise.all(
    slots.map(async (slot) => ({ ...slot, ...(await resolveSlotFks(slot, extraction?.document.workspaceId)) })),
  );

  const timetable = await prisma.timetable.create({
    data: {
      branch: data.branch,
      semester: data.semester,
      section: data.section ?? null,
      extractionId,
      workspaceId: extraction?.document.workspaceId ?? null,
      slots: { create: withFks },
    },
    include: { slots: { orderBy: [{ day: "asc" }, { period: "asc" }] } },
  });

  await prisma.extraction.update({ where: { id: extractionId }, data: { status: "INTEGRATED" } });
  logger.info("Timetable integrated", { extractionId, slots: slots.length });
  return timetable;
}
