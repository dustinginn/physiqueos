// Centralized public-route allowlist for the Founder access gate. Default
// posture is deny; only what is listed here is ever reachable without a
// valid session. Keep this list minimal - see
// docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md for the posture
// this exists to enforce.

export const FOUNDER_GATE_LOGIN_PATH = "/founder-gate";

const PUBLIC_EXACT_PATHS = new Set([
  "/api/v1/health/live",
  "/api/v1/health/ready",
  FOUNDER_GATE_LOGIN_PATH,
  "/favicon.ico",
]);

/**
 * True only for: the two intentionally-public health endpoints, the login
 * page itself (GET and its own POST-back share this path), and static
 * framework assets under /_next/static/ (JS/CSS/font chunks - never
 * product data, required to render the login page at all). Everything
 * else - every product page, every /api route, every media/private-evidence
 * route, every Server Action - is protected by default.
 */
export function isPublicPath(pathname) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/static/")) return true;
  return false;
}
