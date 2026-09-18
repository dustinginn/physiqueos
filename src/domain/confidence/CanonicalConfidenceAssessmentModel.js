import { createHash } from "node:crypto";

export const CANONICAL_CONFIDENCE_ASSESSMENT_VERSION =
  "canonical_confidence_assessment_v2";
export const CANONICAL_CONFIDENCE_ASSESSMENT_V3_VERSION =
  "canonical_confidence_assessment_v3";

const PUBLISHERS = new Set([
  "goal_initialization", "midweek_briefing", "weekly_briefing",
  "monthly_briefing", "dexa_event_briefing", "photo_event_briefing",
  "v3_strategic_activation",
]);
const MOVEMENTS = new Set(["increase", "decrease", "no_meaningful_change"]);

export function createCanonicalConfidenceAssessment(input = {}) {
  if (!PUBLISHERS.has(input.publisherType)) throw new Error("Assessment publisher is invalid.");
  if (!MOVEMENTS.has(input.projection?.movement)) throw new Error("Assessment movement is invalid.");
  const priorPercentage = input.projection.priorPercentage;
  const currentPercentage = input.projection.currentPercentage;
  if (priorPercentage != null && !validPercentage(priorPercentage) ||
      !validPercentage(currentPercentage)) {
    throw new Error("Assessment percentage is invalid.");
  }
  const canonical = {
    schemaVersion: CANONICAL_CONFIDENCE_ASSESSMENT_VERSION,
    goalId: required(input.goalId, "goalId"),
    phaseId: input.phaseId ?? null,
    goalContract: {
      id: input.goalContractId ?? null,
      version: required(input.goalContractVersion, "goalContractVersion"),
    },
    publisherType: input.publisherType,
    originatingBriefingId: required(input.originatingBriefingId, "originatingBriefingId"),
    briefingArtifactId: required(input.briefingArtifactId, "briefingArtifactId"),
    evidenceWindowId: required(input.evidenceWindowId, "evidenceWindowId"),
    priorAssessmentId: input.priorAssessmentId ?? null,
    priorPercentage,
    currentPercentage,
    confidenceBand: required(input.forecastAssessment?.confidenceBand, "confidenceBand"),
    forecastStatus: required(input.forecastAssessment?.goalForecastStatus, "forecastStatus"),
    forecastDirection: required(input.forecastAssessment?.forecastDirection, "forecastDirection"),
    movement: input.projection.movement,
    movementMagnitude: required(input.projection.movementMagnitude, "movementMagnitude"),
    forecastExplanationLineage: structuredClone(input.forecastAssessment.forecastExplanation),
    narrativeExplanation: structuredClone(input.narrativeAssessment.confidenceExplanation),
    remainingUncertainty: structuredClone(input.forecastAssessment.remainingUncertainty),
    nextConfidenceBuildingEvidence: structuredClone(input.forecastAssessment.nextDecisiveEvidence),
    structuredInterpretationId: required(input.structuredInterpretation?.id,
      "structuredInterpretationId"),
    forecastAssessmentId: required(input.forecastAssessment?.id, "forecastAssessmentId"),
    narrativeAssessmentId: required(input.narrativeAssessment?.id, "narrativeAssessmentId"),
    semanticContinuityFingerprint: required(
      input.forecastAssessment?.forecastMetadata?.interpretationSemanticFingerprint,
      "semanticContinuityFingerprint"
    ),
    publicationTimestamp: timestamp(input.publicationTimestamp),
    sourceCutoff: timestamp(input.sourceCutoff),
    replacementLineage: {
      expectedPriorArtifactId: input.expectedPriorArtifactId ?? null,
      replacesArtifactId: input.replacesArtifactId ?? null,
      replacesAssessmentId: input.replacesAssessmentId ?? null,
    },
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    sourceLineage: structuredClone(input.sourceLineage ?? {}),
    reproducibility: {
      numericProjectionVersion: required(input.projection?.schemaVersion,
        "numericProjectionVersion"),
      numericProjectionId: required(input.projection?.id, "numericProjectionId"),
      goalContractFingerprint: required(
        input.forecastAssessment?.forecastMetadata?.goalContractFingerprint,
        "goalContractFingerprint"
      ),
      interpretationFingerprint: required(
        input.structuredInterpretation?.provenance?.inputFingerprint,
        "interpretationFingerprint"
      ),
      forecastFingerprint: required(
        input.forecastAssessment?.forecastMetadata?.inputFingerprint,
        "forecastFingerprint"
      ),
      narrativeFingerprint: required(
        input.narrativeAssessment?.provenance?.inputFingerprint,
        "narrativeFingerprint"
      ),
      semanticContinuityFingerprint: required(
        input.forecastAssessment?.forecastMetadata?.interpretationSemanticFingerprint,
        "semanticContinuityFingerprint"
      ),
      engineVersions: {
        interpretation: input.structuredInterpretation.provenance.engineVersion,
        forecast: input.forecastAssessment.forecastMetadata.engineVersion,
        narrative: input.narrativeAssessment.provenance.engineVersion,
      },
    },
  };
  const strategyRevision = input.strategyRevision ??
    input.structuredInterpretation?.strategyRef?.strategyVersion ?? null;
  if (strategyRevision) canonical.strategyRevision = strategyRevision;
  const evidenceDurability = input.evidenceDurability ??
    input.structuredInterpretation?.evidenceReconciliation?.durability ?? null;
  if (evidenceDurability) {
    canonical.evidenceDurability = structuredClone(evidenceDurability);
  }
  const movementAudit = input.movementAudit ?? input.projection?.movementAudit ?? null;
  if (movementAudit) canonical.movementAudit = structuredClone(movementAudit);
  const id = assessmentIdentity(canonical);
  if (input.id && input.id !== id) throw new Error("Assessment identity mismatch.");
  return deepFreeze({ id, assessmentId: id, ...canonical });
}

