import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env";
import { prisma } from "../config/db";
import type { PrismaClient, Role } from "@prisma/client";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  workspaceId: string | null;
}

export async function publicUser(user: { id: string; email: string; name: string; role: Role; workspaceId?: string | null }) {
  const [faculty, student, workspace] = await Promise.all([
    prisma.faculty.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.student.findUnique({ where: { userId: user.id }, select: { id: true } }),
    user.workspaceId
      ? prisma.workspace.findUnique({ where: { id: user.workspaceId }, select: { id: true, name: true, slug: true } })
      : Promise.resolve(null),
  ]);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    facultyId: faculty?.id ?? null,
    studentId: student?.id ?? null,
    workspaceId: user.workspaceId ?? null,
    workspace: workspace ?? null,
  };
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, workspaceId: user.workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.email || !payload.role) return null;
    return {
      id: payload.sub,
      email: payload.email as string,
      role: payload.role as Role,
      workspaceId: (payload.workspaceId as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "quill_session";

export function cookieOptions(secure = true) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function seedDemoUsers(db: PrismaClient = prisma): Promise<void> {
  const hash = await hashPassword("quill123");
  const users: [string, string, Role][] = [
    ["admin@quill.ai", "Quill Admin", "ADMIN"],
    ["educator@quill.ai", "Quill Educator", "EDUCATOR"],
    ["faculty@quill.ai", "Priya Rao", "EDUCATOR"],
    ["analyst@quill.ai", "Quill Analyst", "ANALYST"],
    ["student@quill.ai", "Aanya Sharma", "STUDENT"],
    ["parent@quill.ai", "Karan Sharma", "PARENT"],
  ];
  for (const [email, name, role] of users) {
    await db.user.upsert({
      where: { email },
      update: {},
      create: { email, name, passwordHash: hash, role },
    });
  }
}
