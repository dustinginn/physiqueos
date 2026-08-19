// Centralized public-route allowlist for the Founder access gate. Default
// posture is deny; only what is listed here is ever reachable without a
// valid session. Keep this list minimal - see
// docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md for the posture
// this exists to enforce.

export const FOUNDER_GATE_LOGIN_PATH = "/founder-gate";

// The combined-cutover transfer channel is Windows-machine-to-provider, not a Founder browser
// session, so it is exempt from the Founder session cookie by design - never because it is
// unauthenticated. Every request under this prefix still requires its own bearer machine
// credential, verified independently inside the route/service boundary
// (`combinedCutoverTransferAuth.js`), which fails closed exactly like the Founder gate does when
// unconfigured. This prefix carries zero Founder product data.
export const COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX = "/api/v1/operations/combined-cutover/transfer/";

// Same reasoning, for the Phase 4 preparation channel (import/parity/provider-prepared
// acknowledgement): machine-to-machine, exempt from the Founder cookie, gated instead by its own
// separate machine credential (`combinedCutoverPreparationAuth.js`). Windows' public runtime never
// reaches this prefix on its own - only an authenticated cutover coordinator can.
export const COMBINED_CUTOVER_PREPARATION_ROUTE_PATH_PREFIX = "/api/v1/operations/combined-cutover/prepare/";

const PUBLIC_EXACT_PATHS = new Set([
  "/api/v1/health/live",
  "/api/v1/health/ready",
  FOUNDER_GATE_LOGIN_PATH,
  "/favicon.ico",
]);

/**
 * True only for: the two intentionally-public health endpoints, the login
 * page itself (GET and its own POST-back share this path), static
 * framework assets under /_next/static/ (JS/CSS/font chunks - never
 * product data, required to render the login page at all), and the
 * separately-machine-authenticated combined-cutover transfer/preparation channels.
 * Everything else - every product page, every other /api route, every
 * media/private-evidence route, every Server Action - is protected by
 * default.
 */
export function isPublicPath(pathname) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith(COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX)) return true;
  if (pathname.startsWith(COMBINED_CUTOVER_PREPARATION_ROUTE_PATH_PREFIX)) return true;
  return false;
}