export function validateCanonicalConfidenceAssessment(value) {
  if (value?.schemaVersion === CANONICAL_CONFIDENCE_ASSESSMENT_V3_VERSION) {
    return validateCanonicalConfidenceAssessmentV3(value);
  }
  if (!value || value.schemaVersion !== CANONICAL_CONFIDENCE_ASSESSMENT_VERSION ||
      value.id !== value.assessmentId || value.id !== assessmentIdentity(value) ||
      !PUBLISHERS.has(value.publisherType) || !MOVEMENTS.has(value.movement) ||
      !validPercentage(value.currentPercentage) ||
      value.priorPercentage != null && !validPercentage(value.priorPercentage) ||
      !value.goalId || !value.goalContract?.version || !value.briefingArtifactId ||
      !value.evidenceWindowId || !value.structuredInterpretationId ||
      !value.forecastAssessmentId || !value.narrativeAssessmentId ||
      !Number.isFinite(Date.parse(value.publicationTimestamp)) ||
      !Number.isFinite(Date.parse(value.sourceCutoff))) {
    throw new Error("Assessment is not canonical.");
  }
  return true;
}

// ---------------------------------------------------------------------------
// V3 — a parallel, V3-native canonical assessment shape. Deliberately NOT
// forced through V2's ForecastAssessment/NarrativeAssessment internal
// contracts (objectiveForecasts, milestoneForecasts, trajectoryForecast,
// etc. are V2 implementation details the Feasibility/Persistence model does
// not share). What V3 DOES share with V2, byte-for-byte, is the OUTER shape
// every read consumer (`CanonicalConfidenceReadService`,
// `ActiveGoalConfidencePresentationReadService`, and therefore Home/Web/
// eventually Native) actually depends on: goalId, phaseId, publisherType,
// currentPercentage, confidenceBand, movement, priorPercentage,
// narrativeExplanation, remainingUncertainty, nextConfidenceBuildingEvidence,
// replacementLineage, idempotencyKey, sourceCutoff, publicationTimestamp.
// That is what keeps Home/Web/Build-40-Native compatible without a rewrite.
// ---------------------------------------------------------------------------

const V3_MOVEMENTS = MOVEMENTS;

