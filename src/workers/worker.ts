import "dotenv/config";
import { v4 as uuid } from "uuid";
import { prisma } from "../lib/prisma";
import { redis, KEYS } from "../lib/redis";
import { logger } from "../lib/logger";
import { registry } from "../jobs/registry";
import { handleFailure } from "../queue/failureHandler";
import { reconcile } from "../queue/reconcile";

const WORKER_ID = `worker-${uuid().slice(0, 8)}`;
const BLOCK_TIMEOUT_SECONDS = 5; // how long BRPOP blocks before looping again (lets us check `running` flag)

let running = true;

/**
 * Pull the next job ID off Redis (blocking pop -- no busy polling),
 * then fetch the full record from Postgres and mark it active.
 * The `status !== 'pending'` guard protects against a stale ID
 * (e.g. duplicate push during a reconcile race).
 */
async function claimNextJob() {
  const result = await redis.brpop(KEYS.waiting, BLOCK_TIMEOUT_SECONDS);
  if (!result) return null; // timed out, no job available

  const [, jobId] = result;
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job || job.status !== "pending") {
    return null; // stale or already handled elsewhere
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "active", lockedAt: new Date(), lockedBy: WORKER_ID },
  });

  return job;
}

async function processJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) return;

  const handler = registry[job.type];
  if (!handler) {
    logger.error({ jobId: job.id, type: job.type }, "no handler registered for job type");
    await handleFailure(job, new Error(`no handler registered for type "${job.type}"`));
    return;
  }

  logger.info({ jobId: job.id, type: job.type, attempt: job.attempts + 1 }, "processing job");

  try {
    const result = await handler(job.payload);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), lockedAt: null, lockedBy: null },
    });
    logger.info({ jobId: job.id, result }, "job completed");
  } catch (err) {
    await handleFailure(job, err as Error);
  }
}

async function mainLoop() {
  while (running) {
    try {
      const job = await claimNextJob();
      if (job) await processJob(job);
    } catch (err) {
      logger.error(err, "worker loop error");
      await new Promise((r) => setTimeout(r, 1000)); // brief pause before retrying the loop
    }
  }
}

async function main() {
  logger.info({ workerId: WORKER_ID }, "worker starting");
  await reconcile(); // rebuild Redis state from Postgres in case of drift
  await mainLoop();
}

// Graceful shutdown: stop pulling new jobs, let in-flight job finish.
process.on("SIGTERM", () => (running = false));
process.on("SIGINT", () => (running = false));

main();
