import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { ok } from "../utils/response";
import type { SessionUser } from "../services/auth.service";
import { generateTimetable, allocateInvigilation } from "../services/timetable-solver.service";
import { toCsv, csvHeaders } from "../utils/csv";
import {
  facultyInput,
  roomInput,
  courseInput,
  extraClassInput,
  slotPatch,
  timetablePatch,
  timetableGenerate,
  invigilationInput,
} from "../validators/campus.validator";
import { rateLimit } from "../middleware/rate-limit";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const campusRouter = new Hono();
campusRouter.use("*", authMiddleware);

// Rate limiting for campus write operations
const campusWriteLimit = rateLimit({ prefix: "campus-write", limit: 50, windowSec: 300, by: "user" });
const mutateCampus = requireRole("ADMIN", "EDUCATOR");

function assertWorkspace(rowWorkspaceId: string | null | undefined, user: SessionUser, notFound = "Not found") {
  if (user.workspaceId && rowWorkspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: notFound });
  }
}

const slotInclude = {
  facultyRef: true,
  roomRef: true,
  courseRef: true,
} as const;

// GET /api/campus/today — Samyak day view
campusRouter.get("/today", async (c) => {
  const user = c.get("user") as SessionUser;
  const now = new Date();
  const jsDay = now.getDay(); // 0 Sun .. 6 Sat
  const day = jsDay === 0 ? 6 : jsDay - 1; // 0 Mon .. 6 Sun
  const faculty = await prisma.faculty.findUnique({ where: { userId: user.id } });

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const extraWhere =
    user.role === "ADMIN" || !faculty
      ? { startsAt: { gte: start, lte: end }, ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}) }
      : { facultyId: faculty.id, startsAt: { gte: start, lte: end } };

  const extraClasses = await prisma.extraClass.findMany({
    where: extraWhere,
    include: { faculty: true, course: true, room: true },
    orderBy: { startsAt: "asc" },
  });

  const dueEnd = new Date(end);
  dueEnd.setDate(dueEnd.getDate() + 7);
  const dueAssignments = await prisma.assignment.findMany({
    where: {
      dueAt: { gte: start, lte: dueEnd },
      ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}),
    },
    select: { id: true, title: true, dueAt: true },
    orderBy: { dueAt: "asc" },
  });

  const invigilations = await prisma.invigilationDuty.findMany({
    where: {
      date: { gte: start, lte: end },
      ...(faculty && user.role !== "ADMIN" ? { facultyId: faculty.id } : {}),
      ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}),
    },
    include: { faculty: true, room: true },
    orderBy: { period: "asc" },
  });

  if (day > 4) {
    return c.json(
      ok({
        day,
        weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
        faculty,
        slots: [],
        extraClasses,
        dueAssignments,
        invigilations,
      }),
    );
  }

  const slotWhere =
    user.role === "ADMIN" || !faculty ? { day } : { day, facultyId: faculty.id };

  const slots = await prisma.timetableSlot.findMany({
    where: {
      ...slotWhere,
      ...(user.workspaceId ? { timetable: { workspaceId: user.workspaceId } } : {}),
    },
    include: { ...slotInclude, timetable: { select: { id: true, branch: true, semester: true, section: true } } },
    orderBy: [{ period: "asc" }, { timetableId: "asc" }],
  });

  return c.json(
    ok({
      day,
      weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day],
      faculty,
      slots,
      extraClasses,
      dueAssignments,
      invigilations,
    }),
  );
});

campusRouter.get("/faculty", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.faculty.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { name: "asc" },
    include: { user: { select: { id: true, email: true, role: true } } },
  });
  return c.json(ok(rows));
});

campusRouter.post("/faculty", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = facultyInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid faculty" });
  const row = await prisma.faculty.create({ data: { ...parsed.data, workspaceId: user.workspaceId } });

  await auditLog({
    action: AuditAction.FACULTY_CREATE,
    entity: "faculty",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { name: row.name, email: row.email },
  });

  return c.json(ok(row), 201);
});

campusRouter.patch("/faculty/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = facultyInput.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid faculty" });
  const id = c.req.param("id");
  const fac = await prisma.faculty.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!fac) throw new HTTPException(404, { message: "Faculty not found" });
  if (user.workspaceId && fac.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Faculty not found" });
  }
  if (parsed.data.userId) {
    await prisma.faculty.updateMany({
      where: { userId: parsed.data.userId, NOT: { id } },
      data: { userId: null },
    });
  }
  const row = await prisma.faculty.update({
    where: { id },
    data: parsed.data,
    include: { user: { select: { id: true, email: true, role: true } } },
  });

  await auditLog({
    action: AuditAction.FACULTY_UPDATE,
    entity: "faculty",
    entityId: id,
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(parsed.data) },
  });

  return c.json(ok(row));
});

