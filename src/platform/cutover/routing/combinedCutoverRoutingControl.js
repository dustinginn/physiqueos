// Source-owned routing-control contract for the combined-cutover authority/routing handoff
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md phase L: "Atomically transition provider
// runtime authority, keep Windows fenced, enable the prepared App Platform route, and verify that
// only the provider can reach the canonical command boundary. Routing must not lead this step.").
//
// WHY ONLY FOUR OPERATIONS. Route PREPARATION (recording the exact provider hostname, TLS, rollback
// mechanics, TTL/dashboard action, and operator) is a documented pre-fence readiness concern (phase
// A) and one of the six combined-cutover preflights - not this phase's responsibility, and
// explicitly out of scope for this task. By the time `transferAuthorityAndRoute` runs, the route is
// already prepared; this contract only needs to inspect its current state, activate it, verify it,
// and - for a later `restoreWindowsAuthority` to use - restore it. Deliberately not overdesigned:
// no "prepare", no generic CRUD, no DigitalOcean-shaped concepts (app IDs, deployments, ingress
// rules) leak into this interface - those belong entirely inside a concrete implementation.
//
// DISTRIBUTED ATOMICITY DOES NOT EXIST HERE, AND THIS MODULE NEVER PRETENDS IT DOES. Durable
// PostgreSQL authority state and external routing (DigitalOcean, DNS, a tunnel) cannot be committed
// as one transaction. `ProductionAuthorityHandoffService.js` commits authority FIRST (durably, via
// the real state machine) and only then calls routing operations; if routing fails or its outcome is
// unknown, the authority row alone remains authoritative and durable handoff-receipt evidence
// records exactly how far routing got, so recovery tooling can reconcile without guessing.
//
// FAIL CLOSED BY DEFAULT. `createUnavailableRoutingControl` remains the production default until the
// separately configured DigitalOcean implementation is explicitly wired: every operation throws
// `ROUTING_CONTROL_UNAVAILABLE`. This is intentional - silently no-op'ing or synthetically
// succeeding would let a real handoff believe routing activated when it did not. See
// `createDeterministicCombinedCutoverRoutingControl` for the in-memory double used by rehearsal and
// integration tests, and the synthetic Phase 2B adapter
// (`syntheticCombinedCutoverRehearsal.js`) for the fully synthetic rehearsal path, which this module
// does not replace.

export const RouteState = Object.freeze({
  WINDOWS_ACTIVE: "windows-active",
  PROVIDER_PREPARED_NOT_ACTIVE: "provider-prepared-not-active",
  PROVIDER_ACTIVE: "provider-active",
  UNPREPARED: "unprepared",
  AMBIGUOUS: "ambiguous",
  UNEXPECTED_TARGET: "unexpected-target",
  MULTIPLE_MATCHING_RECORDS: "multiple-matching-records",
  UNEXPECTED_RECORD_TYPE: "unexpected-record-type",
  TTL_MISMATCH: "ttl-mismatch",
  RECORD_IDENTITY_MISMATCH: "record-identity-mismatch",
});

export const RoutingErrorCode = Object.freeze({
  UNAVAILABLE: "ROUTING_CONTROL_UNAVAILABLE",
  NOT_PREPARED: "ROUTING_TARGET_NOT_PREPARED",
  ACTIVATION_FAILED: "ROUTING_ACTIVATION_FAILED",
  VERIFICATION_FAILED: "ROUTING_VERIFICATION_FAILED",
  RESTORE_FAILED: "ROUTING_RESTORE_FAILED",
  AMBIGUOUS: "ROUTING_OUTCOME_AMBIGUOUS",
  UNEXPECTED_STATE: "ROUTING_UNEXPECTED_STATE",
  MULTIPLE_RECORDS: "ROUTING_MULTIPLE_MATCHING_RECORDS",
  RECORD_TYPE_UNEXPECTED: "ROUTING_RECORD_TYPE_UNEXPECTED",
  IDENTITY_MISMATCH: "ROUTING_IDENTITY_MISMATCH",
});

export function routingControlError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

/**
 * Fail-closed default. Every combined-cutover routing operation throws until a real
 * DigitalOcean-backed implementation is wired in behind this exact same interface - production
 * `transferAuthorityAndRoute` composition never silently substitutes a synthetic implementation
 * when this is what's configured.
 */
export function createUnavailableRoutingControl({ reason = "No production routing-control implementation is configured yet." } = {}) {
  async function unavailable() {
    throw routingControlError(RoutingErrorCode.UNAVAILABLE, reason);
  }
  return Object.freeze({
    kind: "unavailable-routing-control",
    inspectCurrentRoute: unavailable,
    activateProviderRoute: unavailable,
    verifyProviderRoute: unavailable,
    restoreWindowsRoute: unavailable,
  });
}

/**
 * Asserts a candidate implementation satisfies the contract shape, regardless of which concrete
 * implementation is supplied (unavailable, deterministic test double, or a future real one).
 */
export function assertCombinedCutoverRoutingControl(routingControl) {
  const required = ["inspectCurrentRoute", "activateProviderRoute", "verifyProviderRoute", "restoreWindowsRoute"];
  const missing = required.filter((name) => typeof routingControl?.[name] !== "function");
  if (missing.length) throw new Error(`Combined cutover routing control is missing: ${missing.join(", ")}.`);
  return routingControl;
}
