import { createHash } from "node:crypto";

// HealthKit Sleep (HKCategoryTypeIdentifierSleepAnalysis) source contract.
//
//   HealthKit Sleep category sample (this contract, healthKitSleepSamples)
//     -> sleep-canon-v1 canonical sleep day (HealthKitSleepCanonicalizer.js,
//        healthKitSleepDays)
//     -> [not built] Evidence presentation, then a separately authorized
//        strategic-eligibility decision.
//
// Sleep has its own command, its own collections and its own fail-closed
// activation policy. It never reads or writes the generic HealthKit observation
// collection, and nothing here decides strategic meaning: every Sleep record is
// quarantined exactly like every other HealthKit-derived record.
//
// Privacy: a sample carries only the fields listed in SLEEP_SAMPLE_WIRE_FIELDS.
// Source display names, device names, local/UDI device identifiers, firmware
// and arbitrary metadata are refused by name (the whole request is rejected, so
// a Native regression fails loudly instead of silently persisting them), and
// every stored record is built from the allow-list, never from the request.

export const HEALTHKIT_SLEEP_CONTRACT_VERSION = "healthkit-sleep-ingestion-v1";
export const HEALTHKIT_SLEEP_SAMPLE_SCHEMA_VERSION = "healthkit-sleep-sample-v1";
export const HEALTHKIT_SLEEP_STAGE_SCHEMA_VERSION = "hk-sleep-v1";
export const HEALTHKIT_SLEEP_SAMPLE_COLLECTION = "healthKitSleepSamples";
export const HEALTHKIT_SLEEP_DAY_COLLECTION = "healthKitSleepDays";
export const HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION = "healthKitConfiguration";
export const HEALTHKIT_SLEEP_SAMPLE_ID_PREFIX = "healthkit_sleep_sample_";
export const HEALTHKIT_SLEEP_DAY_ID_PREFIX = "healthkit_sleep_day_";

export const HEALTHKIT_SLEEP_MAX_SAMPLES_PER_BATCH = 100;
export const HEALTHKIT_SLEEP_MAX_DELETIONS_PER_BATCH = 100;
export const HEALTHKIT_SLEEP_MAX_MANIFEST_LIVE_IDS = 1000;
// A window manifest covers at most four days of sample end instants. Native
// re-reads sleep days D-2..D (three 18:00->18:00 windows), plus zone slack.
export const HEALTHKIT_SLEEP_MAX_MANIFEST_WINDOW_MS = 96 * 60 * 60 * 1000;
export const HEALTHKIT_SLEEP_MAX_TEXT_LENGTH = 300;
export const HEALTHKIT_SLEEP_MAX_EXTERNAL_ID_LENGTH = 64;
export const HEALTHKIT_SLEEP_MAX_TIMESTAMP_LENGTH = 64;
// One HealthKit sleep sample never legitimately spans more than a day.
export const HEALTHKIT_SLEEP_MAX_SAMPLE_DURATION_MS = 24 * 60 * 60 * 1000;

// The technical sleep-day boundary: sleep day D is [D-1 18:00, D 18:00) in the
// episode's own zone (wake-date attribution, Apple Health convention).
export const HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR = 18;

export const HealthKitSleepStage = Object.freeze({
  IN_BED: "in_bed",
  ASLEEP_UNSPECIFIED: "asleep_unspecified",
  AWAKE: "awake",
  ASLEEP_CORE: "asleep_core",
  ASLEEP_DEEP: "asleep_deep",
  ASLEEP_REM: "asleep_rem",
  UNKNOWN: "unknown",
});

