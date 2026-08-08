export const CONFIDENCE_V1_COMPATIBILITY_VERSION =
  "confidence_v1_compatibility_v2";

export function adaptV1ConfidenceAssessment(assessment = {}, historyRecord = null) {
  const score = Number(assessment.score?.current);
  if (!assessment.id || !Number.isFinite(score)) return null;
  const originalMovement = assessment.score?.movement?.direction ?? "held";
  return deepFreeze({
    schemaVersion: CONFIDENCE_V1_COMPATIBILITY_VERSION,
    id: assessment.id,
    assessmentId: assessment.id,
    goalId: assessment.goalId ?? assessment.goal?.goalId ?? null,
    phaseId: assessment.phaseId ?? null,
    operatingState: assessment.operatingState ?? null,
    goalContract: { id: null, version: null, completeness: "unknown" },
    publisherType: inferPublisher(assessment, historyRecord),
    originatingBriefingId: null,
    briefingArtifactId: null,
    priorAssessmentId: assessment.score?.priorScoreProvenance
      ?.priorCanonicalAssessmentId ?? null,
    priorPercentage: assessment.score?.prior ?? null,
    currentPercentage: score,
    confidenceBand: assessment.score?.band ?? "unknown",
    forecastStatus: "unknown",
    forecastDirection: "indeterminate",
    movement: ({ increased: "increase", decreased: "decrease",
      held: "no_meaningful_change", initial: "no_meaningful_change" })[
      originalMovement] ?? "no_meaningful_change",
    movementMagnitude: assessment.score?.movement?.magnitude ?? "unknown",
    narrativeExplanation: { text: assessment.primaryReason ?? null },
    remainingUncertainty: { status: "unknown",
      items: structuredClone(assessment.unresolvedUncertainty ?? []) },
    nextConfidenceBuildingEvidence: null,
    structuredInterpretationId: null,
    forecastAssessmentId: null,
    narrativeAssessmentId: null,
    semanticContinuityFingerprint: null,
    publicationTimestamp: historyRecord?.persistedAt ??
      assessment.provenance?.generatedAt ?? null,
    sourceCutoff: assessment.evidenceCutoff ?? null,
    idempotencyKey: null,
    compatibility: {
      incomplete: true,
      originalSchemaVersion: assessment.schemaVersion ??
        "pi_goal_confidence_assessment_v1",
      originalMovement,
      unknownV2Semantics: [
        "goal_contract", "forecast_status", "forecast_direction",
        "structured_interpretation", "forecast_assessment", "narrative_assessment",
        "semantic_continuity_fingerprint", "originating_briefing",
      ],
    },
  });
}

function inferPublisher(assessment, record) {
  const type = assessment.context?.type ?? "";
  if (type.includes("midweek")) return "midweek_briefing";
  if (type.includes("weekly")) return "weekly_briefing";
  if (type.includes("dexa")) return "dexa_event_briefing";
  if (type.includes("photo")) return "photo_event_briefing";
  if (record?.operation === "publish_initial") return "migration_only";
  return "unresolved_v1_origin";
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
