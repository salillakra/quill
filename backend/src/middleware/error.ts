import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../utils/logger";

/** Global error handler — every uncaught error lands here, logged with correlation ID. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  logger.error("Unhandled error", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: c.req.path,
    correlationId: c.get("correlationId"),
  });
  return c.json({ error: "Internal server error" }, 500);
};

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFoundHandler() {
  return (c: any) => c.json({ error: "Not found" }, 404);
}
