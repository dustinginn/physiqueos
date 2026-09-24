import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { normalizeHealthKitObservationBatch } from "../../domain/services/HealthKitObservationService.js";
import { reconcileHealthKitCanonicalWorkout } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HealthKitStrengthMatchOutcome as Outcome,
  createHealthKitWorkoutLinkCandidate,
} from "../../domain/services/HealthKitWorkoutLinkService.js";
import {
  confirmHealthKitWorkoutRelationship,
  findHealthKitWorkoutRelationshipViolations,
  getHealthKitWorkoutLinkClaimId,
} from "../../domain/services/HealthKitWorkoutRelationshipService.js";
import {
  HEALTHKIT_WORKOUT_LINK_CONFIRMATION_AUDIT_RECORD_PREFIX,
  runHealthKitWorkoutLinkConfirmation,
} from "./HealthKitWorkoutLinkConfirmationRunner.js";

const OWNER = "user_founder_001";
const DAY = "2026-09-22";
const T0 = "2026-09-22T20:00:00.000Z";
const AUTH = { ownerUserId: OWNER, startLocalDate: DAY, endLocalDate: DAY, authorizationReference: "founder-chat-approved-sep22-strength-link" };
const CLEAN = { workoutsWithMultipleConfirmedLinks: 0, sessionsWithMultipleConfirmedLinks: 0, confirmedLinksWithoutHeldClaims: 0, heldClaimsWithoutConfirmedLink: 0, malformedReleasedClaims: 0 };

