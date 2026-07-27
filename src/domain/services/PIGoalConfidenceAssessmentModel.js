import { createHash } from "node:crypto";

export const PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION =
  "pi_goal_confidence_assessment_v1";
export const PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE =
  "goal_progress_confidence";
export const PI_GOAL_CONFIDENCE_SEMANTIC_DEFINITION =
  "Confidence in the current evidence-supported assessment that the user is progressing appropriately toward the active goal within the active phase and operating state.";

export const PI_GOAL_CONFIDENCE_CONTEXT_TYPES = Object.freeze([
  "current_active_goal",
  "energy_interpretation",
  "training_interpretation",
  "midweek_partial_window",
  "weekly_closed_window",
  "photo_event",
  "dexa_event",
  "phase_transition",
  "controlled_reconciliation",
]);
export const PI_GOAL_CONFIDENCE_DOMAINS = Object.freeze([
  "energy", "training", "weight", "photos", "dexa", "recovery",
  "protocol", "goal_phase_context", "evidence_completeness",
]);
export const PI_GOAL_CONFIDENCE_DIRECTIONS = Object.freeze([
  "supporting", "neutral", "conflicting", "limiting",
]);
export const PI_GOAL_CONFIDENCE_STRENGTHS = Object.freeze([
  "low", "moderate", "high", "authoritative",
]);
export const PI_GOAL_CONFIDENCE_MOVEMENTS = Object.freeze([
  "initial", "increased", "held", "decreased", "unknown",
]);
export const PI_GOAL_CONFIDENCE_MAGNITUDES = Object.freeze([
  "none", "small", "moderate", "material",
]);
export const PI_GOAL_CONFIDENCE_PRIOR_SOURCES = Object.freeze([
  "canonical_pi_assessment",
  "legacy_home_presentation",
  "controlled_reconciliation_seed",
]);

export const PI_GOAL_CONFIDENCE_SCORE_BANDS = Object.freeze([
  Object.freeze({ id: "very_low", min: 0, max: 19 }),
  Object.freeze({ id: "low", min: 20, max: 39 }),
  Object.freeze({ id: "moderate", min: 40, max: 59 }),
  Object.freeze({ id: "high", min: 60, max: 79 }),
  Object.freeze({ id: "very_high", min: 80, max: 100 }),
]);
const COMPLETENESS = ["complete", "partial", "missing", "unknown"];
const CONFIDENCE_LEVELS = ["unevaluated", "low", "moderate", "high", "very_high"];
const OPERATING_STATE_PATTERN = /^[a-z][a-z0-9_]*$/;
const REFERENCE_PATTERN = /^[^\s]+$/;
const MAX_REFERENCES = 128;

export class PIGoalConfidenceValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PIGoalConfidenceValidationError";
    this.code = code;
    this.details = Object.freeze(structuredClone(details));
  }
}

