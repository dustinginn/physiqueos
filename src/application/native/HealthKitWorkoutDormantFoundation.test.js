import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createV3EvidenceUniverse } from "../../domain/intelligence/V3EvidenceUniverse.js";
import {
  assertNotQuarantinedHealthKitEvidence,
  assessHealthKitStrategicEvidenceEligibility,
  selectStrategicallyEligibleRecords,
} from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { resolveHealthKitWorkoutActivationPolicy } from "../../domain/services/HealthKitObservationService.js";
import {
  confirmHealthKitWorkoutRelationship,
  getHealthKitWorkoutLinkClaimId,
} from "../../domain/services/HealthKitWorkoutRelationshipService.js";

const OWNER = "user_founder_001";
const WORKOUT_POLICY_ID = "healthkit_workout_canonical_activation_policy";
const DAILY_POLICY_ID = "healthkit_canonical_daily_activation_policy";
const DAY = "2026-09-23";
const HK_UUID = "9f3c2a10-1111-4222-8333-444455556666";
const SENTINELS = [
  "goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses", "dailyBriefings",
  "briefingReconciliationWorkItems", "phaseReviewDecisions", "phaseLifecycleReadModels", "operatingPlan", "protocols",
  "trainingPerformanceEvents", "trainingPerformanceEventBatches", "canonicalExerciseLibrary", "dexaScans", "progressPhotos",
];

