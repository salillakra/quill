import { prisma } from "../config/db";

export async function resolveSlotFks(
  slot: {
    course: string;
    code: string | null;
    room: string | null;
    faculty: string | null;
  },
  workspaceId?: string | null,
) {
  const ws = workspaceId ? { workspaceId } : {};
  const courseRef = slot.code
    ? await prisma.course.findFirst({ where: { code: slot.code, ...ws } })
    : await prisma.course.findFirst({ where: { name: { equals: slot.course, mode: "insensitive" }, ...ws } });

  const roomRef = slot.room
    ? await prisma.room.findFirst({
        where: {
          ...ws,
          OR: [{ code: { equals: slot.room, mode: "insensitive" } }, { name: { equals: slot.room, mode: "insensitive" } }],
        },
      })
    : null;

  const facultyRef = slot.faculty
    ? await prisma.faculty.findFirst({
        where: {
          ...ws,
          OR: [{ name: { equals: slot.faculty, mode: "insensitive" } }, { email: { equals: slot.faculty, mode: "insensitive" } }],
        },
      })
    : null;

  return {
    courseId: courseRef?.id ?? null,
    roomId: roomRef?.id ?? null,
    facultyId: facultyRef?.id ?? null,
  };
}
