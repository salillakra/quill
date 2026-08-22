import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";

/**
 * One ID threads through HTTP → queue → worker → LLM → DB, so a single
 * failure is traceable end-to-end with a log grep.
 */
export const correlationMiddleware = createMiddleware(async (c, next) => {
  const correlationId = c.req.header("x-correlation-id") ?? randomUUID();
  c.set("correlationId", correlationId);
  c.header("x-correlation-id", correlationId);
  await next();
});

export function getCorrelationId(c: { get: (k: string) => unknown }): string {
  return (c.get("correlationId") as string) ?? "no-correlation";
}
