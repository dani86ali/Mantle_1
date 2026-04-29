import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

export function tenantKey(tenantId: string, ...parts: string[]): string {
  return `tenant:${tenantId}:${parts.join(":")}`;
}