// HKCategoryValueSleepAnalysis raw values. Anything else (a future stage) is
// stored as `unknown`: preserved, never rejected, never asleep.
const STAGE_BY_RAW_VALUE = Object.freeze({
  0: HealthKitSleepStage.IN_BED,
  1: HealthKitSleepStage.ASLEEP_UNSPECIFIED,
  2: HealthKitSleepStage.AWAKE,
  3: HealthKitSleepStage.ASLEEP_CORE,
  4: HealthKitSleepStage.ASLEEP_DEEP,
  5: HealthKitSleepStage.ASLEEP_REM,
});
export const HEALTHKIT_SLEEP_ASLEEP_STAGES = Object.freeze([
  HealthKitSleepStage.ASLEEP_UNSPECIFIED, HealthKitSleepStage.ASLEEP_CORE,
  HealthKitSleepStage.ASLEEP_DEEP, HealthKitSleepStage.ASLEEP_REM,
]);
export const HEALTHKIT_SLEEP_SPECIFIC_STAGES = Object.freeze([
  HealthKitSleepStage.ASLEEP_CORE, HealthKitSleepStage.ASLEEP_DEEP, HealthKitSleepStage.ASLEEP_REM,
]);

export const HealthKitSleepSourceClass = Object.freeze({
  APPLE_WATCH: "apple_watch",
  APPLE_IPHONE: "apple_iphone",
  APPLE_OTHER: "apple_other",
  THIRD_PARTY: "third_party",
  USER_ENTERED: "user_entered",
});

export const HealthKitSleepSourceFamily = Object.freeze({
  APPLE_WATCH: "apple_watch",
  APPLE_IPHONE: "apple_iphone",
  APPLE_OTHER: "apple_other",
  OURA: "oura",
  SLEEP_CYCLE: "sleep_cycle",
  WHOOP: "whoop",
  AUTOSLEEP: "autosleep",
  THIRD_PARTY_OTHER: "third_party_other",
  MANUAL: "manual",
});

// Technical family labels for well-known third-party writers, by bundle
// identifier prefix. This is a classifier, not a policy: an unlisted writer is
// `third_party_other` and is still ranked (and preferable by exact bundle
// identifier). Nothing here prefers any source.
const THIRD_PARTY_FAMILY_PREFIXES = Object.freeze([
  ["com.ouraring.", HealthKitSleepSourceFamily.OURA],
  ["com.lexwarelabs.goodmorning", HealthKitSleepSourceFamily.SLEEP_CYCLE],
  ["com.northcube.", HealthKitSleepSourceFamily.SLEEP_CYCLE],
  ["com.whoop.", HealthKitSleepSourceFamily.WHOOP],
  ["com.tantsissa.autosleep", HealthKitSleepSourceFamily.AUTOSLEEP],
]);

export const HealthKitSleepTimeZoneSource = Object.freeze({
  SAMPLE_METADATA: "sample_metadata",
  DEVICE_AT_INGEST: "device_at_ingest",
});

export const HealthKitSleepLifecycle = Object.freeze({ LIVE: "live", DELETED: "deleted" });
export const HealthKitSleepDeletionSource = Object.freeze({
  HK_DELETED_OBJECT: "hk_deleted_object",
  WINDOW_MANIFEST: "window_manifest",
});

export const HealthKitSleepIngestionPurpose = Object.freeze({
  OPERATIONAL: "operational",
  VALIDATION_ONLY: "validation_only",
});

/**
 * Every property the Sleep command reads. Anything else in a sample is ignored
 * (never persisted); the names in FORBIDDEN_SAMPLE_KEYS are refused outright.
 */
export const SLEEP_SAMPLE_WIRE_FIELDS = Object.freeze({
  sample: Object.freeze({
    externalId: "external_id", categoryValue: "integer", startedAt: "timestamp", endedAt: "timestamp",
    timeZone: "text", timeZoneSource: "text", wasUserEntered: "boolean",
  }),
  source: Object.freeze({ bundleIdentifier: "text", sourceVersion: "text", productType: "text" }),
});
export const SLEEP_DELETION_WIRE_FIELDS = Object.freeze({ externalId: "external_id" });
export const SLEEP_MANIFEST_WIRE_FIELDS = Object.freeze({
  windowStart: "timestamp", windowEnd: "timestamp", liveExternalIds: "external_id_list",
});

// Personal or device-identifying HealthKit fields. Matched case-insensitively
// against sample and source keys.
const FORBIDDEN_SAMPLE_KEYS = Object.freeze([
  "sourcename", "name", "devicename", "device", "localidentifier", "udideviceidentifier", "udi",
  "firmwareversion", "hardwareversion", "softwareversion", "manufacturer", "model", "devicemodel",
  "metadata", "operatingsystemversion", "privacysafedeviceprovenance",
]);

