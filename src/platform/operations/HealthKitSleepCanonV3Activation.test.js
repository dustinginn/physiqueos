import { describe, expect, it } from "vitest";
import { runHealthKitSleepCanonV3Activation } from "./HealthKitSleepCanonV3Activation.js";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createHealthKitSleepIngestPort, buildHealthKitSleepDayPayload } from "../../application/commands/HealthKitSleepIngestPort.js";
import { createHealthKitSleepHistoricalEvidenceImportPort } from "../../application/commands/HealthKitSleepHistoricalEvidenceImportPort.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  resolveHealthKitSleepCanonicalAlgorithmPolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  canonicalizeHealthKitSleep,
  canonicalizeHealthKitSleepV3,
} from "../../domain/services/HealthKitSleepCanonicalizer.js";
import { getHealthKitSleepDayRecordId } from "../../domain/services/HealthKitSleepContract.js";
import { createHealthKitSleepEvidenceReadService } from "../../application/recovery/HealthKitSleepEvidenceReadService.js";
import { OWNER, activationPolicy, preferring, stored, uuid, wire } from "../../testSupport/healthKitSleepSynthetic.js";

const D0 = "2026-10-02";
const START = Date.parse("2026-10-02T06:00:00.000Z"); // 23:00 PDT Oct 1
const at = (minutes, base = START) => new Date(base + minutes * 60_000).toISOString();

// Two Oura revisions of the Oct 2 night in two batches; v2 splices them.
function spliceNight(base = START, idBase = 50_000, day = "a") {
  const a = [["rem", 0, 60], ["deep", 60, 180], ["core", 180, 240], ["core", 240, 420]].map(([stage, from, to], index) =>
    stored({ id: uuid(idBase + index), source: "oura", stage, start: at(from, base), end: at(to, base) },
      { purpose: "validation_only", batchId: `batch-${day}-1`, receivedAt: "2026-10-02T14:34:00.000Z" }));
  const b = [["core", 0, 60], ["core", 60, 120], ["rem", 120, 240], ["deep", 240, 420]].map(([stage, from, to], index) =>
    stored({ id: uuid(idBase + 100 + index), source: "oura", stage, start: at(from, base), end: at(to, base) },
      { purpose: "validation_only", batchId: `batch-${day}-2`, receivedAt: "2026-10-02T14:45:00.000Z" }));
  return { a, b };
}

function storedDays(samples, preference) {
  return [...canonicalizeHealthKitSleep({ samples, preference })].map(([sleepDay, content]) =>
    ({ ...buildHealthKitSleepDayPayload({ content, existing: null, ownerUserId: OWNER, sleepDay, computedAt: "2026-10-02T14:45:01.000Z" }) }));
}

function setup({ samples, days = null, historicalDays = [], historicalSamples = [], algorithmPolicy = null } = {}) {
  const preferenceRecord = { id: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID, status: "enabled", schemaVersion: "healthkit-sleep-source-preference-v1", preferredSources: [{ sourceFamily: "oura" }] };
  const configuration = [
    { ...activationPolicy({ effectiveSleepDay: D0, mode: "validation_only" }), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID },
    preferenceRecord,
    ...(algorithmPolicy ? [{ ...algorithmPolicy, id: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID }] : []),
  ];
  const preference = preferring("oura");
  const store = createInMemoryCanonicalRecordStore({
    healthKitConfiguration: configuration,
    healthKitSleepSamples: samples,
    healthKitSleepDays: days ?? storedDays(samples, preference),
    healthKitSleepHistoricalEvidenceDays: historicalDays,
    healthKitSleepHistoricalEvidenceSamples: historicalSamples,
  });
  const authorization = { ownerUserId: OWNER, effectiveSleepDay: D0, authorizationReference: "test-authorization", maxDays: 7 };
  const day = (sleepDay = D0) => store.get({ ownerUserId: OWNER, collection: "healthKitSleepDays", recordId: getHealthKitSleepDayRecordId(sleepDay) });
  return { store, authorization, day, preference };
}

