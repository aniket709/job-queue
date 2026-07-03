import "dotenv/config";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 1000;

/**
 * Every second, check the delayed sorted set for any jobs whose `runAt`
 * score is now in the past, and move them into the waiting list so
 * workers can pick them up. This is what makes retries and scheduled
 * ("run this at 3pm") jobs actually fire.
 */
async function promoteDueJobs() {
  const now = Date.now();
  const dueJobIds = await redis.zrangebyscore(KEYS.delayed, 0, now);

  if (dueJobIds.length === 0) return;

  const pipeline = redis.pipeline();
  for (const jobId of dueJobIds) {
    pipeline.lpush(KEYS.waiting, jobId);
    pipeline.zrem(KEYS.delayed, jobId);
  }
  await pipeline.exec();

  logger.info({ count: dueJobIds.length }, "promoted delayed jobs to waiting queue");
}

async function main() {
  logger.info("promoter started");
  setInterval(() => {
    promoteDueJobs().catch((err) => logger.error(err, "promoter tick failed"));
  }, POLL_INTERVAL_MS);
}

main();
