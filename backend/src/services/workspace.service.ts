import { prisma } from "../config/db";

export const DEMO_WORKSPACE_SLUG = "demo";

export async function ensureDemoWorkspace() {
  const ws = await prisma.workspace.upsert({
    where: { slug: DEMO_WORKSPACE_SLUG },
    update: {},
    create: { name: "Quill Demo", slug: DEMO_WORKSPACE_SLUG },
  });
  await prisma.user.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.document.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.faculty.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.room.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.course.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.extraClass.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.student.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.assignment.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });
  await prisma.invigilationDuty.updateMany({ where: { workspaceId: null }, data: { workspaceId: ws.id } });

  const unscoped = await prisma.timetable.findMany({
    where: { workspaceId: null },
    select: { id: true, extraction: { select: { document: { select: { workspaceId: true } } } } },
  });
  for (const row of unscoped) {
    await prisma.timetable.update({
      where: { id: row.id },
      data: { workspaceId: row.extraction?.document.workspaceId ?? ws.id },
    });
  }
  return ws;
}