describe("Workout canonicalization is OFF by default", () => {
  it("keeps every workout raw when no Workout policy exists, exactly as before, with numeric types now recognized", async () => {
    const records = store({ workoutPolicy: false, evidence: [logger("session-a", "10:01", "10:59")] });
    const before = records.snapshot();
    const result = await ingest(records, [workout({ activityType: "50" })]);
    expect(result.result).toMatchObject({ workoutCanonicalizedCount: 0, workoutRelationships: { assessed: 0 } });
    // The pre-existing raw candidate state; the numeric "50" is now recognized as strength.
    expect(result.result.observations[0].reconciliation).toMatchObject({ state: "training_match_candidate", confirmationRequired: true });
    const after = records.snapshot();
    expect(after.healthKitCanonicalWorkouts).toEqual([]);
    expect(after.healthKitWorkoutLinks).toEqual([]);
    for (const name of [...SENTINELS, "canonicalEvidenceObjects"]) expect(after[name]).toEqual(before[name]);
  });

  it.each([
    ["not enabled", { status: "disabled" }],
    ["no schema version", { schemaVersion: undefined }],
    ["an eligibility other than quarantined", { strategicEvidenceEligibility: "eligible" }],
    ["a backfill request", { historicalBackfill: true }],
    ["an invalid link auto-confirm value", { linkAutoConfirm: "yes" }],
    ["extra domains", { domains: ["workout", "activity"] }],
    ["a window over three days", { endLocalDate: "2026-09-27" }],
    ["an open window", { endLocalDate: undefined }],
  ])("fails closed on a policy with %s, without throwing", async (_label, overrides) => {
    expect(resolveHealthKitWorkoutActivationPolicy(policy(overrides)).enabled).toBe(false);
    const records = store({ workoutPolicyOverrides: overrides });
    const result = await ingest(records, [workout()]);
    expect(result.status).toBe("committed");
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("is independent of the Activity + Nutrition policy: each enables only its own domains", async () => {
    const dailyOnly = store({ workoutPolicy: false, dailyPolicy: true });
    const first = await ingest(dailyOnly, [workout(), activity()]);
    expect(first.result).toMatchObject({ workoutCanonicalizedCount: 0, activityDayCanonicalizedCount: 1 });
    const workoutOnly = store({ workoutPolicy: true, dailyPolicy: false });
    const second = await ingest(workoutOnly, [workout(), activity()]);
    expect(second.result).toMatchObject({ workoutCanonicalizedCount: 1, activityDayCanonicalizedCount: 0 });
    expect(workoutOnly.snapshot().healthKitObservations.find((o) => o.observationType === "activity_summary").reconciliation.reason)
      .toBe("canonicalization_not_activated");
  });
});

describe("controlled Workout window (policy enabled)", () => {
  it("canonicalizes a strength workout as Apple telemetry, creates a link CANDIDATE, and touches nothing else", async () => {
    const rawSession = logger("session-a", "10:01", "10:59");
    const session = {
      ...rawSession,
      payload: {
        ...rawSession.payload,
        metadata: {
          ...rawSession.payload.metadata,
          logger_origin: "training_logger",
          logger_mode: "live",
        },
      },
    };
    const records = store({ evidence: [session] });
    const before = records.snapshot();
    const result = await ingest(records, [workout({ activityType: "50" })]);
    const after = records.snapshot();
    expect(result.result).toMatchObject({
      workoutCanonicalizedCount: 1,
      workoutRelationships: { assessed: 1, updated: 1, candidateLinksCreated: 1 },
    });
    expect(result.result.observations[0].reconciliation).toMatchObject({
      state: "workout_canonicalized", canonicalStore: "healthKitCanonicalWorkouts", workoutFamily: "strength",
      evidenceEligibility: "quarantined", activityInteraction: "descriptive_never_additive",
    });
    const [canonical] = after.healthKitCanonicalWorkouts;
    expect(canonical).toMatchObject({
      localDate: DAY, revision: 1,
      current: { family: "strength", canonicalType: "traditional_strength_training" },
      linkAssessment: { outcome: "confident_match", candidates: [{ loggerSessionCanonicalId: "session-a" }] },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(JSON.stringify(canonical)).not.toContain(HK_UUID);
    expect(after.healthKitWorkoutLinks).toHaveLength(1);
    expect(after.healthKitWorkoutLinks[0]).toMatchObject({
      status: "candidate", contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
      loggerSessionCanonicalId: "session-a", canonicalWorkoutId: canonical.id,
    });
    // Logger authority, Training events, Library, strategy: byte-identical.
    for (const name of [...SENTINELS, "canonicalEvidenceObjects", "evidencePackages"]) expect(after[name]).toEqual(before[name]);
    expect(after.canonicalEvidenceObjects[0]).toEqual(session);
  });

  it("is idempotent: an identical replay under a new batch changes nothing", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "b1");
    const snapshot = records.snapshot();
    const replay = await ingest(records, [workout()], "b2");
    expect(replay.result).toMatchObject({ status: "matched", createdCount: 0, matchedCount: 1, workoutCanonicalizedCount: 1 });
    expect(replay.result.workoutRelationships).toMatchObject({ candidateLinksCreated: 0, updated: 0 });
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual(snapshot.healthKitCanonicalWorkouts);
    expect(records.snapshot().healthKitWorkoutLinks).toEqual(snapshot.healthKitWorkoutLinks);
  });

  it("advances the same canonical workout on a later revision and keeps one link", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout({ durationSeconds: 3300, activeCalories: 350 })], "b1");
    const revised = await ingest(records, [workout({ sourceRevision: 2, durationSeconds: 3600, activeCalories: 410 })], "b2");
    expect(revised.result.observations[0].reconciliation).toMatchObject({ state: "workout_canonicalized", canonicalRevision: 2, canonicalAction: "update" });
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts).toHaveLength(1);
    expect(snapshot.healthKitCanonicalWorkouts[0]).toMatchObject({ revision: 2, current: { telemetry: { activeCalories: 410, durationSeconds: 3600 } } });
    expect(snapshot.healthKitCanonicalWorkouts[0].revisionHistory).toHaveLength(1);
    expect(snapshot.healthKitWorkoutLinks).toHaveLength(1);
    expect(snapshot.healthKitObservations).toHaveLength(2);
  });

  it("attributes the day by the workout's own start, not the client label or the ingestion time", async () => {
    const records = store();
    // Started 23:50 PDT Sep 23 (06:50Z Sep 24), client mislabelled Sep 24, delivered on Sep 25 UTC.
    const late = await ingest(records, [workout({ startedAt: "2026-09-23T23:50:00-07:00", endedAt: "2026-09-24T00:40:00-07:00", clientLocalDate: "2026-09-24" })], "b1", { receivedAt: "2026-09-25T09:00:00.000Z" });
    expect(late.result.workoutCanonicalizedCount).toBe(1);
    expect(records.snapshot().healthKitCanonicalWorkouts[0]).toMatchObject({ localDate: DAY, current: { localDateCorrected: true, clientLocalDate: "2026-09-24" } });
    // Started 00:10 PDT Sep 24: outside the exact window even though the client said Sep 23.
    const next = await ingest(records, [workout({ externalId: "next-uuid", startedAt: "2026-09-24T00:10:00-07:00", endedAt: "2026-09-24T01:00:00-07:00", clientLocalDate: DAY })], "b2");
    expect(next.result.observations[0].reconciliation.state).not.toBe("workout_canonicalized");
    expect(next.result.workoutCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toHaveLength(1);
  });

  it("re-evaluates the link when the Logger session is committed AFTER the Apple workout arrived", async () => {
    const records = store();
    await ingest(records, [workout()], "b1");
    expect(records.snapshot().healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "no_match" });
    expect(records.snapshot().healthKitWorkoutLinks).toEqual([]);
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-a", payload: logger("session-a", "10:01", "10:59") });
    const replay = await ingest(records, [workout()], "b2");
    expect(replay.result.workoutRelationships).toMatchObject({ candidateLinksCreated: 1, updated: 1 });
    expect(records.snapshot().healthKitWorkoutLinks[0]).toMatchObject({ status: "candidate", loggerSessionCanonicalId: "session-a" });
  });

  it("never links an ambiguous match and releases a stale candidate when a second session appears", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "b1");
    expect(records.snapshot().healthKitWorkoutLinks).toHaveLength(1);
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-b", payload: logger("session-b", "10:02", "11:01") });
    const replay = await ingest(records, [workout()], "b2");
    expect(replay.result.workoutRelationships).toMatchObject({ candidateLinksReleased: 1 });
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "ambiguous_multiple" });
    expect(snapshot.healthKitWorkoutLinks).toHaveLength(1);
    expect(snapshot.healthKitWorkoutLinks[0].status).toBe("unlinked");
    expect(snapshot.healthKitWorkoutLinks[0].statusHistory.at(-1)).toMatchObject({ reason: "assessment_changed" });
    expect(snapshot.evidenceReviews).toHaveLength(1);
    expect(snapshot.evidenceReviews[0]).toMatchObject({
      reviewKind: "healthkit_workout_reconciliation",
      status: "pending",
      strategicEvidenceEligibility: "quarantined",
      candidates: [
        { loggerSessionCanonicalId: "session-a" },
        { loggerSessionCanonicalId: "session-b" },
      ],
    });
    const review = structuredClone(snapshot.evidenceReviews[0]);
    await ingest(records, [workout()], "b3");
    expect(records.snapshot().evidenceReviews).toEqual([review]);
  });

  it("creates exactly one Founder review for a single plausible match that cannot auto-confirm", async () => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], "possible-1");
    const first = records.snapshot();
    expect(first.healthKitCanonicalWorkouts[0].linkAssessment.outcome).toBe("possible_match");
    expect(first.evidenceReviews).toHaveLength(1);
    expect(first.evidenceReviews[0]).toMatchObject({
      reviewKind: "healthkit_workout_reconciliation",
      status: "pending",
      candidates: [{ loggerSessionCanonicalId: "session-a" }],
    });
    const review = structuredClone(first.evidenceReviews[0]);
    await ingest(records, [workout()], "possible-2");
    expect(records.snapshot().evidenceReviews).toEqual([review]);
  });

  it("creates a Founder review when a high-confidence candidate lacks an allowlisted deterministic basis", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("far-away", "16:00", "17:00")] });
    await ingest(records, [workout()], "confident-but-not-deterministic");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts[0].linkAssessment.outcome).toBe("confident_match");
    expect(snapshot.healthKitWorkoutLinks).toEqual([
      expect.objectContaining({ status: "candidate", loggerSessionCanonicalId: "session-a" }),
    ]);
    expect(snapshot.evidenceReviews).toEqual([
      expect.objectContaining({
        reviewKind: "healthkit_workout_reconciliation",
        status: "pending",
        candidates: [expect.objectContaining({ loggerSessionCanonicalId: "session-a" })],
      }),
    ]);
  });

  it("auto-confirms only the deterministic unique Logger-window match when explicitly enabled", async () => {
    const rawSession = logger("session-a", "10:01", "10:59");
    const session = {
      ...rawSession,
      payload: {
        ...rawSession.payload,
        metadata: {
          ...rawSession.payload.metadata,
          logger_origin: "training_logger",
          logger_mode: "live",
        },
      },
    };
    const records = store({
      workoutPolicyOverrides: {
        linkAutoConfirm: true,
        linkAutoConfirmEffectiveAt: "2026-09-23T23:00:00.000Z",
      },
      evidence: [session],
    });
    const before = records.snapshot();
    const result = await ingest(records, [workout()], "auto-1");
    expect(result.result.workoutRelationships.automaticConfirmationRefusals).toEqual([]);
    expect(result.result.workoutRelationships).toMatchObject({ automaticallyConfirmed: 1 });
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinks).toHaveLength(1);
    expect(after.healthKitWorkoutLinks[0]).toMatchObject({
      status: "confirmed",
      confidence: 95,
      matchBasis: "logger_session_window",
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
    expect(after.evidenceReviews).toHaveLength(1);
    expect(after.evidenceReviews[0]).toMatchObject({
      reviewKind: "healthkit_workout_reconciliation",
      status: "resolved_confirmed",
      resolution: { action: "confirm", basis: { mode: "deterministic_auto_confirm" } },
      strategicEvidenceEligibility: "quarantined",
    });
    expect(after.evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    expect(after.trainingPerformanceEvents).toEqual(before.trainingPerformanceEvents);
    await ingest(records, [workout()], "auto-2");
    expect(records.snapshot().evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(records.snapshot().healthKitWorkoutLinks).toHaveLength(1);
  });

  it("never retroactively auto-confirms a workout created before the separately authorized cutoff", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "before-auto", { receivedAt: "2026-09-23T23:30:00.000Z" });
    const currentPolicy = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitConfiguration",
      recordId: WORKOUT_POLICY_ID,
      expectedVersion: currentPolicy.version,
      payload: { ...currentPolicy, linkAutoConfirm: true, linkAutoConfirmEffectiveAt: "2026-09-23T23:31:00.000Z" },
    });

    const replay = await ingest(records, [workout()], "after-auto", { receivedAt: "2026-09-23T23:32:00.000Z" });

    expect(replay.result.workoutRelationships.automaticConfirmationRefusals).toEqual([
      expect.objectContaining({ reasons: ["workout_predates_auto_confirm_activation"] }),
    ]);
    expect(records.snapshot().healthKitWorkoutLinks).toEqual([
      expect.objectContaining({ status: "candidate", loggerSessionCanonicalId: "session-a" }),
    ]);
    expect(records.snapshot().healthKitWorkoutLinkClaims).toEqual([]);
  });

  it("resolves one ambiguous review by explicit Founder selection without changing Logger detail", async () => {
    const sessions = [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")];
    const records = store({ evidence: sessions });
    await ingest(records, [workout()], "ambiguous-confirm");
    const before = records.snapshot();
    const [review] = before.evidenceReviews;
    const result = await createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: "resolve-confirm", expectedVersion: String(review.version), idempotencyKey: "resolve-confirm" },
        payload: { reviewId: review.id, action: "confirm", loggerSessionCanonicalId: "session-b" },
      });
    expect(result.result).toMatchObject({ status: "resolved_confirmed", loggerSessionCanonicalId: "session-b" });
    const after = records.snapshot();
    expect(after.evidenceReviews).toHaveLength(1);
    expect(after.evidenceReviews[0]).toMatchObject({
      status: "resolved_confirmed",
      resolution: {
        action: "confirm",
        selectedLoggerSessionCanonicalId: "session-b",
        basis: {
          mode: "founder_explicit_selection",
          rejectedAlternativeLoggerSessionCanonicalIds: ["session-a"],
        },
        strategicEvidenceEligibility: "quarantined",
      },
    });
    expect(after.evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(after.healthKitWorkoutLinks.filter((link) => link.status === "confirmed")).toHaveLength(1);
    expect(after.healthKitWorkoutLinks.find((link) => link.status === "confirmed"))
      .toMatchObject({ loggerSessionCanonicalId: "session-b", evidenceEligibility: { strategic: false } });
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    expect(after.trainingPerformanceEvents).toEqual(before.trainingPerformanceEvents);
  });

  it("records an ambiguous no-match exactly once and creates no relationship or Training session", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")] });
    await ingest(records, [workout()], "ambiguous-reject");
    const before = records.snapshot();
    const [review] = before.evidenceReviews;
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") });
    const first = await ports.resolveWorkoutReconciliation({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { commandId: "resolve-no-match", expectedVersion: String(review.version), idempotencyKey: "resolve-no-match" },
      payload: { reviewId: review.id, action: "no_match" },
    });
    expect(first.result.status).toBe("resolved_no_match");
    const resolved = records.snapshot().evidenceReviews[0];
    const replay = await ports.resolveWorkoutReconciliation({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { commandId: "resolve-no-match-replay", expectedVersion: String(resolved.version), idempotencyKey: "resolve-no-match-replay" },
      payload: { reviewId: review.id, action: "no_match" },
    });
    expect(replay.result.status).toBe("already_resolved");
    const after = records.snapshot();
    expect(after.evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(after.healthKitWorkoutLinks.filter((link) => link.status === "confirmed")).toEqual([]);
    expect(after.healthKitWorkoutLinkClaims ?? []).toEqual([]);
    expect(after.trainingPerformanceEvents).toEqual(before.trainingPerformanceEvents);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
  });

  it("refuses idempotent reconciliation success when terminal history is corrupt", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")] });
    await ingest(records, [workout()], "corrupt-terminal-history");
    const [review] = records.snapshot().evidenceReviews;
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") });
    await ports.resolveWorkoutReconciliation({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { commandId: "resolve-no-match-first", expectedVersion: String(review.version), idempotencyKey: "resolve-no-match-first" },
      payload: { reviewId: review.id, action: "no_match" },
    });
    const resolved = await records.get({ ownerUserId: OWNER, collection: "evidenceReviews", recordId: review.id });
    const corrupt = await records.put({
      ownerUserId: OWNER,
      collection: "evidenceReviews",
      recordId: review.id,
      expectedVersion: resolved.version,
      payload: { ...resolved, resolutionHistory: [] },
    });
    await expect(ports.resolveWorkoutReconciliation({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { commandId: "resolve-no-match-corrupt-replay", expectedVersion: String(corrupt.version), idempotencyKey: "resolve-no-match-corrupt-replay" },
      payload: { reviewId: review.id, action: "no_match" },
    })).rejects.toMatchObject({ status: 409, code: "WORKOUT_RECONCILIATION_NOT_PENDING" });
  });

  it("freshly reassesses No match and atomically releases every current candidate link", async () => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], "no-match-release");
    const before = records.snapshot();
    const [review] = before.evidenceReviews;
    expect(before.healthKitWorkoutLinks).toEqual([expect.objectContaining({ status: "candidate" })]);
    const result = await createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: "resolve-no-match-release", expectedVersion: String(review.version), idempotencyKey: "resolve-no-match-release" },
        payload: { reviewId: review.id, action: "no_match" },
      });
    expect(result.result.status).toBe("resolved_no_match");
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinks).toEqual([
      expect.objectContaining({
        status: "unlinked",
        statusHistory: expect.arrayContaining([expect.objectContaining({ reason: "founder_explicit_no_match" })]),
      }),
    ]);
    expect(after.healthKitWorkoutLinkClaims).toEqual([]);
    expect(after.evidenceReviews[0]).toMatchObject({
      status: "resolved_no_match",
      resolution: { basis: { freshAssessmentOutcome: "possible_match", releasedCandidateLinkIds: [before.healthKitWorkoutLinks[0].id] } },
    });
  });

  it("rejects a stale No match when the pending review's relationship was independently confirmed", async () => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], "no-match-confirmed-race");
    const before = records.snapshot();
    const [review] = before.evidenceReviews;
    const [candidate] = before.healthKitWorkoutLinks;
    await confirmHealthKitWorkoutRelationship({
      records,
      ownerUserId: OWNER,
      linkId: candidate.id,
      by: { kind: "operator", ref: "independent-confirmation" },
      now: "2026-09-23T23:30:30.000Z",
    });
    await expect(createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: "resolve-no-match-stale", expectedVersion: String(review.version), idempotencyKey: "resolve-no-match-stale" },
        payload: { reviewId: review.id, action: "no_match" },
      })).rejects.toMatchObject({ status: 409, code: "WORKOUT_RECONCILIATION_RELATIONSHIP_DRIFT" });
    const after = records.snapshot();
    expect(after.evidenceReviews[0].status).toBe("pending");
    expect(after.healthKitWorkoutLinks[0].status).toBe("confirmed");
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
  });

  it.each(["orphan_workout", "mismatched_session"])("rejects No match when a relevant %s held claim is corrupt", async (kind) => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], `no-match-claim-${kind}`);
    const before = records.snapshot();
    const [review] = before.evidenceReviews;
    const [candidate] = before.healthKitWorkoutLinks;
    const claimKind = kind === "orphan_workout" ? "workout" : "session";
    const subject = claimKind === "workout" ? candidate.canonicalWorkoutId : candidate.loggerSessionCanonicalId;
    const claimId = getHealthKitWorkoutLinkClaimId(claimKind, subject);
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitWorkoutLinkClaims",
      recordId: claimId,
      payload: {
        id: claimId,
        userId: OWNER,
        kind: claimKind,
        status: "held",
        holderLinkId: kind === "orphan_workout" ? "missing-link" : candidate.id,
        history: [],
      },
    });
    await expect(createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: `resolve-no-match-${kind}`, expectedVersion: String(review.version), idempotencyKey: `resolve-no-match-${kind}` },
        payload: { reviewId: review.id, action: "no_match" },
      })).rejects.toMatchObject({ status: 409, code: "WORKOUT_RECONCILIATION_RELATIONSHIP_DRIFT" });
    expect(records.snapshot().evidenceReviews[0].status).toBe("pending");
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("candidate");
  });

  it("rejects No match when a foreign confirmed link holds the candidate session without its companion workout claim", async () => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], "no-match-foreign-graph");
    const snapshot = records.snapshot();
    const [review] = snapshot.evidenceReviews;
    const [candidate] = snapshot.healthKitWorkoutLinks;
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitWorkoutLinks",
      recordId: "foreign-confirmed-link",
      payload: { ...candidate, id: "foreign-confirmed-link", canonicalWorkoutId: "other-workout", status: "confirmed" },
    });
    const sessionClaimId = getHealthKitWorkoutLinkClaimId("session", candidate.loggerSessionCanonicalId);
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitWorkoutLinkClaims",
      recordId: sessionClaimId,
      payload: {
        schemaVersion: "healthkit-workout-link-claim-v1",
        id: sessionClaimId,
        kind: "session",
        status: "held",
        holderLinkId: "foreign-confirmed-link",
        history: [{ status: "held", holderLinkId: "foreign-confirmed-link", at: "2026-09-23T23:30:00.000Z" }],
      },
    });
    await expect(createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: "resolve-no-match-foreign-graph", expectedVersion: String(review.version), idempotencyKey: "resolve-no-match-foreign-graph" },
        payload: { reviewId: review.id, action: "no_match" },
      })).rejects.toMatchObject({ status: 409, code: "WORKOUT_RECONCILIATION_RELATIONSHIP_DRIFT" });
    expect(records.snapshot().evidenceReviews[0].status).toBe("pending");
  });

  it("reopens a superseded review when a plausible relationship returns", async () => {
    const records = store({ evidence: [logger("session-a", "10:04", "11:20", 4560)] });
    await ingest(records, [workout()], "reopen-1");
    const active = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-a" });
    await records.put({
      ownerUserId: OWNER,
      collection: "canonicalEvidenceObjects",
      recordId: "session-a",
      expectedVersion: active.version,
      payload: { ...active, quality: { status: "superseded" } },
    });
    await ingest(records, [workout()], "reopen-2");
    expect(records.snapshot().evidenceReviews[0].status).toBe("superseded");
    const superseded = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-a" });
    await records.put({
      ownerUserId: OWNER,
      collection: "canonicalEvidenceObjects",
      recordId: "session-a",
      expectedVersion: superseded.version,
      payload: { ...superseded, quality: { status: "active" } },
    });
    const replay = await ingest(records, [workout()], "reopen-3");
    expect(replay.result.workoutRelationships.reconciliationReviewsReopened).toBe(1);
    const review = records.snapshot().evidenceReviews[0];
    expect(review).toMatchObject({ status: "pending", candidates: [{ loggerSessionCanonicalId: "session-a" }] });
    expect(review.resolutionHistory).toEqual([]);
    expect(review.lifecycleHistory.map((entry) => entry.status)).toEqual(["pending", "superseded", "pending"]);
  });

  it("transitions a superseded review to one durable auto-confirm resolution when deterministic facts return", async () => {
    const sessionA = liveLogger("session-a", "10:01", "10:59");
    const sessionB = liveLogger("session-b", "10:02", "11:01");
    const records = store({ evidence: [sessionA, sessionB] });
    await ingest(records, [workout()], "superseded-auto-1");
    for (const id of ["session-a", "session-b"]) {
      const active = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: id });
      await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: id, expectedVersion: active.version, payload: { ...active, quality: { status: "superseded" } } });
    }
    await ingest(records, [workout()], "superseded-auto-2");
    expect(records.snapshot().evidenceReviews[0].status).toBe("superseded");
    const a = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-a" });
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-a", expectedVersion: a.version, payload: { ...a, quality: { status: "active" } } });
    const currentPolicy = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitConfiguration",
      recordId: WORKOUT_POLICY_ID,
      expectedVersion: currentPolicy.version,
      payload: { ...currentPolicy, linkAutoConfirm: true, linkAutoConfirmEffectiveAt: "2026-09-23T23:00:00.000Z" },
    });
    const replay = await ingest(records, [workout()], "superseded-auto-3", { receivedAt: "2026-09-23T23:32:00.000Z" });
    expect(replay.result.workoutRelationships.automaticallyConfirmed).toBe(1);
    const review = records.snapshot().evidenceReviews[0];
    expect(review).toMatchObject({ status: "resolved_confirmed", resolution: { action: "confirm" } });
    expect(review.resolutionHistory).toHaveLength(1);
    expect(review.lifecycleHistory.map((entry) => entry.status)).toEqual(["pending", "superseded", "resolved_confirmed"]);
    await ingest(records, [workout()], "superseded-auto-4", { receivedAt: "2026-09-23T23:33:00.000Z" });
    expect(records.snapshot().evidenceReviews[0].resolutionHistory).toHaveLength(1);
  });

  it("rejects reconciliation records at every generic canonical Evidence Review mutation port", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")] });
    await ingest(records, [workout()], "generic-port-guards");
    const [review] = records.snapshot().evidenceReviews;
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") });
    const context = {
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { commandId: "generic-port-refusal", expectedVersion: String(review.version), idempotencyKey: "generic-port-refusal" },
      payload: { reviewId: review.id, changes: { status: "confirmed" }, evidenceObjectId: "anything", measurements: {} },
    };
    for (const name of [
      "editEvidenceReview",
      "confirmEvidenceReview",
      "confirmNutritionEvidence",
      "confirmPhotoEvidence",
      "confirmDexaEvidence",
      "editDexaReview",
      "requestEvidenceReviewConfirmation",
      "disposeEvidenceReview",
    ]) {
      await expect(ports[name](context)).rejects.toMatchObject({
        status: 409,
        code: "WORKOUT_RECONCILIATION_ACTION_REQUIRED",
      });
    }
    expect(records.snapshot().evidenceReviews[0]).toEqual(review);
  });

  it("never overrides a terminal Founder no-match when later facts become uniquely auto-confirmable", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")] });
    await ingest(records, [workout()], "terminal-no-match-1");
    const [review] = records.snapshot().evidenceReviews;
    await createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-23T23:31:00.000Z") })
      .resolveWorkoutReconciliation({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
        metadata: { commandId: "terminal-no-match", expectedVersion: String(review.version), idempotencyKey: "terminal-no-match" },
        payload: { reviewId: review.id, action: "no_match" },
      });
    const sessionB = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-b" });
    await records.put({
      ownerUserId: OWNER,
      collection: "canonicalEvidenceObjects",
      recordId: "session-b",
      expectedVersion: sessionB.version,
      payload: { ...sessionB, quality: { status: "superseded" } },
    });
    const currentPolicy = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({
      ownerUserId: OWNER,
      collection: "healthKitConfiguration",
      recordId: WORKOUT_POLICY_ID,
      expectedVersion: currentPolicy.version,
      payload: { ...currentPolicy, linkAutoConfirm: true, linkAutoConfirmEffectiveAt: "2026-09-23T23:00:00.000Z" },
    });

    const replay = await ingest(records, [workout()], "terminal-no-match-2", { receivedAt: "2026-09-23T23:32:00.000Z" });

    expect(replay.result.workoutRelationships.automaticConfirmationRefusals).toEqual([
      expect.objectContaining({ reasons: ["founder_reconciliation_already_resolved"] }),
    ]);
    const after = records.snapshot();
    expect(after.evidenceReviews).toHaveLength(1);
    expect(after.evidenceReviews[0]).toMatchObject({ status: "resolved_no_match", resolution: { action: "no_match" } });
    expect(after.evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(after.healthKitWorkoutLinks.filter((link) => link.status === "confirmed")).toEqual([]);
    expect(after.healthKitWorkoutLinkClaims).toEqual([]);
  });

  it("canonicalizes cardio idempotently and records coexistence with an existing Apple Fitness walk (no double count)", async () => {
    const appleFitnessWalk = {
      canonicalId: "training|screenshot|walk-1", version: 1, quality: { status: "active" },
      payload: { id: "walk-1", evidence_type: "training", observed_at: DAY, source: { application: "Apple Fitness", modality: "screenshot" },
        metadata: { activity_type: "Outdoor Walk", start_time: `${DAY}T07:01:00-07:00`, end_time: `${DAY}T07:41:00-07:00`, duration_seconds: 2400, active_calories: 150 }, exercises: [] },
    };
    const records = store({ evidence: [appleFitnessWalk] });
    const before = records.snapshot();
    const walk = workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${DAY}T07:00:00-07:00`, endedAt: `${DAY}T07:40:00-07:00`, durationSeconds: 2400, activeCalories: 150 });
    await ingest(records, [walk], "b1");
    await ingest(records, [walk], "b2");
    const after = records.snapshot();
    expect(after.healthKitCanonicalWorkouts).toHaveLength(1);
    expect(after.healthKitCanonicalWorkouts[0]).toMatchObject({ current: { family: "cardio", canonicalType: "walking" }, coexistence: { state: "matches_existing_evidence_workout" } });
    expect(after.healthKitWorkoutLinks).toEqual([]);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
  });

  it("keeps unsupported types and validation-only workouts raw", async () => {
    const records = store();
    const unsupported = await ingest(records, [workout({ externalId: "elliptical", activityType: "16" })], "b1");
    expect(unsupported.result.observations[0].reconciliation).toMatchObject({ state: "source_only", reason: "unsupported_workout_type" });
    const validation = await ingest(records, [{ ...workout({ externalId: "validation-uuid" }), ingestionPurpose: "validation_only" }], "b2");
    expect(validation.result.workoutCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("never reconsiders a raw workout stored before activation (activate first, then sync)", async () => {
    const records = store({ workoutPolicy: false });
    await ingest(records, [workout()], "b1");
    await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID, payload: policy() });
    const replay = await ingest(records, [workout()], "b2");
    expect(replay.result.workoutCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("deactivation stops new canonicalization and keeps every canonical record and link", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "b1");
    const kept = structuredClone({ w: records.snapshot().healthKitCanonicalWorkouts, l: records.snapshot().healthKitWorkoutLinks });
    const current = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID, expectedVersion: current.version, payload: { ...current, status: "disabled" } });
    const later = await ingest(records, [workout({ externalId: "second-uuid", startedAt: `${DAY}T16:00:00-07:00`, endedAt: `${DAY}T17:00:00-07:00` })], "b2");
    expect(later.result.workoutCanonicalizedCount).toBe(0);
    expect({ w: records.snapshot().healthKitCanonicalWorkouts, l: records.snapshot().healthKitWorkoutLinks }).toEqual(kept);
  });
});

describe("daily Activity is never double counted", () => {
  it("leaves the canonical Activity day byte-identical when workouts with energy are canonicalized around it", async () => {
    const records = store({ dailyPolicy: true });
    await ingest(records, [activity({ moveCalories: 900 })], "b1");
    const day = structuredClone(records.snapshot().healthKitCanonicalDays[0]);
    await ingest(records, [
      workout({ activeCalories: 400 }),
      workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${DAY}T07:00:00-07:00`, endedAt: `${DAY}T07:40:00-07:00`, activeCalories: 150 }),
    ], "b2");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalDays).toEqual([day]);
    expect(snapshot.healthKitCanonicalDays[0].current.values.dailyActivity.move_calories).toBe(900);
    expect(snapshot.healthKitCanonicalDays[0].current.workoutActiveCaloriesAdditive).toBe(false);
    expect(snapshot.healthKitCanonicalWorkouts.every((w) => w.activityInteraction.additiveToDailyActivity === false)).toBe(true);
  });

  it("leaves the current Activity + Nutrition test-day canonicalization exactly as it is when the Workout policy is on", async () => {
    const both = store({ dailyPolicy: true, workoutPolicy: true });
    const alone = store({ dailyPolicy: true, workoutPolicy: false });
    for (const records of [both, alone]) await ingest(records, [activity({ moveCalories: 800 }), nutrition()], "b1");
    const strip = (days) => days.map(({ createdAt, updatedAt, coexistence, ...rest }) => rest);
    expect(strip(both.snapshot().healthKitCanonicalDays)).toEqual(strip(alone.snapshot().healthKitCanonicalDays));
  });
});