export class HealthKitSleepContractError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "HealthKitSleepContractError";
    this.code = code;
    this.field = field;
  }
}

/**
 * Validate and normalize one Sleep command payload. Pure: owner, receipt time
 * and activation are applied by the port. Throws HealthKitSleepContractError
 * for a request the contract refuses as a whole (nothing is then stored).
 */
export function normalizeHealthKitSleepBatch({ batchId, samples, deletions, windowManifest } = {}) {
  const normalizedBatchId = requiredText(batchId, "batchId");
  const sampleList = optionalList(samples, "samples", HEALTHKIT_SLEEP_MAX_SAMPLES_PER_BATCH);
  const deletionList = optionalList(deletions, "deletions", HEALTHKIT_SLEEP_MAX_DELETIONS_PER_BATCH);
  const manifest = windowManifest == null ? null : normalizeWindowManifest(windowManifest);
  if (sampleList.length === 0 && deletionList.length === 0 && manifest === null) {
    throw invalid("samples", "A Sleep batch requires samples, deletions, or a window manifest.");
  }
  return Object.freeze({
    contractVersion: HEALTHKIT_SLEEP_CONTRACT_VERSION,
    batchId: normalizedBatchId,
    samples: Object.freeze(sampleList.map((value, index) => normalizeSleepSample(value, index))),
    deletions: Object.freeze(deletionList.map((value, index) => normalizeDeletion(value, index))),
    windowManifest: manifest,
  });
}

export function normalizeSleepSample(value, index = 0) {
  const field = `samples[${index}]`;
  if (!isPlainObject(value)) throw invalid(field, "Each Sleep sample must be an object.");
  assertNoForbiddenKeys(value, field);
  if (!isPlainObject(value.source)) throw invalid(`${field}.source`, "Sleep source provenance is required.");
  assertNoForbiddenKeys(value.source, `${field}.source`);

  const externalId = externalIdentifier(value.externalId, `${field}.externalId`);
  const categoryValue = nonNegativeInteger(value.categoryValue, `${field}.categoryValue`);
  const startedAt = boundedInstant(value.startedAt, `${field}.startedAt`);
  const endedAt = boundedInstant(value.endedAt, `${field}.endedAt`);
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  if (duration < 0) throw invalid(`${field}.endedAt`, "A Sleep sample must not end before it starts.");
  if (duration > HEALTHKIT_SLEEP_MAX_SAMPLE_DURATION_MS) {
    throw invalid(`${field}.endedAt`, "A Sleep sample must not span more than 24 hours.");
  }
  const timeZone = validTimeZone(value.timeZone, `${field}.timeZone`);
  const timeZoneSource = requiredEnum(value.timeZoneSource, Object.values(HealthKitSleepTimeZoneSource), `${field}.timeZoneSource`);
  if (value.wasUserEntered !== undefined && value.wasUserEntered !== null && typeof value.wasUserEntered !== "boolean") {
    throw invalid(`${field}.wasUserEntered`, "wasUserEntered must be a boolean when present.");
  }
  const wasUserEntered = value.wasUserEntered === true;
  const bundleIdentifier = normalizeSleepBundleIdentifier(requiredText(value.source.bundleIdentifier, `${field}.source.bundleIdentifier`));
  const sourceVersion = optionalText(value.source.sourceVersion, `${field}.source.sourceVersion`);
  const productTypeFamily = classifyProductTypeFamily(optionalText(value.source.productType, `${field}.source.productType`));
  const { sourceClass, sourceFamily } = classifySleepSource({ bundleIdentifier, productTypeFamily, wasUserEntered });
  const stage = STAGE_BY_RAW_VALUE[categoryValue] ?? HealthKitSleepStage.UNKNOWN;

  const source = compact({ bundleIdentifier, sourceClass, sourceFamily, productTypeFamily, sourceVersion });
  const content = {
    externalId, categoryValue, startedAt, endedAt, wasUserEntered,
    source: compact({ bundleIdentifier, sourceVersion, productTypeFamily }),
    // A device-derived zone is ingest context, not HealthKit sample content:
    // a replay after travel must not look like a conflicting sample.
    sampleTimeZone: timeZoneSource === HealthKitSleepTimeZoneSource.SAMPLE_METADATA ? timeZone : null,
  };
  return Object.freeze({
    externalId,
    categoryValue,
    stage,
    stageSchemaVersion: HEALTHKIT_SLEEP_STAGE_SCHEMA_VERSION,
    startedAt,
    endedAt,
    timeZone,
    timeZoneSource,
    wasUserEntered,
    source: Object.freeze(source),
    contentFingerprint: `sha256_${digest(stable(content))}`,
  });
}

