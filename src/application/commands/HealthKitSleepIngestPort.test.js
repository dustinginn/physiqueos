import { describe, expect, it } from "vitest";
import { createHealthKitSleepIngestPort } from "./HealthKitSleepIngestPort.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION,
} from "../../domain/services/HealthKitSleepPolicies.js";
import { getHealthKitSleepDayRecordId, getHealthKitSleepSampleRecordId } from "../../domain/services/HealthKitSleepContract.js";
import { canonicalizeHealthKitSleep } from "../../domain/services/HealthKitSleepCanonicalizer.js";
import { OWNER, activationPolicy, stored, uuid, wire } from "../../testSupport/healthKitSleepSynthetic.js";

const DAY = "2026-09-11";
const H = 3600;

function setup({ policy = activationPolicy(), preference = null, seed = [] } = {}) {
  const configuration = [];
  if (policy) configuration.push({ ...policy, id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID });
  if (preference) configuration.push({ ...preference, id: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_POLICY_RECORD_ID });
  const store = createInMemoryCanonicalRecordStore({ healthKitConfiguration: configuration, healthKitSleepSamples: seed });
  const reads = [];
  // Records every read so the tests can prove the scope of each command.
  const traced = (method) => (input) => {
    reads.push({ method, collection: input.collection, startDate: input.startDate, endDate: input.endDate });
    return store[method](input);
  };
  const records = {
    ...store,
    get: traced("get"),
    list: traced("list"),
    listByOccurrenceDateRange: traced("listByOccurrenceDateRange"),
    listStorageMetadata: traced("listStorageMetadata"),
  };
  let tick = 0;
  const port = createHealthKitSleepIngestPort({ records, now: () => new Date(Date.parse("2026-09-11T20:00:00.000Z") + (tick += 1) * 1000) });
  const run = (payload) => port({ payload, ownerUserId: OWNER, principal: { deviceId: "device-synthetic" }, metadata: {} });
  const day = async (sleepDay = DAY) => store.get({ ownerUserId: OWNER, collection: "healthKitSleepDays", recordId: getHealthKitSleepDayRecordId(sleepDay) });
  const sample = async (id) => store.get({ ownerUserId: OWNER, collection: "healthKitSleepSamples", recordId: getHealthKitSleepSampleRecordId(OWNER, id) });
  return { store, reads, run, day, sample };
}

