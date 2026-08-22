import { PrismaClient } from "@prisma/client";
import { seedDemoUsers } from "../src/services/auth.service";
import { ensureDemoWorkspace } from "../src/services/workspace.service";

const prisma = new PrismaClient();

async function main() {
  const ws = await ensureDemoWorkspace();
  await seedDemoUsers(prisma);
  await prisma.user.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@quill.ai" } });
  const facultyUser = await prisma.user.findUniqueOrThrow({ where: { email: "faculty@quill.ai" } });
  const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: "student@quill.ai" } });
  const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: "parent@quill.ai" } });

  await prisma.faculty.upsert({
    where: { workspaceId_email: { workspaceId: ws.id, email: "admin@quill.ai" } },
    update: { name: "Quill Admin", userId: admin.id },
    create: { name: "Quill Admin", email: "admin@quill.ai", userId: admin.id, workspaceId: ws.id },
  });

  const rao = await prisma.faculty.upsert({
    where: { workspaceId_email: { workspaceId: ws.id, email: "faculty@quill.ai" } },
    update: { name: "Priya Rao", userId: facultyUser.id },
    create: { name: "Priya Rao", email: "faculty@quill.ai", userId: facultyUser.id, workspaceId: ws.id },
  });

  for (const c of [
    { code: "CS201", name: "Data Structures" },
    { code: "MA101", name: "Calculus" },
    { code: "PHY102", name: "Physics" },
  ]) {
    await prisma.course.upsert({
      where: { workspaceId_code: { workspaceId: ws.id, code: c.code } },
      update: { name: c.name, workspaceId: ws.id },
      create: { ...c, workspaceId: ws.id },
    });
  }

  for (const r of [
    { code: "LH-1", name: "Lecture Hall 1", capacity: 120 },
    { code: "LH-2", name: "Lecture Hall 2", capacity: 80 },
    { code: "LAB-A", name: "CS Lab A", capacity: 40 },
  ]) {
    await prisma.room.upsert({
      where: { workspaceId_code: { workspaceId: ws.id, code: r.code } },
      update: { name: r.name, capacity: r.capacity, workspaceId: ws.id },
      create: { ...r, workspaceId: ws.id },
    });
  }

  const cs201 = await prisma.course.findUniqueOrThrow({ where: { workspaceId_code: { workspaceId: ws.id, code: "CS201" } } });
  const lh1 = await prisma.room.findUniqueOrThrow({ where: { workspaceId_code: { workspaceId: ws.id, code: "LH-1" } } });

  const startsAt = new Date();
  startsAt.setHours(16, 0, 0, 0);
  const endsAt = new Date();
  endsAt.setHours(17, 0, 0, 0);

  const extra = await prisma.extraClass.findFirst({
    where: { title: "Doubt session — Data Structures", facultyId: rao.id },
  });
  if (!extra) {
    await prisma.extraClass.create({
      data: {
        title: "Doubt session — Data Structures",
        notes: "Seeded extra class for the Today workspace",
        startsAt,
        endsAt,
        facultyId: rao.id,
        courseId: cs201.id,
        roomId: lh1.id,
        workspaceId: ws.id,
      },
    });
  }

  for (const s of [
    { name: "Aanya Sharma", section: "A", rollNo: "01" },
    { name: "Rohan Patel", section: "A", rollNo: "02" },
    { name: "Diya Nair", section: "A", rollNo: "03" },
  ]) {
    await prisma.student.upsert({
      where: { workspaceId_section_rollNo: { workspaceId: ws.id, section: s.section, rollNo: s.rollNo } },
      update: { name: s.name, workspaceId: ws.id, ...(s.rollNo === "01" ? { userId: studentUser.id } : {}) },
      create: { ...s, workspaceId: ws.id, ...(s.rollNo === "01" ? { userId: studentUser.id } : {}) },
    });
  }

  const aanya = await prisma.student.findUniqueOrThrow({
    where: { workspaceId_section_rollNo: { workspaceId: ws.id, section: "A", rollNo: "01" } },
  });
  await prisma.parentLink.upsert({
    where: { parentUserId_studentId: { parentUserId: parentUser.id, studentId: aanya.id } },
    update: {},
    create: { parentUserId: parentUser.id, studentId: aanya.id },
  });

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 2);
  dueAt.setHours(17, 0, 0, 0);

  const assignment = await prisma.assignment.findFirst({ where: { title: "Midterm — Data Structures" } });
  if (!assignment) {
    await prisma.assignment.create({
      data: {
        title: "Midterm — Data Structures",
        workspaceId: ws.id,
        dueAt,
        rubric: [
          { id: "correctness", criterion: "Correctness", maxMarks: 10 },
          { id: "completeness", criterion: "Completeness", maxMarks: 5 },
          { id: "clarity", criterion: "Clarity", maxMarks: 5 },
        ],
      },
    });
  } else {
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { workspaceId: ws.id, dueAt: assignment.dueAt ?? dueAt },
    });
  }

  console.log("✅ Seed complete — admin / faculty / student / parent @quill.ai · quill123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