export function createPIGoalConfidenceAssessment(input = {}) {
  const modelVersion = input.modelVersion ?? input.schemaVersion ??
    PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION;
  requiredEnum(modelVersion, [PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION],
    "unsupported_model_version", "modelVersion");
  requiredEnum(
    input.assessmentType ?? PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE,
    [PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE],
    "invalid_assessment_type",
    "assessmentType"
  );
  const goalId = requiredReference(input.goalId, "missing_goal_id", "goalId");
  const phaseRequired = input.hasActivePhase !== false;
  const phaseId = input.phaseId == null ? null :
    requiredReference(input.phaseId, "invalid_phase_id", "phaseId");
  if (phaseRequired && !phaseId) {
    fail("missing_phase_id", "phaseId is required for a Goal with an active phase.");
  }
  const operatingState = normalizeMachineValue(
    input.operatingState, "invalid_operating_state", "operatingState"
  );
  const piVersion = requiredReference(input.piVersion, "missing_pi_version", "piVersion");
  const context = normalizeContext(input.context);
  const evidenceCutoff = requiredTimestamp(input.evidenceCutoff, "evidenceCutoff");
  const contributors = normalizeContributors(input.contributors);
  const provenance = normalizeProvenance(input.provenance);
  const score = normalizeScore(input.score, input.priorScore, input.movement, input.priorScoreProvenance);
  const reasoning = normalizeReasoning(input.reasoning);
  const inputFingerprint = input.inputFingerprint ?? input.provenance?.inputFingerprint ??
    createPIGoalConfidenceInputFingerprint({
      goalId, phaseId, operatingState, context, contributors, reasoning,
      provenance: {
        sourceObservationIds: provenance.sourceObservationIds,
        sourceClaimIds: provenance.sourceClaimIds,
        canonicalEvidenceReferences: provenance.canonicalEvidenceReferences,
        piDecisionResultId: provenance.piDecisionResultId,
      },
    });
  validateDigest(inputFingerprint, "invalid_input_fingerprint", "inputFingerprint");
  const identityInput = {
    goalId,
    phaseId,
    operatingState,
    contextType: context.type,
    cadence: context.cadence,
    eventId: context.eventId,
    evidenceWindowId: context.evidenceWindowId,
    evidenceCutoff,
    piVersion,
    modelVersion,
    inputFingerprint,
  };
  const expectedId = createPIGoalConfidenceAssessmentId(identityInput);
  if (input.id && input.id !== expectedId) {
    fail("assessment_identity_mismatch",
      "Assessment ID does not match its deterministic semantic identity.",
      { expectedId, receivedId: input.id });
  }
  const assessment = {
    schemaVersion: PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION,
    modelVersion,
    assessmentType: PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE,
    semanticDefinition: PI_GOAL_CONFIDENCE_SEMANTIC_DEFINITION,
    id: expectedId,
    piVersion,
    goalId,
    phaseId,
    operatingState,
    context,
    evidenceCutoff,
    score,
    primaryReason: optionalText(input.primaryReason),
    contributors,
    unresolvedUncertainty: uniqueText(input.unresolvedUncertainty),
    evidenceCompleteness: normalizeCompleteness(input.evidenceCompleteness),
    phaseAwareInterpretation: optionalText(input.phaseAwareInterpretation),
    coachingImplication: optionalText(input.coachingImplication),
    reasoning,
    provenance: {
      ...provenance,
      generatedAt: requiredTimestamp(
        input.generatedAt ?? input.provenance?.generatedAt,
        "generatedAt"
      ),
      inputFingerprint,
    },
  };
  return deepFreeze(assessment);
}

export function validatePIGoalConfidenceAssessment(value) {
  const rebuilt = createPIGoalConfidenceAssessment(value);
  if (stableSerialize(rebuilt) !== stableSerialize(value)) {
    fail("assessment_not_canonical",
      "Goal-confidence assessment is not in canonical normalized form.");
  }
  return true;
}

export function createPIGoalConfidenceAssessmentId(input = {}) {
  const normalized = {
    goalId: requiredReference(input.goalId, "missing_goal_id", "goalId"),
    phaseId: input.phaseId == null ? null :
      requiredReference(input.phaseId, "invalid_phase_id", "phaseId"),
    operatingState: normalizeMachineValue(
      input.operatingState, "invalid_operating_state", "operatingState"
    ),
    contextType: requiredEnum(input.contextType, PI_GOAL_CONFIDENCE_CONTEXT_TYPES,
      "unsupported_context_type", "contextType"),
    cadence: input.cadence == null ? null :
      normalizeMachineValue(input.cadence, "invalid_cadence", "cadence"),
    eventId: input.eventId == null ? null :
      requiredReference(input.eventId, "invalid_event_id", "eventId"),
    evidenceWindowId: input.evidenceWindowId == null ? null :
      requiredReference(input.evidenceWindowId, "invalid_evidence_window", "evidenceWindowId"),
    evidenceCutoff: requiredTimestamp(input.evidenceCutoff, "evidenceCutoff"),
    piVersion: requiredReference(input.piVersion, "missing_pi_version", "piVersion"),
    modelVersion: requiredEnum(
      input.modelVersion ?? PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION,
      [PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION],
      "unsupported_model_version",
      "modelVersion"
    ),
    inputFingerprint: validateDigest(
      input.inputFingerprint, "invalid_input_fingerprint", "inputFingerprint"
    ),
  };
  return `pi_goal_confidence|${sha256(stableSerialize(normalized))}`;
}

