// Production `verifyCostCeiling` preflight adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// A purely local, config-driven guard: the operation must declare its expected monthly provider
// resource cost (`input.expectedMonthlyCostUsd`), which is compared against an explicitly configured
// ceiling. Both an unconfigured ceiling and a missing/absent expected cost fail closed rather than
// silently passing - "Do not make a preflight pass merely because an adapter module exists."
export function createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd } = {}) {
  const ceiling = Number(maximumMonthlyCostUsd);
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    throw new Error("verifyCostCeiling requires a configured positive maximumMonthlyCostUsd.");
  }

  return async ({ input } = {}) => {
    const expected = Number(input?.expectedMonthlyCostUsd);
    if (!Number.isFinite(expected) || expected <= 0) {
      return freeze({
        ready: false, mutated: false, code: "COMBINED_CUTOVER_COST_CEILING_UNKNOWN",
        reason: "expectedMonthlyCostUsd was not supplied for this operation.", maximumMonthlyCostUsd: ceiling,
      });
    }
    if (expected > ceiling) {
      return freeze({
        ready: false, mutated: false, code: "COMBINED_CUTOVER_COST_CEILING_EXCEEDED",
        reason: `Expected monthly cost ${expected} exceeds the configured ceiling ${ceiling}.`,
        expectedMonthlyCostUsd: expected, maximumMonthlyCostUsd: ceiling,
      });
    }
    return freeze({ ready: true, mutated: false, expectedMonthlyCostUsd: expected, maximumMonthlyCostUsd: ceiling });
  };
}

function freeze(value) { return Object.freeze(value); }
