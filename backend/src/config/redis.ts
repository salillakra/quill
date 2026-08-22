import { Redis } from "ioredis";
import { env } from "./env";

/**
 * Shared Redis connection for BullMQ queues/workers. ioredis auto-connects
 * on first use — never call redis.connect() explicitly, BullMQ does that
 * and a manual connect races it.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

export async function pingRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
