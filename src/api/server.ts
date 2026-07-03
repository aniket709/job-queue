import "dotenv/config";
import express from "express";
import { prisma } from "../lib/prisma";
import { enqueue } from "../queue/enqueue";
import { logger } from "../lib/logger";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors())

const PORT = process.env.PORT || 3000;

// -------Health Check ------------------------------------

app.get("/health",async(req,res)=>{
   try{
    res.status(200).json({
      msg :`server up and running on the port ${PORT}`
    })
   } catch(error:any){
    console.log("server went down");
    res.status(500).json({
      msg:error
    })
   }
})

// --- Enqueue a job -----------------------------------------------------
app.post("/jobs", async (req, res) => {
  const { type, payload, runAt, maxAttempts, idempotencyKey } = req.body;

  if (!type || typeof type !== "string") {
    return res.status(400).json({ error: "`type` is required" });
  }

  const job = await enqueue(type, payload ?? {}, {
    runAt: runAt ? new Date(runAt) : undefined,
    maxAttempts,
    idempotencyKey,
  });

  res.status(201).json(job);
});

// --- Look up a single job ----------------------------------------------
app.get("/jobs/:id", async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: "not found" });
  res.json(job);
});

// --- List jobs, filterable by status ------------------------------------
app.get("/jobs", async (req, res) => {
  const { status, type, limit = "50" } = req.query;
  const jobs = await prisma.job.findMany({
    where: {
      status: status ? (status as any) : undefined,
      type: type ? (type as string) : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: Number(limit),
  });
  res.json(jobs);
});

// --- Dashboard stats: counts grouped by status ---------------------------
app.get("/stats", async (_req, res) => {
  const grouped = await prisma.job.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const counts: Record<string, number> = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  };
  for (const row of grouped) counts[row.status] = row._count.status;

  const recentlyDead = await prisma.job.findMany({
    where: { status: "dead" },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  res.json({ counts, recentlyDead });
});

// --- Retry a dead job manually -------------------------------------------
app.post("/jobs/:id/retry", async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: "pending", attempts: 0, runAt: new Date(), lastError: null },
  });
  const { redis, KEYS } = await import("../lib/redis");
  await redis.lpush(KEYS.waiting, job.id);
  res.json(job);
});

app.listen(PORT, () => {
  logger.info(`API server listening on http://localhost:${PORT}`);
});
