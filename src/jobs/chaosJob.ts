/**
 * A synthetic job used to demonstrate and load-test the queue's reliability
 * features on demand -- retries, backoff, timeouts, dead-lettering --
 * without waiting for a "real" integration to actually fail.
 *
 * Configure via payload: { failureRate?: number, minMs?: number, maxMs?: number, hang?: boolean }
 */
export async function chaosJob(payload: any) {
  const failureRate = payload.failureRate ?? Number(process.env.CHAOS_FAILURE_RATE ?? 0.3);
  const minMs = payload.minMs ?? Number(process.env.CHAOS_MIN_MS ?? 200);
  const maxMs = payload.maxMs ?? Number(process.env.CHAOS_MAX_MS ?? 2000);

  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise((resolve) => setTimeout(resolve, delay));

  if (payload.hang) {
    // simulate a job that never returns, to test timeout/reaper logic
    await new Promise(() => {});
  }

  if (Math.random() < failureRate) {
    throw new Error(`chaos job simulated failure (rate=${failureRate})`);
  }

  return { ok: true, ranForMs: Math.round(delay) };
}
