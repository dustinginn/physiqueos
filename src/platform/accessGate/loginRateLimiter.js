// Minimal in-process throttle for the login action. The provider web
// service runs a single instance (see infra/digitalocean/app.product.template.yaml),
// so in-process state is meaningful here rather than fragmented across
// replicas. This is a supplementary control, not the primary defense - the
// primary defenses are the high-entropy secret, timing-safe verification,
// and a generic failure response that never reveals which part was wrong.
// Deliberately not a distributed/stateful rate-limit service: unnecessary
// for a single-instance, single-credential temporary gate.

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

const attemptsByKey = new Map();

export function checkLoginRateLimit(key, now = Date.now()) {
  const entry = attemptsByKey.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attemptsByKey.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: Math.max(0, WINDOW_MS - (now - entry.windowStart)) };
  }
  return { allowed: true };
}

/** Test-only: clears all throttle state between test cases. */
export function resetLoginRateLimitForTests() {
  attemptsByKey.clear();
}