export function createPIGoalConfidenceInputFingerprint(input = {}) {
  return `sha256_${sha256(stableSerialize(normalizeFingerprintInput(input)))}`;
}

export function resolvePIGoalConfidenceScoreBand(score) {
  const normalized = normalizeIntegerScore(score, "current");
  return PI_GOAL_CONFIDENCE_SCORE_BANDS.find((band) =>
    normalized >= band.min && normalized <= band.max).id;
}

function normalizeScore(value = {}, priorScoreInput, movementInput = {}, priorProvenanceInput) {
  const current = normalizeIntegerScore(value.current ?? value.value, "current");
  const suppliedPrior = value.prior ?? priorScoreInput;
  const prior = suppliedPrior == null ? null : normalizeIntegerScore(suppliedPrior, "prior");
  const delta = prior == null ? null : current - prior;
  if (value.delta != null && value.delta !== delta) {
    fail("inconsistent_score_delta", "Score delta is inconsistent with prior and current scores.");
  }
  const derivedDirection = prior == null ? "initial" :
    delta > 0 ? "increased" : delta < 0 ? "decreased" : "held";
  const direction = movementInput.direction ?? value.movement?.direction ??
    value.movementDirection ?? derivedDirection;
  requiredEnum(direction, PI_GOAL_CONFIDENCE_MOVEMENTS,
    "invalid_movement_direction", "movement.direction");
  if (prior != null && direction !== derivedDirection) {
    fail("inconsistent_movement_direction",
      "Movement direction is inconsistent with prior and current scores.");
  }
  if (prior == null && !["initial", "unknown"].includes(direction)) {
    fail("inconsistent_movement_direction",
      "An assessment without a prior score must be initial or unknown.");
  }
  const magnitude = movementInput.magnitude ?? value.movement?.magnitude ??
    value.movementMagnitude ??
    (delta == null || delta === 0 ? "none" : null);
  requiredEnum(magnitude, PI_GOAL_CONFIDENCE_MAGNITUDES,
    "invalid_movement_magnitude", "movement.magnitude");
  if ((delta == null || delta === 0) && magnitude !== "none") {
    fail("inconsistent_movement_magnitude",
      "Initial, unknown, and held assessments must use movement magnitude none.");
  }
  if (delta != null && delta !== 0 && magnitude === "none") {
    fail("inconsistent_movement_magnitude",
      "Changed scores require a supplied non-none movement magnitude.");
  }
  const suppliedBand = value.band;
  const band = resolvePIGoalConfidenceScoreBand(current);
  if (suppliedBand != null && suppliedBand !== band) {
    fail("invalid_score_band", "Score band does not match the canonical score boundary.");
  }
  return {
    current,
    band,
    prior,
    delta,
    movement: { direction, magnitude },
    priorScoreProvenance: normalizePriorScoreProvenance(
      value.priorScoreProvenance ?? priorProvenanceInput, prior
    ),
  };
}

function normalizePriorScoreProvenance(value, prior) {
  if (prior == null) {
    if (value != null) {
      fail("unexpected_prior_provenance",
        "Prior-score provenance requires a prior score.");
    }
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("missing_prior_provenance",
      "A supplied prior score requires typed provenance.");
  }
  const source = requiredEnum(value.source, PI_GOAL_CONFIDENCE_PRIOR_SOURCES,
    "invalid_prior_provenance", "priorScoreProvenance.source");
  return {
    source,
    assessmentId: value.assessmentId == null ? null :
      requiredReference(value.assessmentId, "invalid_prior_provenance", "assessmentId"),
    modelVersion: value.modelVersion == null ? null :
      requiredReference(value.modelVersion, "invalid_prior_provenance", "modelVersion"),
  };
}

