import { createHash } from "node:crypto";
import {
  createDexaSemanticFingerprint,
  selectActiveCanonicalDexaScans,
} from "./CanonicalDexaScanService.js";
import { localDateTimeToUtc } from "./IntelligenceLifecycleIdentityService.js";
import { resolveLocalTimeZone } from "../utils/localDate.js";

export const DEXA_HEALTHKIT_WRITEBACK_POLICY_RECORD_ID = "dexa_healthkit_writeback_policy";
export const DEXA_HEALTHKIT_WRITEBACK_POLICY_SCHEMA_VERSION = "dexa-healthkit-writeback-policy-v1";
export const DEXA_HEALTHKIT_WRITEBACK_SCHEMA_VERSION = "dexa-hk-writeback-v1";
export const DEXA_HEALTHKIT_WRITEBACK_RECEIPT_COLLECTION = "dexaHealthKitWritebackReceipts";
export const DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE = "2026-10-09";
export const DEXA_HEALTHKIT_VALIDATION_DATE = "2026-09-12";
export const DEXA_HEALTHKIT_VALIDATION_EXPECTED_REVISION = 1;
export const DEXA_HEALTHKIT_VALIDATION_EXPECTED_FINGERPRINT =
  "sha256_d06c092bd2dada5fcf78fa6c00ff25c0070ec701912b5109bb8a5d893047b029";

export const DexaHealthKitMeasurementKind = Object.freeze({
  BODY_FAT_PERCENTAGE: "bodyFatPercentage",
  LEAN_BODY_MASS_FAT_FREE: "leanBodyMassFatFree",
});

export const DEXA_HEALTHKIT_ALLOWED_MEASUREMENT_KINDS = Object.freeze([
  DexaHealthKitMeasurementKind.BODY_FAT_PERCENTAGE,
  DexaHealthKitMeasurementKind.LEAN_BODY_MASS_FAT_FREE,
]);

const ALLOWED_KIND_SET = new Set(DEXA_HEALTHKIT_ALLOWED_MEASUREMENT_KINDS);
const ALLOWED_RECEIPT_OUTCOMES = new Set([
  "saved", "already_present", "permission_needed", "failed", "deleted", "deferred",
]);

export function resolveDexaHealthKitWritebackPolicy(record) {
  const disabled = (source, invalidReason = null) => Object.freeze({
    schemaVersion: DEXA_HEALTHKIT_WRITEBACK_POLICY_SCHEMA_VERSION,
    enabled: false,
    effectiveFromScanDate: DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE,
    measurementKinds: DEXA_HEALTHKIT_ALLOWED_MEASUREMENT_KINDS,
    prospectiveOnly: true,
    historicalBackfill: false,
    source,
    invalidReason,
  });
  if (!record) return disabled("not_configured");
  try {
    if (record.schemaVersion !== DEXA_HEALTHKIT_WRITEBACK_POLICY_SCHEMA_VERSION) {
      return disabled("invalid_configuration_fail_closed", "schema_version_unrecognized");
    }
    if (record.enabled !== true || record.status !== "enabled") {
      return disabled("server_owned_configuration", "status_not_enabled");
    }
    if (record.effectiveFromScanDate !== DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE) {
      return disabled("invalid_configuration_fail_closed", "effective_date_invalid");
    }
    if (record.prospectiveOnly !== true || record.historicalBackfill !== false) {
      return disabled("invalid_configuration_fail_closed", "prospective_only_contract_invalid");
    }
    const kinds = [...new Set(record.measurementKinds ?? [])].sort();
    if (JSON.stringify(kinds) !== JSON.stringify([...DEXA_HEALTHKIT_ALLOWED_MEASUREMENT_KINDS].sort())) {
      return disabled("invalid_configuration_fail_closed", "measurement_scope_invalid");
    }
    return Object.freeze({
      schemaVersion: record.schemaVersion,
      enabled: true,
      effectiveFromScanDate: record.effectiveFromScanDate,
      measurementKinds: DEXA_HEALTHKIT_ALLOWED_MEASUREMENT_KINDS,
      prospectiveOnly: true,
      historicalBackfill: false,
      source: "server_owned_configuration",
      invalidReason: null,
    });
  } catch {
    return disabled("invalid_configuration_fail_closed", "policy_unreadable");
  }
}

