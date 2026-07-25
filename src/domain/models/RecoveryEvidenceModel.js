export const RECOVERY_EVIDENCE_SCHEMA_VERSION = "recovery_evidence_v1";
export const RECOVERY_EVIDENCE_CANONICALIZATION_VERSION =
  "recovery_canonicalization_v1";

export const RECOVERY_METRICS = Object.freeze([
  "sleep_duration",
  "subjective_recovery",
  "soreness",
]);

export const SUBJECTIVE_RECOVERY_VALUES = Object.freeze([
  "poor",
  "below_average",
  "average",
  "good",
  "excellent",
]);

export const SORENESS_VALUES = Object.freeze([
  "none",
  "mild",
  "moderate",
  "high",
  "severe",
]);

const SOURCE_KINDS = new Set(["manual_check_in"]);
const STATUSES = new Set(["valid", "partial", "unknown", "invalid", "superseded"]);

export function createRecoveryEvidenceRecord(input = {}) {
  const before = structuredClone(input);
  const metric = requiredEnum(input.metric, RECOVERY_METRICS, "metric");
  const evidenceDate = requiredDate(input.evidenceDate, "evidenceDate");
  const timezone = requiredText(input.timezone, "timezone");
  const source = normalizeSource(input.source);
  const sourceRecordId = requiredText(input.sourceRecordId, "sourceRecordId");
  const scope = normalizeScope(input.scope);
  const value = normalizeValue(metric, input.value);
  const unit = normalizeUnit(metric, input.unit);
  const status = input.status ?? "valid";
  if (!STATUSES.has(status)) throw new Error("Unsupported Recovery evidence status.");
  validateLineage(input);
  const id = input.id ?? createRecoveryEvidenceId({
    metric,
    evidenceDate,
    sourceKind: source.kind,
    sourceRecordId,
    scope,
  });
  const record = Object.freeze({
    schemaVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
    id,
    userId: requiredText(input.userId, "userId"),
    type: "physiological_recovery",
    metric,
    value,
    unit,
    status,
    evidenceDate,
    recordedAt: requiredTimestamp(input.recordedAt, "recordedAt"),
    timezone,
    scope,
    source,
    sourceRecordId,
    sourceEvidenceIds: unique(input.sourceEvidenceIds ?? []),
    confidence: normalizeConfidence(input.confidence, source),
    limitations: unique(input.limitations ?? []),
    isCorrection: Boolean(input.correctsEvidenceId),
    correctsEvidenceId: input.correctsEvidenceId ?? null,
    supersedesEvidenceId: input.supersedesEvidenceId ?? null,
    supersededByEvidenceId: input.supersededByEvidenceId ?? null,
    sleepEpisode: normalizeSleepEpisode(metric, input.sleepEpisode, timezone),
    createdAt: requiredTimestamp(input.createdAt, "createdAt"),
    updatedAt: requiredTimestamp(input.updatedAt, "updatedAt"),
    provenance: Object.freeze({
      producer: "recovery_evidence_model",
      canonicalizationVersion: RECOVERY_EVIDENCE_CANONICALIZATION_VERSION,
      ingestionPath: source.ingestionPath,
      sourceTimestamp: source.recordedAt,
      ...(input.provenance ?? {}),
    }),
  });
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Recovery evidence input mutation detected.");
  }
  return record;
}

export function createCanonicalRecoveryEvidenceObject(record) {
  validateRecoveryEvidenceRecord(record);
  return Object.freeze({
    canonicalId: record.id,
    userId: record.userId,
    evidence_type: "recovery",
    observedAt: record.recordedAt,
    lastObservedAt: record.recordedAt,
    sourceEvidenceIds: [...record.sourceEvidenceIds],
    payload: structuredClone(record),
    provenance: {
      producer: "recovery_evidence_model",
      producerVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
      canonicalizationVersion: RECOVERY_EVIDENCE_CANONICALIZATION_VERSION,
    },
  });
}

