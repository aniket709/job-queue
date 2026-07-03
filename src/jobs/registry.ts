import { chaosJob } from "./chaosJob";
import { sendEmailJob } from "./sendEmailJob";
import { sendWebhookJob } from "./sendWebhookJob";

export type JobHandler = (payload: any) => Promise<unknown>;

/**
 * Add a new job type by writing a handler function and registering it here.
 * The queue engine itself never needs to change -- it just calls
 * registry[job.type](job.payload).
 */
export const registry: Record<string, JobHandler> = {
  chaos: chaosJob,
  sendEmail: sendEmailJob,
  sendWebhook: sendWebhookJob,
};
