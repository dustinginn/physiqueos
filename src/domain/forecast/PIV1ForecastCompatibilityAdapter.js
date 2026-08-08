import { deepFreeze, semanticHash, uniqueStrings } from "./forecastRuntimeUtils";

export const PI_V1_FORECAST_CONTEXT_ADAPTER_VERSION =
  "pi_v1_forecast_context_adapter_v1";

export function adaptPIV1AssessmentToPreviousForecastContext(assessment = {}) {
  const movement = ({
    increased: "increase",
    decreased: "decrease",
    held: "no_meaningful_change",
    initial: "no_meaningful_change",
  })[assessment.score?.movement?.direction ??
    assessment.movement?.direction] ?? "no_meaningful_change";
  return deepFreeze({
    contextVersion: "previous_forecast_context_v2_compat_v1",
    sourceType: "pi_v1_assessment_compatibility",
    priorForecastRef: assessment.id ?? null,
    goalId: assessment.goal?.goalId ?? assessment.goalId ?? null,
    strategyRevision: assessment.strategyRevision ?? null,
    assessedAt: assessment.evidenceCutoff ??
      assessment.provenance?.generatedAt ?? null,
    goalForecastStatus: "unknown",
    confidenceBand: "unknown",
    forecastDirection: "indeterminate",
    movementDirection: movement,
    interpretationSemanticFingerprint: null,
    compatibility: {
      adapterVersion: PI_V1_FORECAST_CONTEXT_ADAPTER_VERSION,
      missingSemantics: ["v2_goal_forecast_status", "v2_confidence_band"],
      inferredSemantics: [],
      ignoredLegacyFields: [
        "score", "primaryReason", "coachingImplication", "confidence",
      ],
      sourceFingerprint: `sha256_${semanticHash({
        id: assessment.id ?? null,
        goalId: assessment.goal?.goalId ?? assessment.goalId ?? null,
        cutoff: assessment.evidenceCutoff ?? null,
        movement,
      })}`,
    },
  });
}

export function adaptForecastAssessmentToPreviousContext(assessment = {}) {
  return deepFreeze({
    contextVersion: "previous_forecast_context_v2_v1",
    sourceType: "canonical_forecast_assessment",
    priorForecastRef: assessment.id ?? null,
    goalId: assessment.goalRef?.goalId ?? null,
    strategyRevision: assessment.strategyRef?.strategyVersion ?? null,
    assessedAt: assessment.assessmentContext?.assessedAt ?? null,
    goalForecastStatus: assessment.goalForecastStatus ?? "unknown",
    confidenceBand: assessment.confidenceBand ?? "unknown",
    forecastDirection: assessment.forecastDirection ?? "indeterminate",
    movementDirection: assessment.movement?.direction ??
      "no_meaningful_change",
    interpretationSemanticFingerprint: assessment.forecastMetadata
      ?.interpretationSemanticFingerprint ?? null,
    compatibility: {
      adapterVersion: null,
      missingSemantics: uniqueStrings([]),
      inferredSemantics: [],
      ignoredLegacyFields: [],
    },
  });
}
