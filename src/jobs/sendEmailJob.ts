import { logger } from "../lib/logger";

/**
 * Simulated email send -- no real SMTP provider, just logs and randomly
 * fails to demonstrate retry behavior realistically. Swap the body of
 * this function for a real provider (SES, Postmark, Resend, etc.) later;
 * the queue engine doesn't need to change at all.
 */
export async function sendEmailJob(payload: { to: string; subject: string }) {
  await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 300));

  if (Math.random() < 0.2) {
    throw new Error(`simulated SMTP timeout while emailing ${payload.to}`);
  }

  logger.info({ to: payload.to, subject: payload.subject }, "email sent");
  return { sentTo: payload.to };
}