campusRouter.delete("/faculty/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const fac = await prisma.faculty.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!fac) throw new HTTPException(404, { message: "Faculty not found" });
  if (user.workspaceId && fac.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Faculty not found" });
  }
  await prisma.faculty.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.FACULTY_DELETE,
    entity: "faculty",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});

campusRouter.get("/rooms", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.room.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { code: "asc" },
  });
  return c.json(ok(rows));
});

campusRouter.post("/rooms", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = roomInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid room" });
  const row = await prisma.room.create({ data: { ...parsed.data, workspaceId: user.workspaceId } });

  await auditLog({
    action: AuditAction.ROOM_CREATE,
    entity: "room",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { code: row.code, name: row.name },
  });

  return c.json(ok(row), 201);
});

campusRouter.patch("/rooms/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = roomInput.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid room" });
  const room = await prisma.room.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!room) throw new HTTPException(404, { message: "Room not found" });
  if (user.workspaceId && room.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Room not found" });
  }
  const row = await prisma.room.update({ where: { id: c.req.param("id") }, data: parsed.data });

  await auditLog({
    action: AuditAction.ROOM_UPDATE,
    entity: "room",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(parsed.data) },
  });

  return c.json(ok(row));
});

campusRouter.delete("/rooms/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const room = await prisma.room.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!room) throw new HTTPException(404, { message: "Room not found" });
  if (user.workspaceId && room.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Room not found" });
  }
  await prisma.room.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.ROOM_DELETE,
    entity: "room",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});

campusRouter.get("/courses", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.course.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { code: "asc" },
  });
  return c.json(ok(rows));
});

campusRouter.post("/courses", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = courseInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid course" });
  const row = await prisma.course.create({ data: { ...parsed.data, workspaceId: user.workspaceId } });

  await auditLog({
    action: AuditAction.COURSE_CREATE,
    entity: "course",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { code: row.code, name: row.name },
  });

  return c.json(ok(row), 201);
});

campusRouter.patch("/courses/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = courseInput.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid course" });
  const course = await prisma.course.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!course) throw new HTTPException(404, { message: "Course not found" });
  if (user.workspaceId && course.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Course not found" });
  }
  const row = await prisma.course.update({ where: { id: c.req.param("id") }, data: parsed.data });

  await auditLog({
    action: AuditAction.COURSE_UPDATE,
    entity: "course",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(parsed.data) },
  });

  return c.json(ok(row));
});

campusRouter.delete("/courses/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const course = await prisma.course.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!course) throw new HTTPException(404, { message: "Course not found" });
  if (user.workspaceId && course.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Course not found" });
  }
  await prisma.course.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.COURSE_DELETE,
    entity: "course",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});

campusRouter.get("/timetables", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.timetable.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      extraction: { select: { id: true, documentId: true } },
      slots: { include: slotInclude, orderBy: [{ day: "asc" }, { period: "asc" }] },
    },
  });
  return c.json(ok(rows));
});

campusRouter.post("/timetables/generate", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = timetableGenerate.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid generate" });
  const result = await generateTimetable({ ...parsed.data, workspaceId: user.workspaceId });

  await auditLog({
    action: AuditAction.TIMETABLE_GENERATE,
    entity: "timetable",
    entityId: result.timetable?.id ?? "unknown",
    user,
    ip: getClientIp(c),
    metadata: { branch: parsed.data.branch, semester: parsed.data.semester, section: parsed.data.section },
  });

  return c.json(ok(result), 201);
});

campusRouter.get("/timetables/:id/export.csv", async (c) => {
  const user = c.get("user") as SessionUser;
  const row = await prisma.timetable.findUnique({
    where: { id: c.req.param("id") },
    include: {
      slots: { include: slotInclude, orderBy: [{ day: "asc" }, { period: "asc" }] },
    },
  });
  if (!row) throw new HTTPException(404, { message: "Timetable not found" });
  assertWorkspace(row.workspaceId, user, "Timetable not found");
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const body = toCsv(
    ["day", "period", "course", "code", "faculty", "room"],
    row.slots.map((s) => [
      days[s.day] ?? s.day,
      s.period,
      s.courseRef?.name ?? s.course,
      s.courseRef?.code ?? s.code,
      s.facultyRef?.name ?? s.faculty,
      s.roomRef?.code ?? s.room,
    ]),
  );
  return c.body(body, 200, csvHeaders(`timetable-${row.branch}-sem${row.semester}.csv`));
});

campusRouter.get("/timetables/:id", async (c) => {
  const user = c.get("user") as SessionUser;
  const row = await prisma.timetable.findUnique({
    where: { id: c.req.param("id") },
    include: {
      extraction: { select: { id: true, documentId: true } },
      slots: { include: slotInclude, orderBy: [{ day: "asc" }, { period: "asc" }] },
    },
  });
  if (!row) throw new HTTPException(404, { message: "Timetable not found" });
  assertWorkspace(row.workspaceId, user, "Timetable not found");
  return c.json(ok(row));
});