describe("sleep-canon-v3 bounded prospective activation", () => {
  it("dry run discovers exactly the prospective days, predicts v2 -> v3, and writes nothing", async () => {
    const { a, b } = spliceNight();
    const current = setup({ samples: [...a, ...b] });
    const before = current.store.getMutationCount();
    const result = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization });
    expect(result.outcome).toBe("dry_run");
    expect(result.facts.targetDays).toEqual([D0]);
    expect(result.ledger).toEqual([expect.objectContaining({
      sleepDay: D0, changed: true,
      before: expect.objectContaining({ algorithmVersion: "sleep-canon-v2", deepSeconds: 0 }),
      after: expect.objectContaining({ algorithmVersion: "sleep-canon-v3", deepSeconds: 180 * 60 }),
    })]);
    expect(current.store.getMutationCount()).toBe(before);
  });

  it("apply rewrites only the prospective day, keeps identity, stays quarantined, and leaves historical rows untouched", async () => {
    const { a, b } = spliceNight();
    const historicalSamples = [stored({ id: uuid(60_000), source: "oura", stage: "core", start: "2026-09-20T06:00:00.000Z", end: "2026-09-20T13:00:00.000Z" }, { purpose: "historical_evidence_import" })];
    const historicalDays = [{ id: "healthkit_sleep_day_2026-09-20", sleepDay: "2026-09-20", algorithmVersion: "sleep-canon-v2", inputDigest: "sha256_hist", revision: 1, ingestionPurpose: "historical_evidence_import" }];
    const current = setup({ samples: [...a, ...b], historicalDays, historicalSamples });
    const dryRun = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization });
    const before = await current.day();
    const historicalBefore = JSON.stringify(current.store.snapshot().healthKitSleepHistoricalEvidenceDays);
    const applied = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization, apply: true, expected: dryRun.facts });
    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.verification).every(Boolean)).toBe(true);
    const after = await current.day();
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after).toMatchObject({ algorithmVersion: "sleep-canon-v3", strategicEligible: false, ingestionPurpose: "validation_only" });
    expect(after.inputDigest).toBe(canonicalizeHealthKitSleepV3({ samples: [...a, ...b], preference: current.preference }).get(D0).inputDigest);
    expect(after.mainSleep.deepSeconds).toBe(180 * 60);
    expect(current.store.snapshot().healthKitSleepDays).toHaveLength(1);
    expect(JSON.stringify(current.store.snapshot().healthKitSleepHistoricalEvidenceDays)).toBe(historicalBefore);
    const policy = resolveHealthKitSleepCanonicalAlgorithmPolicy(await current.store.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID }));
    expect(policy).toMatchObject({ enabled: true, algorithmVersion: "sleep-canon-v3", effectiveSleepDay: D0 });
    // Idempotent: the same activation again is already applied and writes nothing.
    const again = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization });
    expect(again.outcome).toBe("already_applied");
    // Evidence serves the corrected stages for a v3 row.
    const evidence = createHealthKitSleepEvidenceReadService({ store: { listDays: async () => current.store.snapshot().healthKitSleepDays } });
    const night = await evidence.night({ ownerUserId: OWNER, sleepDay: D0 });
    expect(night).toMatchObject({ algorithmVersion: "sleep-canon-v3", stageStatus: "available", strategicEligible: false, strategicUse: "quarantined" });
    expect(night.stages.deepSeconds).toBe(180 * 60);
  });

  it("refuses apply when production drifted since the dry run (a new sample arrived)", async () => {
    const { a, b } = spliceNight();
    const current = setup({ samples: [...a, ...b] });
    const dryRun = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization });
    await current.store.put({ ownerUserId: OWNER, collection: "healthKitSleepSamples", recordId: "late", payload: stored({ id: uuid(61_000), source: "oura", stage: "awake", start: at(420), end: at(425) }, { purpose: "validation_only" }) });
    const mutations = current.store.getMutationCount();
    const refused = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization, apply: true, expected: dryRun.facts });
    expect(refused).toMatchObject({ outcome: "refused", reason: "production_drifted_since_dry_run" });
    expect(current.store.getMutationCount()).toBe(mutations);
  });

  it("stops before mutation when more than the bounded prospective days are selected", async () => {
    const first = spliceNight();
    const second = spliceNight(START + 86_400_000, 52_000, "b");
    const current = setup({ samples: [...first.a, ...first.b, ...second.a, ...second.b] });
    const result = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: { ...current.authorization, maxDays: 1 } });
    expect(result).toMatchObject({ outcome: "refused", reason: "prospective_day_bound_exceeded" });
    expect(result.facts.targetDays).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("refuses without the authorization reference, and when D0 is not the enabled prospective day", async () => {
    const { a, b } = spliceNight();
    const current = setup({ samples: [...a, ...b] });
    const dryRun = await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: current.authorization });
    expect(await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: { ...current.authorization, authorizationReference: "" }, apply: true, expected: dryRun.facts }))
      .toMatchObject({ outcome: "refused", reason: "authorization_reference_required" });
    expect(await runHealthKitSleepCanonV3Activation({ records: current.store, authorization: { ...current.authorization, effectiveSleepDay: "2026-09-01" } }))
      .toMatchObject({ outcome: "refused", reason: "prospective_activation_d0_mismatch" });
  });
});

