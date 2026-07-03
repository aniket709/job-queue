import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // required for blocking commands like BRPOP
});

// Redis key names, centralized so they're never typo'd across files
export const KEYS = {
  waiting: "queue:waiting",       // List — job IDs ready to run now
  delayed: "queue:delayed",       // Sorted Set — job IDs scored by runAt timestamp (retries + scheduled)
};
