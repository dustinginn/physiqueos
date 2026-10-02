// Synthetic HealthKit Sleep builders for tests. No Founder data.
import {
  createHealthKitSleepSampleRecord,
  normalizeSleepSample,
} from "../domain/services/HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "../domain/services/HealthKitSleepPolicies.js";

export const OWNER = "owner-sleep-synthetic";
export const LA = "America/Los_Angeles";

export const SOURCES = Object.freeze({
  watch: { bundleIdentifier: "com.apple.health.2B7C1E10-0000-4000-8000-000000000001", productType: "Watch7,1", sourceVersion: "11.0" },
  iphone: { bundleIdentifier: "com.apple.health", productType: "iPhone16,1", sourceVersion: "27.0" },
  oura: { bundleIdentifier: "com.ouraring.oura", productType: "iPhone16,1", sourceVersion: "5.40" },
  sleepCycle: { bundleIdentifier: "com.lexwarelabs.goodmorning", productType: "iPhone16,1", sourceVersion: "4.25" },
  manual: { bundleIdentifier: "com.apple.Health", productType: "iPhone16,1", sourceVersion: "27.0" },
});

export const STAGE = Object.freeze({ inBed: 0, unspecified: 1, awake: 2, core: 3, deep: 4, rem: 5 });

let counter = 0;
export function uuid(n = (counter += 1)) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Wire-shaped sample as Native would send it. */
export function wire({
  id = uuid(), source = "watch", stage = "unspecified", start, end, timeZone = LA,
  timeZoneSource = "sample_metadata", extra = {},
} = {}) {
  const value = typeof stage === "number" ? stage : STAGE[stage];
  return {
    externalId: id,
    categoryValue: value,
    startedAt: start,
    endedAt: end,
    timeZone,
    timeZoneSource,
    wasUserEntered: source === "manual",
    source: { ...SOURCES[source] },
    ...extra,
  };
}

/** Stored sample record (as the port would persist it). */
export function stored(options = {}, { purpose = "operational", receivedAt = "2026-09-30T12:00:00.000Z", batchId = "batch-synthetic" } = {}) {
  return createHealthKitSleepSampleRecord({
    ownerUserId: OWNER,
    sample: normalizeSleepSample(wire(options)),
    receivedAt,
    batchId,
    deliveryDeviceId: "device-synthetic",
    ingestionPurpose: purpose,
  });
}

export function preferring(...entries) {
  return resolveHealthKitSleepSourcePreferencePolicy({
    status: "enabled",
    schemaVersion: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
    preferredSources: entries.map((entry) => typeof entry === "string" ? { sourceFamily: entry } : entry),
  });
}

export function activationPolicy(overrides = {}) {
  return {
    status: "enabled",
    schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION,
    effectiveSleepDay: "2026-09-10",
    timeZone: LA,
    openEnded: true,
    mode: "operational",
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    ...overrides,
  };
}