export function createCanonicalConfidenceAssessmentV3(input = {}) {
  if (input.publisherType !== "v3_strategic_activation" && !PUBLISHERS.has(input.publisherType)) {
    throw new Error("Assessment publisher is invalid.");
  }
  if (!V3_MOVEMENTS.has(input.projection?.movement)) throw new Error("Assessment movement is invalid.");
  const priorPercentage = input.projection.previousPercentage ?? null;
  const currentPercentage = input.projection.currentPercentage;
  if (priorPercentage != null && !validPercentage(priorPercentage) ||
      !validPercentage(currentPercentage)) {
    throw new Error("Assessment percentage is invalid.");
  }
  const canonical = {
    schemaVersion: CANONICAL_CONFIDENCE_ASSESSMENT_V3_VERSION,
    goalId: required(input.goalId, "goalId"),
    phaseId: input.phaseId ?? null,
    goalContract: {
      id: input.goalContractId ?? null,
      version: required(input.goalContractVersion, "goalContractVersion"),
    },
    publisherType: input.publisherType,
    originatingBriefingId: required(input.originatingBriefingId, "originatingBriefingId"),
    briefingArtifactId: required(input.briefingArtifactId, "briefingArtifactId"),
    evidenceWindowId: required(input.evidenceWindowId, "evidenceWindowId"),
    priorAssessmentId: input.priorAssessmentId ?? null,
    priorPercentage,
    currentPercentage,
    confidenceBand: required(input.confidenceBand, "confidenceBand"),
    movement: input.projection.movement,
    movementMagnitude: magnitudeOf(input.projection.delta),
    narrativeExplanation: {
      text: required(input.narrative?.summary, "narrative.summary"),
      movementRationaleCode: input.interpretation?.confidenceMovementReason ?? null,
      uncertaintyReduction: null,
    },
    remainingUncertainty: {
      status: (input.interpretation?.uncertaintyReason?.length ?? 0) > 0 ? "material" : "none",
      items: [...(input.interpretation?.uncertaintyReason ?? [])],
    },
    nextConfidenceBuildingEvidence: input.interpretation?.nextDecisiveEvidence ?? null,
    structuredInterpretationId: required(input.interpretation?.id ?? interpretationId(input.interpretation),
      "structuredInterpretationId"),
    forecastAssessmentId: null,
    narrativeAssessmentId: required(narrativeId(input.narrative), "narrativeAssessmentId"),
    semanticContinuityFingerprint: required(input.interpretation?.provenance?.inputFingerprint,
      "semanticContinuityFingerprint"),
    publicationTimestamp: timestamp(input.publicationTimestamp),
    sourceCutoff: timestamp(input.sourceCutoff),
    replacementLineage: {
      expectedPriorArtifactId: input.expectedPriorArtifactId ?? null,
      replacesArtifactId: input.replacesArtifactId ?? null,
      replacesAssessmentId: input.replacesAssessmentId ?? null,
    },
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    sourceLineage: structuredClone(input.sourceLineage ?? {}),
    reproducibility: {
      numericProjectionVersion: required(input.projection?.schemaVersion, "numericProjectionVersion"),
      numericProjectionId: projectionId(input.projection),
      goalContractFingerprint: input.goalContractFingerprint ?? null,
      interpretationFingerprint: required(input.interpretation?.provenance?.inputFingerprint,
        "interpretationFingerprint"),
      forecastFingerprint: null,
      narrativeFingerprint: required(input.narrative?.provenance?.inputFingerprint, "narrativeFingerprint"),
      semanticContinuityFingerprint: required(input.interpretation?.provenance?.inputFingerprint,
        "semanticContinuityFingerprint"),
      engineVersions: {
        interpretation: input.interpretation.provenance.engineVersion,
        forecast: null,
        narrative: input.narrative.provenance.engineVersion,
        projection: input.projection.schemaVersion,
      },
    },
    // V3-native fields — additive, never required by the V2 read path, and
    // never consumed by client presentation directly (Web/Native still only
    // ever read the shared outer fields above). Kept for auditability,
    // future presentation, and the Native contract handoff.
    evidenceDomainsConsidered: [...(input.eligibility?.evidenceDomainsConsidered ?? [])],
    eligibleEvidenceRefs: [...(input.eligibility?.eligibleEvidenceRefs ?? [])],
    freshnessState: input.eligibility?.perDomain
      ? summarizeFreshness(input.eligibility.perDomain) : null,
    completenessState: input.eligibility?.overallCompleteness ?? null,
    contradictions: [...(input.eligibility?.contradictions ?? [])],
    feasibilityState: input.interpretation?.feasibilityState ?? null,
    persistenceState: input.interpretation?.persistenceState ?? null,
    missingEvidence: [...(input.eligibility?.missingEvidence ?? [])],
    staleEvidence: [...(input.eligibility?.staleEvidence ?? [])],
    narrativeSections: input.narrative?.sections ?? null,
    narrativeSupportingFactors: [...(input.narrative?.supportingFactors ?? [])],
    narrativeLimitingFactors: [...(input.narrative?.limitingFactors ?? [])],
    operatingPlanImplications: input.narrative?.sections?.operatingPlanImplications ?? [],
  };
  const id = assessmentIdentityV3(canonical);
  if (input.id && input.id !== id) throw new Error("Assessment identity mismatch.");
  return deepFreeze({ id, assessmentId: id, ...canonical });
}

