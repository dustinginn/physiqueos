// The single source of truth for recognizing a compatibility-shaped runtime-authority environment
// name (e.g. "compatibility", "compatibility-foundation"). Deliberately kept in its OWN module,
// separate from CombinedRuntimeAuthorityState.js: CombinedCutoverPreparationAuthorityIsolation.test.js
// enforces that no module in the preparation channel (combinedCutoverPreparationComposition.js
// included) may import CombinedRuntimeAuthorityState.js at all, since only
// ProductionAcknowledgeProviderPreparedService.js is allowed to touch runtime-authority state (and
// only to read it). This predicate is pure and read-only, but it still must not be imported FROM
// that module, so both CombinedRuntimeAuthorityState.js and combinedCutoverPreparationComposition.js
// import it from here instead - preventing the classification from drifting between them.
export function isCompatibilityShapedEnvironment(value) {
  return /^compatibility(?:[-/]|$)/i.test(String(value ?? ""));
}
