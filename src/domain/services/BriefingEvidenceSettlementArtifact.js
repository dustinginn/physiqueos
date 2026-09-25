import {
  buildEvidenceSettlementWatermarkV1,
  SettlementReasonCode,
  verifyEvidenceSettlementWatermarkIntegrity,
} from "./BriefingEvidenceSettlementPolicy.js";

// Where the immutable evidence-settlement watermark lives, and how it travels.
//
// CONTRACT
// - It is one optional top-level member of the persisted briefing artifact
//   JSON: `artifact.evidenceSettlement`. No schema migration: the artifact is
//   already stored whole as JSON in the canonical `dailyBriefings` collection.
// - Absent === "this artifact predates the field" (every historical V2/V3
//   artifact). Nothing may require it, and nothing regenerates to add it.
// - Written exactly once, at first publication of an occurrence. A later
//   HealthKit/evidence revision, a retry, a duplicate worker, or an authorized
//   replacement of the artifact never rewrites it: the OLDEST watermark of an
//   occurrence wins (see `preserveOccurrenceEvidenceSettlement`).
// - Deep-frozen when built, when written by the artifact repository, and when
//   an artifact is read back through the repository.

export const EVIDENCE_SETTLEMENT_ARTIFACT_FIELD = "evidenceSettlement";

// Executor side. Turns the gate's decision for a cadence entry into the
// `settlement` generator input: `{ decision, readiness, evidenceWindow,
// timeZone, asOf, watermark }`. `asOf` doubles as the artifact's generatedAt
// (every generator stamps `generatedAt = asOf.toISOString()`).
export function createSettlementGeneratorInput({ entry, decision, asOf } = {}) {
  if (!entry?.evidenceWindow || !decision) return null;
  const applicable = decision.reasonCode !== SettlementReasonCode.NOT_APPLICABLE &&
    Boolean(decision.readiness);
  const readiness = decision.readiness ?? Object.freeze({
    schemaVersion: null, domains: Object.freeze({}), ready: null,
    unsettledDomains: Object.freeze([]),
  });
  const watermark = buildEvidenceSettlementWatermarkV1({
    evidenceWindow: entry.evidenceWindow,
    readiness,
    publishDecision: decision,
    generatedAt: asOf.toISOString(),
    cadence: entry.cadence ?? entry.evidenceWindow.cadence ?? null,
    timeZone: entry.timeZone ?? entry.evidenceWindow.timeZone ?? null,
    timeZoneAuthority: "briefing_schedule_authority",
    earliestPublishAt: decision.earliestPublishAt ?? entry.dueAt ?? null,
    hardDeadlineAt: decision.hardDeadlineAt ?? null,
    settlementApplicable: applicable,
    coverageReadFailed: decision.coverageReadFailed === true,
  });
  return Object.freeze({
    decision, readiness, evidenceWindow: entry.evidenceWindow,
    timeZone: entry.timeZone ?? null, asOf, watermark,
  });
}

// Generator side. Returns a copy of `artifact` carrying the watermark. No-op
// when no settlement input was supplied (manual/ad-hoc generation, legacy
// callers): those artifacts simply have no watermark, like historical ones.
// An artifact that already carries a watermark keeps it (existing wins).
export function attachEvidenceSettlement(artifact, settlement = null) {
  const watermark = settlement?.watermark;
  if (!watermark) return artifact;
  if (artifact?.[EVIDENCE_SETTLEMENT_ARTIFACT_FIELD]) return artifact;
  if (!verifyEvidenceSettlementWatermarkIntegrity(watermark)) {
    throw settlementError("evidence_settlement_integrity_invalid",
      "The evidence-settlement watermark failed its integrity check.");
  }
  // A watermark describing a different window than the artifact being built
  // would be a false statement about that artifact: fail loudly instead.
  // The window id embeds the timezone. The cadence registry and the generators
  // resolve that timezone through different fallback chains, so two ids may
  // differ ONLY by timezone while naming the exact same evidence days; that
  // must not block first publication forever (the watermark records its own
  // timeZone/timeZoneAuthority honestly). Any difference in the covered days,
  // or an id mismatch with no comparable dates, still fails loudly.
  const artifactWindow = artifact?.evidenceWindow;
  const sameEvidenceDays = Boolean(
    artifactWindow?.startDate && artifactWindow?.endDate &&
    watermark.evidenceWindow?.startDate === artifactWindow.startDate &&
    watermark.evidenceWindow?.endDate === artifactWindow.endDate
  );
  if (artifactWindow?.id &&
      watermark.evidenceWindow?.id !== artifactWindow.id && !sameEvidenceDays) {
    throw settlementError("evidence_settlement_window_mismatch",
      "The evidence-settlement watermark does not describe this artifact's window.");
  }
  return { ...artifact, [EVIDENCE_SETTLEMENT_ARTIFACT_FIELD]: watermark };
}

// Reader helper for every consumer that wants the watermark: null for
// historical artifacts, never throws.
export function readEvidenceSettlement(artifact) {
  const value = artifact?.[EVIDENCE_SETTLEMENT_ARTIFACT_FIELD];
  return value && typeof value === "object" ? value : null;
}

export function deepFreezeJson(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeJson(child);
  return Object.freeze(value);
}

// Repository side: freeze the stored watermark of an artifact record (and of
// every archived replaced artifact in its history) in place.
export function freezeStoredEvidenceSettlement(record) {
  if (!record || typeof record !== "object") return record;
  if (record[EVIDENCE_SETTLEMENT_ARTIFACT_FIELD]) {
    deepFreezeJson(record[EVIDENCE_SETTLEMENT_ARTIFACT_FIELD]);
  }
  for (const entry of record.replacedBriefingHistory ?? []) {
    freezeStoredEvidenceSettlement(entry?.artifact);
  }
  return record;
}

// Repository side: the OLDEST watermark of an occurrence is authoritative. An
// incoming artifact for an occurrence that already has one (replacement,
// duplicate/retry generation) inherits it unchanged; an incoming watermark is
// only accepted for an occurrence that has none yet.
export function preserveOccurrenceEvidenceSettlement(incoming, existingRecords = []) {
  if (!incoming || typeof incoming !== "object") return incoming;
  const authoritative = existingRecords
    .map(readEvidenceSettlement)
    .filter(Boolean)
    .sort((left, right) => String(left.generatedAt).localeCompare(String(right.generatedAt)))[0] ?? null;
  if (authoritative) incoming[EVIDENCE_SETTLEMENT_ARTIFACT_FIELD] = authoritative;
  return freezeStoredEvidenceSettlement(incoming);
}

function settlementError(code, message) {
  return Object.assign(new Error(message), { code });
}
