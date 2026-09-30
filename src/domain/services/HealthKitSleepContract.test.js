import { describe, expect, it } from "vitest";
import {
  HealthKitSleepStage,
  classifySleepSource,
  deriveHealthKitSleepDay,
  getHealthKitSleepSampleRecordId,
  normalizeHealthKitSleepBatch,
  normalizeSleepSample,
  sleepDayWindowEndMs,
  sleepDayWindowStartMs,
} from "./HealthKitSleepContract.js";
import {
  assessHealthKitSleepSampleActivation,
  describeHealthKitSleepCapability,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepSourcePreferencePolicy,
} from "./HealthKitSleepPolicies.js";
import { LA, OWNER, activationPolicy, stored, uuid, wire } from "../../testSupport/healthKitSleepSynthetic.js";

const base = { start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00" };

describe("HealthKit Sleep sample contract", () => {
  it("normalizes a sample to the minimum privacy-safe fields", () => {
    const sample = normalizeSleepSample(wire({ id: uuid(10).toUpperCase(), source: "watch", stage: "deep", ...base }));
    expect(sample).toMatchObject({
      externalId: uuid(10),
      categoryValue: 4,
      stage: HealthKitSleepStage.ASLEEP_DEEP,
      stageSchemaVersion: "hk-sleep-v1",
      startedAt: "2026-09-11T06:00:00.000Z",
      endedAt: "2026-09-11T14:00:00.000Z",
      timeZone: LA,
      timeZoneSource: "sample_metadata",
      wasUserEntered: false,
      source: { sourceClass: "apple_watch", sourceFamily: "apple_watch", productTypeFamily: "watch", sourceVersion: "11.0" },
    });
    expect(Object.keys(sample.source).sort()).toEqual(["bundleIdentifier", "productTypeFamily", "sourceClass", "sourceFamily", "sourceVersion"]);
  });

  it("maps every HealthKit raw value; unknown future values become unknown (never rejected)", () => {
    const stages = [0, 1, 2, 3, 4, 5, 6, 42].map((value) => normalizeSleepSample(wire({ stage: value, ...base })).stage);
    expect(stages).toEqual(["in_bed", "asleep_unspecified", "awake", "asleep_core", "asleep_deep", "asleep_rem", "unknown", "unknown"]);
  });

  it("classifies sources generically; user-entered is manual regardless of bundle", () => {
    expect(classifySleepSource({ bundleIdentifier: "com.ouraring.oura" })).toEqual({ sourceClass: "third_party", sourceFamily: "oura" });
    expect(classifySleepSource({ bundleIdentifier: "com.example.unknownsleep" })).toEqual({ sourceClass: "third_party", sourceFamily: "third_party_other" });
    expect(classifySleepSource({ bundleIdentifier: "com.apple.health", productTypeFamily: "iphone" })).toEqual({ sourceClass: "apple_iphone", sourceFamily: "apple_iphone" });
    expect(classifySleepSource({ bundleIdentifier: "com.ouraring.oura", wasUserEntered: true })).toEqual({ sourceClass: "user_entered", sourceFamily: "manual" });
  });

  it("refuses personal source/device names, device identifiers, firmware and metadata by name", () => {
    for (const extra of [
      { sourceName: "A Person's Apple Watch" }, { deviceName: "Personal" }, { device: { name: "x" } },
      { localIdentifier: "x" }, { udiDeviceIdentifier: "x" }, { firmwareVersion: "1" }, { metadata: { HKTimeZone: LA } },
    ]) {
      expect(() => normalizeSleepSample(wire({ ...base, extra }))).toThrow(expect.objectContaining({ code: "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED" }));
    }
    const withSourceName = wire(base);
    withSourceName.source.sourceName = "A Person's iPhone";
    expect(() => normalizeSleepSample(withSourceName)).toThrow(expect.objectContaining({ code: "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED" }));
  });

  it("never persists fields outside the allow-list", () => {
    const record = stored({ ...base, extra: { somethingElse: "ignored", hkSyncIdentifier: "x" } });
    const text = JSON.stringify(record);
    for (const needle of ["somethingElse", "hkSyncIdentifier", "sourceName", "deviceName", "iPhone16,1", "Watch7,1"]) {
      expect(text).not.toContain(needle);
    }
    expect(record.evidenceEligibility).toMatchObject({ state: "quarantined", strategic: false });
  });

  it("validates identity, timing, zone and bounds", () => {
    expect(() => normalizeSleepSample(wire({ ...base, id: "not-a-uuid" }))).toThrow(/HealthKit UUID/);
    expect(() => normalizeSleepSample(wire({ start: base.end, end: base.start }))).toThrow(/end before/);
    expect(() => normalizeSleepSample(wire({ start: "2026-09-09T00:00:00Z", end: "2026-09-10T00:00:01Z" }))).toThrow(/24 hours/);
    expect(() => normalizeSleepSample(wire({ ...base, timeZone: "Mars/Olympus" }))).toThrow(/IANA/);
    expect(() => normalizeSleepSample(wire({ ...base, timeZoneSource: "guessed" }))).toThrow(/unsupported/);
    expect(() => normalizeSleepSample(wire({ ...base, stage: 1.5 }))).toThrow(/raw value/);
    expect(() => normalizeHealthKitSleepBatch({ batchId: "b" })).toThrow(/requires samples/);
    expect(() => normalizeHealthKitSleepBatch({ batchId: "b", samples: Array.from({ length: 101 }, () => wire(base)) })).toThrow(/at most 100/);
    expect(() => normalizeHealthKitSleepBatch({ batchId: "b", windowManifest: {
      windowStart: "2026-09-01T00:00:00Z", windowEnd: "2026-09-06T00:00:00Z", liveExternalIds: [],
    } })).toThrow(/96 hours/);
  });

  it("content fingerprint ignores a device-derived zone but not a HealthKit sample zone", () => {
    const deviceA = normalizeSleepSample(wire({ id: uuid(20), ...base, timeZoneSource: "device_at_ingest" }));
    const deviceB = normalizeSleepSample(wire({ id: uuid(20), ...base, timeZoneSource: "device_at_ingest", timeZone: "America/New_York" }));
    expect(deviceA.contentFingerprint).toBe(deviceB.contentFingerprint);
    const sampleA = normalizeSleepSample(wire({ id: uuid(20), ...base }));
    const sampleB = normalizeSleepSample(wire({ id: uuid(20), ...base, timeZone: "America/New_York" }));
    expect(sampleA.contentFingerprint).not.toBe(sampleB.contentFingerprint);
  });

  it("identity is by owner + HealthKit UUID only (deletions carry only the UUID)", () => {
    expect(getHealthKitSleepSampleRecordId(OWNER, uuid(5).toUpperCase())).toBe(getHealthKitSleepSampleRecordId(OWNER, uuid(5)));
    expect(getHealthKitSleepSampleRecordId(OWNER, uuid(5))).toMatch(/^healthkit_sleep_sample_[0-9a-f]{64}$/);
  });
});

describe("HealthKit Sleep contract review regressions", () => {
  it("requires ISO-8601 instants with Z or an explicit offset", () => {
    for (const [start, end] of [
      ["2026-09-10T23:00:00", "2026-09-11T07:00:00"],
      ["2026-09-10", "2026-09-11"],
      ["Sep 10 2026 23:00", "Sep 11 2026 07:00"],
    ]) {
      expect(() => normalizeSleepSample(wire({ start, end }))).toThrow(/explicit offset/);
    }
    for (const [start, end] of [
      ["2026-02-30T00:00:00Z", "2026-02-30T01:00:00Z"],
      ["2026-09-10T24:00:00Z", "2026-09-11T01:00:00Z"],
    ]) {
      expect(() => normalizeSleepSample(wire({ start, end }))).toThrow(/ISO date-time/);
    }
    for (const [start, end] of [
      ["2026-09-10T23:00:00+0200", "2026-09-11T07:00:00+0200"],
    ]) {
      expect(() => normalizeSleepSample(wire({ start, end }))).toThrow(/explicit offset/);
    }
    expect(normalizeSleepSample(wire({ start: "2026-09-11T06:00:00.123Z", end: "2026-09-11T14:00:00Z" })).startedAt)
      .toBe("2026-09-11T06:00:00.123Z");
  });

  it("drops the per-device suffix of Apple Health bundle identifiers before storing or fingerprinting", () => {
    const record = stored({ source: "watch", ...base });
    expect(record.source.bundleIdentifier).toBe("com.apple.health");
    expect(JSON.stringify(record)).not.toContain("2B7C1E10");
    const other = wire({ id: uuid(30), source: "watch", ...base });
    other.source.bundleIdentifier = "com.apple.health.FFFFFFFF-0000-4000-8000-00000000000F";
    const same = wire({ id: uuid(30), source: "watch", ...base });
    expect(normalizeSleepSample(other).contentFingerprint).toBe(normalizeSleepSample(same).contentFingerprint);
  });
});

describe("sleep-day time arithmetic", () => {
  it("attributes [D-1 18:00, D 18:00) local to D", () => {
    expect(deriveHealthKitSleepDay("2026-09-10T17:59:59-07:00", LA)).toBe("2026-09-10");
    expect(deriveHealthKitSleepDay("2026-09-10T18:00:00-07:00", LA)).toBe("2026-09-11");
    expect(deriveHealthKitSleepDay("2026-09-11T07:00:00-07:00", LA)).toBe("2026-09-11");
  });

  it("window instants are DST-correct", () => {
    expect(new Date(sleepDayWindowStartMs("2026-03-08", LA)).toISOString()).toBe("2026-03-08T02:00:00.000Z");
    expect(new Date(sleepDayWindowEndMs("2026-03-08", LA)).toISOString()).toBe("2026-03-09T01:00:00.000Z");
    expect(sleepDayWindowEndMs("2026-03-08", LA) - sleepDayWindowStartMs("2026-03-08", LA)).toBe(23 * 3600 * 1000);
    expect(sleepDayWindowEndMs("2026-11-01", LA) - sleepDayWindowStartMs("2026-11-01", LA)).toBe(25 * 3600 * 1000);
  });
});

describe("Sleep activation policy (absent = OFF)", () => {
  it("is disabled when absent, disabled, or malformed — never throws", () => {
    expect(resolveHealthKitSleepActivationPolicy(null)).toMatchObject({ enabled: false, source: "not_configured" });
    for (const [overrides, reason] of [
      [{ status: "disabled" }, "status_not_enabled"],
      [{ schemaVersion: "v0" }, "schema_version_unrecognized"],
      [{ strategicEvidenceEligibility: "eligible" }, "strategic_eligibility_not_quarantined"],
      [{ historicalBackfill: true }, "historical_backfill_not_permitted"],
      [{ mode: "strategic" }, "mode_invalid"],
      [{ effectiveSleepDay: "2026-02-30" }, "effective_sleep_day_invalid"],
      [{ timeZone: "Nowhere/Zone" }, "time_zone_invalid"],
      [{ openEnded: "yes" }, "open_ended_flag_invalid"],
      [{ openEnded: true, endSleepDay: "2026-09-12" }, "open_ended_window_must_have_no_end_date"],
      [{ openEnded: false, endSleepDay: "2026-09-30" }, "window_invalid"],
    ]) {
      expect(resolveHealthKitSleepActivationPolicy(activationPolicy(overrides))).toMatchObject({ enabled: false, invalidReason: reason });
    }
    expect(resolveHealthKitSleepActivationPolicy({ get status() { throw new Error("boom"); } }))
      .toMatchObject({ enabled: false, invalidReason: "policy_unreadable" });
  });

  it("derives the prospective floor (D0-1 18:00 local) and enforces it without backfill", () => {
    const policy = resolveHealthKitSleepActivationPolicy(activationPolicy());
    expect(policy).toMatchObject({ enabled: true, mode: "operational", openEnded: true, activationFloor: "2026-09-10T01:00:00.000Z" });
    const before = normalizeSleepSample(wire({ start: "2026-09-09T10:00:00-07:00", end: "2026-09-09T17:00:00-07:00" }));
    const straddling = normalizeSleepSample(wire({ start: "2026-09-09T17:00:00-07:00", end: "2026-09-09T19:00:00-07:00" }));
    expect(assessHealthKitSleepSampleActivation({ sample: before, policy })).toMatchObject({ admitted: false, reason: "before_activation_floor" });
    expect(assessHealthKitSleepSampleActivation({ sample: straddling, policy })).toMatchObject({ admitted: true });
    expect(assessHealthKitSleepSampleActivation({ sample: straddling, policy: resolveHealthKitSleepActivationPolicy(null) }))
      .toMatchObject({ admitted: false, reason: "sleep_ingestion_not_activated" });
  });

  it("describes a disabled Native capability by default", () => {
    expect(describeHealthKitSleepCapability(null, { commandType: "healthkit.sleep.ingest.v1" })).toEqual({
      commandType: "healthkit.sleep.ingest.v1", contractVersion: "healthkit-sleep-ingestion-v1",
      enabled: false, mode: null, effectiveSleepDay: null, endSleepDay: null, activationFloor: null,
    });
    expect(describeHealthKitSleepCapability(resolveHealthKitSleepActivationPolicy(activationPolicy({ mode: "validation_only" }))))
      .toMatchObject({ enabled: true, mode: "validation_only", effectiveSleepDay: "2026-09-10", activationFloor: "2026-09-10T01:00:00.000Z" });
  });
});

describe("Sleep source-preference policy (absent = generic ranking)", () => {
  it("fails closed to generic ranking and never prefers manual", () => {
    expect(resolveHealthKitSleepSourcePreferencePolicy(null)).toMatchObject({ configured: false, digest: "generic" });
    const valid = { status: "enabled", schemaVersion: "healthkit-sleep-source-preference-v1" };
    for (const preferredSources of [[], [{ sourceFamily: "manual" }], [{ sourceFamily: "oura", bundleIdentifier: "x" }], ["oura"], [{ sourceFamily: "fitbit" }]]) {
      expect(resolveHealthKitSleepSourcePreferencePolicy({ ...valid, preferredSources })).toMatchObject({ configured: false, invalidReason: "preferred_sources_invalid" });
    }
    expect(resolveHealthKitSleepSourcePreferencePolicy({ ...valid, preferredSources: [{ sourceFamily: "oura" }, { bundleIdentifier: "com.example.sleep" }] }))
      .toMatchObject({ configured: true, preferredSources: [{ sourceFamily: "oura" }, { bundleIdentifier: "com.example.sleep" }] });
  });
});