describe("guarded Workout link confirmation operation", () => {
  it("dry-run selects the single candidate strength link in the window, proves it is allowed, predicts the exact writes, and writes nothing", async () => {
    const { records, link } = await world();
    const before = records.snapshot();
    const result = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    expect(result).toMatchObject({
      outcome: "dry_run", linkId: link, linkStatus: "candidate", family: "strength", localDate: DAY, matchOutcome: "confident_match", confidence: 99,
      predictedMutations: [
        { collection: "healthKitWorkoutLinks", recordId: link, operation: "update", to: "confirmed" },
        { collection: "healthKitWorkoutLinkClaims", operation: "hold" },
        { collection: "healthKitWorkoutLinkClaims", operation: "hold" },
        { collection: "healthKitConfiguration", operation: "create" },
      ],
    });
    expect(Object.keys(result.facts).sort()).toEqual([
      "canonicalDayCount", "canonicalDaysDigest", "canonicalWorkoutCount", "canonicalWorkoutsDigest", "claimCount", "claimsDigest",
      "dailyPolicyDigest", "evidenceCount", "evidenceDigest", "evidenceStorageMetadataDigest", "linkCount", "linksDigest", "observationCount", "observationsDigest", "workoutPolicyDigest",
    ]);
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
  });

  it("refuses when there is no candidate in the window or more than one, preserving ambiguity for an explicit choice", async () => {
    const empty = await world({ candidates: [] });
    expect(await runHealthKitWorkoutLinkConfirmation({ records: empty.records, authorization: AUTH })).toMatchObject({ outcome: "refused", reasons: ["no_candidate_in_window"] });
    const outside = await world();
    expect(await runHealthKitWorkoutLinkConfirmation({ records: outside.records, authorization: { ...AUTH, startLocalDate: "2026-09-23", endLocalDate: "2026-09-23" } }))
      .toMatchObject({ outcome: "refused", reasons: ["no_candidate_in_window"] });
    const two = await world({ sessions: ["S1", "S2"], candidates: [["u1", "S1"], ["u1", "S2"]] });
    expect(await runHealthKitWorkoutLinkConfirmation({ records: two.records, authorization: AUTH })).toMatchObject({ outcome: "refused", reasons: ["multiple_candidates_in_window"], candidateCount: 2 });
    expect(two.records.getMutationCount()).toBe(0);
  });

  it("refuses with the domain code, not a raw error, when the candidate collides with an established link or a foreign held claim", async () => {
    const { records, link, links } = await world({ workouts: [["u1", "10:00", "11:00"], ["u2", "10:00", "11:00"]], candidates: [["u1", "S1"], ["u2", "S1"]] });
    // Confirm u2 -> S1 through the guarded service directly; u1 -> S1 is now blocked on the session side.
    await confirmHealthKitWorkoutRelationship({ records, ownerUserId: OWNER, linkId: links("u2", "S1"), by: { kind: "founder", ref: "prior" }, now: T0 });
    const before = records.snapshot();
    const result = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: {} });
    // Only u1 -> S1 is still a candidate in the window, so it is selected, then refused.
    expect(result).toMatchObject({ outcome: "refused", reasons: ["LINK_ONE_TO_ONE_VIOLATION"], linkId: link });
    expect(records.snapshot()).toEqual(before);
  });

  it("apply requires the dry-run facts and refuses on drift without writing", async () => {
    const { records } = await world();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    const stale = { ...dry.facts, linksDigest: "different" };
    const drifted = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: stale });
    expect(drifted).toMatchObject({ outcome: "drifted", drift: ["linksDigest"] });
    expect(await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: null })).toMatchObject({ outcome: "drifted" });
    expect(records.getMutationCount()).toBe(0);
  });

  it("apply confirms exactly that link, holds both claims, writes one audit row, verifies invariants, and never touches the Logger session, workouts, days, observations, or policies", async () => {
    const { records, link, session } = await world();
    const before = records.snapshot();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    const result = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts, now: () => new Date(T0) });
    expect(result.outcome).toBe("applied");
    expect(Object.values(result.invariants).every((ok) => ok === true)).toBe(true);
    expect(result.violations).toEqual(CLEAN);
    const after = records.snapshot();
    const stored = after.healthKitWorkoutLinks.find((record) => record.id === link);
    expect(stored).toMatchObject({ status: "confirmed", version: 2, contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" } });
    expect(stored.statusHistory.at(-1)).toMatchObject({ status: "confirmed", by: { kind: "founder", ref: AUTH.authorizationReference } });
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held").map((claim) => claim.holderLinkId)).toEqual([link, link]);
    expect(after.healthKitConfiguration.filter((record) => record.kind === "healthkit_workout_link_confirmation_audit")).toHaveLength(1);
    for (const name of ["canonicalEvidenceObjects", "healthKitCanonicalWorkouts", "healthKitCanonicalDays", "healthKitObservations", "trainingPerformanceEvents", "canonicalExerciseLibrary"]) {
      expect(after[name]).toEqual(before[name]);
    }
    expect(after.canonicalEvidenceObjects.find((record) => record.canonicalId === session).payload.exercises).toEqual([{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }]);
    expect(after.healthKitConfiguration.filter((record) => record.id?.includes("activation_policy"))).toEqual(before.healthKitConfiguration.filter((record) => record.id?.includes("activation_policy")));
    expect(stored.evidenceEligibility?.state).toBe(before.healthKitWorkoutLinks[0].evidenceEligibility?.state);
  });

  it("replaying a completed confirmation is idempotent (already_confirmed, nothing written) and a reused authorization reference is refused", async () => {
    const { records } = await world();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts });
    const mutations = records.getMutationCount();
    const again = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts });
    expect(again).toMatchObject({ outcome: "already_confirmed", linkStatus: "confirmed" });
    expect(await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH })).toMatchObject({ outcome: "already_confirmed" });
    expect(records.getMutationCount()).toBe(mutations);
  });

  it("refuses already-confirmed replay after trusted live Logger provenance is removed", async () => {
    const { records } = await world();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts });
    const snapshot = records.snapshot();
    const session = snapshot.canonicalEvidenceObjects[0];
    delete session.payload.metadata.logger_origin;
    delete session.payload.metadata.logger_mode;
    const corrupt = createInMemoryCanonicalRecordStore(snapshot);
    expect(await runHealthKitWorkoutLinkConfirmation({ records: corrupt, authorization: AUTH }))
      .toMatchObject({ outcome: "refused", reasons: ["LINK_SESSION_UNAVAILABLE"] });
    expect(corrupt.getMutationCount()).toBe(0);
  });

  it("refuses to reuse an authorization reference whose audit row already exists (AUDIT_ROW_EXISTS), writing nothing", async () => {
    // Reviewer-noted gap: the prior version of this case seeded a made-up audit
    // id, so the guard was never reached. The real id is prefix + first 12 hex
    // of sha256(reference), exactly as the runner derives it.
    const { records } = await world();
    const auditId = HEALTHKIT_WORKOUT_LINK_CONFIRMATION_AUDIT_RECORD_PREFIX +
      createHash("sha256").update(AUTH.authorizationReference).digest("hex").slice(0, 32).slice(0, 12);
    await records.putIfAbsent({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: auditId, payload: { id: auditId, kind: "healthkit_workout_link_confirmation_audit" } });
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    expect(dry.outcome).toBe("dry_run");
    const before = records.snapshot();
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts })).rejects.toMatchObject({ code: "AUDIT_ROW_EXISTS" });
    expect(records.snapshot()).toEqual(before);
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("candidate");
    expect(records.snapshot().healthKitWorkoutLinkClaims).toHaveLength(0);
  });

  it("refuses by name when stored relationship state is already violated, instead of failing a post-write invariant", async () => {
    const { records } = await world();
    // An orphaned held claim (its holder link does not exist) is a stored violation.
    await records.putIfAbsent({ ownerUserId: OWNER, collection: "healthKitWorkoutLinkClaims", recordId: "healthkit_link_claim_w_orphan",
      payload: { id: "healthkit_link_claim_w_orphan", kind: "workout", status: "held", holderLinkId: "healthkit_workout_link_missing", history: [] } });
    const before = records.snapshot();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    expect(dry).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"], violations: { heldClaimsWithoutConfirmedLink: 1 } });
    expect(await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts })).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"] });
    expect(records.snapshot()).toEqual(before);
  });

  it("names a confirmed link whose claims are not held instead of reporting no candidate", async () => {
    const { records, link } = await world();
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link });
    await records.put({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link, expectedVersion: stored.version, payload: { ...stored, status: "confirmed" } });
    // No claims exist for it: the violation checker reports confirmedLinksWithoutHeldClaims, so this refuses as a stored violation first ...
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    expect(dry).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"], violations: { confirmedLinksWithoutHeldClaims: 1 } });
    expect(records.getMutationCount()).toBe(1);
  });

  it("two concurrent applies for the same window can never both win, and never produce two active links", async () => {
    const { records, link } = await world();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    const attempts = await Promise.allSettled([
      runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts }),
      runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, authorizationReference: "founder-chat-approved-second-window" }, apply: true, expected: dry.facts }),
    ]);
    const outcomes = attempts.map((attempt) => (attempt.status === "fulfilled" ? attempt.value.outcome : `error:${attempt.reason?.code ?? attempt.reason?.status}`));
    expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinks.filter((record) => record.status === "confirmed").map((record) => record.id)).toEqual([link]);
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
    expect(findHealthKitWorkoutRelationshipViolations({ links: after.healthKitWorkoutLinks, claims: after.healthKitWorkoutLinkClaims })).toEqual(CLEAN);
  });

  it("treats a durable held claim as the arbiter even when no confirmed link is visible (claim-only collision), refusing without writes", async () => {
    // The domain guard only sees confirmed LINKS. A held CLAIM with no visible
    // confirmed link (an orphaned or foreign holder) must still refuse: the
    // claim row is the durable arbiter and the runner must not reach the write.
    for (const kind of ["session", "workout"]) {
      const { records, link, session, claimId } = await world();
      const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link });
      const subject = kind === "session" ? session : stored.canonicalWorkoutId;
      await records.putIfAbsent({
        ownerUserId: OWNER, collection: "healthKitWorkoutLinkClaims", recordId: claimId(kind, subject),
        payload: { id: claimId(kind, subject), kind, status: "held", holderLinkId: "healthkit_workout_link_someone_else", history: [] },
      });
      // A held claim whose holder is not a confirmed link is, by definition, a
      // stored violation, so the pre-state check names it first (the runner's
      // own per-side heldBy refusal stays behind it as defense-in-depth). Either
      // way: refused, typed, and nothing written -- the write is never reached.
      const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
      expect(dry).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"], violations: { heldClaimsWithoutConfirmedLink: 1 } });
      const before = records.snapshot();
      const applied = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH, apply: true, expected: dry.facts });
      expect(applied).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"] });
      expect(records.snapshot()).toEqual(before);
      expect(records.snapshot().healthKitWorkoutLinks.find((record) => record.id === link).status).toBe("candidate");
      expect(records.snapshot().healthKitWorkoutLinkClaims.filter((claim) => claim.holderLinkId === link)).toHaveLength(0);
    }
  });

  it("refuses before prediction when a candidate is not quarantined, so confirmation can never graduate a link", async () => {
    const { records, link } = await world();
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link });
    await records.put({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: link, expectedVersion: stored.version,
      payload: { ...stored, evidenceEligibility: { ...stored.evidenceEligibility, state: "eligible" } } });
    const before = records.snapshot();
    const beforeWrites = records.getMutationCount();
    const dry = await runHealthKitWorkoutLinkConfirmation({ records, authorization: AUTH });
    expect(dry).toMatchObject({ outcome: "refused", reasons: ["LINK_RELATIONSHIP_INTEGRITY_INVALID"] });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(beforeWrites);
  });

  it("rejects an invalid or too-wide window before reading anything", async () => {
    const { records } = await world();
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, startLocalDate: "2026-09-23", endLocalDate: "2026-09-22" } })).rejects.toMatchObject({ code: "WINDOW_INVALID" });
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, startLocalDate: "2026-13-45", endLocalDate: "2026-13-45" } })).rejects.toMatchObject({ code: "WINDOW_INVALID" });
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, startLocalDate: "2026-02-30", endLocalDate: "2026-02-30" } })).rejects.toMatchObject({ code: "WINDOW_INVALID" });
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, startLocalDate: "2026-09-20", endLocalDate: "2026-09-24" } })).rejects.toMatchObject({ code: "WINDOW_TOO_WIDE" });
    await expect(runHealthKitWorkoutLinkConfirmation({ records, authorization: { ...AUTH, ownerUserId: "" } })).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
  });
});