function normalizeDeletion(value, index) {
  const field = `deletions[${index}]`;
  if (!isPlainObject(value)) throw invalid(field, "Each Sleep deletion must be an object.");
  assertNoForbiddenKeys(value, field);
  return Object.freeze({ externalId: externalIdentifier(value.externalId, `${field}.externalId`) });
}

function normalizeWindowManifest(value) {
  const field = "windowManifest";
  if (!isPlainObject(value)) throw invalid(field, "The Sleep window manifest must be an object.");
  const windowStart = boundedInstant(value.windowStart, `${field}.windowStart`);
  const windowEnd = boundedInstant(value.windowEnd, `${field}.windowEnd`);
  const span = Date.parse(windowEnd) - Date.parse(windowStart);
  if (span <= 0 || span > HEALTHKIT_SLEEP_MAX_MANIFEST_WINDOW_MS) {
    throw invalid(`${field}.windowEnd`, "The Sleep window manifest must span more than zero and at most 96 hours.");
  }
  if (!Array.isArray(value.liveExternalIds)) {
    throw invalid(`${field}.liveExternalIds`, "liveExternalIds must be an array (it may be empty).");
  }
  if (value.liveExternalIds.length > HEALTHKIT_SLEEP_MAX_MANIFEST_LIVE_IDS) {
    throw invalid(`${field}.liveExternalIds`, `liveExternalIds accepts at most ${HEALTHKIT_SLEEP_MAX_MANIFEST_LIVE_IDS} identifiers.`);
  }
  const liveExternalIds = [...new Set(value.liveExternalIds.map((id, index) =>
    externalIdentifier(id, `${field}.liveExternalIds[${index}]`)))].sort();
  return Object.freeze({ windowStart, windowEnd, liveExternalIds: Object.freeze(liveExternalIds) });
}

/** Store identity: one record per HealthKit UUID (deletions carry only the UUID). */
export function getHealthKitSleepSampleRecordId(ownerUserId, externalId) {
  return `${HEALTHKIT_SLEEP_SAMPLE_ID_PREFIX}${digest(["sleep", String(ownerUserId), String(externalId).toLowerCase()].join("\u0000"))}`;
}

export function getHealthKitSleepDayRecordId(sleepDay) {
  return `${HEALTHKIT_SLEEP_DAY_ID_PREFIX}${sleepDay}`;
}

/**
 * Apple Health device sources arrive as `com.apple.health.<device UUID>`. The
 * suffix is a stable per-device identifier (the same privacy class as a UDI),
 * so it is dropped before anything is stored, fingerprinted, or ranked.
 */
export function normalizeSleepBundleIdentifier(bundleIdentifier) {
  const text = String(bundleIdentifier ?? "").trim();
  const lower = text.toLowerCase();
  if (lower === "com.apple.health" || lower.startsWith("com.apple.health.")) return "com.apple.health";
  return text;
}

export function classifyProductTypeFamily(productType) {
  const text = String(productType ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text.startsWith("watch")) return "watch";
  if (text.startsWith("iphone")) return "iphone";
  if (text.startsWith("ipad")) return "ipad";
  return "other";
}

