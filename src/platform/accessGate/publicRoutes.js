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

// Same reasoning, for the Phase 5 authority/routing handoff channel - but note this prefix carries
// only a single READ-ONLY status route (`combinedCutoverHandoffService.js`). There is no endpoint
// that triggers the handoff itself: the orchestrator's `commitAuthority` closure cannot cross an
// HTTP boundary, so the real transition only ever runs in-process with the orchestrator. Gated by
// its own separate, narrower machine credential (`combinedCutoverHandoffAuth.js`).
export const COMBINED_CUTOVER_HANDOFF_ROUTE_PATH_PREFIX = "/api/v1/operations/combined-cutover/handoff/";

// Native device routes intentionally bypass the temporary browser cookie gate because every
// protected product request authenticates its own short-lived Founder bearer credential. The
// pairing/refresh routes accept only their one-time or rotating high-entropy credentials. This is
// additive: browser pages and all other product API routes remain Founder-cookie gated.
export const NATIVE_FOUNDER_API_ROUTE_PATH_PREFIX = "/api/v1/native/";

// Production migration dry-runs are machine-to-provider operations authenticated by the existing
// operations bearer token inside their routes. Exempt only the collection POST and one status GET
// segment with the controller's exact operation-ID grammar; arbitrary descendants stay Founder-gated.
export const PRODUCTION_MIGRATION_DRY_RUN_ROUTE_PATH = "/api/v1/operations/production-migration-dry-runs";
const PRODUCTION_MIGRATION_DRY_RUN_OPERATION_ID = /^[A-Za-z0-9._:-]{8,160}$/;

// The simplified provider migration command is also machine-to-provider and retains the same
// operations-bearer authentication inside its exact routes. Exempt only its collection POST and
// one command-status segment from the Founder cookie middleware.
export const SIMPLIFIED_PROVIDER_MIGRATION_ROUTE_PATH = "/api/v1/operations/simplified-provider-migrations";
const SIMPLIFIED_PROVIDER_MIGRATION_COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

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
 * separately-machine-authenticated combined-cutover transfer/preparation/handoff channels.
 * Everything else - every product page, every other /api route, every
 * media/private-evidence route, every Server Action - is protected by
 * default.
 */
export function isPublicPath(pathname) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith(COMBINED_CUTOVER_TRANSFER_ROUTE_PATH_PREFIX)) return true;
  if (pathname.startsWith(COMBINED_CUTOVER_PREPARATION_ROUTE_PATH_PREFIX)) return true;
  if (pathname.startsWith(COMBINED_CUTOVER_HANDOFF_ROUTE_PATH_PREFIX)) return true;
  if (pathname.startsWith(NATIVE_FOUNDER_API_ROUTE_PATH_PREFIX)) return true;
  if (pathname === PRODUCTION_MIGRATION_DRY_RUN_ROUTE_PATH) return true;
  if (pathname.startsWith(`${PRODUCTION_MIGRATION_DRY_RUN_ROUTE_PATH}/`)) {
    return PRODUCTION_MIGRATION_DRY_RUN_OPERATION_ID.test(pathname.slice(PRODUCTION_MIGRATION_DRY_RUN_ROUTE_PATH.length + 1));
  }
  if (pathname === SIMPLIFIED_PROVIDER_MIGRATION_ROUTE_PATH) return true;
  if (pathname.startsWith(`${SIMPLIFIED_PROVIDER_MIGRATION_ROUTE_PATH}/`)) {
    return SIMPLIFIED_PROVIDER_MIGRATION_COMMAND_ID.test(pathname.slice(SIMPLIFIED_PROVIDER_MIGRATION_ROUTE_PATH.length + 1));
  }
  return false;
}