const nightWire = (overrides = {}) => wire({ source: "watch", stage: "core", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00", ...overrides });
const canonicalContent = (record) => {
  const { computedAt, revision, version, ...content } = record ?? {};
  return content;
};

describe("healthkit.sleep.ingest.v1 dormancy", () => {
  it("absent policy = OFF: 409 before anything is stored", async () => {
    const current = setup({ policy: null });
    await expect(current.run({ batchId: "b1", samples: [nightWire()] }))
      .rejects.toMatchObject({ status: 409, code: "HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED" });
    expect(current.store.getMutationCount()).toBe(0);
    expect(current.store.snapshot().healthKitSleepSamples).toEqual([]);
    expect(current.store.snapshot().healthKitSleepDays).toBeUndefined();
  });

  it("a malformed policy is OFF too", async () => {
    const current = setup({ policy: activationPolicy({ historicalBackfill: true }) });
    await expect(current.run({ batchId: "b1", samples: [nightWire()] })).rejects.toMatchObject({ status: 409 });
    expect(current.store.snapshot().healthKitSleepSamples).toEqual([]);
  });

  it("private fields reject the whole request with nothing stored", async () => {
    const current = setup();
    await expect(current.run({ batchId: "b1", samples: [nightWire({ extra: { sourceName: "A Person's Watch" } })] }))
      .rejects.toMatchObject({ status: 400, code: "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED" });
    expect(current.store.snapshot().healthKitSleepSamples).toEqual([]);
  });
});

describe("healthkit.sleep.ingest.v1 storage, idempotency and revision", () => {
  it("stores samples, computes the canonical day, and never reads the generic observation collection", async () => {
    const current = setup();
    const outcome = await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    expect(outcome.result.samples).toEqual([{ externalId: uuid(1), outcome: "stored" }]);
    expect(outcome.result.sleepDays).toEqual([{ sleepDay: DAY, revision: 1 }]);
    expect(outcome.result.strategicEvidenceEligibility).toBe("quarantined");
    const day = await current.day();
    expect(day).toMatchObject({ sleepDay: DAY, revision: 1, occurrenceDate: DAY, mainSleep: { asleepSeconds: 8 * H } });
    expect(day.evidenceEligibility).toMatchObject({ state: "quarantined", strategic: false });
    expect(current.reads.every((read) => read.collection !== "healthKitObservations")).toBe(true);
    expect(current.reads.some((read) => read.method === "list")).toBe(false);
    const ranges = current.reads.filter((read) => read.method === "listByOccurrenceDateRange");
    expect(ranges.every((read) => ["healthKitSleepSamples", "healthKitSleepDays"].includes(read.collection))).toBe(true);
    // Touched days 09-09..09-13 (end day 09-11 +-2): samples read +-1 around
    // them, stored days +-2 more. Bounded, never the whole history.
    expect(ranges).toEqual([
      { method: "listByOccurrenceDateRange", collection: "healthKitSleepSamples", startDate: "2026-09-08", endDate: "2026-09-14" },
      { method: "listByOccurrenceDateRange", collection: "healthKitSleepDays", startDate: "2026-09-06", endDate: "2026-09-16" },
    ]);
  });

  it("#16 duplicate delivery is a no-op (same batch twice; same sample in two batches)", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    const before = await current.day();
    const again = await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    const other = await current.run({ batchId: "b2", samples: [nightWire({ id: uuid(1) }), nightWire({ id: uuid(1) })] });
    expect(again.result.samples).toEqual([{ externalId: uuid(1), outcome: "replayed" }]);
    expect(other.result.samples.map((item) => item.outcome)).toEqual(["replayed", "replayed"]);
    expect(again.result.sleepDays).toEqual([]);
    expect(await current.day()).toEqual(before);
  });

  it("#18 same UUID with conflicting content refuses only that sample; the batch still commits", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    const outcome = await current.run({ batchId: "b2", samples: [
      nightWire({ id: uuid(1), stage: "deep" }),
      wire({ id: uuid(2), source: "watch", stage: "core", start: "2026-09-11T14:00:00-07:00", end: "2026-09-11T15:00:00-07:00" }),
    ] });
    expect(outcome.result.samples[0]).toMatchObject({ externalId: uuid(1), outcome: "refused_identity_conflict", incomingContentDigest: expect.stringMatching(/^sha256_/) });
    expect(outcome.result.samples[1]).toEqual({ externalId: uuid(2), outcome: "stored" });
    expect((await current.sample(uuid(1))).stage).toBe("asleep_core");
    expect((await current.day()).episodes).toHaveLength(2);
    expect(JSON.stringify(outcome.result)).not.toMatch(/2026-09-1\dT/);
  });

  it("#14 deletion marks the sample deleted, recomputes the day, and replays as a no-op", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [
      nightWire({ id: uuid(1) }),
      wire({ id: uuid(2), source: "watch", stage: "core", start: "2026-09-11T14:00:00-07:00", end: "2026-09-11T15:00:00-07:00" }),
    ] });
    const deleted = await current.run({ batchId: "b2", deletions: [{ externalId: uuid(2) }] });
    expect(deleted.result.deletions).toEqual([{ externalId: uuid(2), outcome: "deleted" }]);
    expect(await current.sample(uuid(2))).toMatchObject({ status: "deleted", lifecycle: { state: "deleted", deletionSource: "hk_deleted_object" } });
    const day = await current.day();
    expect(day).toMatchObject({ revision: 2, episodes: [expect.objectContaining({ kind: "main" })] });
    const replay = await current.run({ batchId: "b3", deletions: [{ externalId: uuid(2) }] });
    expect(replay.result.deletions).toEqual([{ externalId: uuid(2), outcome: "already_deleted" }]);
    expect(replay.result.sleepDays).toEqual([]);
  });

  it("#15 revision (delete old UUID + add new UUID) converges to the new totals; digest changes once", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    const first = await current.day();
    const revised = await current.run({ batchId: "b2", deletions: [{ externalId: uuid(1) }], samples: [
      nightWire({ id: uuid(3), end: "2026-09-11T06:00:00-07:00" }),
    ] });
    expect(revised.result.sleepDays).toEqual([{ sleepDay: DAY, revision: 2 }]);
    const second = await current.day();
    expect(second.mainSleep.asleepSeconds).toBe(7 * H);
    expect(second.inputDigest).not.toBe(first.inputDigest);
    expect((await current.run({ batchId: "b3", samples: [nightWire({ id: uuid(3), end: "2026-09-11T06:00:00-07:00" })] })).result.sleepDays).toEqual([]);
  });

  it("deleting every sample leaves an explicit empty day (no stale totals)", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    await current.run({ batchId: "b2", deletions: [{ externalId: uuid(1) }] });
    expect(await current.day()).toMatchObject({ status: "no_sleep_recorded", episodes: [], mainSleep: null, revision: 2 });
  });

  it("#17 out-of-order delivery converges to identical canonical content", async () => {
    const add = { batchId: "add", samples: [nightWire({ id: uuid(1) }), wire({ id: uuid(2), source: "oura", start: "2026-09-10T22:40:00-07:00", end: "2026-09-11T07:10:00-07:00" })] };
    const stages = { batchId: "stages", samples: [wire({ id: uuid(3), source: "oura", stage: "deep", start: "2026-09-11T01:00:00-07:00", end: "2026-09-11T02:00:00-07:00" })] };
    const remove = { batchId: "remove", deletions: [{ externalId: uuid(1) }] };
    const orders = [[add, stages, remove], [remove, stages, add], [stages, remove, add], [add, remove, stages]];
    const finals = [];
    for (const order of orders) {
      const current = setup();
      for (const payload of order) await current.run(payload);
      finals.push(canonicalContent(await current.day()));
      // A deletion that arrived first leaves the late sample deleted.
      expect((await current.sample(uuid(1))).lifecycle.state).toBe("deleted");
    }
    for (const final of finals.slice(1)) expect(final).toEqual(finals[0]);
    expect(finals[0].mainSleep).toMatchObject({ deepSeconds: H });
    expect(finals[0].episodes[0].primarySource.sourceFamily).toBe("oura");
  });

  it("a deletion for an unknown UUID is tombstoned; the late add stays deleted and never counts", async () => {
    const current = setup();
    const tomb = await current.run({ batchId: "b1", deletions: [{ externalId: uuid(9) }] });
    expect(tomb.result.deletions).toEqual([{ externalId: uuid(9), outcome: "tombstoned" }]);
    const late = await current.run({ batchId: "b2", samples: [nightWire({ id: uuid(9) })] });
    expect(late.result.samples).toEqual([{ externalId: uuid(9), outcome: "deleted_before_arrival" }]);
    expect(await current.day()).toBeNull();
  });
});

