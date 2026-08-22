import type { Context } from "hono";
import { env } from "../config/env";

/** Basic-auth gate for Prometheus scrapes. Production fails closed if creds are unset. */
export function metricsAuthDenied(c: Context): Response | null {
  const credsSet = Boolean(env.METRICS_USERNAME && env.METRICS_PASSWORD);
  if (env.NODE_ENV === "production" && !credsSet) {
    return c.text("Unauthorized", 401, { "WWW-Authenticate": 'Basic realm="Metrics"' });
  }
  if (!credsSet) return null;

  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return c.text("Unauthorized", 401, { "WWW-Authenticate": 'Basic realm="Metrics"' });
  }
  const decoded = atob(auth.slice(6));
  const [username, password] = decoded.split(":");
  if (username !== env.METRICS_USERNAME || password !== env.METRICS_PASSWORD) {
    return c.text("Unauthorized", 401, { "WWW-Authenticate": 'Basic realm="Metrics"' });
  }
  return null;
}
