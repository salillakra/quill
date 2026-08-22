import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { analyticsSummary, pipelineLatency, activityLast30Days } from "../services/analytics.service";
import { ok } from "../utils/response";
import type { SessionUser } from "../services/auth.service";

export const analyticsRouter = new Hono();
analyticsRouter.use("*", authMiddleware);

analyticsRouter.get("/summary", async (c) => {
  const user = c.get("user") as SessionUser;
  return c.json(ok(await analyticsSummary(user.workspaceId)));
});

analyticsRouter.get("/pipeline-latency", async (c) => {
  const user = c.get("user") as SessionUser;
  return c.json(ok(await pipelineLatency(user.workspaceId)));
});

analyticsRouter.get("/activity", async (c) => {
  const user = c.get("user") as SessionUser;
  return c.json(ok(await activityLast30Days(user.workspaceId)));
});
