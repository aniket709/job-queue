import { Job } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";

/**
 * Exponential backoff with jitter.
 * attempt 1 -> ~2s, attempt 2 -> ~4s, attempt 3 -> ~8s ... capped at 60s.
 * Jitter avoids a "thundering herd" where many jobs retry at the exact same millisecond.
 */
function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 60_000);
  const jitter = Math.random() * 1000;
  return base + jitter;
}

export async function handleFailure(job: Job, error: Error) {
  const attempts = job.attempts + 1;
  const exceededRetries = attempts >= job.maxAttempts;

  if (exceededRetries) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "dead",
        attempts,
        lastError: error.message,
        lockedAt: null,
        lockedBy: null,
      },
    });
    logger.warn({ jobId: job.id, attempts }, "job moved to dead letter queue");
    return;
  }

  const delay = backoffMs(attempts);
  const runAt = new Date(Date.now() + delay);

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "pending",
      attempts,
      runAt,
      lastError: error.message,
      lockedAt: null,
      lockedBy: null,
    },
  });

  // Schedule the retry in Redis's delayed set; the promoter will move it
  // to the waiting queue once `runAt` has passed.
  await redis.zadd(KEYS.delayed, runAt.getTime(), job.id);

  logger.warn({ jobId: job.id, attempts, retryInMs: Math.round(delay) }, "job failed, scheduled retry");
}
