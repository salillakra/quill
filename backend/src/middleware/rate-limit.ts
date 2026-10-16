import { redis } from "../config/redis";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import type { SessionUser } from "../services/auth.service";

export async function hitRateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    const ttl = await redis.ttl(key);
    return {
      ok: n <= limit,
      remaining: Math.max(0, limit - n),
      retryAfter: ttl > 0 ? ttl : windowSec,
    };
  } catch {
    // Redis unavailable — fail open so the API stays responsive
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") || "local";
}

export function rateLimit(opts: { prefix: string; limit: number; windowSec: number; by: "ip" | "user" }) {
  return createMiddleware(async (c, next) => {
    const id =
      opts.by === "user"
        ? ((c.get("user") as SessionUser | undefined)?.id ?? clientIp(c))
        : clientIp(c);
    const result = await hitRateLimit(`rl:${opts.prefix}:${id}`, opts.limit, opts.windowSec);
    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.ok) {
      c.header("Retry-After", String(result.retryAfter));
      throw new HTTPException(429, { message: "Too many requests" });
    }
    await next();
  });
}
