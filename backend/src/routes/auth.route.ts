import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setCookie } from "hono/cookie";
import { prisma } from "../config/db";
import { env } from "../config/env";
import {
  verifyPassword,
  hashPassword,
  signToken,
  COOKIE_NAME,
  cookieOptions,
  publicUser,
  type SessionUser,
} from "../services/auth.service";
import { loginSchema, passwordChangeSchema, workspaceCreateSchema, workspaceSwitchSchema } from "../validators/auth.validator";
import { authMiddleware, requireRole } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { ok } from "../utils/response";
import { auditLog, AuditAction, getClientIp } from "../services/audit.service";

export const authRouter = new Hono();

authRouter.post("/login", rateLimit({ prefix: "login", limit: 10, windowSec: 900, by: "ip" }), async (c) => {
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid input" });

  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    await auditLog({
      action: AuditAction.LOGIN_FAILED,
      entity: "user",
      ip: getClientIp(c),
      metadata: { email: body.data.email.toLowerCase() },
    });
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const session: SessionUser = { id: user.id, email: user.email, role: user.role, workspaceId: user.workspaceId };
  const token = await signToken(session);

  // Set secure cookie with proper flags
  setCookie(c, COOKIE_NAME, token, cookieOptions(env.NODE_ENV === "production"));

  await auditLog({
    action: AuditAction.LOGIN,
    entity: "user",
    entityId: user.id,
    user: session,
    ip: getClientIp(c),
    metadata: { email: user.email, role: user.role },
  });

  return c.json(ok(await publicUser(user)));
});

authRouter.post("/logout", (c) => {
  const sessionUser = c.get("user") as SessionUser | undefined;
  setCookie(c, COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });

  if (sessionUser) {
    void auditLog({
      action: AuditAction.LOGOUT,
      entity: "user",
      entityId: sessionUser.id,
      user: sessionUser,
      ip: getClientIp(c),
    });
  }

  return c.json(ok({ loggedOut: true }));
});

authRouter.get("/me", authMiddleware, async (c) => {
  const user = c.get("user") as SessionUser;
  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) throw new HTTPException(404, { message: "User not found" });
  return c.json(ok(await publicUser(full)));
});

authRouter.get("/users", authMiddleware, requireRole("ADMIN"), async (c) => {
  const user = c.get("user") as SessionUser;
  const rows = await prisma.user.findMany({
    where: user.workspaceId ? { workspaceId: user.workspaceId } : {},
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true, workspaceId: true },
  });
  return c.json(ok(rows));
});

authRouter.post("/password", authMiddleware, rateLimit({ prefix: "password", limit: 10, windowSec: 900, by: "user" }), async (c) => {
  const session = c.get("user") as SessionUser;
  const body = passwordChangeSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid input" });
  const full = await prisma.user.findUnique({ where: { id: session.id } });
  if (!full) throw new HTTPException(404, { message: "User not found" });
  if (!(await verifyPassword(body.data.currentPassword, full.passwordHash))) {
    throw new HTTPException(401, { message: "Current password is incorrect" });
  }
  await prisma.user.update({
    where: { id: full.id },
    data: { passwordHash: await hashPassword(body.data.newPassword) },
  });
  await auditLog({
    action: AuditAction.PASSWORD_CHANGE,
    entity: "user",
    entityId: full.id,
    user: session,
    ip: getClientIp(c),
  });
  return c.json(ok({ changed: true }));
});

authRouter.get("/workspaces", authMiddleware, requireRole("ADMIN"), async (c) => {
  const rows = await prisma.workspace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  return c.json(ok(rows));
});

authRouter.post("/workspaces", authMiddleware, requireRole("ADMIN"), async (c) => {
  const session = c.get("user") as SessionUser;
  const body = workspaceCreateSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid workspace" });
  const row = await prisma.workspace.create({ data: { name: body.data.name, slug: body.data.slug } });
  await auditLog({
    action: AuditAction.WORKSPACE_CREATE,
    entity: "workspace",
    entityId: row.id,
    user: session,
    ip: getClientIp(c),
    metadata: { name: row.name, slug: row.slug },
  });
  return c.json(ok(row), 201);
});

authRouter.post("/workspaces/switch", authMiddleware, requireRole("ADMIN"), async (c) => {
  const session = c.get("user") as SessionUser;
  const body = workspaceSwitchSchema.safeParse(await c.req.json());
  if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? "Invalid switch" });
  const ws = await prisma.workspace.findUnique({ where: { id: body.data.workspaceId } });
  if (!ws) throw new HTTPException(404, { message: "Workspace not found" });
  const updated = await prisma.user.update({
    where: { id: session.id },
    data: { workspaceId: ws.id },
  });
  const next: SessionUser = { id: updated.id, email: updated.email, role: updated.role, workspaceId: updated.workspaceId };
  const token = await signToken(next);
  setCookie(c, COOKIE_NAME, token, cookieOptions(env.NODE_ENV === "production"));
  await auditLog({
    action: AuditAction.WORKSPACE_UPDATE,
    entity: "workspace",
    entityId: ws.id,
    user: next,
    ip: getClientIp(c),
    metadata: { switchedTo: ws.slug },
  });
  return c.json(ok(await publicUser(updated)));
});