export function projectDexaHealthKitWriteback({
  canonicalEvidenceObjects = [],
  executionItems = [],
  ownerUserId,
  ownerTimeZone = "America/Los_Angeles",
  policyRecord = null,
  receipts = [],
  mode = "permanent",
  validationAction = null,
} = {}) {
  const policy = resolveDexaHealthKitWritebackPolicy(policyRecord);
  const diagnostics = [];
  const receiptByIdentity = new Map(receipts.map((receipt) => [receipt.intentIdentity, receipt]));
  const validation = validationCapability(policy);
  let selected = [];
  let desiredState = "present";

  if (mode === "validation") {
    if (!["write", "delete"].includes(validationAction)) {
      diagnostics.push({ code: "DEXA_HEALTHKIT_VALIDATION_ACTION_REQUIRED" });
      return projection({ policy, validation, diagnostics, intents: [] });
    }
    const guarded = selectValidationScan(canonicalEvidenceObjects, ownerUserId);
    diagnostics.push(...guarded.diagnostics);
    if (!guarded.record) return projection({ policy, validation, diagnostics, intents: [] });
    selected = [guarded.record];
    desiredState = validationAction === "delete" ? "withdrawn" : "present";
  } else {
    if (!policy.enabled) return projection({ policy, validation, diagnostics, intents: [] });
    const active = selectActiveCanonicalDexaScans(canonicalEvidenceObjects, { userId: ownerUserId });
    diagnostics.push(...active.diagnostics);
    if (active.diagnostics.length) return projection({ policy, validation, diagnostics, intents: [] });
    selected = active.records.filter((record) => scanDate(record) >= policy.effectiveFromScanDate);
  }

  const currentIntents = [];
  for (const record of selected) {
    const recordDiagnostics = validateCanonicalIdentity(record, ownerUserId);
    if (recordDiagnostics.length) {
      diagnostics.push(...recordDiagnostics);
      continue;
    }
    const timing = resolveSampleTiming({
      record,
      executionItems,
      ownerTimeZone,
      forceDatePrecision: mode === "validation",
    });
    const measurements = projectMeasurements(record);
    diagnostics.push(...measurements.diagnostics.map((item) => ({
      ...item,
      canonicalId: record.canonicalId,
    })));
    for (const measurement of measurements.values) {
      currentIntents.push(createIntent({
        record,
        timing,
        measurement,
        desiredState,
        mode,
        latestReceipt: receiptByIdentity.get(intentIdentity(record.dexaRevision.logicalScanKey, measurement.kind)) ?? null,
      }));
    }
  }

  if (mode === "permanent") {
    const currentIdentities = new Set(currentIntents.map((intent) => intent.intentIdentity));
    for (const receipt of receipts) {
      if (!receiptHasMaterializedPresent(receipt) || currentIdentities.has(receipt.intentIdentity)) continue;
      if (!ALLOWED_KIND_SET.has(receipt.measurementKind) || !receipt.syncIdentifier) continue;
      const materializedRevision = receipt.materializedRevision ?? receipt.canonicalRevision;
      currentIntents.push(Object.freeze({
        schemaVersion: DEXA_HEALTHKIT_WRITEBACK_SCHEMA_VERSION,
        intentIdentity: receipt.intentIdentity,
        canonicalId: receipt.canonicalId ?? null,
        logicalScanKey: receipt.logicalScanKey,
        canonicalRevision: materializedRevision,
        occurrenceDate: receipt.occurrenceDate ?? null,
        sampleInstant: receipt.sampleInstant ?? null,
        timeZone: receipt.timeZone ?? resolveLocalTimeZone(ownerTimeZone),
        timePrecision: receipt.timePrecision ?? "date",
        measurementKind: receipt.measurementKind,
        value: null,
        unit: null,
        derivation: receipt.derivation ?? null,
        desiredState: "withdrawn",
        syncIdentifier: receipt.syncIdentifier,
        syncVersion: materializedRevision,
        externalUUID: receipt.externalUUID ?? externalUUID(receipt.syncIdentifier.replace(/^physiqueos\.dexa\.v1\./, "")),
        mode: "permanent",
        latestReceipt: sanitizeReceipt(receipt),
      }));
    }
  }

  return projection({
    policy,
    validation,
    diagnostics,
    intents: currentIntents.sort((left, right) =>
      String(left.occurrenceDate).localeCompare(String(right.occurrenceDate)) ||
      left.measurementKind.localeCompare(right.measurementKind)),
  });
}