export function classifySleepSource({ bundleIdentifier, productTypeFamily = null, wasUserEntered = false } = {}) {
  if (wasUserEntered === true) {
    return { sourceClass: HealthKitSleepSourceClass.USER_ENTERED, sourceFamily: HealthKitSleepSourceFamily.MANUAL };
  }
  const bundle = String(bundleIdentifier ?? "").toLowerCase();
  if (bundle === "com.apple.health" || bundle.startsWith("com.apple.health.")) {
    if (productTypeFamily === "watch") return { sourceClass: HealthKitSleepSourceClass.APPLE_WATCH, sourceFamily: HealthKitSleepSourceFamily.APPLE_WATCH };
    if (productTypeFamily === "iphone") return { sourceClass: HealthKitSleepSourceClass.APPLE_IPHONE, sourceFamily: HealthKitSleepSourceFamily.APPLE_IPHONE };
    return { sourceClass: HealthKitSleepSourceClass.APPLE_OTHER, sourceFamily: HealthKitSleepSourceFamily.APPLE_OTHER };
  }
  const family = THIRD_PARTY_FAMILY_PREFIXES.find(([prefix]) => bundle.startsWith(prefix))?.[1] ??
    HealthKitSleepSourceFamily.THIRD_PARTY_OTHER;
  return { sourceClass: HealthKitSleepSourceClass.THIRD_PARTY, sourceFamily: family };
}

/** Stored sample record for a newly received (or tombstone-upgraded) sample. */
export function createHealthKitSleepSampleRecord({
  ownerUserId, sample, receivedAt, batchId, deliveryDeviceId, ingestionPurpose, lifecycle = null,
} = {}) {
  const sleepDayKey = deriveHealthKitSleepDay(sample.endedAt, sample.timeZone);
  const state = lifecycle ?? { state: HealthKitSleepLifecycle.LIVE };
  return Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_SAMPLE_SCHEMA_VERSION,
    id: getHealthKitSleepSampleRecordId(ownerUserId, sample.externalId),
    userId: ownerUserId,
    externalId: sample.externalId,
    categoryValue: sample.categoryValue,
    stage: sample.stage,
    stageSchemaVersion: sample.stageSchemaVersion,
    startedAt: sample.startedAt,
    endedAt: sample.endedAt,
    timeZone: sample.timeZone,
    timeZoneSource: sample.timeZoneSource,
    wasUserEntered: sample.wasUserEntered,
    source: structuredClone(sample.source),
    contentFingerprint: sample.contentFingerprint,
    // Candidate sleep day of this sample's own end; the canonical day an
    // episode lands on is decided by the canonicalizer, which reads a margin.
    occurrenceDate: sleepDayKey,
    observedAt: sample.endedAt,
    status: state.state,
    lifecycle: structuredClone(state),
    ingestionPurpose,
    ingestion: { firstReceivedAt: receivedAt, batchId, deliveryDeviceId },
    evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
  });
}

/** Identity-only record for a deletion of a sample the Server never received. */
export function createHealthKitSleepTombstoneRecord({ ownerUserId, externalId, deletedAt, batchId, deletionSource }) {
  return Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_SAMPLE_SCHEMA_VERSION,
    id: getHealthKitSleepSampleRecordId(ownerUserId, externalId),
    userId: ownerUserId,
    externalId,
    tombstone: true,
    occurrenceDate: null,
    status: HealthKitSleepLifecycle.DELETED,
    lifecycle: { state: HealthKitSleepLifecycle.DELETED, deletedAt, deletionSource, deletionBatchId: batchId },
    evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
  });
}

// ---------------------------------------------------------------------------
// Sleep-day time arithmetic. Durations always come from absolute instants; the
// zone is used only to name calendar dates and the 18:00 boundary.

/** Wake-date sleep day of an instant: [D-1 18:00, D 18:00) local -> D. */
export function deriveHealthKitSleepDay(instant, timeZone) {
  const ms = typeof instant === "number" ? instant : Date.parse(String(instant ?? ""));
  if (!Number.isFinite(ms)) return null;
  const parts = zonedParts(ms, timeZone);
  if (!parts) return null;
  const dateKey = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return parts.hour >= HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR ? shiftDateKey(dateKey, 1) : dateKey;
}

/** Absolute instant (ms) at which sleep day D's window closes: D 18:00 local. */
export function sleepDayWindowEndMs(sleepDay, timeZone) {
  return zonedWallTimeToInstant(sleepDay, HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR, timeZone);
}

