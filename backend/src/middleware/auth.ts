import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { prisma } from "../config/db";
import { verifyToken, COOKIE_NAME, type SessionUser } from "../services/auth.service";
import type { Role } from "@prisma/client";

function extractToken(c: any): string | null {
  const cookie = c.req.header("cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  const bearer = c.req.header("authorization") ?? "";
  if (bearer.startsWith("Bearer ")) return bearer.slice(7);
  return null;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = extractToken(c);
  if (!token) throw new HTTPException(401, { message: "Unauthorized" });
  const user = await verifyToken(token);
  if (!user) throw new HTTPException(401, { message: "Invalid or expired session" });
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, role: true, workspaceId: true },
  });
  if (!row) throw new HTTPException(401, { message: "Invalid or expired session" });
  c.set("user", {
    id: user.id,
    email: row.email,
    role: row.role,
    workspaceId: row.workspaceId,
  } satisfies SessionUser);
  await next();
});

export function requireRole(...roles: Role[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user") as SessionUser | undefined;
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: `Requires role: ${roles.join(" or ")}` });
    }
    await next();
  });
}
