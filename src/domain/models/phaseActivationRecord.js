import { createHash } from "node:crypto";

export const PhaseActivationRecordStatus = Object.freeze({
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  SUPERSEDED: "superseded",
});

export const PHASE_ACTIVATION_RECORD_STATUSES = Object.freeze(
  Object.values(PhaseActivationRecordStatus));

export function activationRecordFingerprint(value) {
  return `sha256_${createHash("sha256").update(stable(value)).digest("hex")}`;
}

export function immutablePhaseRecordContent(record) {
  const copy = structuredClone(record);
  for (const key of ["revision", "status", "acceptedAt", "acceptedBy", "acceptanceId",
    "acceptedRevision", "acceptanceIdempotencyKey", "rejectedAt", "rejectedBy", "supersededAt", "supersededBy",
    "supersedesId", "contentFingerprint"]) delete copy[key];
  return copy;
}

export function normalizePhaseSourceLineage(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("sourceLineage must contain at least one canonical source reference.");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("sourceLineage entries must be objects.");
    }
    return {
      field: required(entry.field, "sourceLineage.field"),
      sourceType: required(entry.sourceType, "sourceLineage.sourceType"),
      sourceId: required(entry.sourceId, "sourceLineage.sourceId"),
      sourceRevision: entry.sourceRevision == null ? null : String(entry.sourceRevision),
      path: required(entry.path, "sourceLineage.path"),
      classification: required(entry.classification, "sourceLineage.classification"),
    };
  });
}

export function validatePhaseRecordEnvelope(record, {
  idField, schemaVersion, expectedGoalId = null, expectedPhaseId = null,
} = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Phase activation record must be an object.");
  }
  const id = required(record[idField] ?? record.id, idField);
  if (record.id !== id || record[idField] !== id) {
    throw new TypeError(`id and ${idField} must match.`);
  }
  if (record.schemaVersion !== schemaVersion) {
    throw new TypeError(`schemaVersion must be ${schemaVersion}.`);
  }
  required(record.goalId, "goalId");
  required(record.phaseId, "phaseId");
  if (expectedGoalId && record.goalId !== expectedGoalId) throw new TypeError("Phase record Goal does not match.");
  if (expectedPhaseId && record.phaseId !== expectedPhaseId) throw new TypeError("Phase record phase does not match.");
  nonNegativeInteger(record.revision, "revision");
  if (!PHASE_ACTIVATION_RECORD_STATUSES.includes(record.status)) {
    throw new TypeError("Phase activation record lifecycle status is unsupported.");
  }
  timestamp(record.createdAt, "createdAt");
  normalizePhaseSourceLineage(record.sourceLineage);
  if ([PhaseActivationRecordStatus.ACCEPTED, PhaseActivationRecordStatus.SUPERSEDED]
      .includes(record.status)) {
    timestamp(record.acceptedAt, "acceptedAt");
    required(record.acceptedBy, "acceptedBy");
    required(record.acceptanceId, "acceptanceId");
    required(record.acceptanceIdempotencyKey, "acceptanceIdempotencyKey");
    if (!Number.isSafeInteger(record.acceptedRevision) || record.acceptedRevision < 0 ||
        record.acceptedRevision > record.revision ||
        (record.status === PhaseActivationRecordStatus.ACCEPTED &&
          record.acceptedRevision !== record.revision)) {
      throw new TypeError("acceptedRevision must equal the accepted record revision.");
    }
  } else if (record.acceptedAt != null || record.acceptedBy != null ||
      record.acceptanceId != null || record.acceptanceIdempotencyKey != null ||
      record.acceptedRevision != null) {
    throw new TypeError("Only accepted records may contain acceptance metadata.");
  }
  if (record.status === PhaseActivationRecordStatus.SUPERSEDED) {
    timestamp(record.supersededAt, "supersededAt");
    required(record.supersededBy, "supersededBy");
    required(record.supersedesId, "supersedesId");
  }
  if (record.status === PhaseActivationRecordStatus.REJECTED) {
    timestamp(record.rejectedAt, "rejectedAt");
    required(record.rejectedBy, "rejectedBy");
  }
  const fingerprint = activationRecordFingerprint(immutablePhaseRecordContent(record));
  if (record.contentFingerprint !== fingerprint) {
    throw new TypeError("Phase activation record content fingerprint is invalid.");
  }
  return true;
}

export function assertNoExecutionOwnedFields(value, path = "record") {
  const prohibited = new Set([
    "schedule", "schedules", "exactDate", "exactTime", "timeOfDay", "dayOfWeek",
    "daysOfWeek", "reminder", "reminders", "occurrence", "occurrences",
    "completionState", "completedAt", "dose", "dosage", "doseUnit",
    "administration", "exerciseId", "exerciseIds",
  ]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoExecutionOwnedFields(item, `${path}[${index}]`));
    return true;
  }
  if (!value || typeof value !== "object") return true;
  for (const [key, child] of Object.entries(value)) {
    if (prohibited.has(key)) throw new TypeError(`${path}.${key} is Execution-owned.`);
    assertNoExecutionOwnedFields(child, `${path}.${key}`);
  }
  return true;
}

export function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
export function nonNegativeInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError(`${field} must be a non-negative integer.`);
  return parsed;
}
export function timestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}
export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
