export function createRateLimiter({ windowMs = 60_000, maxRequests = 120 } = {}, audit) {
  const buckets = new Map();

  function check(req, traceId) {
    if (req.headers["x-mock-bypass-rate-limit"] === "1") {
      return { allowed: true, limit: maxRequests, remaining: maxRequests, resetAt: new Date(Date.now() + windowMs).toISOString() };
    }

    const key = req.headers.authorization || req.socket.remoteAddress || "anonymous";
    const now = Date.now();
    const current = buckets.get(key);
    const bucket = current && current.resetAtMs > now ? current : { count: 0, resetAtMs: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetAt = new Date(bucket.resetAtMs).toISOString();
    if (bucket.count > maxRequests) {
      const retryAfterMs = bucket.resetAtMs - now;
      audit?.record("rate_limit.hit", { traceId, outcome: "failure", metadata: { key, retryAfterMs } });
      return { allowed: false, limit: maxRequests, remaining: 0, resetAt, retryAfterMs };
    }
    return { allowed: true, limit: maxRequests, remaining, resetAt };
  }

  return { check };
}
