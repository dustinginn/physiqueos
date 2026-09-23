import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { normalizeHealthKitObservationBatch } from "./HealthKitObservationService.js";
import { isHealthKitDerivedRecord } from "./HealthKitEvidenceEligibilityPolicy.js";
import { reconcileHealthKitCanonicalWorkout } from "./HealthKitWorkoutService.js";
import {
  HealthKitStrengthMatchOutcome as Outcome,
  assessHealthKitStrengthLinkCandidates,
  createHealthKitWorkoutLinkCandidate,
} from "./HealthKitWorkoutLinkService.js";
import {
  confirmHealthKitWorkoutRelationship,
  findHealthKitWorkoutRelationshipViolations,
  getHealthKitWorkoutLinkClaimId,
  unlinkHealthKitWorkoutRelationship,
} from "./HealthKitWorkoutRelationshipService.js";

const OWNER = "user_founder_001";
const DAY = "2026-09-25";
const T0 = "2026-09-25T20:00:00.000Z";
const FOUNDER = { kind: "founder", ref: "confirm" };

describe("guarded relationship confirmation", () => {
  it("confirms a candidate, holds one claim per side, and leaves the Logger session and Training state untouched", async () => {
    const { records, w1, link } = await world({ sessions: [session("S1", "10:01", "10:59")], workouts: [["u1", "10:00", "11:00"]] });
    const before = records.snapshot();
    const result = await confirm(records, link("u1", "S1"));
    expect(result.outcome).toBe("confirmed");
    expect(result.link).toMatchObject({ status: "confirmed", contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" } });
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
    expect(after.healthKitWorkoutLinkClaims.map((claim) => claim.holderLinkId)).toEqual([result.link.id, result.link.id]);
    for (const name of ["canonicalEvidenceObjects", "trainingPerformanceEvents", "canonicalExerciseLibrary", "healthKitCanonicalWorkouts"]) {
      expect(after[name]).toEqual(before[name]);
    }
    expect(w1("u1").id).toBe(result.link.canonicalWorkoutId);
  });

  it("is idempotent for an already confirmed link", async () => {
    const { records, link } = await world({ sessions: [session("S1", "10:01", "10:59")], workouts: [["u1", "10:00", "11:00"]] });
    const first = await confirm(records, link("u1", "S1"));
    const again = await confirm(records, link("u1", "S1"));
    expect(again.outcome).toBe("already_confirmed");
    expect(again.link).toEqual(first.link);
    expect(records.snapshot().healthKitWorkoutLinkClaims).toHaveLength(2);
  });

  it("refuses a second Apple workout for one Logger session (Logger -> HealthKit one-to-one)", async () => {
    const { records, link } = await world({
      sessions: [session("S1", "10:00", "11:00")],
      workouts: [["u1", "10:00", "10:30"], ["u2", "10:30", "11:00"]],
      extraLinks: [["u1", "S1"], ["u2", "S1"]],
    });
    await confirm(records, link("u1", "S1"));
    await expect(confirm(records, link("u2", "S1"))).rejects.toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
    expect((await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link("u2", "S1") })).status).toBe("candidate");
    expect(records.snapshot().healthKitWorkoutLinkClaims).toHaveLength(2);
  });

  it("refuses a second Logger session for one Apple workout (HealthKit -> Logger one-to-one)", async () => {
    const { records, link } = await world({
      sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")],
      workouts: [["u1", "10:00", "11:00"]],
      extraLinks: [["u1", "S1"], ["u1", "S2"]],
    });
    await confirm(records, link("u1", "S1"));
    await expect(confirm(records, link("u1", "S2"))).rejects.toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
    expect(records.snapshot().healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
  });

  it("refuses a re-created HealthKit UUID (same physical workout) that tries a second relationship", async () => {
    const { records, link } = await world({
      sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")],
      workouts: [["original", "10:00", "11:00"], ["recreated", "10:00", "11:00"]],
      extraLinks: [["original", "S1"], ["recreated", "S2"], ["recreated", "S1"]],
    });
    await confirm(records, link("original", "S1"));
    await expect(confirm(records, link("recreated", "S2"))).rejects.toMatchObject({ code: "LINK_DUPLICATE_GROUP_CONFLICT" });
    // the same session through the re-created record is refused too
    await expect(confirm(records, link("recreated", "S1"))).rejects.toMatchObject({ code: expect.stringMatching(/LINK_(ONE_TO_ONE_VIOLATION|DUPLICATE_GROUP_CONFLICT)/) });
    expect(findHealthKitWorkoutRelationshipViolations({ links: records.snapshot().healthKitWorkoutLinks, claims: records.snapshot().healthKitWorkoutLinkClaims }))
      .toMatchObject({ workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0 });
  });

  it("refuses a stale candidate after another relationship has won, and never overwrites the established link", async () => {
    const { records, link } = await world({
      sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")],
      workouts: [["u1", "10:00", "11:00"]],
      extraLinks: [["u1", "S1"], ["u1", "S2"]],
    });
    const won = await confirm(records, link("u1", "S1"));
    await expect(confirm(records, link("u1", "S2"))).rejects.toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
    const established = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link("u1", "S1") });
    expect(established).toEqual(won.link);
  });

  it("refuses to confirm against a Logger session that is no longer an active strength session, or a missing workout", async () => {
    const { records, link } = await world({ sessions: [session("S1", "10:01", "10:59")], workouts: [["u1", "10:00", "11:00"]] });
    const s1 = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "S1" });
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "S1", expectedVersion: s1.version, payload: { ...s1, quality: { status: "superseded" } } });
    await expect(confirm(records, link("u1", "S1"))).rejects.toMatchObject({ code: "LINK_SESSION_UNAVAILABLE" });
    await expect(confirm(records, "healthkit_workout_link_missing")).rejects.toMatchObject({ code: "LINK_NOT_FOUND" });
    expect(records.snapshot().healthKitWorkoutLinkClaims).toEqual([]);
  });

  it("unlink releases the claims without deleting anything, and a relink or another link can then take them", async () => {
    const { records, link } = await world({
      sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")],
      workouts: [["u1", "10:00", "11:00"]],
      extraLinks: [["u1", "S1"], ["u1", "S2"]],
    });
    await confirm(records, link("u1", "S1"));
    const off = await unlinkHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId: link("u1", "S1"), by: FOUNDER, now: T0, reason: "wrong session" });
    expect(off.link.status).toBe("unlinked");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts).toHaveLength(1);
    expect(snapshot.canonicalEvidenceObjects).toHaveLength(2);
    expect(snapshot.healthKitWorkoutLinkClaims.every((claim) => claim.status === "released")).toBe(true);
    // the other session can now win the same Apple workout
    await confirm(records, link("u1", "S2"));
    // and the first can no longer be relinked over it
    await expect(confirm(records, link("u1", "S1"))).rejects.toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
    // after unlinking the second, the first can be relinked
    await unlinkHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId: link("u1", "S2"), by: FOUNDER, now: T0 });
    const relinked = await confirm(records, link("u1", "S1"));
    expect(relinked.link.statusHistory.map((entry) => entry.status)).toEqual(["candidate", "confirmed", "unlinked", "confirmed"]);
    expect(findHealthKitWorkoutRelationshipViolations({ links: records.snapshot().healthKitWorkoutLinks, claims: records.snapshot().healthKitWorkoutLinkClaims }))
      .toEqual({ workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0, confirmedLinksWithoutHeldClaims: 0, heldClaimsWithoutConfirmedLink: 0 });
  });

  it("is race-safe: two concurrent confirmations for one workout or one session can never both win", async () => {
    for (const shape of ["same-workout", "same-session"]) {
      const { records, link } = shape === "same-workout"
        ? await world({ sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")], workouts: [["u1", "10:00", "11:00"]], extraLinks: [["u1", "S1"], ["u1", "S2"]] })
        : await world({ sessions: [session("S1", "10:00", "11:00")], workouts: [["u1", "10:00", "10:30"], ["u2", "10:30", "11:00"]], extraLinks: [["u1", "S1"], ["u2", "S1"]] });
      const ids = shape === "same-workout" ? [link("u1", "S1"), link("u1", "S2")] : [link("u1", "S1"), link("u2", "S1")];
      const settled = await Promise.allSettled(ids.map((linkId) => confirm(records, linkId)));
      expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = settled.find((result) => result.status === "rejected");
      expect(rejected.reason).toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
      const snapshot = records.snapshot();
      expect(snapshot.healthKitWorkoutLinks.filter((item) => item.status === "confirmed")).toHaveLength(1);
      expect(findHealthKitWorkoutRelationshipViolations({ links: snapshot.healthKitWorkoutLinks, claims: snapshot.healthKitWorkoutLinkClaims }))
        .toMatchObject({ workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0, confirmedLinksWithoutHeldClaims: 0, heldClaimsWithoutConfirmedLink: 0 });
    }
  });

  it("keeps the durable claim as the arbiter even if the domain guard cannot see the conflict", async () => {
    // Two DIFFERENT physical workouts, two candidates on one session, evaluated concurrently:
    // both pass the domain guard (nothing confirmed yet); only the atomic claim row decides.
    const { records, link } = await world({
      sessions: [session("S1", "10:00", "11:00")],
      workouts: [["u1", "10:00", "10:30"], ["u2", "10:30", "11:00"]],
      extraLinks: [["u1", "S1"], ["u2", "S1"]],
    });
    const settled = await Promise.allSettled([confirm(records, link("u1", "S1")), confirm(records, link("u2", "S1"))]);
    expect(settled.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(records.snapshot().healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
  });

  it("holds under a store that returns object keys in jsonb order", async () => {
    const jsonbOrder = (value) => Array.isArray(value) ? value.map(jsonbOrder)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((key) => [key, jsonbOrder(value[key])]))
        : value;
    const { records: inner, link } = await world({ sessions: [session("S1", "10:01", "10:59"), session("S2", "10:02", "11:00")], workouts: [["u1", "10:00", "11:00"]], extraLinks: [["u1", "S1"], ["u1", "S2"]] });
    const records = { ...inner,
      get: async (i) => { const r = await inner.get(i); return r ? jsonbOrder(r) : r; },
      list: async (i) => (await inner.list(i)).map(jsonbOrder),
      putIfAbsent: async (i) => { const r = await inner.putIfAbsent(i); return { ...r, record: jsonbOrder(r.record) }; },
      put: async (i) => jsonbOrder(await inner.put(i)) };
    await confirmWith(records, link("u1", "S1"));
    await expect(confirmWith(records, link("u1", "S2"))).rejects.toMatchObject({ code: "LINK_ONE_TO_ONE_VIOLATION" });
  });

  it("reports stored violations without any write and treats claims as quarantined HealthKit records", async () => {
    const clean = findHealthKitWorkoutRelationshipViolations({ links: [], claims: [] });
    expect(clean).toEqual({ workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0, confirmedLinksWithoutHeldClaims: 0, heldClaimsWithoutConfirmedLink: 0 });
    const corrupt = findHealthKitWorkoutRelationshipViolations({
      links: [{ id: "a", status: "confirmed", canonicalWorkoutId: "w", loggerSessionCanonicalId: "s1" }, { id: "b", status: "confirmed", canonicalWorkoutId: "w", loggerSessionCanonicalId: "s2" }],
      claims: [{ id: "x", status: "held", holderLinkId: "gone" }],
    });
    expect(corrupt).toMatchObject({ workoutsWithMultipleConfirmedLinks: 1, confirmedLinksWithoutHeldClaims: 2, heldClaimsWithoutConfirmedLink: 1 });
    expect(isHealthKitDerivedRecord({ id: getHealthKitWorkoutLinkClaimId("workout", "healthkit_canonical_workout_x") })).toBe(true);
  });

  it("fails closed before any read without an attributable actor or a valid time", async () => {
    const { records, link } = await world({ sessions: [session("S1", "10:01", "10:59")], workouts: [["u1", "10:00", "11:00"]] });
    const before = records.snapshot();
    for (const by of [undefined, null, {}, { kind: "founder" }, { kind: "", ref: "x" }, "founder"]) {
      await expect(confirmHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId: link("u1", "S1"), by, now: T0 }))
        .rejects.toMatchObject({ code: "LINK_ACTOR_REQUIRED" });
    }
    for (const now of [undefined, null, "not-a-date", Number.NaN]) {
      await expect(confirmHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId: link("u1", "S1"), by: FOUNDER, now }))
        .rejects.toMatchObject({ code: "LINK_TIME_INVALID" });
    }
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
  });

  it("releases both freshly held claims when the link write itself conflicts, surfacing a typed conflict, never a half-held state", async () => {
    // Reviewer-noted gap: the compensation branch for a link-record version
    // conflict (e.g. the ingest matcher refreshed the candidate between our read
    // and our write) had no coverage. It must leave NO held claim behind.
    const { records, link } = await world({ sessions: [session("S1", "10:01", "10:59")], workouts: [["u1", "10:00", "11:00"]] });
    const linkId = link("u1", "S1");
    let armed = true;
    const racing = {
      ...records,
      async put(input) {
        if (armed && input.collection === "healthKitWorkoutLinks" && input.recordId === linkId) {
          armed = false;
          // Simulate the concurrent refresh: bump the stored version first, then
          // let the real store reject the stale expectedVersion.
          const current = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: linkId });
          await records.put({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: linkId, expectedVersion: current.version, payload: { ...current, confidence: 91 } });
        }
        return records.put(input);
      },
    };
    await expect(confirmWith(racing, linkId)).rejects.toMatchObject({ status: 409, code: "EXPECTED_VERSION_CONFLICT" });
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(0);
    expect(after.healthKitWorkoutLinkClaims.every((claim) => claim.status === "released" && claim.holderLinkId === linkId)).toBe(true);
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: linkId });
    expect(stored.status).toBe("candidate");
    expect(findHealthKitWorkoutRelationshipViolations({ links: after.healthKitWorkoutLinks, claims: after.healthKitWorkoutLinkClaims }))
      .toEqual({ workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0, confirmedLinksWithoutHeldClaims: 0, heldClaimsWithoutConfirmedLink: 0 });
    // The released claims are reusable: a retry against the refreshed record confirms cleanly.
    const retry = await confirm(records, linkId);
    expect(retry.outcome).toBe("confirmed");
    expect(records.snapshot().healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
  });
});