export function validateCanonicalConfidenceAssessmentV3(value) {
  if (!value || value.schemaVersion !== CANONICAL_CONFIDENCE_ASSESSMENT_V3_VERSION ||
      value.id !== value.assessmentId || value.id !== assessmentIdentityV3(value) ||
      (value.publisherType !== "v3_strategic_activation" && !PUBLISHERS.has(value.publisherType)) ||
      !V3_MOVEMENTS.has(value.movement) ||
      !validPercentage(value.currentPercentage) ||
      value.priorPercentage != null && !validPercentage(value.priorPercentage) ||
      !value.goalId || !value.goalContract?.version || !value.briefingArtifactId ||
      !value.evidenceWindowId || !value.structuredInterpretationId ||
      !value.narrativeAssessmentId ||
      !Number.isFinite(Date.parse(value.publicationTimestamp)) ||
      !Number.isFinite(Date.parse(value.sourceCutoff))) {
    throw new Error("Assessment is not canonical.");
  }
  return true;
}

function assessmentIdentityV3(value) {
  return `confidence_assessment_v3|${hash({
    goalId: value.goalId,
    phaseId: value.phaseId,
    goalContract: value.goalContract,
    publisherType: value.publisherType,
    briefingArtifactId: value.briefingArtifactId,
    evidenceWindowId: value.evidenceWindowId,
    priorAssessmentId: value.priorAssessmentId,
    currentPercentage: value.currentPercentage,
    structuredInterpretationId: value.structuredInterpretationId,
    idempotencyKey: value.idempotencyKey,
  })}`;
}
function interpretationId(interpretation) {
  return interpretation ? `strategic_interpretation|${interpretation.provenance?.inputFingerprint}` : null;
}
function narrativeId(narrative) {
  return narrative ? `narrative_v3|${narrative.provenance?.inputFingerprint}` : null;
}
function projectionId(projection) {
  return projection ? `strategic_confidence_projection|${projection.interpretationInputFingerprint}|${projection.currentPercentage}` : null;
}
function summarizeFreshness(perDomain) {
  if (perDomain.some((item) => item.freshnessState === "stale")) return "stale";
  if (perDomain.some((item) => item.freshnessState === "aging")) return "aging";
  if (perDomain.every((item) => item.freshnessState === "current")) return "current";
  return "unknown";
}
function magnitudeOf(delta) {
  const value = Math.abs(delta ?? 0);
  if (value === 0) return "none";
  if (value <= 2) return "small";
  if (value <= 5) return "moderate";
  return "material";
}

function assessmentIdentity(value) {
  return `confidence_assessment_v2|${hash({
    goalId: value.goalId,
    phaseId: value.phaseId,
    goalContract: value.goalContract,
    publisherType: value.publisherType,
    briefingArtifactId: value.briefingArtifactId,
    evidenceWindowId: value.evidenceWindowId,
    priorAssessmentId: value.priorAssessmentId,
    currentPercentage: value.currentPercentage,
    forecastAssessmentId: value.forecastAssessmentId,
    idempotencyKey: value.idempotencyKey,
  })}`;
}

function validPercentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}
function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Assessment timestamp is invalid.");
  return new Date(parsed).toISOString();
}
function hash(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
