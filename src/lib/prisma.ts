import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across the app (avoids exhausting
// the Postgres connection pool when using tsx watch / hot reload).
export const prisma = new PrismaClient({
  log: ["warn", "error"],
});
