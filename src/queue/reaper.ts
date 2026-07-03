import "dotenv/config";
import { prisma } from "../lib/prisma";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";

const STUCK_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const CHECK_INTERVAL_MS = 30_000;

/**
 * If a worker crashes mid-job, that job's row stays `status=active`
 * forever with nothing watching it. This periodic sweep finds jobs
 * that have been "active" for too long and requeues them.
 */
async function reapStuckJobs() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuckJobs = await prisma.job.findMany({
    where: { status: "active", lockedAt: { lt: cutoff } },
  });

  if (stuckJobs.length === 0) return;

  for (const job of stuckJobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "pending", lockedAt: null, lockedBy: null },
    });
    await redis.lpush(KEYS.waiting, job.id);
  }

  logger.warn({ count: stuckJobs.length }, "reaper requeued stuck jobs");
}

async function main() {
  logger.info("reaper started");
  setInterval(() => {
    reapStuckJobs().catch((err) => logger.error(err, "reaper tick failed"));
  }, CHECK_INTERVAL_MS);
}

main();