function normalizeContext(value = {}) {
  const type = requiredEnum(value.type, PI_GOAL_CONFIDENCE_CONTEXT_TYPES,
    "unsupported_context_type", "context.type");
  const evidenceWindowId = value.evidenceWindowId == null ? null :
    requiredReference(value.evidenceWindowId, "invalid_evidence_window", "evidenceWindowId");
  const eventId = value.eventId == null ? null :
    requiredReference(value.eventId, "invalid_event_id", "eventId");
  if (["midweek_partial_window", "weekly_closed_window"].includes(type) &&
      !evidenceWindowId) {
    fail("missing_evidence_window",
      `${type} requires an evidence-window identity.`);
  }
  if (["photo_event", "dexa_event"].includes(type) && !eventId) {
    fail("missing_event_id", `${type} requires an event identity.`);
  }
  return {
    type,
    cadence: value.cadence == null ? null :
      normalizeMachineValue(value.cadence, "invalid_cadence", "context.cadence"),
    evidenceWindowId,
    eventId,
  };
}

function normalizeContributors(values = []) {
  if (!Array.isArray(values)) {
    fail("invalid_contributors", "Contributors must be an array.");
  }
  const normalized = values.map(normalizeContributor)
    .sort((left, right) => left.id.localeCompare(right.id));
  const ids = normalized.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    fail("duplicate_contributor_id", "Contributor IDs must be unique.");
  }
  return normalized;
}

function normalizeContributor(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_contributor", "Each contributor must be an object.");
  }
  const contributor = {
    id: requiredReference(value.id, "invalid_contributor_id", "contributor.id"),
    domain: requiredEnum(normalizeDomain(value.domain), PI_GOAL_CONFIDENCE_DOMAINS,
      "invalid_contributor_domain", "contributor.domain"),
    label: requiredText(value.label, "invalid_contributor_label", "contributor.label"),
    direction: requiredEnum(value.direction, PI_GOAL_CONFIDENCE_DIRECTIONS,
      "invalid_contributor_direction", "contributor.direction"),
    strength: requiredEnum(value.strength, PI_GOAL_CONFIDENCE_STRENGTHS,
      "invalid_contributor_strength", "contributor.strength"),
    confidence: normalizeConfidence(value.confidence),
    evidenceCompleteness: requiredEnum(
      value.evidenceCompleteness ?? "unknown",
      COMPLETENESS,
      "invalid_evidence_completeness",
      "contributor.evidenceCompleteness"
    ),
    reason: optionalText(value.reason),
    sourceObservationIds: referenceList(value.sourceObservationIds, "sourceObservationIds"),
    sourceClaimIds: referenceList(value.sourceClaimIds, "sourceClaimIds"),
    canonicalEvidenceReferences: evidenceReferences(value.canonicalEvidenceReferences),
    affectedScoreMovement: Boolean(value.affectedScoreMovement),
    userFacing: value.userFacing !== false,
  };
  const lineage = normalizeContributorLineage(value);
  return Object.values(lineage).some((item) =>
    Array.isArray(item) ? item.length > 0 : item != null
  ) ? { ...contributor, ...lineage } : contributor;
}

function normalizeContributorLineage(value) {
  const role = value.consumptionRole ?? null;
  if (role != null && !["new_effect", "prior_context", "new_corroboration"].includes(role)) {
    fail("invalid_consumption_role", "Unsupported contributor consumption role.");
  }
  return {
    consumedTransitionIds: referenceList(
      value.consumedTransitionIds,
      "consumedTransitionIds"
    ),
    contributorSemanticFingerprint: value.contributorSemanticFingerprint == null
      ? null
      : validateDigest(
          value.contributorSemanticFingerprint,
          "invalid_contributor_semantic_fingerprint",
          "contributorSemanticFingerprint"
        ),
    firstConsumedAssessmentId: value.firstConsumedAssessmentId == null
      ? null
      : requiredReference(
          value.firstConsumedAssessmentId,
          "invalid_first_consumed_assessment",
          "firstConsumedAssessmentId"
        ),
    sourceInterpretationId: value.sourceInterpretationId == null
      ? null
      : requiredReference(
          value.sourceInterpretationId,
          "invalid_source_interpretation",
          "sourceInterpretationId"
        ),
    consumptionRole: role,
  };
}