/** Absolute instant (ms) at which sleep day D's window opens: D-1 18:00 local. */
export function sleepDayWindowStartMs(sleepDay, timeZone) {
  return zonedWallTimeToInstant(shiftDateKey(sleepDay, -1), HEALTHKIT_SLEEP_DAY_BOUNDARY_HOUR, timeZone);
}

export function shiftDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function isCalendarDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const PARTS_FORMATTERS = new Map();
function zonedParts(ms, timeZone) {
  try {
    let formatter = PARTS_FORMATTERS.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      if (PARTS_FORMATTERS.size > 64) PARTS_FORMATTERS.clear();
      PARTS_FORMATTERS.set(timeZone, formatter);
    }
    const parts = Object.fromEntries(formatter.formatToParts(new Date(ms))
      .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return parts;
  } catch {
    return null;
  }
}
function zoneOffsetMs(ms, timeZone) {
  const parts = zonedParts(ms, timeZone);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(ms / 1000) * 1000;
}
function zonedWallTimeToInstant(dateKey, hour, timeZone) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour);
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(first, timeZone);
  return second;
}
function pad(value) { return String(value).padStart(2, "0"); }

// ---------------------------------------------------------------------------

function assertNoForbiddenKeys(value, field) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_SAMPLE_KEYS.includes(key.toLowerCase())) {
      throw new HealthKitSleepContractError(
        "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED",
        "Sleep samples must not carry source names, device identity, firmware, or arbitrary metadata.",
        `${field}.${key}`
      );
    }
  }
}
function optionalList(value, field, maximum) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw invalid(field, `${field} must be an array.`);
  if (value.length > maximum) throw invalid(field, `${field} accepts at most ${maximum} entries.`);
  return value;
}
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function externalIdentifier(value, field) {
  const raw = String(value ?? "");
  if (raw.length > HEALTHKIT_SLEEP_MAX_EXTERNAL_ID_LENGTH) throw invalid(field, `${field} must be a HealthKit UUID.`);
  const text = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    throw invalid(field, `${field} must be a HealthKit UUID.`);
  }
  return text;
}
function nonNegativeInteger(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw invalid(field, `${field} must be a HealthKit category raw value.`);
  }
  return value;
}
// ISO-8601 with an explicit zone designator only: a zone-less or free-form
// value would be read in the Server's own zone and move the sleep day.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
function boundedInstant(value, field) {
  const text = String(value ?? "");
  if (!text || text.length > HEALTHKIT_SLEEP_MAX_TIMESTAMP_LENGTH || !ISO_INSTANT.test(text)) {
    throw invalid(field, `${field} must be an ISO-8601 date-time with Z or an explicit offset.`);
  }
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw invalid(field, `${field} must be an ISO date-time.`);
  return new Date(time).toISOString();
}
function requiredText(value, field) {
  const raw = String(value ?? "");
  if (raw.length > HEALTHKIT_SLEEP_MAX_TEXT_LENGTH) throw invalid(field, `${field} must be a non-empty bounded string.`);
  const text = raw.trim();
  if (!text) throw invalid(field, `${field} must be a non-empty bounded string.`);
  return text;
}
function optionalText(value, field) {
  if (value == null) return null;
  const raw = String(value);
  if (raw.length > HEALTHKIT_SLEEP_MAX_TEXT_LENGTH) throw invalid(field, `${field} must be a bounded string.`);
  return raw.trim() || null;
}
function requiredEnum(value, values, field) {
  const text = requiredText(value, field);
  if (!values.includes(text)) throw invalid(field, `${field} is unsupported.`);
  return text;
}
function validTimeZone(value, field) {
  const text = requiredText(value, field);
  if (!isValidTimeZone(text)) throw invalid(field, `${field} must be an IANA time zone.`);
  return text;
}
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "")); }
export function digest(value) { return createHash("sha256").update(value).digest("hex"); }
export function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function invalid(field, message) { return new HealthKitSleepContractError("HEALTHKIT_SLEEP_CONTRACT_INVALID", message, field); }
