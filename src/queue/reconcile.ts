import { prisma } from "../lib/prisma";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";

/**
 * Rebuilds Redis's queues from Postgres.
 *
 * Why this exists: Redis only holds job IDs as a fast dispatch layer.
 * If Redis is flushed, restarted, or loses data, jobs are NOT lost --
 * Postgres is the source of truth. Run this on worker/promoter startup
 * (and optionally on a schedule) to re-sync Redis with reality.
 */
export async function reconcile() {
  const now = new Date();

  // Anything pending and due now -> should be in the waiting list.
  const dueJobs = await prisma.job.findMany({
    where: { status: "pending", runAt: { lte: now } },
    select: { id: true },
  });

  // Anything pending but scheduled for the future -> should be in the delayed set.
  const futureJobs = await prisma.job.findMany({
    where: { status: "pending", runAt: { gt: now } },
    select: { id: true, runAt: true },
  });

  if (dueJobs.length > 0) {
    const pipeline = redis.pipeline();
    for (const job of dueJobs) pipeline.lpush(KEYS.waiting, job.id);
    await pipeline.exec();
  }

  if (futureJobs.length > 0) {
    const pipeline = redis.pipeline();
    for (const job of futureJobs) pipeline.zadd(KEYS.delayed, job.runAt.getTime(), job.id);
    await pipeline.exec();
  }

  logger.info(
    { dueJobs: dueJobs.length, futureJobs: futureJobs.length },
    "reconciliation complete: Redis rebuilt from Postgres"
  );
}