export function normalizeDexaHealthKitWritebackReceipt(payload, { ownerUserId, reportedAt = new Date() } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw receiptError("payload_invalid");
  const measurementKind = String(payload.measurementKind ?? "");
  const logicalScanKey = boundedText(payload.logicalScanKey, "logical_scan_key_invalid", 300);
  const canonicalRevision = Number(payload.canonicalRevision);
  const outcome = String(payload.outcome ?? "");
  const desiredState = String(payload.desiredState ?? "");
  const expectedIdentity = intentIdentity(logicalScanKey, measurementKind);
  if (!ALLOWED_KIND_SET.has(measurementKind)) throw receiptError("measurement_kind_invalid");
  if (!Number.isSafeInteger(canonicalRevision) || canonicalRevision < 1) throw receiptError("canonical_revision_invalid");
  if (!ALLOWED_RECEIPT_OUTCOMES.has(outcome)) throw receiptError("outcome_invalid");
  if (!["present", "withdrawn"].includes(desiredState)) throw receiptError("desired_state_invalid");
  if (payload.intentIdentity !== expectedIdentity) throw receiptError("intent_identity_invalid");
  const expectedSyncIdentifier = syncIdentity(logicalScanKey, measurementKind).syncIdentifier;
  if (payload.syncIdentifier !== expectedSyncIdentifier) throw receiptError("sync_identifier_invalid");
  if (payload.value !== undefined || payload.healthValue !== undefined) throw receiptError("health_value_forbidden");
  return Object.freeze({
    schemaVersion: "dexa-hk-writeback-receipt-v1",
    id: `dexa_hk_receipt_${digest(`${logicalScanKey}\0${measurementKind}`)}`,
    userId: ownerUserId,
    intentIdentity: expectedIdentity,
    canonicalId: optionalText(payload.canonicalId, 300),
    logicalScanKey,
    canonicalRevision,
    occurrenceDate: optionalDate(payload.occurrenceDate),
    sampleInstant: optionalInstant(payload.sampleInstant),
    timeZone: resolveLocalTimeZone(payload.timeZone),
    timePrecision: ["exact", "appointment_time", "date"].includes(payload.timePrecision) ? payload.timePrecision : "date",
    measurementKind,
    derivation: measurementKind === DexaHealthKitMeasurementKind.LEAN_BODY_MASS_FAT_FREE
      ? "fat_free_mass_total_minus_fat" : null,
    desiredState,
    syncIdentifier: expectedSyncIdentifier,
    externalUUID: syncIdentity(logicalScanKey, measurementKind).externalUUID,
    outcome,
    healthKitCorrelationId: optionalText(payload.healthKitCorrelationId, 100),
    errorCode: optionalText(payload.errorCode, 100),
    reportedAt: new Date(reportedAt).toISOString(),
  });
}

export function mergeDexaHealthKitWritebackReceipt(previous, attempt) {
  const prior = previous?.payload ?? previous ?? null;
  let materializedState = prior?.materializedState ??
    (receiptHasMaterializedPresent(prior) ? "present" : "unknown");
  let materializedRevision = prior?.materializedRevision ??
    (materializedState === "present" ? prior?.canonicalRevision ?? null : null);
  let materializedCorrelationId = prior?.materializedCorrelationId ??
    (materializedState === "present" ? prior?.healthKitCorrelationId ?? null : null);
  const staleAttempt = Number.isSafeInteger(materializedRevision) &&
    attempt.canonicalRevision < materializedRevision;
  if (!staleAttempt && attempt.desiredState === "present" && ["saved", "already_present"].includes(attempt.outcome)) {
    materializedState = "present";
    materializedRevision = attempt.canonicalRevision;
    materializedCorrelationId = attempt.healthKitCorrelationId ?? materializedCorrelationId;
  } else if (!staleAttempt && attempt.desiredState === "withdrawn" && attempt.outcome === "deleted") {
    materializedState = "absent";
    materializedRevision = attempt.canonicalRevision;
    materializedCorrelationId = null;
  }
  return Object.freeze({
    ...attempt,
    materializedState,
    materializedRevision,
    materializedCorrelationId,
  });
}

export function intentIdentity(logicalScanKey, measurementKind) {
  return `dexa_hk_intent_${digest(`dexa-hk-intent-v1|${logicalScanKey}|${measurementKind}`)}`;
}

