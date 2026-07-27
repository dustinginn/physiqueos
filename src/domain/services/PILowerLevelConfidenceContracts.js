import { createHash } from "node:crypto";

export const PI_LOWER_LEVEL_CONFIDENCE_VERSION =
  "pi_lower_level_confidence_v1";
export const PI_LOWER_LEVEL_CONFIDENCE_MODEL_VERSION =
  "pi_goal_confidence_assessment_v1";

export const PILowerLevelTriggerType = Object.freeze({
  ENERGY: "energy_interpretation_change",
  TRAINING: "training_interpretation_change",
});

export const PILowerLevelTriggerOutcome = Object.freeze({
  PUBLISHED_SUCCESSOR: "published_successor",
  MATCHED: "matched",
  NOT_MATERIAL: "not_material",
  AWAITING_PAIR: "awaiting_pair",
  AWAITING_TRAINING: "awaiting_final_training_interpretation",
  ALREADY_CONSUMED: "already_consumed",
  CADENCE_OWNED: "cadence_owned",
  EVENT_OWNED: "event_owned",
  CONTEXT_PRECEDENCE_BLOCKED: "context_precedence_blocked",
  BASELINE_CONFLICT: "baseline_conflict",
  SEMANTIC_CONFLICT: "semantic_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
});

export const PIConsumptionRole = Object.freeze({
  NEW_EFFECT: "new_effect",
  PRIOR_CONTEXT: "prior_context",
  NEW_CORROBORATION: "new_corroboration",
});

export function createPIDomainConsumptionIdentity(input = {}) {
  const domain = required(input.domain, "domain");
  const semantic = {
    version: "pi_domain_transition_consumption_v1",
    domain,
    sourceInterpretationId: required(
      input.sourceInterpretationId,
      "sourceInterpretationId"
    ),
    interpretationFingerprint: required(
      input.interpretationFingerprint,
      "interpretationFingerprint"
    ),
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    evidenceCutoff: iso(input.evidenceCutoff),
    sourceEvidenceIds: strings(input.sourceEvidenceIds),
    transitionFromState: input.transitionFromState ?? null,
    transitionToState: required(input.transitionToState, "transitionToState"),
    confidenceModelVersion:
      input.confidenceModelVersion ?? PI_LOWER_LEVEL_CONFIDENCE_MODEL_VERSION,
    domainIdentity: normalizeDomainIdentity(domain, input.domainIdentity),
  };
  return freeze({
    schemaVersion: semantic.version,
    id: `pi_domain_consumption|${sha(stable(semantic))}`,
    ...semantic,
    firstConsumedAssessmentId: input.firstConsumedAssessmentId ?? null,
    consumptionRole: enumValue(
      input.consumptionRole ?? PIConsumptionRole.NEW_EFFECT,
      Object.values(PIConsumptionRole),
      "consumptionRole"
    ),
  });
}

export function createPILowerLevelTriggerCandidate(input = {}) {
  const triggerType = enumValue(
    input.triggerType,
    Object.values(PILowerLevelTriggerType),
    "triggerType"
  );
  const consumption = createPIDomainConsumptionIdentity(input.consumption);
  const semantic = {
    version: "pi_lower_level_trigger_candidate_v1",
    triggerType,
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    sourceEvidenceIds: strings(input.sourceEvidenceIds),
    finalizedInterpretationId: required(
      input.finalizedInterpretationId,
      "finalizedInterpretationId"
    ),
    interpretationFingerprint: required(
      input.interpretationFingerprint,
      "interpretationFingerprint"
    ),
    evidenceCutoff: iso(input.evidenceCutoff),
    semanticChangeType: required(
      input.semanticChangeType,
      "semanticChangeType"
    ),
    publicationEligibility: Boolean(input.publicationEligibility),
    expectedCurrentSnapshotId: input.expectedCurrentSnapshotId ?? null,
    expectedRevision: integer(input.expectedRevision, "expectedRevision"),
    expectedSemanticDigest: required(
      input.expectedSemanticDigest,
      "expectedSemanticDigest"
    ),
    consumptionId: consumption.id,
    priorConsumedTransitionIdentity:
      input.priorConsumedTransitionIdentity ?? null,
    ownership: enumValue(
      input.ownership ?? "lower_level",
      ["lower_level", "cadence", "event"],
      "ownership"
    ),
  };
  return freeze({
    schemaVersion: semantic.version,
    id: `pi_lower_level_trigger|${sha(stable(semantic))}`,
    ...semantic,
    consumption,
  });
}

export function normalizePIContributorLineage(value = {}) {
  return freeze({
    consumedTransitionIds: strings(value.consumedTransitionIds),
    contributorSemanticFingerprint:
      value.contributorSemanticFingerprint ?? null,
    firstConsumedAssessmentId: value.firstConsumedAssessmentId ?? null,
    sourceInterpretationId: value.sourceInterpretationId ?? null,
    consumptionRole: value.consumptionRole == null
      ? null
      : enumValue(
          value.consumptionRole,
          Object.values(PIConsumptionRole),
          "consumptionRole"
        ),
  });
}

export function resolvePICadenceConsumptionRole({
  consumedTransitionId,
  predecessorConsumedTransitionIds = [],
  hasNewDomainTransition = false,
  hasNewCorroboration = false,
} = {}) {
  if (
    consumedTransitionId &&
    strings(predecessorConsumedTransitionIds).includes(consumedTransitionId) &&
    !hasNewDomainTransition
  ) {
    return hasNewCorroboration
      ? PIConsumptionRole.NEW_CORROBORATION
      : PIConsumptionRole.PRIOR_CONTEXT;
  }
  return PIConsumptionRole.NEW_EFFECT;
}

function normalizeDomainIdentity(domain, value = {}) {
  if (domain === "energy") {
    return {
      pairedLocalDates: strings(value.pairedLocalDates),
      nutritionIds: strings(value.nutritionIds),
      activityIds: strings(value.activityIds),
      rollingWindowId: required(value.rollingWindowId, "rollingWindowId"),
      interpretationVersion: required(
        value.interpretationVersion,
        "interpretationVersion"
      ),
    };
  }
  if (domain === "training") {
    return {
      canonicalSessionId: required(
        value.canonicalSessionId,
        "canonicalSessionId"
      ),
      performanceEventIds: strings(value.performanceEventIds),
      finalizedReportId: required(value.finalizedReportId, "finalizedReportId"),
      categoryTrendFingerprint: required(
        value.categoryTrendFingerprint,
        "categoryTrendFingerprint"
      ),
      interpretationVersion: required(
        value.interpretationVersion,
        "interpretationVersion"
      ),
    };
  }
  throw new Error(`Unsupported lower-level confidence domain: ${domain}`);
}

export function stablePISerialize(value) {
  return stable(value);
}
export function createPISemanticFingerprint(value) {
  return `sha256_${sha(stable(value))}`;
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}
function strings(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}
function iso(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("evidenceCutoff is invalid.");
  return new Date(time).toISOString();
}
function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Unsupported ${field}: ${value}`);
  return value;
}
function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
