import { prisma } from "../config/db";
import { HTTPException } from "hono/http-exception";

const DAYS = 5;
const PERIODS = 8;

export interface OfferingInput {
  courseId: string;
  facultyId: string;
  roomId?: string | null;
  periodsPerWeek: number;
}

export async function generateTimetable(input: {
  branch: string;
  semester: number;
  section?: string | null;
  workspaceId?: string | null;
  offerings: OfferingInput[];
}) {
  if (input.offerings.length === 0) throw new HTTPException(400, { message: "Need at least one offering" });

  const workspaceWhere = input.workspaceId ? { workspaceId: input.workspaceId } : {};
  const courses = await prisma.course.findMany({
    where: { id: { in: input.offerings.map((o) => o.courseId) }, ...workspaceWhere },
  });
  const faculty = await prisma.faculty.findMany({
    where: { id: { in: input.offerings.map((o) => o.facultyId) }, ...workspaceWhere },
  });
  const rooms = await prisma.room.findMany({ where: workspaceWhere });
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const facultyById = new Map(faculty.map((f) => [f.id, f]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const facultyBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const taken = new Set<string>();
  const slots: {
    day: number;
    period: number;
    course: string;
    code: string | null;
    room: string | null;
    faculty: string | null;
    facultyId: string;
    roomId: string | null;
    courseId: string;
  }[] = [];
  const unplaced: { courseId: string; remaining: number }[] = [];

  const pickRoom = (preferred: string | null | undefined, day: number, period: number): string | null => {
    if (preferred && !roomBusy.has(`${preferred}:${day}:${period}`)) return preferred;
    for (const r of rooms) {
      if (!roomBusy.has(`${r.id}:${day}:${period}`)) return r.id;
    }
    return null;
  };

  for (const off of input.offerings) {
    const course = courseById.get(off.courseId);
    const fac = facultyById.get(off.facultyId);
    if (!course || !fac) throw new HTTPException(400, { message: "Unknown course or faculty in offerings" });
    let placed = 0;
    for (let day = 0; day < DAYS && placed < off.periodsPerWeek; day++) {
      for (let period = 1; period <= PERIODS && placed < off.periodsPerWeek; period++) {
        const cell = `${day}:${period}`;
        if (taken.has(cell)) continue;
        if (facultyBusy.has(`${off.facultyId}:${day}:${period}`)) continue;
        const roomId = pickRoom(off.roomId, day, period);
        if (!roomId) continue;
        const room = roomById.get(roomId);
        taken.add(cell);
        facultyBusy.add(`${off.facultyId}:${day}:${period}`);
        roomBusy.add(`${roomId}:${day}:${period}`);
        slots.push({
          day,
          period,
          course: course.name,
          code: course.code,
          room: room?.code ?? null,
          faculty: fac.name,
          facultyId: fac.id,
          roomId,
          courseId: course.id,
        });
        placed++;
      }
    }
    if (placed < off.periodsPerWeek) unplaced.push({ courseId: off.courseId, remaining: off.periodsPerWeek - placed });
  }

  const timetable = await prisma.timetable.create({
    data: {
      branch: input.branch,
      semester: input.semester,
      section: input.section ?? null,
      workspaceId: input.workspaceId ?? null,
      slots: { create: slots },
    },
    include: { slots: { include: { facultyRef: true, roomRef: true, courseRef: true }, orderBy: [{ day: "asc" }, { period: "asc" }] } },
  });

  return { timetable, unplaced };
}

export async function allocateInvigilation(input: {
  date: Date;
  periods: number[];
  roomIds: string[];
  workspaceId: string | null;
}) {
  const jsDay = input.date.getDay();
  const day = jsDay === 0 ? 6 : jsDay - 1;
  const faculty = await prisma.faculty.findMany({
    where: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    include: { slots: { where: { day } } },
  });
  if (faculty.length === 0) throw new HTTPException(400, { message: "No faculty to assign" });
  const rooms = await prisma.room.findMany({
    where: input.roomIds.length ? { id: { in: input.roomIds } } : input.workspaceId ? { workspaceId: input.workspaceId } : {},
  });
  if (rooms.length === 0) throw new HTTPException(400, { message: "No rooms to cover" });

  const load = new Map(faculty.map((f) => [f.id, f.slots.length]));
  const duties: { date: Date; period: number; facultyId: string; roomId: string; notes: string; workspaceId: string | null }[] = [];

  for (const period of input.periods) {
    for (const room of rooms) {
      const ranked = [...faculty]
        .filter((f) => !f.slots.some((s) => s.period === period))
        .filter((f) => !duties.some((d) => d.facultyId === f.id && d.period === period))
        .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
      const pick = ranked[0];
      if (!pick) continue;
      load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
      duties.push({
        date: input.date,
        period,
        facultyId: pick.id,
        roomId: room.id,
        notes: `Invigilation · ${room.code} · period ${period}`,
        workspaceId: input.workspaceId,
      });
    }
  }

  if (duties.length === 0) throw new HTTPException(409, { message: "No invigilator could be placed without a clash" });

  await prisma.invigilationDuty.createMany({ data: duties });
  return prisma.invigilationDuty.findMany({
    where: { date: input.date, workspaceId: input.workspaceId },
    include: { faculty: true, room: true },
    orderBy: [{ period: "asc" }, { facultyId: "asc" }],
  });
}
