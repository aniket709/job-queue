import "dotenv/config";
import { enqueue } from "../queue/enqueue";
import { logger } from "./logger";

/**
 * Fires a batch of chaos jobs to demo/load-test retry, backoff, and
 * dead-lettering behavior on demand. Run with: npm run seed:chaos
 */
async function main() {
  const count = Number(process.argv[2] ?? 100);
  logger.info({ count }, "seeding chaos jobs");

  for (let i = 0; i < count; i++) {
    await enqueue("chaos", { failureRate: 0.4 }, { maxAttempts: 5 });
  }

  logger.info("done seeding");
  process.exit(0);
}

main();
