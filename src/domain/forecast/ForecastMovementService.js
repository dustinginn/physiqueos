import { ForecastMovementDirection } from "./ForecastRuntimeContract";

const STATUS_RANK = {
  forecast_unlikely: 0,
  forecast_at_risk: 1,
  forecast_uncertain: 2,
  on_forecast: 3,
  ahead_of_forecast: 4,
};
const BAND_RANK = {
  very_low: 0, low: 1, developing: 2, moderate: 3, high: 4, very_high: 5,
};

export function determineForecastMovement({
  goalForecastStatus,
  confidenceBand,
  currentStrategyRevision,
  interpretationSemanticFingerprint,
  previousForecastContext,
  structuredInterpretation,
} = {}) {
  const previousStatus = previousForecastContext?.goalForecastStatus;
  const previousBand = previousForecastContext?.confidenceBand;
  const durability = structuredInterpretation?.evidenceReconciliation
    ?.durability ?? {};
  if (previousForecastContext?.interpretationSemanticFingerprint &&
      previousForecastContext.interpretationSemanticFingerprint ===
        interpretationSemanticFingerprint) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext.priorForecastRef,
      "interpretation_semantics_unchanged", {
        kind: "hold_duplicate",
        reasonCode: "duplicate_evidence_no_change",
        durability,
      });
  }
  if (previousForecastContext?.strategyRevision && currentStrategyRevision &&
      previousForecastContext.strategyRevision !== currentStrategyRevision) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext.priorForecastRef,
      "prior_strategy_revision_changed", {
        kind: "strategy_revision_boundary",
        reasonCode: "strategy_revision_boundary_hold",
        durability,
      });
  }
  if (!(previousStatus in STATUS_RANK) || !(previousBand in BAND_RANK)) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext?.priorForecastRef ?? null,
      "prior_forecast_semantics_unavailable", {
        kind: "hold_unqualified_history",
        reasonCode: "historical_durability_unavailable_hold",
        durability,
      });
  }
  const statusChange = STATUS_RANK[goalForecastStatus] - STATUS_RANK[previousStatus];
  const bandChange = BAND_RANK[confidenceBand] - BAND_RANK[previousBand];
  if (statusChange < 0 && bandChange <= 0 || bandChange < 0 && statusChange <= 0) {
    return movement(ForecastMovementDirection.DECREASE,
      previousForecastContext.priorForecastRef,
      "forecast_and_band_materially_weakened", {
        kind: "material_forecast_transition",
        reasonCode: "material_forecast_transition",
        durability,
      });
  }
  if (statusChange > 0 && bandChange > 0) {
    return movement(ForecastMovementDirection.INCREASE,
      previousForecastContext.priorForecastRef,
      "forecast_and_band_materially_strengthened", {
        kind: "material_forecast_transition",
        reasonCode: "material_forecast_transition",
        durability,
      });
  }
  const proxy = proxyEligibility({
    statusChange,
    bandChange,
    structuredInterpretation,
    durability,
  });
  if (proxy.eligible) {
    return movement(ForecastMovementDirection.INCREASE,
      previousForecastContext.priorForecastRef,
      proxy.reasonCode, {
        kind: proxy.kind,
        reasonCode: proxy.reasonCode,
        durability,
      });
  }
  if (proxy.reasonCode) {
    return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
      previousForecastContext.priorForecastRef,
      proxy.reasonCode, {
        kind: proxy.kind,
        reasonCode: proxy.reasonCode,
        durability,
      });
  }
  return movement(ForecastMovementDirection.NO_MEANINGFUL_CHANGE,
    previousForecastContext.priorForecastRef,
    "forecast_change_not_material", {
      kind: "hold_no_semantic_transition",
      reasonCode: "forecast_change_not_material",
      durability,
    });
}

