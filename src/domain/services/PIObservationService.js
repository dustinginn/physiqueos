export const PI_OBSERVATION_SCHEMA_VERSION = "pi_observation_v1";

export const PI_OBSERVATION_DOMAINS = Object.freeze([
  "training",
  "nutrition",
  "weight",
  "dexa",
  "photos",
  "activity",
  "energy",
  "recovery",
  "goals",
  "protocols",
]);

export const PI_OBSERVATION_STATUSES = Object.freeze([
  "unknown",
  "observed",
  "insufficient_data",
  "stable",
  "improving",
  "plateauing",
  "regressing",
]);

export const PI_OBSERVATION_DIRECTIONS = Object.freeze([
  "positive",
  "negative",
  "neutral",
  "rising",
  "falling",
  "stable",
  "not_applicable",
  "unknown",
]);

export const PI_CONFIDENCE_LEVELS = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
  "very_high",
]);

export const PI_MATERIALITY_LEVELS = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
]);

export const PI_OBSERVATION_ROLES = Object.freeze([
  "progress",
  "guardrail",
  "risk",
  "context",
  "unknown",
]);

export const PI_NOVELTY_STATES = Object.freeze(["unevaluated"]);

export const PI_LIFECYCLE_STATES = Object.freeze([
  "unevaluated",
  "new",
  "strengthened",
  "weakened",
  "contradicted",
  "unchanged",
  "resolved",
  "background",
  "retired",
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MACHINE_KEY_PATTERN = /^[a-z0-9]+(?:[._|:-][a-z0-9]+)*$/;

/**
 * Semantic identity deliberately excludes status, confidence, evidence, dates,
 * and rendered language. Event-scoped producers may opt into a stable scope.
 */
export function createPIObservationId({
  domain,
  kind,
  subjectKey,
  semanticScope = null,
} = {}) {
  const normalizedDomain = requiredEnum(domain, "domain", PI_OBSERVATION_DOMAINS);
  const normalizedKind = requiredMachineKey(kind, "kind");
  const normalizedSubjectKey = requiredMachineKey(subjectKey, "subjectKey");
  const normalizedScope =
    semanticScope == null
      ? null
      : requiredMachineKey(semanticScope, "semanticScope");

  return [
    "pi",
    normalizedDomain,
    normalizedKind,
    normalizedSubjectKey,
    normalizedScope,
  ]
    .filter(Boolean)
    .join("|");
}

export function createPIObservation(input = {}) {
  const normalizedInput = { ...input };
  if (!normalizedInput.id) {
    const subject = normalizeSubject(normalizedInput.subject);
    normalizedInput.id = createPIObservationId({
      domain: normalizedInput.domain,
      kind: normalizedInput.kind,
      subjectKey: subject.id ?? subject.semanticKey,
      semanticScope: normalizedInput.semanticScope,
    });
  }

  return normalizePIObservation(normalizedInput);
}

export function normalizePIObservation(input = {}) {
  assertPlainObject(input, "observation");

  const subject = normalizeSubject(input.subject);
  const observation = {
    id: requiredString(input.id, "id"),
    schemaVersion:
      input.schemaVersion == null
        ? PI_OBSERVATION_SCHEMA_VERSION
        : requiredEnum(
            input.schemaVersion,
            "schemaVersion",
            [PI_OBSERVATION_SCHEMA_VERSION]
          ),
    domain: requiredEnum(input.domain, "domain", PI_OBSERVATION_DOMAINS),
    kind: requiredMachineKey(input.kind, "kind"),
    subject,
    status: requiredEnum(input.status, "status", PI_OBSERVATION_STATUSES),
    direction: requiredEnum(
      input.direction,
      "direction",
      PI_OBSERVATION_DIRECTIONS
    ),
    evidenceWindow: normalizeEvidenceWindow(input.evidenceWindow),
    supportingEvidenceIds: normalizeEvidenceIds(
      input.supportingEvidenceIds,
      "supportingEvidenceIds"
    ),
    contradictingEvidenceIds: normalizeEvidenceIds(
      input.contradictingEvidenceIds,
      "contradictingEvidenceIds"
    ),
    confidence: normalizeConfidence(input.confidence),
    materiality: normalizeMateriality(input.materiality),
    goalContext: normalizeGoalContext(input.goalContext),
    novelty: normalizeNovelty(input.novelty),
    lifecycle: normalizeLifecycle(input.lifecycle),
    explanationData: normalizeJsonObject(
      input.explanationData,
      "explanationData"
    ),
    provenance: normalizeProvenance(input.provenance),
  };

  validatePIObservation(observation);
  return observation;
}

export function validatePIObservation(input) {
  assertPlainObject(input, "observation");
  requiredString(input.id, "id");
  requiredEnum(input.schemaVersion, "schemaVersion", [
    PI_OBSERVATION_SCHEMA_VERSION,
  ]);
  requiredEnum(input.domain, "domain", PI_OBSERVATION_DOMAINS);
  requiredMachineKey(input.kind, "kind");
  normalizeSubject(input.subject);
  requiredEnum(input.status, "status", PI_OBSERVATION_STATUSES);
  requiredEnum(input.direction, "direction", PI_OBSERVATION_DIRECTIONS);
  normalizeEvidenceWindow(input.evidenceWindow);
  normalizeEvidenceIds(input.supportingEvidenceIds, "supportingEvidenceIds");
  normalizeEvidenceIds(
    input.contradictingEvidenceIds,
    "contradictingEvidenceIds"
  );
  normalizeConfidence(input.confidence);
  normalizeMateriality(input.materiality);
  normalizeGoalContext(input.goalContext);
  normalizeNovelty(input.novelty);
  normalizeLifecycle(input.lifecycle);
  normalizeJsonObject(input.explanationData, "explanationData");
  normalizeProvenance(input.provenance);
  return true;
}

export function isPIObservation(value) {
  try {
    validatePIObservation(value);
    return true;
  } catch {
    return false;
  }
}

export function sortPIObservations(observations = []) {
  const validated = observations.map((observation) => {
    validatePIObservation(observation);
    return observation;
  });
  assertUniquePIObservationIds(validated);
  return [...validated].sort((left, right) => left.id.localeCompare(right.id));
}

export function filterPIObservationsByDomain(observations = [], domain) {
  const normalizedDomain = requiredEnum(
    domain,
    "domain",
    PI_OBSERVATION_DOMAINS
  );
  return observations.filter((observation) => {
    validatePIObservation(observation);
    return observation.domain === normalizedDomain;
  });
}

export function filterPIObservationsByKind(observations = [], kind) {
  const normalizedKind = requiredMachineKey(kind, "kind");
  return observations.filter((observation) => {
    validatePIObservation(observation);
    return observation.kind === normalizedKind;
  });
}

export function assertUniquePIObservationIds(observations = []) {
  const seen = new Set();
  const duplicates = new Set();

  observations.forEach((observation) => {
    const id = requiredString(observation?.id, "observation.id");
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate PI observation IDs: ${[...duplicates].sort().join(", ")}`
    );
  }

  return true;
}

export function normalizePIEvidenceIds(values = [], field = "evidenceIds") {
  return normalizeEvidenceIds(values, field);
}

function normalizeSubject(value) {
  assertPlainObject(value, "subject");
  const id = optionalMachineKey(value.id, "subject.id");
  const semanticKey = optionalMachineKey(
    value.semanticKey,
    "subject.semanticKey"
  );
  if (!id && !semanticKey) {
    throw new Error("subject requires id or semanticKey.");
  }

  return {
    type: requiredMachineKey(value.type, "subject.type"),
    id,
    semanticKey,
    label: optionalString(value.label, "subject.label"),
  };
}

function normalizeEvidenceWindow(value) {
  assertPlainObject(value, "evidenceWindow");
  const startDate = optionalDate(value.startDate, "evidenceWindow.startDate");
  const endDate = optionalDate(value.endDate, "evidenceWindow.endDate");
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error(
      "evidenceWindow.startDate and endDate must both be supplied or both be null."
    );
  }
  if (startDate && startDate > endDate) {
    throw new Error("evidenceWindow.startDate must not follow endDate.");
  }

  const comparisonStartDate = optionalDate(
    value.comparisonStartDate,
    "evidenceWindow.comparisonStartDate"
  );
  const comparisonEndDate = optionalDate(
    value.comparisonEndDate,
    "evidenceWindow.comparisonEndDate"
  );
  if (
    comparisonStartDate &&
    comparisonEndDate &&
    comparisonStartDate > comparisonEndDate
  ) {
    throw new Error(
      "evidenceWindow.comparisonStartDate must not follow comparisonEndDate."
    );
  }

  return {
    startDate,
    endDate,
    comparisonStartDate,
    comparisonEndDate,
  };
}

function normalizeConfidence(value = {}) {
  assertPlainObject(value, "confidence");
  const score = optionalFiniteNumber(value.score, "confidence.score");
  if (score != null && (score < 0 || score > 100)) {
    throw new Error("confidence.score must be between 0 and 100.");
  }

  return {
    level: requiredEnum(
      value.level ?? "unevaluated",
      "confidence.level",
      PI_CONFIDENCE_LEVELS
    ),
    score,
    reasons: normalizeStringArray(value.reasons, "confidence.reasons"),
    factors: normalizeJsonArray(value.factors, "confidence.factors"),
    limitations: normalizeStringArray(
      value.limitations,
      "confidence.limitations"
    ),
    method: optionalMachineKey(value.method, "confidence.method"),
  };
}

function normalizeMateriality(value = {}) {
  assertPlainObject(value, "materiality");
  const score = optionalFiniteNumber(value.score, "materiality.score");
  if (score != null && (score < 0 || score > 100)) {
    throw new Error("materiality.score must be between 0 and 100.");
  }

  return {
    level: requiredEnum(
      value.level ?? "unevaluated",
      "materiality.level",
      PI_MATERIALITY_LEVELS
    ),
    score,
    basis: normalizeStringArray(value.basis, "materiality.basis"),
    method: optionalMachineKey(value.method, "materiality.method"),
  };
}

function normalizeGoalContext(value = null) {
  if (value == null) return null;
  assertPlainObject(value, "goalContext");
  const phaseAgeDays = optionalNonNegativeNumber(
    value.phaseAgeDays,
    "goalContext.phaseAgeDays"
  );
  const phaseAgeWeeks = optionalNonNegativeNumber(
    value.phaseAgeWeeks,
    "goalContext.phaseAgeWeeks"
  );

  return {
    activeGoalId: optionalString(value.activeGoalId, "goalContext.activeGoalId"),
    goalType: optionalMachineKey(value.goalType, "goalContext.goalType"),
    goalStatus: optionalMachineKey(value.goalStatus, "goalContext.goalStatus"),
    semanticGoalType: optionalMachineKey(
      value.semanticGoalType,
      "goalContext.semanticGoalType"
    ),
    goalStartDate: optionalDate(
      value.goalStartDate,
      "goalContext.goalStartDate"
    ),
    goalPhase: optionalMachineKey(value.goalPhase, "goalContext.goalPhase"),
    phaseId: optionalMachineKey(value.phaseId, "goalContext.phaseId"),
    phaseStartDate: optionalDate(
      value.phaseStartDate,
      "goalContext.phaseStartDate"
    ),
    phaseAgeDays,
    phaseAgeWeeks,
    phaseAgeBand: optionalMachineKey(
      value.phaseAgeBand,
      "goalContext.phaseAgeBand"
    ),
    observationRole: requiredEnum(
      value.observationRole ?? "unknown",
      "goalContext.observationRole",
      PI_OBSERVATION_ROLES
    ),
    primaryOutcomeRelevance: optionalBoolean(
      value.primaryOutcomeRelevance,
      "goalContext.primaryOutcomeRelevance"
    ),
    guardrailRelevance: optionalBoolean(
      value.guardrailRelevance,
      "goalContext.guardrailRelevance"
    ),
    evidencePurpose: optionalMachineKey(
      value.evidencePurpose,
      "goalContext.evidencePurpose"
    ),
    primaryOutcomeDomains: normalizeMachineKeyArray(
      value.primaryOutcomeDomains,
      "goalContext.primaryOutcomeDomains"
    ),
    primaryOutcomeMeasures: normalizeMachineKeyArray(
      value.primaryOutcomeMeasures,
      "goalContext.primaryOutcomeMeasures"
    ),
    guardrailDomains: normalizeMachineKeyArray(
      value.guardrailDomains,
      "goalContext.guardrailDomains"
    ),
    guardrailMeasures: normalizeMachineKeyArray(
      value.guardrailMeasures,
      "goalContext.guardrailMeasures"
    ),
    contextualDomains: normalizeMachineKeyArray(
      value.contextualDomains,
      "goalContext.contextualDomains"
    ),
    contextualMeasures: normalizeMachineKeyArray(
      value.contextualMeasures,
      "goalContext.contextualMeasures"
    ),
    targetRanges: normalizeJsonArray(
      value.targetRanges,
      "goalContext.targetRanges"
    ),
    sourceGoalIds: normalizeEvidenceIds(
      value.sourceGoalIds,
      "goalContext.sourceGoalIds"
    ),
    sourceProtocolIds: normalizeEvidenceIds(
      value.sourceProtocolIds,
      "goalContext.sourceProtocolIds"
    ),
    provenance: normalizeOptionalJsonObject(
      value.provenance,
      "goalContext.provenance"
    ),
    limitations: normalizeStringArray(
      value.limitations,
      "goalContext.limitations"
    ),
    conflicts: normalizeJsonArray(value.conflicts, "goalContext.conflicts"),
  };
}

function normalizeNovelty(value = {}) {
  assertPlainObject(value, "novelty");
  return {
    state: requiredEnum(
      value.state ?? "unevaluated",
      "novelty.state",
      PI_NOVELTY_STATES
    ),
    method: optionalMachineKey(value.method, "novelty.method"),
  };
}

function normalizeLifecycle(value = {}) {
  assertPlainObject(value, "lifecycle");
  return {
    state: requiredEnum(
      value.state ?? "unevaluated",
      "lifecycle.state",
      PI_LIFECYCLE_STATES
    ),
    method: optionalMachineKey(value.method, "lifecycle.method"),
  };
}

function normalizeProvenance(value) {
  assertPlainObject(value, "provenance");
  return {
    producer: requiredMachineKey(value.producer, "provenance.producer"),
    producerVersion: requiredMachineKey(
      value.producerVersion,
      "provenance.producerVersion"
    ),
    calculationMethod: requiredMachineKey(
      value.calculationMethod,
      "provenance.calculationMethod"
    ),
    sourceEvidenceIds: normalizeEvidenceIds(
      value.sourceEvidenceIds,
      "provenance.sourceEvidenceIds"
    ),
    sourceObservationIds: normalizeEvidenceIds(
      value.sourceObservationIds,
      "provenance.sourceObservationIds"
    ),
    generatedAt: optionalIsoTimestamp(
      value.generatedAt,
      "provenance.generatedAt"
    ),
  };
}

function normalizeEvidenceIds(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  return [...new Set(values.map((value, index) =>
    requiredString(value, `${field}[${index}]`)
  ))].sort();
}

function normalizeStringArray(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  return values.map((value, index) =>
    requiredString(value, `${field}[${index}]`)
  );
}

function normalizeMachineKeyArray(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  return [...new Set(values.map((value, index) =>
    requiredMachineKey(value, `${field}[${index}]`)
  ))].sort();
}

function normalizeJsonArray(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  assertJsonSafe(values, field);
  return structuredClone(values);
}

function normalizeJsonObject(value = {}, field) {
  assertPlainObject(value, field);
  assertJsonSafe(value, field);
  return structuredClone(value);
}

function normalizeOptionalJsonObject(value = null, field) {
  return value == null ? null : normalizeJsonObject(value, field);
}

function assertJsonSafe(value, field, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must be JSON-safe.`);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new Error(`${field} must be JSON-safe.`);
  }
  seen.add(value);
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) {
    assertJsonSafe(child, `${field}.${key}`, seen);
  }
  seen.delete(value);
}

function requiredDate(value, field) {
  const normalized = requiredString(value, field);
  if (!DATE_PATTERN.test(normalized) || !isCalendarDate(normalized)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return normalized;
}

function optionalDate(value, field) {
  return value == null ? null : requiredDate(value, field);
}

function isCalendarDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function optionalIsoTimestamp(value, field) {
  if (value == null) return null;
  const normalized = requiredString(value, field);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return normalized;
}

function requiredMachineKey(value, field) {
  const normalized = requiredString(value, field);
  if (!MACHINE_KEY_PATTERN.test(normalized)) {
    throw new Error(`${field} must be a stable machine-readable key.`);
  }
  return normalized;
}

function optionalMachineKey(value, field) {
  return value == null ? null : requiredMachineKey(value, field);
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value, field) {
  return value == null ? null : requiredString(value, field);
}

function requiredEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function optionalFiniteNumber(value, field) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function optionalNonNegativeNumber(value, field) {
  const normalized = optionalFiniteNumber(value, field);
  if (normalized != null && normalized < 0) {
    throw new Error(`${field} must not be negative.`);
  }
  return normalized;
}

function optionalBoolean(value, field) {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

function assertPlainObject(value, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object.`);
  }
}
