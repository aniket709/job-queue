# Mini Job Queue

A background job queue system (a small BullMQ/Sidekiq-style engine) built with
**Redis** for fast dispatch and **Postgres + Prisma** as the durable source of
truth. Supports retries with exponential backoff, dead-letter queues,
idempotency, delayed/scheduled jobs, and crash recovery.

## Why two databases?

| Concern | Owner | Why |
|---|---|---|
| Live queue mechanics (waiting / delayed) | **Redis** | Sub-millisecond push/pop; sorted sets are a natural fit for "run this at time T" |
| Durable job record, history, dashboard queries | **Postgres** | Survives restarts; supports `GROUP BY`, filtering, joins |
| Preventing double-processing | **Redis** `BRPOP` | Atomic pop — two workers can never grab the same job ID |
| Dead-letter queue | **Postgres** | Needs to be queryable/searchable long-term, not just sitting in memory |

Redis only ever stores **job IDs**. Postgres always owns the actual job data.
If Redis is flushed or restarted, no jobs are lost — `reconcile()` rebuilds
Redis's queues from Postgres on worker startup.

## Architecture

```
Producer (API) --INSERT--> Postgres (source of truth)
                --LPUSH/ZADD--> Redis (waiting / delayed)

Worker  --BRPOP--> Redis          (claim next job ID)
        --SELECT/UPDATE--> Postgres (fetch + mark active)
        --run handler--
          success --> Postgres: status=completed
          failure --> Postgres: attempts++, status=pending, runAt=now+backoff
                      Redis: ZADD into delayed set

Promoter (background loop, every 1s)
  --ZRANGEBYSCORE--> find delayed jobs whose runAt has passed
  --LPUSH--> move them into the waiting list

Reaper (background loop, every 30s)
  --> finds jobs stuck in `active` for >5min (crashed worker)
  --> requeues them
```

## Setup

```bash
cp .env.example .env
docker compose up -d          # starts Postgres + Redis
npm install
npx prisma migrate dev --name init
npx prisma generate
```

Run each process in its own terminal:

```bash
npm run dev:api        # POST /jobs, GET /stats, etc — http://localhost:3000
npm run dev:worker     # processes jobs (run multiple instances to test concurrency)
npm run dev:promoter   # promotes due delayed/retry jobs into the waiting queue
```

Seed some demo jobs:

```bash
npm run seed:chaos -- 200     # enqueues 200 chaos jobs with a 40% failure rate
```

Watch `/stats` or the worker logs to see retries, backoff, and dead-lettering
happen live.

## API

- `POST /jobs` — `{ type, payload, runAt?, maxAttempts?, idempotencyKey? }`
- `GET /jobs/:id` — fetch a single job
- `GET /jobs?status=dead&type=sendEmail` — list/filter jobs
- `GET /stats` — counts by status + recently dead jobs (dashboard data)
- `POST /jobs/:id/retry` — manually requeue a dead job

## Job types

- `chaos` — synthetic job with configurable failure rate/duration, used to
  demo and load-test retry/backoff/DLQ behavior on demand
- `sendEmail` — simulated email send (swap in a real provider later; the
  queue engine doesn't need to change)
- `sendWebhook` — a **real** HTTP POST — point it at
  [webhook.site](https://webhook.site) to watch deliveries arrive live

## Key design decisions

- **At-least-once delivery, not exactly-once.** A job could theoretically run
  twice (e.g. worker crashes after completing work but before marking the
  job `completed`). Handlers should be idempotent where it matters —
  `idempotencyKey` on enqueue prevents duplicate *submissions*, not duplicate
  *executions* of an already-claimed job.
- **Exponential backoff with jitter** avoids a thundering herd where many
  retries fire in the same instant and hammer a downstream service.
- **Redis `BRPOP` for claiming jobs** is what guarantees two workers never
  process the same job — it's an atomic pop, not a read-then-write.
- **Postgres reconciliation on worker startup** means Redis is treated as a
  cache/dispatch layer, not the source of truth — losing it is recoverable.

## Load testing

```bash
npm run seed:chaos -- 5000
# then, with autocannon or k6, hit /stats repeatedly to watch throughput,
# or just tail worker logs to see retries/DLQ happening under load
```