async function confirm(records, linkId) {
  return confirmWith(records, linkId);
}
function confirmWith(records, linkId) {
  return confirmHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId, by: FOUNDER, now: T0 });
}

// A world with canonical Apple workouts, Logger sessions, and candidate links.
async function world({ sessions = [], workouts = [], extraLinks = null } = {}) {
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, version: 1 }],
    canonicalEvidenceObjects: sessions,
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    trainingPerformanceEvents: [{ id: "sentinel", version: 1 }],
    canonicalExerciseLibrary: [{ id: "sentinel", version: 1 }],
  });
  const byUuid = new Map();
  for (const [uuid, start, end] of workouts) {
    const record = canonicalWorkout(uuid, start, end);
    const saved = await records.putIfAbsent({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts", recordId: record.id, payload: record });
    byUuid.set(uuid, saved.record);
  }
  const linkIds = new Map();
  const pairs = extraLinks ?? workouts.flatMap(([uuid]) => sessions.map((s) => [uuid, s.canonicalId]));
  for (const [uuid, sessionId] of pairs) {
    const workout = byUuid.get(uuid);
    const candidate = createHealthKitWorkoutLinkCandidate({
      canonicalWorkout: workout,
      assessment: { outcome: Outcome.POSSIBLE, matcherVersion: "test", candidates: [{ loggerSessionCanonicalId: sessionId, confidence: 90, reasons: ["test"], basis: "temporal_and_telemetry" }] },
      ownerUserId: OWNER, now: T0,
    });
    await records.putIfAbsent({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: candidate.id, sourceIdentity: candidate.id, payload: candidate });
    linkIds.set(`${uuid}|${sessionId}`, candidate.id);
  }
  return { records, w1: (uuid) => byUuid.get(uuid), link: (uuid, sessionId) => linkIds.get(`${uuid}|${sessionId}`) };
}

function canonicalWorkout(uuid, start, end) {
  const seconds = (Date.parse(`${DAY}T${end}:00Z`) - Date.parse(`${DAY}T${start}:00Z`)) / 1000;
  return reconcileHealthKitCanonicalWorkout({
    observation: normalizeHealthKitObservationBatch({
      batchId: "b", principalDeviceId: "founder-iphone",
      observations: [{
        observationType: "workout", externalId: uuid, source: { bundleIdentifier: "com.apple.health.watch" },
        occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt: `${DAY}T${start}:00-07:00`, endedAt: `${DAY}T${end}:00-07:00` },
        workout: { activityType: "50", durationSeconds: seconds, activeCalories: 400, averageHeartRate: 120 },
      }],
    }).observations[0],
    ownerUserId: OWNER, now: T0,
  }).record;
}

function session(id, start, end) {
  const seconds = (Date.parse(`${DAY}T${end}:00Z`) - Date.parse(`${DAY}T${start}:00Z`)) / 1000;
  return {
    canonicalId: id, version: 1, quality: { status: "active" },
    payload: {
      id, evidence_type: "training", observed_at: DAY, source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
      metadata: { activity_type: "Traditional Strength Training", start_time: `${DAY}T${start}:00-07:00`, end_time: `${DAY}T${end}:00-07:00`, duration_seconds: seconds },
      exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }],
    },
  };
}

// keep the matcher import honest: candidates in these worlds are built directly.
void assessHealthKitStrengthLinkCandidates;
