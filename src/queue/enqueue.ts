import { prisma } from "../lib/prisma";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";

export interface EnqueueOptions {
  runAt?: Date;           // schedule for the future (defaults to now)
  maxAttempts?: number;   // defaults to 5
  idempotencyKey?: string; // if provided, duplicate enqueues are ignored
}

/**
 * Enqueue a job.
 *
 * Postgres is the source of truth: the job row is created there first.
 * Redis only ever stores the job ID, in either:
 *  - `queue:waiting` (a List)   -> ready to run immediately
 *  - `queue:delayed` (a Sorted Set, scored by runAt) -> scheduled for later
 */
export async function enqueue(type: string, payload: object, options: EnqueueOptions = {}) {
  const runAt = options.runAt ?? new Date();

  // Idempotency: if a job with this key already exists, return it instead of creating a duplicate.
  if (options.idempotencyKey) {
    const existing = await prisma.job.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) {
      logger.info({ jobId: existing.id, idempotencyKey: options.idempotencyKey }, "duplicate enqueue skipped");
      return existing;
    }
  }

  const job = await prisma.job.create({
    data: {
      type,
      payload,
      runAt,
      maxAttempts: options.maxAttempts ?? 5,
      idempotencyKey: options.idempotencyKey,
    },
  });

  const isDueNow = runAt.getTime() <= Date.now();

  if (isDueNow) {
    await redis.lpush(KEYS.waiting, job.id);
  } else {
    await redis.zadd(KEYS.delayed, runAt.getTime(), job.id);
  }

  logger.info({ jobId: job.id, type, isDueNow }, "job enqueued");
  return job;
}
