import { describe, expect, it } from "vitest";
import { createHealthKitSleepHistoricalValidationPort } from "./HealthKitSleepHistoricalValidationPort.js";
import { createHealthKitSleepIngestPort } from "./HealthKitSleepIngestPort.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION,
  compareHealthKitSleepValidationV1V2,
  resolveHealthKitSleepValidationPolicy,
  summarizeHealthKitSleepValidation,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
  resolveHealthKitSleepActivationPolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import { assessHealthKitStrategicEvidenceEligibility } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { OWNER, activationPolicy, uuid, wire } from "../../testSupport/healthKitSleepSynthetic.js";

const D0 = "2026-10-10";
const validationPolicy = (overrides = {}) => ({
  id: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  status: "enabled",
  schemaVersion: HEALTHKIT_SLEEP_VALIDATION_POLICY_SCHEMA_VERSION,
  purpose: "historical_validation",
  runId: `hv-${D0}-30d`,
  timeZone: "America/Los_Angeles",
  windowStartSleepDay: "2026-09-10",
  windowEndSleepDay: "2026-10-09",
  prospectiveEffectiveSleepDay: D0,
  strategicEvidenceEligibility: "quarantined",
  canonicalProductionHistory: false,
  ...overrides,
});
const OURA_PREFERENCE = {
  id: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  status: "enabled", schemaVersion: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION, preferredSources: [{ sourceFamily: "oura" }],
};
const STRATEGIC = ["canonicalEvidenceObjects", "dailyBriefings", "goalConfidenceSnapshots", "analyses", "healthKitObservations", "healthKitCanonicalDays"];

