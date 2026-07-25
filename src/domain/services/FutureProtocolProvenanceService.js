import { createProtocolProvenance } from "../models/protocolProvenance";

export function attachCanonicalProvenanceToProtocolVersion(version = {}) {
  const target = targetFrom(version.change?.reviewedChanges ?? {}, version);
  const provenance = createProtocolProvenance({
    protocolId: version.protocolId,
    protocolVersionId: version.id,
    protocolCategory: version.protocolCategory ?? "unknown",
    goalId: version.goalLinks?.[0]?.goalId ?? null,
    previousProtocolVersionId: version.change?.previousVersionId ?? null,
    sourceProtocolId: version.sourceProtocolId ?? null,
    sourceTransitionDraftId: version.sourceTransitionDraftId ?? null,
    state: version.status ?? "planned",
    effectiveFrom: String(version.effectiveAt).slice(0, 10),
    timezone: version.timezone ?? "America/Los_Angeles",
    target,
    activatedAt: version.effectiveAt ?? null,
    createdAt: version.effectiveAt ?? null,
    createdBy: version.confirmation?.authority ?? null,
    provenance: {
      source: "goal_transition_activation",
      sourceVersionId: version.change?.previousVersionId ?? null,
    },
    limitations: [],
  });
  return {
    ...version,
    canonicalProvenance: provenance,
  };
}

function targetFrom(strategy, version) {
  if (version.protocolCategory !== "nutrition") return null;
  const basis = strategy.proteinBasis ?? null;
  const ratio = positive(strategy.proteinRatio);
  const translated = positive(strategy.proteinTarget);
  const fixed = positive(strategy.fixedProtein);
  if (basis === "body_weight") {
    const input = weightInput(strategy, version.effectiveAt);
    const conflict = fixed != null && translated != null && fixed !== translated;
    return {
      mode: "grams_per_pound",
      configuredRatio: ratio,
      translatedValue: translated,
      roundingRule: strategy.proteinRoundingRule ?? "nearest_integer",
      calculationVersion: strategy.proteinCalculationVersion ?? "nutrition_protocol_target_v1",
      effectiveFrom: String(version.effectiveAt).slice(0, 10),
      source: "reviewed_protocol_strategy",
      sourceProtocolVersionId: version.id,
      sourceGoalId: version.goalLinks?.[0]?.goalId ?? null,
      inputProvenance: input,
      status: conflict ? "conflicted" : input ? "resolved" : "partially_resolved",
      sourceFacts: { proteinTarget: translated, fixedProtein: fixed },
      limitations: [
        conflict ? "conflicting_body_weight_and_fixed_values" : null,
        !input ? "body_weight_input_provenance_unavailable" : null,
      ].filter(Boolean),
    };
  }
  const configured = fixed ?? translated;
  if (configured == null) return null;
  return {
    mode: "fixed_grams",
    configuredValue: configured,
    effectiveFrom: String(version.effectiveAt).slice(0, 10),
    source: "reviewed_protocol_strategy",
    sourceProtocolVersionId: version.id,
    sourceGoalId: version.goalLinks?.[0]?.goalId ?? null,
    status: "resolved",
  };
}
function weightInput(strategy, effectiveAt) {
  const value = positive(strategy.proteinWeightValue ?? strategy.bodyWeightValue);
  const id = strategy.proteinWeightEvidenceId ?? strategy.bodyWeightEvidenceId;
  const date = String(strategy.proteinWeightDate ?? strategy.bodyWeightDate ?? "").slice(0, 10);
  if (value == null || !id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    weightValue: value,
    weightUnit: strategy.proteinWeightUnit ?? strategy.bodyWeightUnit ?? "lb",
    weightDate: date,
    weightEvidenceId: id,
    weightSource: strategy.proteinWeightSource ?? strategy.bodyWeightSource ?? null,
    weightSelectionMethod: strategy.proteinWeightSelectionMethod ?? "explicit_protocol_input",
    weightStatus: "resolved",
    weightLimitations: [],
    effectiveFrom: String(effectiveAt).slice(0, 10),
  };
}
function positive(value) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}