describe("strategic quarantine", () => {
  it("keeps Apple workouts and links out of V3, Evidence, and every strategic reader", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "b1");
    const snapshot = records.snapshot();
    const universe = createV3EvidenceUniverse({
      store: snapshot, goal: { id: "g" }, phase: { id: "p", startedAt: "2026-09-01" }, evidenceCutoff: "2026-09-27T06:59:59.999Z",
    });
    expect(JSON.stringify(universe)).not.toMatch(/healthkit/i);
    const derived = [...snapshot.healthKitCanonicalWorkouts, ...snapshot.healthKitWorkoutLinks];
    expect(derived).toHaveLength(2);
    expect(derived.every((record) => assessHealthKitStrategicEvidenceEligibility(record).eligible === false)).toBe(true);
    expect(selectStrategicallyEligibleRecords(derived)).toEqual([]);
    for (const record of derived) expect(() => assertNotQuarantinedHealthKitEvidence(record)).toThrow();
    // No Training performance events, PRs, or Library records are produced.
    expect(snapshot.trainingPerformanceEvents).toEqual([{ id: "trainingPerformanceEvents-sentinel", version: 1 }]);
    expect(snapshot.canonicalExerciseLibrary).toEqual([{ id: "canonicalExerciseLibrary-sentinel", version: 1 }]);
  });
});