function proxyEligibility({ statusChange, bandChange,
  structuredInterpretation, durability }) {
  const strategy = structuredInterpretation?.strategyValidation?.status;
  const quality = structuredInterpretation?.evidenceReconciliation?.quality?.status;
  const objectiveBlocked = (structuredInterpretation?.objectiveEvaluation
    ?.conclusions ?? []).some((item) =>
    ["behind", "contradicted"].includes(item.status));
  const guardrailBlocked = (structuredInterpretation?.guardrailEvaluation
    ?.conclusions ?? []).some((item) =>
    ["pressured", "violated"].includes(item.status));
  const contradiction = durability.contradictionState !== "none";
  if (contradiction) {
    return { eligible: false, kind: "blocked_by_contradiction",
      reasonCode: "material_contradiction_blocks_increase" };
  }
  if (durability.samePeriodRevision && !durability.transition &&
      !(durability.reducedUncertaintyKeys?.length)) {
    return { eligible: false, kind: "hold_same_period",
      reasonCode: "same_period_revision_no_new_durability" };
  }
  if (durability.duplicateEvidence) {
    return { eligible: false, kind: "hold_duplicate",
      reasonCode: "duplicate_evidence_no_change" };
  }
  const baseEligible = statusChange >= 0 && bandChange >= 0 &&
    ["directionally_supported", "confirmed"].includes(strategy) &&
    ["adequate", "robust"].includes(quality) &&
    !objectiveBlocked && !guardrailBlocked;
  const transition = ["repeated", "sustained"].includes(durability.transition) &&
    (durability.triggeringCapabilities?.length ?? 0) > 0;
  const eligibleReducedUncertaintyKeys = (durability.reducedUncertaintyKeys ?? [])
    .filter((key) => !String(key).startsWith("evidence_coverage_limited|"));
  const uncertaintyReduced = eligibleReducedUncertaintyKeys.length > 0 &&
    durability.uncertaintyComparisonSafe === true;
  const preliminaryCorroboration = durability.currentPeriod?.state ===
    "preliminary" && durability.priorDurabilityEstablished === true &&
    durability.corroborationTransition === true;
  if (baseEligible && transition) {
    return { eligible: true, kind: "proxy_durability_transition",
      reasonCode: durability.transition === "sustained"
        ? "proxy_support_sustained_increase"
        : "proxy_support_repeated_increase" };
  }
  if (baseEligible && uncertaintyReduced) {
    return { eligible: true, kind: "uncertainty_reduction",
      reasonCode: "uncertainty_reduced_increase" };
  }
  if (baseEligible && preliminaryCorroboration) {
    return { eligible: true, kind: "proxy_durability_transition",
      reasonCode: durability.persistence === "sustained"
        ? "proxy_support_sustained_increase"
        : "proxy_support_repeated_increase" };
  }
  if ((durability.signals?.length ?? 0) > 0 &&
      (durability.persistence === "emerging" ||
       durability.currentPeriod?.state === "preliminary")) {
    return { eligible: false, kind: "hold_emerging_proxy",
      reasonCode: "proxy_support_emerging_hold" };
  }
  return { eligible: false, kind: null, reasonCode: null };
}

function movement(direction, priorForecastRef, rationale, details = {}) {
  const durability = details.durability ?? {};
  return {
    direction,
    priorForecastRef,
    rationale,
    kind: details.kind ?? "unknown",
    reasonCode: details.reasonCode ?? rationale,
    triggeringCapabilities: [...(durability.triggeringCapabilities ?? [])],
    priorPersistence: durability.signals?.[0]?.priorPersistence ?? null,
    currentPersistence: durability.persistence ?? null,
    independentPeriodCount: durability.independentPeriodCount ?? 0,
    periodId: durability.currentPeriod?.id ?? null,
    corroboratingCapabilityCount:
      durability.corroboratingCapabilityCount ?? 0,
    reducedUncertaintyKeys: [...(durability.reducedUncertaintyKeys ?? [])],
  };
}