function setup(configuration = [validationPolicy()]) {
  const store = createInMemoryCanonicalRecordStore({
    healthKitConfiguration: configuration,
    ...Object.fromEntries(STRATEGIC.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
  const port = createHealthKitSleepHistoricalValidationPort({ records: store, now: () => new Date("2026-10-09T20:00:00Z") });
  const run = (payload) => port({ payload, ownerUserId: OWNER, principal: { deviceId: "device-synthetic" }, metadata: {} });
  return { store, run };
}
const night = (id, source = "oura", overrides = {}) => wire({ id: uuid(id), source, stage: "core", start: "2026-09-20T23:00:00-07:00", end: "2026-09-21T07:00:00-07:00", ...overrides });

describe("historical-validation window policy", () => {
  it("is OFF when absent or malformed and always ends exactly at the prospective floor", () => {
    expect(resolveHealthKitSleepValidationPolicy(null).enabled).toBe(false);
    for (const [overrides, reason] of [
      [{ status: "disabled" }, "status_not_enabled"],
      [{ purpose: "operational" }, "purpose_invalid"],
      [{ strategicEvidenceEligibility: "eligible" }, "strategic_eligibility_not_quarantined"],
      [{ canonicalProductionHistory: true }, "canonical_production_history_not_false"],
      [{ runId: "BAD RUN" }, "run_id_invalid"],
      [{ windowEndSleepDay: "2026-10-10" }, "window_must_end_the_day_before_d0"],
      [{ windowStartSleepDay: "2026-09-08" }, "window_too_long"],
    ]) {
      expect(resolveHealthKitSleepValidationPolicy(validationPolicy(overrides))).toMatchObject({ enabled: false, invalidReason: reason });
    }
    const policy = resolveHealthKitSleepValidationPolicy(validationPolicy());
    const prospective = resolveHealthKitSleepActivationPolicy(activationPolicy({ effectiveSleepDay: D0 }));
    expect(policy.windowEnd).toBe(prospective.activationFloor);
    expect(policy.windowStart).toBe("2026-09-10T01:00:00.000Z");
  });
});

describe("healthkit.sleep.historical-validation.ingest.v1", () => {
  it("is refused with nothing stored when the window policy is absent or the runId does not match", async () => {
    for (const current of [setup([]), setup()]) {
      const before = current.store.snapshot();
      await expect(current.run({ batchId: "b1", runId: "hv-other-run-30d", samples: [night(1)] }))
        .rejects.toMatchObject({ status: 409, code: "HEALTHKIT_SLEEP_HISTORICAL_VALIDATION_NOT_ENABLED" });
      expect(current.store.snapshot()).toEqual(before);
    }
  });

  it("accepts samples only; deletions and window manifests are refused", async () => {
    const current = setup();
    await expect(current.run({ batchId: "b1", runId: `hv-${D0}-30d`, samples: [night(1)], deletions: [{ externalId: uuid(2) }] }))
      .rejects.toMatchObject({ status: 400, code: "HEALTHKIT_SLEEP_VALIDATION_CONTRACT_INVALID" });
  });

  it("stores in-window samples ONLY in the validation collection; never ordinary Sleep or strategic collections", async () => {
    const current = setup();
    const before = current.store.snapshot();
    const outcome = await current.run({ batchId: "b1", runId: `hv-${D0}-30d`, samples: [
      night(1),
      night(2, "watch", { start: "2026-09-05T23:00:00-07:00", end: "2026-09-06T07:00:00-07:00" }),
      night(3, "watch", { start: "2026-10-09T22:00:00-07:00", end: "2026-10-10T06:00:00-07:00" }),
    ] });
    expect(outcome.result.samples.map((item) => item.outcome)).toEqual(["stored", "refused_outside_validation_window", "refused_outside_validation_window"]);
    const after = current.store.snapshot();
    expect(after.healthKitSleepValidationSamples).toHaveLength(1);
    expect(after.healthKitSleepSamples).toBeUndefined();
    expect(after.healthKitSleepDays).toBeUndefined();
    for (const name of STRATEGIC) expect(after[name]).toEqual(before[name]);
    const stored = after.healthKitSleepValidationSamples[0];
    expect(stored).toMatchObject({ purpose: "historical_validation", canonicalProductionHistory: false, validationRunId: `hv-${D0}-30d` });
    expect(stored.id).toMatch(/^healthkit_sleep_validation_sample_[0-9a-f]{64}$/);
    expect(assessHealthKitStrategicEvidenceEligibility(stored)).toMatchObject({ applicable: true, eligible: false });
    expect(JSON.stringify(stored)).not.toMatch(/sourceName|Watch7,1|iPhone16,1/);
  });

  it("replays idempotently and refuses conflicting content for the same UUID", async () => {
    const current = setup();
    await current.run({ batchId: "b1", runId: `hv-${D0}-30d`, samples: [night(1)] });
    const again = await current.run({ batchId: "b2", runId: `hv-${D0}-30d`, samples: [night(1), night(1, "oura", { stage: "deep" })] });
    expect(again.result.samples.map((item) => item.outcome)).toEqual(["replayed", "refused_identity_conflict"]);
    expect(current.store.snapshot().healthKitSleepValidationSamples).toHaveLength(1);
  });

  it("historical validation and prospective ingestion cannot collide", async () => {
    const store = createInMemoryCanonicalRecordStore({
      healthKitConfiguration: [validationPolicy(), { ...activationPolicy({ effectiveSleepDay: D0 }), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }],
    });
    const context = (payload) => ({ payload, ownerUserId: OWNER, principal: { deviceId: "d" }, metadata: {} });
    const validate = createHealthKitSleepHistoricalValidationPort({ records: store, now: () => new Date("2026-10-11T20:00:00Z") });
    const ingest = createHealthKitSleepIngestPort({ records: store, now: () => new Date("2026-10-11T20:00:00Z") });
    const historical = night(1);
    const prospective = wire({ id: uuid(2), source: "oura", stage: "core", start: "2026-10-10T23:00:00-07:00", end: "2026-10-11T07:00:00-07:00" });
    // The same historical sample is refused by the ordinary floor, and the
    // prospective sample is refused by the historical window.
    const ordinary = await ingest(context({ batchId: "o1", samples: [historical, prospective] }));
    expect(ordinary.result.samples.map((item) => item.outcome)).toEqual(["refused_before_activation_floor", "stored"]);
    const validation = await validate(context({ batchId: "v1", runId: `hv-${D0}-30d`, samples: [historical, prospective] }));
    expect(validation.result.samples.map((item) => item.outcome)).toEqual(["stored", "refused_outside_validation_window"]);
    const snapshot = store.snapshot();
    expect(snapshot.healthKitSleepSamples.map((sample) => sample.externalId)).toEqual([uuid(2)]);
    expect(snapshot.healthKitSleepValidationSamples.map((sample) => sample.externalId)).toEqual([uuid(1)]);
    expect(snapshot.healthKitSleepDays.every((day) => day.sleepDay >= D0)).toBe(true);
  });
});

describe("sanitized historical shape", () => {
  it("summarizes Oura-first reconciliation without timestamps, UUIDs or source names", async () => {
    const current = setup([validationPolicy(), OURA_PREFERENCE]);
    const samples = [];
    let id = 1;
    for (let day = 11; day <= 20; day += 1) {
      const start = `2026-09-${String(day).padStart(2, "0")}T23:00:00-07:00`;
      const end = `2026-09-${String(day + 1).padStart(2, "0")}T07:00:00-07:00`;
      samples.push(wire({ id: uuid(id++), source: "watch", stage: "core", start: `2026-09-${String(day).padStart(2, "0")}T22:30:00-07:00`, end }));
      if (day % 5 !== 0) samples.push(wire({ id: uuid(id++), source: "oura", stage: "unspecified", start, end }));
      if (day === 12) samples.push(wire({ id: uuid(id++), source: "sleepCycle", start, end }));
    }
    await current.run({ batchId: "b1", runId: `hv-${D0}-30d`, samples });
    const snapshot = current.store.snapshot();
    const shape = summarizeHealthKitSleepValidation({
      samples: snapshot.healthKitSleepValidationSamples,
      preferenceRecord: OURA_PREFERENCE,
      policy: resolveHealthKitSleepValidationPolicy(validationPolicy()),
    });
    expect(shape.nights.withAnySleepData).toBe(10);
    expect(shape.nights.missing).toBe(20);
    expect(shape.oura).toMatchObject({ nightsPresent: 8, primaryWhenPresent: 8, primaryWhenPresentRatio: 1 });
    expect(shape.mainEpisode.primarySourceFamily).toEqual({ oura: 8, apple_watch: 2 });
    expect(shape.genericRankingComparison.nightsWherePrimaryDiffers).toBe(8);
    expect(shape.mainEpisode.stageSumEqualsAsleep).toBe(10);
    expect(shape.samples.bySourceFamily).toMatchObject({ sleep_cycle: 1 });
    const text = JSON.stringify(shape);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(text).not.toMatch(/sourceName|bundleIdentifier/);
  });

  it("compares v1 and v2 with aggregate copy-selection facts only", async () => {
    const current = setup([validationPolicy(), OURA_PREFERENCE]);
    await current.run({ batchId: "b-copy", runId: `hv-${D0}-30d`, samples: [
      night(100),
      night(101),
      wire({
        id: uuid(102), source: "oura", stage: "core",
        start: "2026-09-21T23:00:00-07:00", end: "2026-09-22T07:00:00-07:00",
      }),
    ] });
    const comparison = compareHealthKitSleepValidationV1V2({
      samples: current.store.snapshot().healthKitSleepValidationSamples,
      preferenceRecord: OURA_PREFERENCE,
      policy: resolveHealthKitSleepValidationPolicy(validationPolicy()),
    });
    expect(comparison).toMatchObject({
      algorithmVersions: { before: "sleep-canon-v1", candidate: "sleep-canon-v2" },
      samples: 3,
      nights: {
        v1: 2,
        v2: 2,
        affectedDuplicateCopies: 1,
        affectedResolvedToOneSelectedCopy: 1,
        affectedSelectedCopyConflictFree: 1,
        affectedSelectedTotalsWithinTolerance: 1,
        affectedAsleepStableWithinTolerance: 1,
        unaffected: 1,
        unaffectedSemanticallyEquivalent: 1,
      },
      duplicateCopyCandidates: { 2: 1 },
    });
    const text = JSON.stringify(comparison);
    expect(text).not.toMatch(/2026-\d{2}-\d{2}T/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
