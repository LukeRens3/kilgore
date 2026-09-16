import "server-only";

/**
 * Best-effort brake on password guessing.
 *
 * This is deliberately modest: Amplify runs several stateless Lambda instances
 * and recycles them, so counters here are per-instance and evaporate on cold
 * start. It slows a naive script pointed at one endpoint; it is NOT a substitute
 * for rate limiting at the edge (WAF) if this app is reachable from the public
 * internet. Treat it as defence in depth, not as the defence.
 */

const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 10;

interface Bucket {
  failures: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 1000) return;
  const expired: string[] = [];
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) expired.push(key);
  });
  expired.forEach((key) => buckets.delete(key));
}

/** The client address, as far as it can be trusted behind the CDN. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Seconds the caller must wait, or 0 if they may proceed. */
export function retryAfter(key: string): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return 0;
  if (bucket.failures < MAX_FAILURES) return 0;
  return Math.ceil((bucket.resetAt - now) / 1000);
}

export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.failures += 1;
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}
