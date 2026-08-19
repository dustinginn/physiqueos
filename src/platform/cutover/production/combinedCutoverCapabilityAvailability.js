// Shared fail-closed "capability unavailable" result shape for combined-cutover preflights that
// inherently require live DigitalOcean/provider network access (provider build/deployment
// verification, target-cluster isolation, managed-database backup freshness) - none of which this
// task is authorized to exercise (no DigitalOcean connection, no PAT, no Trusted Source). Mirrors the
// exact pattern `createUnavailableRoutingControl` already established in Phase 5
// (`../routing/combinedCutoverRoutingControl.js`): the production default is explicit and structured,
// never a silent `{ready: true}`. A real, provider-backed implementation can be injected later behind
// the same adapter shape without changing this contract.
export const CombinedCutoverCapabilityErrorCode = Object.freeze({
  UNAVAILABLE: "COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE",
});

export function combinedCutoverCapabilityBlockedResult({ capability, reason, extra = {} }) {
  return Object.freeze({
    ready: false,
    mutated: false,
    blocked: true,
    capability,
    code: CombinedCutoverCapabilityErrorCode.UNAVAILABLE,
    reason,
    ...extra,
  });
}
