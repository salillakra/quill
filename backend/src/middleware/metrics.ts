import { createMiddleware } from "hono/factory";
import { recordHttpRequest } from "../services/metrics.service";
import { getCorrelationId } from "./correlation";
import { logger } from "../utils/logger";

/**
 * Middleware to record HTTP request metrics (latency, count by route/status)
 * and structured logging with correlation IDs.
 */
export const metricsMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const correlationId = getCorrelationId(c);

  // Log request start
  logger.debug("HTTP request started", {
    correlationId,
    method: c.req.method,
    path: c.req.path,
    query: Object.fromEntries(new URL(c.req.url).searchParams),
  });

  try {
    await next();
  } finally {
    const durationMs = Date.now() - start;
    // Use route pattern if available, fallback to raw path
    const route = (c as any).matchedRoutes?.[0] ?? c.req.path;
    const status = c.res.status;

    // Record metrics
    recordHttpRequest(c.req.method, route, status, durationMs);

    // Log request completion
    logger.info("HTTP request completed", {
      correlationId,
      method: c.req.method,
      path: c.req.path,
      route,
      status,
      durationMs,
    });
  }
});