function createIntent({ record, timing, measurement, desiredState, mode, latestReceipt }) {
  const logicalScanKey = record.dexaRevision.logicalScanKey;
  const identity = syncIdentity(logicalScanKey, measurement.kind);
  return Object.freeze({
    schemaVersion: DEXA_HEALTHKIT_WRITEBACK_SCHEMA_VERSION,
    intentIdentity: intentIdentity(logicalScanKey, measurement.kind),
    canonicalId: record.canonicalId,
    logicalScanKey,
    canonicalRevision: record.dexaRevision.revision,
    occurrenceDate: scanDate(record),
    sampleInstant: timing.sampleInstant,
    timeZone: timing.timeZone,
    timePrecision: timing.timePrecision,
    measurementKind: measurement.kind,
    value: desiredState === "present" ? measurement.value : null,
    unit: desiredState === "present" ? measurement.unit : null,
    derivation: measurement.derivation ?? null,
    desiredState,
    syncIdentifier: identity.syncIdentifier,
    syncVersion: record.dexaRevision.revision,
    externalUUID: identity.externalUUID,
    mode,
    latestReceipt: sanitizeReceipt(latestReceipt),
  });
}

function projectMeasurements(record) {
  const payload = record.payload ?? record;
  const bodyFat = scalar(payload.bodyFatPercentage);
  const totalMass = massInPounds(payload.totalMass);
  const fatMass = massInPounds(payload.fatMass);
  const diagnostics = [];
  const values = [];
  const consistent = bodyFat == null || totalMass == null || fatMass == null ||
    Math.abs(fatMass - totalMass * bodyFat / 100) <= 0.8;
  if (!consistent) diagnostics.push({ code: "DEXA_HEALTHKIT_COMPOSITION_INCONSISTENT" });
  if (bodyFat != null && bodyFat > 0 && bodyFat < 100 && consistent) {
    values.push(Object.freeze({
      kind: DexaHealthKitMeasurementKind.BODY_FAT_PERCENTAGE,
      value: bodyFat,
      unit: "percent",
    }));
  } else if (bodyFat != null && (bodyFat <= 0 || bodyFat >= 100)) {
    diagnostics.push({ code: "DEXA_HEALTHKIT_BODY_FAT_INVALID" });
  }
  if (totalMass != null && fatMass != null && totalMass > fatMass && fatMass >= 0 && consistent) {
    values.push(Object.freeze({
      kind: DexaHealthKitMeasurementKind.LEAN_BODY_MASS_FAT_FREE,
      value: round(totalMass - fatMass),
      unit: "lb",
      derivation: "fat_free_mass_total_minus_fat",
    }));
  } else if (totalMass != null || fatMass != null) {
    diagnostics.push({ code: "DEXA_HEALTHKIT_FAT_FREE_MASS_UNAVAILABLE" });
  }
  return Object.freeze({ values: Object.freeze(values), diagnostics: Object.freeze(diagnostics) });
}

function selectValidationScan(canonicalEvidenceObjects, ownerUserId) {
  const selected = selectActiveCanonicalDexaScans(canonicalEvidenceObjects, {
    date: DEXA_HEALTHKIT_VALIDATION_DATE,
    userId: ownerUserId,
  });
  const diagnostics = [...selected.diagnostics];
  if (diagnostics.length) return { record: null, diagnostics };
  if (selected.records.length !== 1) {
    diagnostics.push({ code: "DEXA_HEALTHKIT_VALIDATION_SCAN_COUNT_INVALID" });
    return { record: null, diagnostics };
  }
  const record = selected.records[0];
  const expectedLogicalKey = `dexa_scan|${ownerUserId}|${DEXA_HEALTHKIT_VALIDATION_DATE}`;
  const computedFingerprint = createDexaSemanticFingerprint(record.payload ?? record);
  if (record.canonicalId !== expectedLogicalKey || record.dexaRevision?.logicalScanKey !== expectedLogicalKey ||
      record.dexaRevision?.revision !== DEXA_HEALTHKIT_VALIDATION_EXPECTED_REVISION ||
      record.dexaRevision?.semanticFingerprint !== DEXA_HEALTHKIT_VALIDATION_EXPECTED_FINGERPRINT ||
      computedFingerprint !== record.dexaRevision?.semanticFingerprint) {
    diagnostics.push({ code: "DEXA_HEALTHKIT_VALIDATION_SCAN_IDENTITY_MISMATCH" });
    return { record: null, diagnostics };
  }
  return { record, diagnostics };
}

function receiptHasMaterializedPresent(receipt) {
  if (!receipt) return false;
  if (receipt.materializedState != null) return receipt.materializedState === "present";
  return receipt.desiredState === "present" && ["saved", "already_present"].includes(receipt.outcome);
}