function normalizeProvenance(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_provenance", "Provenance must be an object.");
  }
  return {
    sourceObservationIds: referenceList(value.sourceObservationIds, "sourceObservationIds"),
    sourceClaimIds: referenceList(value.sourceClaimIds, "sourceClaimIds"),
    canonicalEvidenceReferences: evidenceReferences(value.canonicalEvidenceReferences),
    piDecisionResultId: value.piDecisionResultId == null ? null :
      requiredReference(value.piDecisionResultId, "invalid_pi_decision_reference",
        "piDecisionResultId"),
  };
}

function normalizeReasoning(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_reasoning", "Reasoning must be an object.");
  }
  return {
    observationSemantics: semanticRecords(
      value.observations ?? value.observationSemantics
    ),
    claimSemantics: semanticRecords(value.claims ?? value.claimSemantics),
    limitations: uniqueText(value.limitations),
    contradictions: uniqueText(value.contradictions),
    domainInterpretations: semanticRecords(value.domainInterpretations),
    authoritativeMeasurement: normalizeSemanticRecord(value.authoritativeMeasurement),
  };
}

function normalizeFingerprintInput(value = {}) {
  return {
    goalId: nullableReference(value.goalId),
    phaseId: nullableReference(value.phaseId),
    operatingState: value.operatingState == null ? null : normalizeMachineValue(
      value.operatingState, "invalid_operating_state", "operatingState"
    ),
    context: value.context ? normalizeContext(value.context) : null,
    contributors: fingerprintContributors(value.contributors),
    reasoning: normalizeReasoning(value.reasoning),
    provenance: value.provenance ? {
      sourceObservationIds: referenceList(value.provenance.sourceObservationIds),
      sourceClaimIds: referenceList(value.provenance.sourceClaimIds),
      canonicalEvidenceReferences: evidenceReferences(
        value.provenance.canonicalEvidenceReferences
      ),
      piDecisionResultId: nullableReference(value.provenance.piDecisionResultId),
    } : null,
  };
}

function fingerprintContributors(values = []) {
  return normalizeContributors(values).map((item) => ({
    id: item.id,
    domain: item.domain,
    direction: item.direction,
    strength: item.strength,
    confidence: item.confidence,
    evidenceCompleteness: item.evidenceCompleteness,
    sourceObservationIds: item.sourceObservationIds,
    sourceClaimIds: item.sourceClaimIds,
    canonicalEvidenceReferences: item.canonicalEvidenceReferences,
    affectedScoreMovement: item.affectedScoreMovement,
    consumedTransitionIds: item.consumedTransitionIds ?? [],
    contributorSemanticFingerprint:
      item.contributorSemanticFingerprint ?? null,
    sourceInterpretationId: item.sourceInterpretationId ?? null,
    consumptionRole: item.consumptionRole ?? null,
  }));
}

function semanticRecords(values = []) {
  if (!Array.isArray(values)) {
    fail("invalid_semantic_records", "PI semantic records must be an array.");
  }
  return values.map(normalizeSemanticRecord)
    .filter(Boolean)
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)));
}

function normalizeSemanticRecord(value) {
  if (value == null) return null;
  if (typeof value === "string") return { id: requiredReference(
    value, "invalid_semantic_record", "semanticRecord.id"
  ) };
  if (typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_semantic_record", "PI semantic records must be IDs or objects.");
  }
  const result = {};
  for (const key of [
    "id", "domain", "kind", "status", "direction", "relationshipKind",
    "confidenceLevel", "evidenceCompleteness", "authority", "measurementStatus",
  ]) {
    const candidate = key === "confidenceLevel"
      ? value.confidenceLevel ?? value.confidence?.level
      : value[key];
    if (candidate != null && candidate !== "") result[key] = String(candidate);
  }
  if (!result.id && Object.keys(result).length === 0) {
    fail("invalid_semantic_record",
      "PI semantic records require stable semantic fields.");
  }
  return result;
}

