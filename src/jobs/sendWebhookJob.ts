/**
 * Real HTTP delivery -- point `url` at https://webhook.site (free, gives you
 * a unique inbox URL to watch requests arrive live) or your own test server.
 * This is a genuine network call, so real timeouts/failures show up here,
 * which makes it the best demo for retries + backoff + DLQ.
 */
export async function sendWebhookJob(payload: { url: string; body: object }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(payload.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`webhook endpoint responded with ${res.status}`);
    }

    return { delivered: true, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}