describe("activation floor, purpose, preference", () => {
  it("#22 samples ending before the prospective floor are refused and never stored; a straddling sample is kept", async () => {
    const current = setup();
    const outcome = await current.run({ batchId: "b1", samples: [
      wire({ id: uuid(1), source: "watch", stage: "core", start: "2026-09-08T23:00:00-07:00", end: "2026-09-09T07:00:00-07:00" }),
      wire({ id: uuid(2), source: "watch", stage: "core", start: "2026-09-09T17:00:00-07:00", end: "2026-09-09T19:00:00-07:00" }),
    ] });
    expect(outcome.result.samples).toEqual([
      { externalId: uuid(1), outcome: "refused_before_activation_floor" },
      { externalId: uuid(2), outcome: "stored" },
    ]);
    expect(await current.sample(uuid(1))).toBeNull();
    expect(await current.day("2026-09-09")).toBeNull();
    expect(await current.day("2026-09-10")).toMatchObject({ mainSleep: { asleepSeconds: 2 * H } });
  });

  it("validation_only mode marks samples and days validation_only", async () => {
    const current = setup({ policy: activationPolicy({ mode: "validation_only" }) });
    const outcome = await current.run({ batchId: "b1", samples: [nightWire({ id: uuid(1) })] });
    expect(outcome.result.ingestionPurpose).toBe("validation_only");
    expect(await current.sample(uuid(1))).toMatchObject({ ingestionPurpose: "validation_only" });
    expect(await current.day()).toMatchObject({ ingestionPurpose: "validation_only" });
  });

  it("the stored preference policy drives the primary lane (no hard-coded source)", async () => {
    const both = [nightWire({ id: uuid(1), start: "2026-09-10T22:00:00-07:00" }), wire({ id: uuid(2), source: "oura", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00" })];
    const generic = setup();
    await generic.run({ batchId: "b1", samples: both });
    expect((await generic.day()).episodes[0].primarySource.sourceFamily).toBe("apple_watch");
    const preferred = setup({ preference: {
      status: "enabled", schemaVersion: HEALTHKIT_SLEEP_SOURCE_PREFERENCE_SCHEMA_VERSION, preferredSources: [{ sourceFamily: "oura" }],
    } });
    await preferred.run({ batchId: "b1", samples: both });
    const day = await preferred.day();
    expect(day.episodes[0].primarySource.sourceFamily).toBe("oura");
    expect(day.inputSampleIds).toHaveLength(2);
  });
});

describe("#21 recent-window live-ID manifest", () => {
  it("marks only missing live samples inside the window and after the floor as deleted(window_manifest)", async () => {
    const beforeFloor = stored({ id: uuid(50), source: "watch", stage: "core", start: "2026-09-09T15:00:00-07:00", end: "2026-09-09T17:30:00-07:00" });
    const current = setup({ seed: [beforeFloor] });
    await current.run({ batchId: "b1", samples: [
      nightWire({ id: uuid(1) }),
      wire({ id: uuid(2), source: "watch", stage: "core", start: "2026-09-11T14:00:00-07:00", end: "2026-09-11T15:00:00-07:00" }),
      wire({ id: uuid(3), source: "watch", stage: "core", start: "2026-09-13T23:00:00-07:00", end: "2026-09-14T07:00:00-07:00" }),
    ] });
    const outcome = await current.run({ batchId: "b2", windowManifest: {
      windowStart: "2026-09-09T00:00:00-07:00", windowEnd: "2026-09-12T00:00:00-07:00", liveExternalIds: [uuid(1)],
    } });
    expect(outcome.result.windowManifest.markedDeleted).toBe(1);
    expect(await current.sample(uuid(2))).toMatchObject({ lifecycle: { state: "deleted", deletionSource: "window_manifest" } });
    expect((await current.sample(uuid(1))).lifecycle.state).toBe("live");
    expect((await current.sample(uuid(3))).lifecycle.state).toBe("live");
    expect((await current.sample(uuid(50))).lifecycle.state).toBe("live");
    expect((await current.day()).episodes).toHaveLength(1);
    const replay = await current.run({ batchId: "b3", windowManifest: {
      windowStart: "2026-09-09T00:00:00-07:00", windowEnd: "2026-09-12T00:00:00-07:00", liveExternalIds: [uuid(1)],
    } });
    expect(replay.result).toMatchObject({ windowManifest: { markedDeleted: 0 }, sleepDays: [] });
  });
});

// Stored days must always equal a fresh canonicalization of every stored
// sample: no stale day, no episode counted on two days.
function expectStoredDaysMatchFreshCanonicalization(current) {
  const snapshot = current.store.snapshot();
  const fresh = canonicalizeHealthKitSleep({ samples: snapshot.healthKitSleepSamples ?? [] });
  const storedDays = (snapshot.healthKitSleepDays ?? []).filter((day) => day.episodes.length > 0);
  expect(storedDays.map((day) => day.sleepDay).sort()).toEqual([...fresh.keys()].sort());
  for (const day of storedDays) {
    expect(day.inputDigest).toBe(fresh.get(day.sleepDay).inputDigest);
  }
}

describe("review regressions", () => {
  it("a zero-length asleep sample commits instead of wedging the batch", async () => {
    const current = setup();
    const outcome = await current.run({ batchId: "b1", samples: [
      wire({ id: uuid(1), source: "watch", stage: "core", start: "2026-09-11T03:00:00-07:00", end: "2026-09-11T03:00:00-07:00" }),
      wire({ id: uuid(2), source: "watch", stage: "awake", start: "2026-09-11T03:00:00-07:00", end: "2026-09-11T03:10:00-07:00" }),
    ] });
    expect(outcome.result.samples.map((item) => item.outcome)).toEqual(["stored", "stored"]);
    expect(await current.day()).toBeNull();
    expectStoredDaysMatchFreshCanonicalization(current);
  });

  it("a long sample that merges into an earlier day's episode rewrites that day (no stale day, no double count)", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [
      wire({ id: uuid(1), source: "watch", stage: "core", start: "2026-09-13T13:00:00-07:00", end: "2026-09-13T17:30:00-07:00" }),
    ] });
    expect(await current.day("2026-09-13")).toMatchObject({ mainSleep: { asleepSeconds: 4.5 * H } });
    await current.run({ batchId: "b2", samples: [
      wire({ id: uuid(2), source: "watch", stage: "unspecified", start: "2026-09-13T18:15:00-07:00", end: "2026-09-14T18:10:00-07:00" }),
    ] });
    expect(await current.day("2026-09-13")).toMatchObject({ status: "no_sleep_recorded", episodes: [], revision: 2 });
    expect((await current.day("2026-09-15")).episodes).toHaveLength(1);
    expectStoredDaysMatchFreshCanonicalization(current);
    // Deleting the bridge restores the earlier day.
    await current.run({ batchId: "b3", deletions: [{ externalId: uuid(2) }] });
    expect(await current.day("2026-09-13")).toMatchObject({ mainSleep: { asleepSeconds: 4.5 * H }, revision: 3 });
    expectStoredDaysMatchFreshCanonicalization(current);
  });

  it("deleting a bridging sample splits a chained episode across days correctly", async () => {
    const current = setup();
    await current.run({ batchId: "b1", samples: [
      wire({ id: uuid(1), source: "oura", start: "2026-09-12T08:00:00-07:00", end: "2026-09-12T17:00:00-07:00" }),
      wire({ id: uuid(2), source: "oura", start: "2026-09-12T17:30:00-07:00", end: "2026-09-13T10:00:00-07:00" }),
      wire({ id: uuid(3), source: "oura", start: "2026-09-13T10:30:00-07:00", end: "2026-09-14T09:00:00-07:00" }),
    ] });
    expectStoredDaysMatchFreshCanonicalization(current);
    await current.run({ batchId: "b2", deletions: [{ externalId: uuid(2) }] });
    expectStoredDaysMatchFreshCanonicalization(current);
    await current.run({ batchId: "b3", deletions: [{ externalId: uuid(1) }, { externalId: uuid(3) }] });
    expectStoredDaysMatchFreshCanonicalization(current);
    expect(current.store.snapshot().healthKitSleepDays.every((day) => day.episodes.length === 0)).toBe(true);
  });

  async function convergenceWorlds({ seed: initial, zones, maxSlots, worlds, steps }) {
    let seed = initial;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const sources = ["watch", "oura", "sleepCycle", "manual", "iphone"];
    const stages = ["inBed", "unspecified", "awake", "core", "deep", "rem"];
    let populatedChecks = 0;
    for (let world = 0; world < worlds; world += 1) {
      const current = setup();
      const live = [];
      let next = 0;
      for (let step = 0; step < steps; step += 1) {
        const roll = random();
        if (roll < 0.6 || live.length === 0) {
          const samples = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
            const startMs = Date.parse("2026-09-10T12:00:00Z") + Math.floor(random() * 96) * 30 * 60 * 1000;
            const durationMs = (1 + Math.floor(random() * maxSlots)) * 20 * 60 * 1000;
            const id = uuid(100000 + world * 1000 + (next += 1));
            live.push(id);
            return wire({
              id,
              source: sources[Math.floor(random() * sources.length)],
              stage: stages[Math.floor(random() * stages.length)],
              start: new Date(startMs).toISOString(),
              end: new Date(startMs + durationMs).toISOString(),
              timeZone: zones[Math.floor(random() * zones.length)],
              timeZoneSource: random() < 0.5 ? "sample_metadata" : "device_at_ingest",
            });
          });
          await current.run({ batchId: `w${world}-s${step}`, samples });
        } else if (roll < 0.85) {
          const id = live.splice(Math.floor(random() * live.length), 1)[0];
          await current.run({ batchId: `w${world}-d${step}`, deletions: [{ externalId: id }] });
        } else {
          const keep = live.filter(() => random() < 0.7);
          await current.run({ batchId: `w${world}-m${step}`, windowManifest: {
            windowStart: "2026-09-10T00:00:00Z", windowEnd: "2026-09-14T00:00:00Z", liveExternalIds: keep,
          } });
          live.splice(0, live.length, ...keep);
        }
        expectStoredDaysMatchFreshCanonicalization(current);
        if ((current.store.snapshot().healthKitSleepDays ?? []).some((day) => day.episodes.length > 1)) populatedChecks += 1;
      }
    }
    return populatedChecks;
  }

  it("randomized adds, deletions and manifests converge to a fresh canonicalization (seeded, LA/NY, <=10 h)", async () => {
    const populated = await convergenceWorlds({ seed: 20260930, zones: ["America/Los_Angeles", "America/New_York"], maxSlots: 30, worlds: 6, steps: 14 });
    expect(populated).toBeGreaterThan(10);
  });

  it("converges across extreme zone skew and 24 h samples (LA/Tokyo, Kiritimati/Pago Pago/UTC)", async () => {
    for (const [seed, zones] of [
      [7, ["America/Los_Angeles", "Asia/Tokyo"]],
      [11, ["America/Los_Angeles", "Asia/Tokyo"]],
      [7, ["America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]],
      [23, ["America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]],
    ]) {
      const populated = await convergenceWorlds({ seed, zones, maxSlots: 72, worlds: 8, steps: 16 });
      expect(populated).toBeGreaterThan(2);
    }
  }, 120000);

  it("an in-batch repeat mirrors the first copy's refusal instead of reporting replayed", async () => {
    const current = setup();
    const early = wire({ id: uuid(1), source: "watch", stage: "core", start: "2026-09-08T23:00:00-07:00", end: "2026-09-09T07:00:00-07:00" });
    const outcome = await current.run({ batchId: "b1", samples: [early, early] });
    expect(outcome.result.samples.map((item) => item.outcome)).toEqual(["refused_before_activation_floor", "refused_before_activation_floor"]);
  });
});