function normalizeCompleteness(value = {}) {
  if (typeof value === "string") {
    return { overall: requiredEnum(value, COMPLETENESS,
      "invalid_evidence_completeness", "evidenceCompleteness") };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_evidence_completeness", "Evidence completeness must be typed.");
  }
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    normalized[normalizeMachineValue(key, "invalid_evidence_completeness", key)] =
      requiredEnum(value[key], COMPLETENESS,
        "invalid_evidence_completeness", `evidenceCompleteness.${key}`);
  }
  return normalized;
}

function normalizeConfidence(value = "unevaluated") {
  const source = typeof value === "string" ? { level: value } : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    fail("invalid_contributor_confidence", "Contributor confidence must be typed.");
  }
  return {
    level: requiredEnum(source.level ?? "unevaluated", CONFIDENCE_LEVELS,
      "invalid_contributor_confidence", "contributor.confidence.level"),
    method: source.method == null ? null :
      normalizeMachineValue(source.method, "invalid_contributor_confidence",
        "contributor.confidence.method"),
  };
}

function evidenceReferences(values = []) {
  if (!Array.isArray(values) || values.length > MAX_REFERENCES) {
    fail("invalid_source_reference", "Canonical evidence references must be bounded.");
  }
  const map = new Map();
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail("invalid_source_reference",
        "Canonical evidence references must be objects.");
    }
    const reference = {
      id: requiredReference(value.id, "invalid_source_reference", "evidenceReference.id"),
      type: value.type == null ? null :
        normalizeMachineValue(value.type, "invalid_source_reference",
          "evidenceReference.type"),
    };
    const key = stableSerialize(reference);
    map.set(key, reference);
  }
  return [...map.values()].sort((left, right) =>
    stableSerialize(left).localeCompare(stableSerialize(right)));
}

function referenceList(values = [], field = "references") {
  if (!Array.isArray(values) || values.length > MAX_REFERENCES) {
    fail("invalid_source_reference", `${field} must be a bounded array.`);
  }
  return [...new Set(values.map((value) =>
    requiredReference(value, "invalid_source_reference", field)))].sort();
}

function normalizeDomain(value) {
  return String(value ?? "").trim().toLowerCase()
    .replaceAll("/", "_")
    .replaceAll("-", "_")
    .replace(/\s+/g, "_");
}

function normalizeIntegerScore(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    fail("invalid_score", `${field} score must be an integer from 0 through 100.`);
  }
  return value;
}

function requiredReference(value, code, field) {
  if (typeof value !== "string" || !value.trim() ||
      !REFERENCE_PATTERN.test(value.trim())) {
    fail(code, `${field} must be a stable non-empty reference.`);
  }
  return value.trim();
}

function nullableReference(value) {
  return value == null ? null :
    requiredReference(value, "invalid_source_reference", "reference");
}

function requiredText(value, code, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail(code, `${field} is required.`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueText(values = []) {
  if (!Array.isArray(values)) {
    fail("invalid_text_collection", "Structured text collections must be arrays.");
  }
  return [...new Set(values.filter((value) =>
    typeof value === "string" && value.trim()).map((value) => value.trim()))].sort();
}

function normalizeMachineValue(value, code, field) {
  if (typeof value !== "string" || !OPERATING_STATE_PATTERN.test(value.trim())) {
    fail(code, `${field} must be a lowercase machine value.`);
  }
  return value.trim();
}

function requiredTimestamp(value, field) {
  if (typeof value !== "string" || !value.trim() ||
      !Number.isFinite(Date.parse(value))) {
    fail("invalid_timestamp", `${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function requiredEnum(value, allowed, code, field) {
  if (!allowed.includes(value)) fail(code, `Unsupported ${field}.`, { value });
  return value;
}

function validateDigest(value, code, field) {
  if (typeof value !== "string" || !/^sha256_[a-f0-9]{64}$/.test(value)) {
    fail(code, `${field} must use the canonical SHA-256 fingerprint format.`);
  }
  return value;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function fail(code, message, details) {
  throw new PIGoalConfidenceValidationError(code, message, details);
}