describe("sleep-canon-v3 ingest selection", () => {
  const nightWire = (overrides = {}) => wire({ source: "oura", stage: "core", start: "2026-10-01T23:00:00-07:00", end: "2026-10-02T06:00:00-07:00", ...overrides });
  function ingestSetup(algorithmPolicy = null) {
    const configuration = [
      { ...activationPolicy({ effectiveSleepDay: D0, mode: "validation_only" }), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID },
      ...(algorithmPolicy ? [{ ...algorithmPolicy, id: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID }] : []),
    ];
    const store = createInMemoryCanonicalRecordStore({ healthKitConfiguration: configuration });
    const port = createHealthKitSleepIngestPort({ records: store, now: () => new Date("2026-10-02T15:00:00.000Z") });
    return { store, run: (payload) => port({ payload, ownerUserId: OWNER, principal: { deviceId: "device-synthetic" }, metadata: {} }) };
  }
  const v3Policy = { status: "enabled", schemaVersion: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_SCHEMA_VERSION, algorithmVersion: "sleep-canon-v3", effectiveSleepDay: D0, scope: "ordinary_prospective_only" };

  it("without the canonical-algorithm policy, ordinary ingestion stays sleep-canon-v2 (dormant deploy)", async () => {
    const current = ingestSetup();
    await current.run({ batchId: "b1", samples: [nightWire()] });
    expect(current.store.snapshot().healthKitSleepDays[0]).toMatchObject({ sleepDay: D0, algorithmVersion: "sleep-canon-v2" });
  });

  it("with the policy enabled, ordinary days on or after its effective day are computed with sleep-canon-v3", async () => {
    const current = ingestSetup(v3Policy);
    await current.run({ batchId: "b1", samples: [nightWire()] });
    expect(current.store.snapshot().healthKitSleepDays[0]).toMatchObject({ sleepDay: D0, algorithmVersion: "sleep-canon-v3", strategicEligible: false });
  });

  it("an invalid or disabled policy fails closed to sleep-canon-v2", async () => {
    for (const record of [{ ...v3Policy, status: "disabled" }, { ...v3Policy, algorithmVersion: "sleep-canon-v9" }, { ...v3Policy, scope: "everything" }]) {
      expect(resolveHealthKitSleepCanonicalAlgorithmPolicy(record)).toMatchObject({ enabled: false, algorithmVersion: "sleep-canon-v2" });
    }
  });

  it("historical Sleep import is pinned to sleep-canon-v2 even when v3 is enabled", async () => {
    const configuration = [{ ...v3Policy, id: HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID }];
    const store = createInMemoryCanonicalRecordStore({ healthKitConfiguration: configuration });
    const port = createHealthKitSleepHistoricalEvidenceImportPort({ records: store, now: () => new Date("2026-10-01T05:00:00.000Z") });
    await port({
      ownerUserId: OWNER, principal: { deviceId: "device-synthetic" }, metadata: {},
      payload: { runId: "sleep-evidence-2026-07-06-through-2026-10-06-v1", batchId: "h1", samples: [wire({ source: "oura", stage: "core", start: "2026-09-19T23:00:00-07:00", end: "2026-09-20T06:00:00-07:00" })] },
    });
    const days = store.snapshot().healthKitSleepHistoricalEvidenceDays ?? [];
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((day) => day.algorithmVersion === "sleep-canon-v2")).toBe(true);
  });
});