async function ingest(records, observations, batchId = "batch-one", { receivedAt = "2026-09-23T23:30:00.000Z" } = {}) {
  return createCanonicalPersistenceCommandPorts({ records, now: () => new Date(receivedAt) })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: receivedAt, clientTimeZone: "America/Los_Angeles", idempotencyKey: `key-${batchId}` },
      payload: { batchId, observations },
    });
}

function policy(overrides = {}) {
  return {
    id: WORKOUT_POLICY_ID,
    schemaVersion: "healthkit-workout-activation-policy-v1",
    status: "enabled",
    domains: ["workout"],
    effectiveLocalDate: DAY,
    endLocalDate: DAY,
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    linkAutoConfirm: false,
    version: 1,
    ...overrides,
  };
}

function store({ workoutPolicy = true, workoutPolicyOverrides = {}, dailyPolicy = false, evidence = [] } = {}) {
  const configuration = [];
  if (workoutPolicy) configuration.push(policy(workoutPolicyOverrides));
  if (dailyPolicy) {
    configuration.push({
      id: DAILY_POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled",
      domains: ["activity", "nutrition"], effectiveLocalDate: DAY, endLocalDate: DAY,
      strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1,
    });
  }
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitConfiguration: configuration,
    canonicalEvidenceObjects: evidence,
    evidencePackages: [],
    ...Object.fromEntries(SENTINELS.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
}

function workout({
  activityType = "50", externalId = HK_UUID, startedAt = `${DAY}T10:00:00-07:00`, endedAt = `${DAY}T11:00:00-07:00`,
  clientLocalDate = DAY, durationSeconds = 3600, activeCalories = 400, averageHeartRate = 122, sourceRevision,
} = {}) {
  return {
    observationType: "workout",
    externalId,
    source: { bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch", productType: "Watch7,5" },
    occurrence: { localDate: clientLocalDate, timeZone: "America/Los_Angeles", startedAt, endedAt },
    workout: { activityType, durationSeconds, activeCalories, averageHeartRate, ...(sourceRevision ? { sourceRevision } : {}) },
  };
}

function activity({ moveCalories = 800 } = {}) {
  return {
    observationType: "activity_summary",
    externalId: `activity-summary:${DAY}`,
    source: { bundleIdentifier: "com.apple.Health" },
    occurrence: { localDate: DAY, timeZone: "America/Los_Angeles" },
    activitySummary: { aggregationScope: "daily_total_including_workouts", coverage: "complete_day", sourceRevision: 1, dailyActivity: { move_calories: moveCalories, exercise_minutes: 50, stand_hours: 11 } },
  };
}

function nutrition() {
  return {
    observationType: "nutrition_daily_total",
    externalId: `nutrition-daily-total:${DAY}`,
    source: { bundleIdentifier: "com.apple.Health" },
    occurrence: { localDate: DAY, timeZone: "America/Los_Angeles" },
    nutritionDailyTotal: { aggregationScope: "daily_total_all_sources", coverage: "complete_day", sourceRevision: 1, dailyNutrition: { calories: 2400, protein_g: 200, carbs_g: 250, fat_g: 70 } },
  };
}

function logger(id, start, end, duration = 3540) {
  return {
    canonicalId: id,
    version: 1,
    quality: { status: "active" },
    payload: {
      id, evidence_type: "training", observed_at: DAY,
      source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
      metadata: { activity_type: "Traditional Strength Training", start_time: `${DAY}T${start}:00-07:00`, end_time: `${DAY}T${end}:00-07:00`, duration_seconds: duration, logger_origin: "training_logger", logger_mode: "live" },
      exercises: [{ name: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    },
  };
}

function liveLogger(id, start, end, duration = 3540) {
  const session = logger(id, start, end, duration);
  session.payload.metadata.logger_origin = "training_logger";
  session.payload.metadata.logger_mode = "live";
  return session;
}

describe("review hardening: real storage, duplicates, and shapes", () => {
  // A jsonb column returns object keys shorter-first then bytewise, not in insertion order.
  const jsonbOrder = (value) => {
    if (Array.isArray(value)) return value.map(jsonbOrder);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((key) => [key, jsonbOrder(value[key])]));
    }
    return value;
  };
  const jsonbStore = (inner) => Object.freeze({
    ...inner,
    get: async (input) => { const r = await inner.get(input); return r ? jsonbOrder(r) : r; },
    list: async (input) => (await inner.list(input)).map(jsonbOrder),
    putIfAbsent: async (input) => { const r = await inner.putIfAbsent(input); return { ...r, record: jsonbOrder(r.record) }; },
    put: async (input) => jsonbOrder(await inner.put(input)),
  });

  it("is idempotent on a store that reorders keys: repeated replays write nothing and never bump versions", async () => {
    const inner = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    const records = jsonbStore(inner);
    await ingest(records, [workout()], "b1");
    const version = (await records.list({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts" }))[0].version;
    for (const batch of ["b2", "b3", "b4"]) {
      const replay = await ingest(records, [workout()], batch);
      expect(replay.result.workoutRelationships).toMatchObject({ updated: 0, candidateLinksCreated: 0, candidateLinksReleased: 0, candidateLinksRefreshed: 0 });
    }
    expect((await records.list({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts" }))[0].version).toBe(version);
    const walk = workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${DAY}T07:00:00-07:00`, endedAt: `${DAY}T07:40:00-07:00` });
    await ingest(records, [walk], "c1");
    const walkVersion = (await records.list({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts" })).find((w) => w.current.family === "cardio").version;
    for (const batch of ["c2", "c3"]) {
      expect((await ingest(records, [walk], batch)).result.workoutRelationships.updated).toBe(0);
    }
    expect((await records.list({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts" })).find((w) => w.current.family === "cardio").version).toBe(walkVersion);
  });

  it("keeps one physical workout from becoming two candidate links when HealthKit re-creates it under a new UUID", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout({ externalId: "original-uuid" })], "b1");
    const recreated = await ingest(records, [workout({ externalId: "recreated-uuid" })], "b2");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts).toHaveLength(2);
    expect(snapshot.healthKitWorkoutLinks).toHaveLength(1);
    const [first, second] = [...snapshot.healthKitCanonicalWorkouts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    expect(first.linkAssessment).toMatchObject({ outcome: "confident_match", possibleDuplicateOf: [second.id] });
    expect(second.linkAssessment).toMatchObject({ linkSuppressed: "possible_duplicate_of_another_canonical_workout", possibleDuplicateOf: [first.id] });
    expect(snapshot.healthKitWorkoutLinks[0].canonicalWorkoutId).toBe(first.id);
    expect(recreated.result.workoutRelationships.candidateLinksCreated).toBe(0);
  });

  it("restores the system's own released candidate when the ambiguity later clears", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    await ingest(records, [workout()], "b1");
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-b", payload: logger("session-b", "10:02", "11:01") });
    await ingest(records, [workout()], "b2");
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("unlinked");
    const b = await records.get({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-b" });
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "session-b", expectedVersion: b.version, payload: { ...b, quality: { status: "superseded" } } });
    const cleared = await ingest(records, [workout()], "b3");
    expect(cleared.result.workoutRelationships.candidateLinksRefreshed).toBe(1);
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("candidate");
    expect(records.snapshot().healthKitWorkoutLinks[0].statusHistory.at(-1)).toMatchObject({ reason: "assessment_restored" });
  });

  it("links a Logger session recorded with a bare wall time or meridiem time", async () => {
    const shaped = logger("session-a", "10:01", "10:59");
    shaped.payload.metadata.start_time = "10:01 AM";
    shaped.payload.metadata.end_time = "10:59 AM";
    const records = store({ evidence: [shaped] });
    const result = await ingest(records, [workout()], "b1");
    expect(result.result.workoutRelationships.candidateLinksCreated).toBe(1);
    expect(records.snapshot().healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "confident_match", unverifiableSessionCount: 0 });
  });

  it("treats an explicit first sourceRevision as the same observation as an unstated one", async () => {
    const records = store();
    await ingest(records, [workout()], "b1");
    const again = await ingest(records, [workout({ sourceRevision: 1 })], "b2");
    expect(again.result).toMatchObject({ status: "matched", matchedCount: 1, createdCount: 0 });
    expect(records.snapshot().healthKitObservations).toHaveLength(1);
  });

  it("keeps coexistence on the canonical cardio workout across a later revision", async () => {
    const shot = { canonicalId: "training|screenshot|walk-1", version: 1, quality: { status: "active" }, payload: {
      id: "walk-1", evidence_type: "training", observed_at: DAY, source: { application: "Apple Fitness", modality: "screenshot" },
      metadata: { activity_type: "Outdoor Walk", start_time: "07:01:00", end_time: "07:41:00", duration_seconds: 2400, active_calories: 150 }, exercises: [] } };
    const records = store({ evidence: [shot] });
    const walk = (extra = {}) => workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${DAY}T07:00:00-07:00`, endedAt: `${DAY}T07:40:00-07:00`, durationSeconds: 2400, activeCalories: 150, ...extra });
    await ingest(records, [walk()], "b1");
    await ingest(records, [walk({ sourceRevision: 2, activeCalories: 160 })], "b2");
    expect(records.snapshot().healthKitCanonicalWorkouts[0]).toMatchObject({ revision: 2, coexistence: { state: "matches_existing_evidence_workout" } });
  });
});

describe("link hardening through the real ingest path", () => {
  const withClaims = (records) => records;
  const confirmLink = async (records, linkId) => {
    const { confirmHealthKitWorkoutRelationship } = await import("../../domain/services/HealthKitWorkoutRelationshipService.js");
    return confirmHealthKitWorkoutRelationship({ records: withClaims(records), ownerUserId: OWNER, linkId, by: { kind: "founder", ref: "c" }, now: "2026-09-23T22:00:00.000Z" });
  };
  const storeWithClaims = (options) => {
    const inner = store(options);
    return inner;
  };

  it("never creates a confirmed link or a claim from ingestion, even for an explicit source identity", async () => {
    const explicit = logger("session-x", "18:00", "19:00");
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const records = storeWithClaims({ evidence: [explicit] });
    await ingest(records, [workout()], "b1");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitWorkoutLinks).toHaveLength(1);
    expect(snapshot.healthKitWorkoutLinks[0]).toMatchObject({ status: "candidate", matchBasis: "explicit_source_identity", confidence: 100 });
    expect(snapshot.healthKitWorkoutLinkClaims ?? []).toEqual([]);
  });

  it("routes a temporally incompatible explicit identity to review even when auto-confirm is enabled", async () => {
    const explicit = logger("session-x", "18:00", "19:00");
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const records = storeWithClaims({
      evidence: [explicit],
      workoutPolicyOverrides: {
        linkAutoConfirm: true,
        linkAutoConfirmEffectiveAt: "2026-09-23T23:00:00.000Z",
      },
    });
    const result = await ingest(records, [workout()], "explicit-temporal-refusal");
    const snapshot = records.snapshot();
    expect(result.result.workoutRelationships.automaticallyConfirmed ?? 0).toBe(0);
    expect(result.result.workoutRelationships.automaticConfirmationRefusals).toEqual([
      expect.objectContaining({ reasons: expect.arrayContaining(["deterministic_basis_not_allowlisted"]) }),
    ]);
    expect(snapshot.healthKitWorkoutLinks).toEqual([
      expect.objectContaining({ status: "candidate", matchBasis: "explicit_source_identity" }),
    ]);
    expect(snapshot.healthKitWorkoutLinkClaims ?? []).toEqual([]);
    expect(snapshot.evidenceReviews).toEqual([
      expect.objectContaining({
        reviewKind: "healthkit_workout_reconciliation",
        status: "pending",
        candidates: [expect.objectContaining({
          loggerSessionCanonicalId: "session-x",
          substantiveOverlap: false,
          startAligned: false,
          endAligned: false,
        })],
      }),
    ]);
  });

  it("excludes an aligned explicit identity from non-Logger evidence", async () => {
    const explicit = logger("session-x", "10:00", "11:00");
    explicit.payload.source = { application: "Evidence import", modality: "screenshot" };
    delete explicit.payload.metadata.logger_origin;
    delete explicit.payload.metadata.logger_mode;
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const records = storeWithClaims({
      evidence: [explicit],
      workoutPolicyOverrides: {
        linkAutoConfirm: true,
        linkAutoConfirmEffectiveAt: "2026-09-23T23:00:00.000Z",
      },
    });
    const result = await ingest(records, [workout()], "explicit-untrusted-provenance");
    const snapshot = records.snapshot();
    expect(result.result.workoutRelationships.automaticallyConfirmed ?? 0).toBe(0);
    expect(result.result.workoutRelationships.automaticConfirmationRefusals).toEqual([]);
    expect(snapshot.healthKitWorkoutLinks ?? []).toEqual([]);
    expect(snapshot.healthKitWorkoutLinkClaims ?? []).toEqual([]);
    expect(snapshot.evidenceReviews ?? []).toEqual([]);
    expect(snapshot.healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "no_match", reason: "no_plausible_logger_session" });
  });

  it("does not treat a sequential session that only touches the Apple workout as a match", async () => {
    const records = store({ evidence: [logger("session-a", "09:00", "10:00", 3600)] });
    const result = await ingest(records, [workout()], "b1");
    expect(result.result.workoutRelationships.candidateLinksCreated).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "no_match", reason: "no_plausible_logger_session" });
    expect(records.snapshot().healthKitWorkoutLinks).toEqual([]);
  });

  it("makes adjacent Logger sessions a clear match for the right one and ambiguous when the Apple workout straddles", async () => {
    const a = logger("A", "09:00", "10:00", 3600);
    const b = logger("B", "10:00", "11:00", 3600);
    const clear = store({ evidence: [a, b] });
    await ingest(clear, [workout({ startedAt: `${DAY}T10:00:00-07:00`, endedAt: `${DAY}T11:00:00-07:00` })], "b1");
    expect(clear.snapshot().healthKitWorkoutLinks.map((l) => l.loggerSessionCanonicalId)).toEqual(["B"]);
    const straddle = store({ evidence: [a, b] });
    await ingest(straddle, [workout({ startedAt: `${DAY}T09:45:00-07:00`, endedAt: `${DAY}T10:45:00-07:00` })], "b1");
    expect(straddle.snapshot().healthKitCanonicalWorkouts[0].linkAssessment).toMatchObject({ outcome: "ambiguous_multiple" });
    expect(straddle.snapshot().healthKitWorkoutLinks).toEqual([]);
  });

  it("never crowds an established confirmed link: a re-created UUID and further replays add no candidate", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59")] });
    // the claims collection must exist for the guarded service
    await ingest(records, [workout({ externalId: "original-uuid" })], "b1");
    const linkId = records.snapshot().healthKitWorkoutLinks[0].id;
    await confirmLink(records, linkId);
    const confirmed = structuredClone(records.snapshot().healthKitWorkoutLinks[0]);
    const recreated = await ingest(records, [workout({ externalId: "recreated-uuid" })], "b2");
    const replay = await ingest(records, [workout({ externalId: "original-uuid" })], "b3");
    const snapshot = records.snapshot();
    expect(recreated.result.workoutRelationships.candidateLinksCreated).toBe(0);
    expect(replay.result.workoutRelationships).toMatchObject({ candidateLinksCreated: 0, candidateLinksReleased: 0 });
    expect(snapshot.healthKitWorkoutLinks).toHaveLength(1);
    expect(snapshot.healthKitWorkoutLinks[0]).toEqual(confirmed);
    const dup = snapshot.healthKitCanonicalWorkouts.find((w) => w.linkAssessment?.linkSuppressed);
    expect(dup.linkAssessment.linkSuppressed).toMatch(/possible_duplicate_of_another_canonical_workout|workout_or_duplicate_already_linked/);
  });
});

describe("prospective (open-ended, Strength-only) Workout policy", () => {
  const LATER = "2026-10-03"; // ten days after effectiveLocalDate: beyond any bounded window
  const prospective = { openEnded: true, endLocalDate: undefined, families: ["strength"] };
  const laterLogger = (id) => {
    const session = logger(id, "10:01", "10:59");
    return { ...session, payload: { ...session.payload, observed_at: LATER, metadata: { ...session.payload.metadata,
      start_time: `${LATER}T10:01:00-07:00`, end_time: `${LATER}T10:59:00-07:00` } } };
  };

  it("resolves open-ended with no end date and an explicit family scope; absent families mean every family", () => {
    expect(resolveHealthKitWorkoutActivationPolicy(policy(prospective))).toMatchObject({
      enabled: true, effectiveLocalDate: DAY, endLocalDate: null, openEnded: true, families: ["strength"],
    });
    expect(resolveHealthKitWorkoutActivationPolicy(policy())).toMatchObject({ enabled: true, openEnded: false, families: ["cardio", "strength"] });
    expect(resolveHealthKitWorkoutActivationPolicy(policy({ families: ["strength", "cardio", "strength"] })).families).toEqual(["cardio", "strength"]);
  });

  it.each([
    ["an open-ended flag together with an end date", { openEnded: true, families: ["strength"] }, "open_ended_window_must_have_no_end_date"],
    ["a non-boolean open-ended flag", { openEnded: "yes" }, "open_ended_flag_invalid"],
    ["an empty family list", { families: [] }, "families_invalid"],
    ["an unknown family", { families: ["strength", "unsupported"] }, "families_invalid"],
    ["a non-array family scope", { families: "strength" }, "families_invalid"],
  ])("fails closed on %s", async (_label, overrides, invalidReason) => {
    expect(resolveHealthKitWorkoutActivationPolicy(policy(overrides))).toMatchObject({ enabled: false, invalidReason });
    const records = store({ workoutPolicyOverrides: overrides });
    await ingest(records, [workout()]);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("canonicalizes a strength workout far past the effective date and still creates the link candidate (no upper bound)", async () => {
    const records = store({ workoutPolicyOverrides: prospective, evidence: [laterLogger("session-later")] });
    const before = records.snapshot();
    const result = await ingest(records, [workout({ startedAt: `${LATER}T10:00:00-07:00`, endedAt: `${LATER}T11:00:00-07:00`, clientLocalDate: LATER })]);
    expect(result.result).toMatchObject({ workoutCanonicalizedCount: 1, workoutRelationships: { assessed: 1, candidateLinksCreated: 1 } });
    const [canonical] = records.snapshot().healthKitCanonicalWorkouts;
    expect(canonical).toMatchObject({
      localDate: LATER, current: { family: "strength" },
      activation: { effectiveLocalDate: DAY, endLocalDate: null, openEnded: true, families: ["strength"] },
      linkAssessment: { outcome: "confident_match", candidates: [{ loggerSessionCanonicalId: "session-later" }] },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(records.snapshot().healthKitWorkoutLinks).toHaveLength(1);
    expect(records.snapshot().healthKitWorkoutLinks[0]).toMatchObject({ status: "candidate", loggerSessionCanonicalId: "session-later" });
    for (const name of [...SENTINELS, "canonicalEvidenceObjects", "evidencePackages"]) expect(records.snapshot()[name]).toEqual(before[name]);
  });

  it("keeps a cardio workout raw under a Strength-only scope with its real reason stored, no canonical record or coexistence", async () => {
    const records = store({ workoutPolicyOverrides: prospective });
    const walk = workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${LATER}T07:00:00-07:00`, endedAt: `${LATER}T07:40:00-07:00`, clientLocalDate: LATER });
    const result = await ingest(records, [walk]);
    expect(result.result.workoutCanonicalizedCount).toBe(0);
    expect(result.result.observations[0].reconciliation).toEqual({ state: "workout_canonicalization_deferred", reason: "family_not_in_activation_scope" });
    const [stored] = records.snapshot().healthKitObservations;
    expect(stored.reconciliation).toEqual({ state: "workout_canonicalization_deferred", reason: "family_not_in_activation_scope" });
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
    expect(records.snapshot().healthKitWorkoutLinks).toEqual([]);
    // Same rule as every raw workout stored under a policy: not reconsidered later.
    const current = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID, expectedVersion: current.version, payload: { ...current, families: ["cardio", "strength"] } });
    const replay = await ingest(records, [walk], "b2");
    expect(replay.result.workoutCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
    // The stored reason is sticky across replays so an audit keeps counting it.
    expect(replay.result.observations[0]).toMatchObject({ outcome: "matched", reconciliation: { state: "workout_canonicalization_deferred", reason: "family_not_in_activation_scope" } });
    expect(records.snapshot().healthKitObservations[0]).toEqual(stored);
  });

  it("still refuses a workout whose own day is before the effective date (no backfill through an open window)", async () => {
    const records = store({ workoutPolicyOverrides: prospective });
    const result = await ingest(records, [workout({ startedAt: "2026-09-22T10:00:00-07:00", endedAt: "2026-09-22T11:00:00-07:00", clientLocalDate: "2026-09-22" })]);
    expect(result.result.workoutCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("a bounded policy naming both families still canonicalizes cardio exactly as before", async () => {
    const records = store({ workoutPolicyOverrides: { families: ["cardio", "strength"] } });
    await ingest(records, [workout({ externalId: "walk-uuid", activityType: "52", startedAt: `${DAY}T07:00:00-07:00`, endedAt: `${DAY}T07:40:00-07:00` })]);
    expect(records.snapshot().healthKitCanonicalWorkouts).toHaveLength(1);
    expect(records.snapshot().healthKitCanonicalWorkouts[0].current.family).toBe("cardio");
  });
});

describe("same-identity workout content drift (immutable HealthKit workout re-delivered with changed statistics)", () => {
  it("acknowledges and ignores the drifted copy: stored observation, canonical workout and link byte-identical; later observations in the batch still ingest", async () => {
    const records = store({ evidence: [logger("session-a", "10:01", "10:59"), logger("far-away", "18:00", "19:00")] });
    await ingest(records, [workout()], "b1");
    const before = records.snapshot();
    const drifted = workout({ averageHeartRate: 131, activeCalories: 412 });
    const second = workout({ externalId: "second-uuid", startedAt: `${DAY}T16:00:00-07:00`, endedAt: `${DAY}T17:00:00-07:00` });
    const result = await ingest(records, [drifted, second], "b2");
    expect(result.status).toBe("committed");
    expect(result.result.observations[0]).toMatchObject({
      sourceObservationId: before.healthKitObservations[0].id, outcome: "ignored", observationType: "workout",
      reconciliation: { state: "workout_canonicalized" }, replay: { ignored: true, reason: "workout_content_drift_same_identity" },
    });
    expect(result.result.observations[1]).toMatchObject({ outcome: "created", reconciliation: { state: "workout_canonicalized" } });
    // Like a matched replay, the ignored copy reports the stored canonicalized state.
    expect(result.result).toMatchObject({ workoutCanonicalizedCount: 2, ignoredCount: 1, createdCount: 1, acceptedCount: 2 });
    const after = records.snapshot();
    expect(after.healthKitObservations.find((record) => record.id === before.healthKitObservations[0].id)).toEqual(before.healthKitObservations[0]);
    expect(after.healthKitCanonicalWorkouts.find((record) => record.id === before.healthKitCanonicalWorkouts[0].id)).toEqual(before.healthKitCanonicalWorkouts[0]);
    expect(after.healthKitWorkoutLinks.find((record) => record.id === before.healthKitWorkoutLinks[0].id)).toEqual(before.healthKitWorkoutLinks[0]);
    expect(after.healthKitObservations).toHaveLength(2);
    expect(after.healthKitCanonicalWorkouts).toHaveLength(2);
    expect(after.healthKitWorkoutLinks).toHaveLength(1);
    for (const name of [...SENTINELS, "canonicalEvidenceObjects", "evidencePackages"]) expect(after[name]).toEqual(before[name]);
    // Ignoring is stable: the same drifted copy alone is ignored again, with nothing written.
    const again = await ingest(records, [drifted], "b3");
    expect(again.result.observations[0].outcome).toBe("ignored");
    expect(records.snapshot()).toEqual(after);
  });

  it("ignores drift for a workout that stayed raw (no policy) without ever canonicalizing it", async () => {
    const records = store({ workoutPolicy: false });
    await ingest(records, [workout()], "b1");
    const before = records.snapshot();
    const result = await ingest(records, [workout({ averageHeartRate: 131 })], "b2");
    expect(result.result.observations[0]).toMatchObject({ outcome: "ignored", replay: { reason: "workout_content_drift_same_identity" } });
    expect(records.snapshot()).toEqual(before);
  });

  it("still refuses a purpose change, a batch-internal duplicate with different content, and a drifted daily snapshot", async () => {
    const records = store({ dailyPolicy: true });
    await ingest(records, [workout(), activity()], "b1");
    const before = records.snapshot();
    await expect(ingest(records, [{ ...workout({ averageHeartRate: 131 }), ingestionPurpose: "validation_only" }], "b2"))
      .rejects.toMatchObject({ status: 409, code: "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE" });
    await expect(ingest(records, [workout(), workout({ averageHeartRate: 131 })], "b3"))
      .rejects.toMatchObject({ status: 409, code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION" });
    await expect(ingest(records, [activity({ moveCalories: 801 })], "b4"))
      .rejects.toMatchObject({ status: 409, code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION" });
    expect(records.snapshot()).toEqual(before);
  });
});
