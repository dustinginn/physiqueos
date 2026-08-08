import { createHash } from "node:crypto";

export const CANONICAL_CONFIDENCE_ASSESSMENT_VERSION =
  "canonical_confidence_assessment_v2";

const PUBLISHERS = new Set([
  "goal_initialization", "midweek_briefing", "weekly_briefing",
  "monthly_briefing", "dexa_event_briefing", "photo_event_briefing",
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
  const id = assessmentIdentity(canonical);
  if (input.id && input.id !== id) throw new Error("Assessment identity mismatch.");
  return deepFreeze({ id, assessmentId: id, ...canonical });
}

export function validateCanonicalConfidenceAssessment(value) {
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