function validateCanonicalIdentity(record, ownerUserId) {
  const expected = `dexa_scan|${ownerUserId}|${scanDate(record)}`;
  const revision = record.dexaRevision;
  if (!record.canonicalId || record.canonicalId !== expected ||
      revision?.schemaVersion !== "canonical-dexa-scan-revision-v1" ||
      revision.logicalScanKey !== expected || !Number.isSafeInteger(revision.revision) || revision.revision < 1 ||
      !String(revision.semanticFingerprint ?? "").startsWith("sha256_")) {
    return [{ code: "DEXA_HEALTHKIT_CANONICAL_IDENTITY_INVALID", canonicalId: record.canonicalId ?? null }];
  }
  return [];
}

function resolveSampleTiming({ record, executionItems, ownerTimeZone, forceDatePrecision }) {
  const payload = record.payload ?? record;
  const date = scanDate(record);
  const timeZone = resolveLocalTimeZone(payload.scanTimeZone ?? ownerTimeZone);
  if (!forceDatePrecision) {
    const exact = [payload.scanTimestamp, payload.measuredAt]
      .find((value) => String(value ?? "").includes("T") && Number.isFinite(Date.parse(value)));
    if (exact) return { sampleInstant: new Date(exact).toISOString(), timeZone, timePrecision: "exact" };
    const appointment = executionItems.find((item) =>
      item?.type === "dexa_appointment" && item.completedEvidenceDate === date &&
      item.completedByEvidenceId === record.canonicalId && item.preferredSchedule?.date === date &&
      /^\d{2}:\d{2}$/.test(String(item.preferredSchedule?.timeOfDay ?? "")));
    if (appointment) {
      const appointmentZone = resolveLocalTimeZone(appointment.timezone ?? timeZone);
      return {
        sampleInstant: localDateTimeToUtc({ date, time: `${appointment.preferredSchedule.timeOfDay}:00`, timeZone: appointmentZone }).toISOString(),
        timeZone: appointmentZone,
        timePrecision: "appointment_time",
      };
    }
  }
  return {
    sampleInstant: localDateTimeToUtc({ date, time: "12:00:00", timeZone }).toISOString(),
    timeZone,
    timePrecision: "date",
  };
}

function syncIdentity(logicalScanKey, measurementKind) {
  const hex = digest(`dexa-hk-v1|${logicalScanKey}|${measurementKind}`).slice(0, 32);
  return Object.freeze({
    syncIdentifier: `physiqueos.dexa.v1.${hex}`,
    externalUUID: externalUUID(hex),
  });
}

function externalUUID(hex) {
  const value = String(hex).padEnd(32, "0").slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function validationCapability(policy) {
  return Object.freeze({
    supported: true,
    scanDate: DEXA_HEALTHKIT_VALIDATION_DATE,
    expectedRevision: DEXA_HEALTHKIT_VALIDATION_EXPECTED_REVISION,
    requiresExplicitAction: true,
    permanentPolicyEnabled: policy.enabled,
    permanentEffectiveFromScanDate: DEXA_HEALTHKIT_WRITEBACK_EFFECTIVE_DATE,
  });
}

function projection({ policy, validation, diagnostics, intents }) {
  return Object.freeze({
    schemaVersion: DEXA_HEALTHKIT_WRITEBACK_SCHEMA_VERSION,
    policy,
    validation,
    intents: Object.freeze(intents),
    diagnostics: Object.freeze(diagnostics),
  });
}

function sanitizeReceipt(receipt) {
  if (!receipt) return null;
  return Object.freeze({
    canonicalRevision: receipt.canonicalRevision,
    measurementKind: receipt.measurementKind,
    desiredState: receipt.desiredState,
    outcome: receipt.outcome,
    errorCode: receipt.errorCode ?? null,
    reportedAt: receipt.reportedAt,
  });
}

function scanDate(record) {
  const payload = record?.payload ?? record ?? {};
  return String(payload.measuredAt ?? payload.observed_at ?? payload.date ?? "").slice(0, 10);
}

function scalar(value) {
  const number = Number(value?.value ?? value);
  return Number.isFinite(number) ? number : null;
}

function massInPounds(value) {
  const number = scalar(value);
  const unit = String(value?.unit ?? "lb").toLowerCase();
  if (number == null) return null;
  if (["lb", "lbs", "pound"].includes(unit)) return number;
  if (["kg", "kilogram"].includes(unit)) return number * 2.2046226218487757;
  return null;
}

function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function round(value) { return Math.round((value + Number.EPSILON) * 1e9) / 1e9; }
function boundedText(value, code, maximum) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maximum) throw receiptError(code);
  return text;
}
function optionalText(value, maximum) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text && text.length <= maximum ? text : null;
}
function optionalDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : null; }
function optionalInstant(value) { return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
function receiptError(code) { return Object.assign(new Error("DEXA HealthKit receipt is invalid."), { code }); }
