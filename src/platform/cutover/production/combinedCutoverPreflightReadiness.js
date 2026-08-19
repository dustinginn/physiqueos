// Source-owned combined-cutover PREFLIGHT READINESS aggregate. The six preflight adapters
// (`verifyAuthorization`, `verifyWindowsSource`, `verifyProviderBuild`, `verifyTargetIsolation`,
// `verifyBackups`, `verifyCostCeiling`) each return an independent, disconnected `{ready, ...}`
// result; this module runs the full set and reports one structured readiness result so a future
// provider-backed rehearsal - or a diagnostic tool run well before any production authorization
// exists - can answer exactly which prerequisites are ready versus blocked, without needing to drive
// the full orchestrator (which requires `productionAuthorization: true` and mutates the Windows write
// fence). Every preflight adapter is already non-mutating by contract
// (`CombinedAppPlatformCutoverOrchestrator`'s own `mode: "rehearsal"` check enforces this), so running
// them here standalone is safe.
//
// Named "preflight readiness," not "Gate 6" - no such name exists in this repository's source or
// governing document for the combined-cutover preflight set.
export const COMBINED_CUTOVER_PREFLIGHT_NAMES = Object.freeze([
  "verifyAuthorization", "verifyWindowsSource", "verifyProviderBuild",
  "verifyTargetIsolation", "verifyBackups", "verifyCostCeiling",
]);

export async function assessCombinedCutoverPreflightReadiness({ preflightAdapters, input } = {}) {
  const missing = COMBINED_CUTOVER_PREFLIGHT_NAMES.filter((name) => typeof preflightAdapters?.[name] !== "function");
  if (missing.length) throw new Error(`Combined cutover readiness assessment is missing preflight adapters: ${missing.join(", ")}.`);

  const results = {};
  const blocked = [];
  for (const name of COMBINED_CUTOVER_PREFLIGHT_NAMES) {
    let result;
    try {
      result = await preflightAdapters[name]({ input });
    } catch (error) {
      result = { ready: false, mutated: false, code: error.code ?? "COMBINED_CUTOVER_PREFLIGHT_ERROR", reason: error.message };
    }
    results[name] = Object.freeze(result ?? {});
    if (result?.ready !== true) {
      blocked.push(Object.freeze({ preflight: name, code: result?.code ?? null, reason: result?.reason ?? null }));
    }
  }

  return Object.freeze({
    ready: blocked.length === 0,
    blocked: Object.freeze(blocked),
    results: Object.freeze(results),
  });
}