// A world with one canonical strength workout per entry, Logger sessions, and candidate links.
async function world({ workouts = [["u1", "10:00", "11:00"]], sessions = ["S1"], candidates = [["u1", "S1"]], sessionTimes = {} } = {}) {
  const sessionRecords = sessions.map((id) => session(id, ...(sessionTimes[id] ?? ["10:01", "10:59"])));
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    canonicalEvidenceObjects: sessionRecords,
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitCanonicalDays: [{ id: "healthkit_canonical_day_activity_2026-09-22", version: 3, domain: "activity", localDate: DAY }],
    healthKitObservations: [{ id: "healthkit_observation_a", version: 1, observationType: "activity_summary" }],
    healthKitConfiguration: [
      { id: "healthkit_canonical_daily_activation_policy", version: 1, status: "enabled", domains: ["activity", "nutrition"] },
      { id: "healthkit_workout_canonical_activation_policy", version: 1, status: "enabled", domains: ["workout"], effectiveLocalDate: DAY, endLocalDate: DAY, strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false },
    ],
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
  for (const [uuid, sessionId] of candidates) {
    const candidate = createHealthKitWorkoutLinkCandidate({
      canonicalWorkout: byUuid.get(uuid),
      assessment: { outcome: Outcome.CONFIDENT, matcherVersion: "healthkit-strength-matcher-v5", candidates: [{ loggerSessionCanonicalId: sessionId, confidence: 99, reasons: ["single_overlapping_session"], basis: "temporal_and_telemetry" }] },
      ownerUserId: OWNER, now: T0,
    });
    await records.putIfAbsent({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: candidate.id, sourceIdentity: candidate.id, payload: candidate });
    linkIds.set(`${uuid}|${sessionId}`, candidate.id);
  }
  const [firstUuid, firstSession] = candidates[0] ?? [];
  return {
    records,
    link: linkIds.get(`${firstUuid}|${firstSession}`),
    links: (uuid, sessionId) => linkIds.get(`${uuid}|${sessionId}`),
    session: firstSession,
    claimId: getHealthKitWorkoutLinkClaimId,
  };
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
      metadata: { activity_type: "Traditional Strength Training", start_time: `${DAY}T${start}:00-07:00`, end_time: `${DAY}T${end}:00-07:00`, duration_seconds: seconds, logger_origin: "training_logger", logger_mode: "live" },
      exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }],
    },
  };
}