campusRouter.get("/invigilations", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.invigilationDuty.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    include: { faculty: true, room: true },
    orderBy: [{ date: "asc" }, { period: "asc" }],
  });
  return c.json(ok(rows));
});

campusRouter.post("/invigilations", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = invigilationInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid invigilation" });
  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) throw new HTTPException(400, { message: "Invalid date" });
  const rows = await allocateInvigilation({
    date,
    periods: parsed.data.periods,
    roomIds: parsed.data.roomIds ?? [],
    workspaceId: user.workspaceId,
  });

  await auditLog({
    action: AuditAction.INVIGILATION_ALLOCATE,
    entity: "invigilation",
    user,
    ip: getClientIp(c),
    metadata: { date: parsed.data.date, periods: parsed.data.periods.length, roomIds: parsed.data.roomIds?.length ?? 0 },
  });

  return c.json(ok(rows), 201);
});

campusRouter.patch("/timetables/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = timetablePatch.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid timetable" });
  const existing = await prisma.timetable.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!existing) throw new HTTPException(404, { message: "Timetable not found" });
  assertWorkspace(existing.workspaceId, user, "Timetable not found");
  const row = await prisma.timetable.update({
    where: { id: c.req.param("id") },
    data: parsed.data,
    include: {
      slots: { include: slotInclude, orderBy: [{ day: "asc" }, { period: "asc" }] },
    },
  });

  await auditLog({
    action: AuditAction.TIMETABLE_UPDATE,
    entity: "timetable",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(parsed.data) },
  });

  return c.json(ok(row));
});

campusRouter.delete("/timetables/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const existing = await prisma.timetable.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!existing) throw new HTTPException(404, { message: "Timetable not found" });
  assertWorkspace(existing.workspaceId, user, "Timetable not found");
  await prisma.timetable.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.TIMETABLE_DELETE,
    entity: "timetable",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});

campusRouter.patch("/slots/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = slotPatch.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid slot" });
  const existing = await prisma.timetableSlot.findUnique({
    where: { id: c.req.param("id") },
    include: { timetable: { select: { workspaceId: true } } },
  });
  if (!existing) throw new HTTPException(404, { message: "Slot not found" });
  assertWorkspace(existing.timetable.workspaceId, user, "Slot not found");
  const row = await prisma.timetableSlot.update({
    where: { id: c.req.param("id") },
    data: parsed.data,
    include: { ...slotInclude, timetable: { select: { id: true, workspaceId: true } } },
  });

  await auditLog({
    action: AuditAction.TIMETABLE_UPDATE, // Reusing for slot updates
    entity: "timetableSlot",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
    metadata: { updatedFields: Object.keys(parsed.data) },
  });

  return c.json(ok(row));
});

campusRouter.get("/extra-classes", async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.extraClass.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { startsAt: "desc" },
    include: { faculty: true, course: true, room: true },
  });
  return c.json(ok(rows));
});

campusRouter.post("/extra-classes", campusWriteLimit, mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const parsed = extraClassInput.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid extra class" });
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new HTTPException(400, { message: "Invalid extra-class times" });
  }
  const row = await prisma.extraClass.create({
    data: {
      title: parsed.data.title,
      notes: parsed.data.notes ?? null,
      startsAt,
      endsAt,
      facultyId: parsed.data.facultyId,
      courseId: parsed.data.courseId ?? null,
      roomId: parsed.data.roomId ?? null,
      workspaceId: user.workspaceId,
    },
    include: { faculty: true, course: true, room: true },
  });

  await auditLog({
    action: AuditAction.EXTRA_CLASS_CREATE,
    entity: "extraClass",
    entityId: row.id,
    user,
    ip: getClientIp(c),
    metadata: { title: row.title, facultyId: row.facultyId },
  });

  return c.json(ok(row), 201);
});

campusRouter.delete("/extra-classes/:id", mutateCampus, async (c) => {
  const user = c.get("user") as SessionUser;
  const extra = await prisma.extraClass.findUnique({ where: { id: c.req.param("id") }, select: { workspaceId: true } });
  if (!extra) throw new HTTPException(404, { message: "Extra class not found" });
  if (user.workspaceId && extra.workspaceId !== user.workspaceId) {
    throw new HTTPException(404, { message: "Extra class not found" });
  }
  await prisma.extraClass.delete({ where: { id: c.req.param("id") } });

  await auditLog({
    action: AuditAction.EXTRA_CLASS_DELETE,
    entity: "extraClass",
    entityId: c.req.param("id"),
    user,
    ip: getClientIp(c),
  });

  return c.json(ok({ deleted: c.req.param("id") }));
});