export function validateRecoveryEvidenceRecord(record) {
  const rebuilt = createRecoveryEvidenceRecord(record);
  if (rebuilt.id !== record.id) throw new Error("Recovery evidence identity mismatch.");
  return true;
}

export function createRecoveryEvidenceId({
  metric,
  evidenceDate,
  sourceKind,
  sourceRecordId,
  scope = null,
}) {
  return [
    "recovery",
    token(metric),
    token(evidenceDate),
    token(sourceKind),
    token(sourceRecordId),
    token(scope?.region ?? "whole_body"),
  ].join("|");
}

export function assignPreviousNightSleepEvidenceDate({ checkInDate }) {
  return requiredDate(checkInDate, "checkInDate");
}

function normalizeValue(metric, value) {
  if (typeof value === "string" && /\b(note|notes|protocol|foam|stretch)\b/i.test(value)) {
    throw new Error("Freeform notes and protocol adherence are not Recovery values.");
  }
  if (metric === "sleep_duration") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 24) {
      throw new Error("Sleep duration must be between 0 and 24 hours.");
    }
    return Math.round(number * 100) / 100;
  }
  if (metric === "subjective_recovery") {
    return requiredEnum(value, SUBJECTIVE_RECOVERY_VALUES, "subjective recovery");
  }
  return requiredEnum(value, SORENESS_VALUES, "soreness");
}

function normalizeUnit(metric, unit) {
  const expected = metric === "sleep_duration" ? "hours" : "category";
  if ((unit ?? expected) !== expected) {
    throw new Error(`Recovery metric ${metric} requires unit ${expected}.`);
  }
  return expected;
}

function normalizeSource(source = {}) {
  const kind = requiredText(source.kind, "source.kind");
  if (!SOURCE_KINDS.has(kind)) {
    throw new Error("Unsupported or unavailable Recovery evidence source.");
  }
  return Object.freeze({
    kind,
    name: requiredText(source.name, "source.name"),
    provider: source.provider ?? null,
    ingestionPath: requiredText(source.ingestionPath, "source.ingestionPath"),
    recordedAt: requiredTimestamp(source.recordedAt, "source.recordedAt"),
    confidence: source.confidence ?? "normal",
  });
}

function normalizeConfidence(confidence, source) {
  const level = confidence?.level ?? source.confidence ?? "normal";
  if (!["low", "normal", "high"].includes(level)) {
    throw new Error("Unsupported Recovery evidence confidence.");
  }
  return Object.freeze({
    level,
    basis: confidence?.basis ?? "explicit_structured_input",
  });
}

function normalizeScope(scope) {
  if (scope == null) return Object.freeze({ region: "whole_body" });
  if (typeof scope !== "object" || Array.isArray(scope)) {
    throw new Error("Recovery evidence scope must be structured.");
  }
  return Object.freeze({ region: requiredText(scope.region, "scope.region") });
}

function normalizeSleepEpisode(metric, episode, timezone) {
  if (metric !== "sleep_duration") {
    if (episode != null) throw new Error("Sleep episode is only valid for sleep duration.");
    return null;
  }
  if (episode == null) return null;
  const start = requiredTimestamp(episode.start, "sleepEpisode.start");
  const end = requiredTimestamp(episode.end, "sleepEpisode.end");
  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error("Sleep episode must end after it starts.");
  }
  return Object.freeze({ start, end, timezone });
}

function validateLineage(input) {
  const links = [
    input.correctsEvidenceId,
    input.supersedesEvidenceId,
    input.supersededByEvidenceId,
  ].filter(Boolean);
  if (input.id && links.includes(input.id)) {
    throw new Error("Recovery evidence cannot reference itself.");
  }
  if (
    input.correctsEvidenceId &&
    input.supersededByEvidenceId &&
    input.correctsEvidenceId === input.supersededByEvidenceId
  ) {
    throw new Error("Recovery evidence lineage cannot form a loop.");
  }
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function requiredDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return value;
}

function requiredTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return value;
}

function requiredEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Unsupported ${field}.`);
  return value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function token(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}
