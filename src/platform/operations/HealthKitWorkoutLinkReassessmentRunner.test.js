import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { normalizeHealthKitObservationBatch } from "../../domain/services/HealthKitObservationService.js";
import { reconcileHealthKitCanonicalWorkout } from "../../domain/services/HealthKitWorkoutService.js";
import { runHealthKitWorkoutLinkReassessment } from "./HealthKitWorkoutLinkReassessmentRunner.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";

const OWNER = "user_founder_001";
const DAY = "2026-09-23";
const NOW = "2026-09-23T17:00:00.000Z";
const AUTH = {
  ownerUserId: OWNER,
  localDate: DAY,
  authorizationReference: "founder-chat-approved-sep23-strength-reassessment",
};

describe("guarded Workout link reassessment operation", () => {
  it("dry-run proves the exact Sep 23 Logger candidate and predicts only candidate, assessment, and audit writes", async () => {
    const records = await world();
    const before = records.snapshot();

    const result = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });

    expect(result).toMatchObject({
      outcome: "dry_run",
      localDate: DAY,
      canonicalType: "traditional_strength_training",
      linkStatus: "candidate",
      loggerSessionCanonicalId: "training|authoritative|training_logger_draft_sep23",
      matchOutcome: "confident_match",
      confidence: 95,
      matchBasis: "logger_session_window",
      matcherVersion: "healthkit-strength-matcher-v5",
      predictedMutations: [
        { collection: "healthKitWorkoutLinks", operation: "create", to: "candidate" },
        { collection: "healthKitCanonicalWorkouts", operation: "update_assessment" },
        { collection: "healthKitConfiguration", operation: "create" },
      ],
    });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
    expect(result.facts).toMatchObject({
      evidenceStorageMetadataCount: 1,
      evidenceStorageMetadataDigest: expect.any(String),
    });
  });

  it("fails closed for the production-shaped Sep 23 record without a usable durable Server commit timestamp", async () => {
    const absent = await world({ loggerCommitTimestamp: null });
    const absentBefore = absent.snapshot();
    const absentResult = await runHealthKitWorkoutLinkReassessment({ records: absent, authorization: AUTH, now });
    expect(absentResult).toMatchObject({
      outcome: "refused",
      reasons: ["single_session_below_confident_threshold"],
      matchOutcome: "possible_match",
      candidateCount: 1,
    });
    expect(absent.snapshot()).toEqual(absentBefore);
    expect(absent.getMutationCount()).toBe(0);

    const misaligned = await world({ loggerCommitTimestamp: "2026-09-23T16:56:31Z" });
    const misalignedResult = await runHealthKitWorkoutLinkReassessment({ records: misaligned, authorization: AUTH, now });
    expect(misalignedResult).toMatchObject({
      outcome: "refused",
      reasons: ["single_session_below_confident_threshold"],
      matchOutcome: "possible_match",
      candidateCount: 1,
    });
  });

  it("apply is drift-fenced and writes one quarantined candidate without confirmation, claims, Logger mutation, or policy changes", async () => {
    const records = await world();
    const before = records.snapshot();
    const dry = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });

    const drifted = await runHealthKitWorkoutLinkReassessment({
      records,
      authorization: AUTH,
      apply: true,
      expected: { ...dry.facts, evidenceDigest: "stale" },
      now,
    });
    expect(drifted).toMatchObject({ outcome: "drifted", drift: ["evidenceDigest"] });
    expect(records.snapshot()).toEqual(before);

    const applied = await runHealthKitWorkoutLinkReassessment({
      records,
      authorization: AUTH,
      apply: true,
      expected: dry.facts,
      now,
    });

    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinks).toHaveLength(1);
    expect(after.healthKitWorkoutLinks[0]).toMatchObject({
      status: "candidate",
      matchOutcome: "confident_match",
      matchBasis: "logger_session_window",
      evidenceEligibility: { state: "quarantined", strategic: false },
      contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
    });
    expect(after.healthKitWorkoutLinkClaims).toEqual([]);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    expect(after.healthKitConfiguration.filter((item) => item.id?.includes("activation_policy")))
      .toEqual(before.healthKitConfiguration.filter((item) => item.id?.includes("activation_policy")));
    expect(after.healthKitConfiguration.find((item) => item.kind === "healthkit_workout_link_reassessment_audit"))
      .toMatchObject({ autoConfirm: false, strategicEvidenceEligibility: "quarantined" });
  });

  it("is idempotent after reassessment and never upgrades the candidate", async () => {
    const records = await world();
    const dry = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });
    await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, apply: true, expected: dry.facts, now });
    const mutations = records.getMutationCount();

    const replay = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });
    const applyReplay = await runHealthKitWorkoutLinkReassessment({
      records,
      authorization: AUTH,
      apply: true,
      expected: dry.facts,
      now,
    });

    expect(replay).toMatchObject({ outcome: "already_reassessed", linkStatus: "candidate" });
    expect(applyReplay).toMatchObject({
      outcome: "already_reassessed",
      linkStatus: "candidate",
      auditRecordId: expect.stringContaining("healthkit_workout_link_reassessment_audit_"),
    });
    expect(records.getMutationCount()).toBe(mutations);
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("candidate");
  });

  it("keeps the guarded confident candidate durable through ordinary HealthKit reassessment", async () => {
    const records = await world();
    const dry = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });
    await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, apply: true, expected: dry.facts, now });

    await createCanonicalPersistenceCommandPorts({ records, now }).ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "session" },
      metadata: { clientOccurredAt: NOW },
      payload: {
        batchId: "post-guarded-reassessment",
        observations: [{
          observationType: "workout",
          externalId: "sep23-strength",
          source: { bundleIdentifier: "com.apple.health.watch" },
          occurrence: {
            localDate: DAY,
            timeZone: "America/Los_Angeles",
            startedAt: "2026-09-23T13:47:54Z",
            endedAt: "2026-09-23T14:57:12Z",
          },
          workout: { activityType: "50", durationSeconds: 4158, activeCalories: 400 },
        }],
      },
    });

    expect(records.snapshot().healthKitWorkoutLinks).toHaveLength(1);
    expect(records.snapshot().healthKitWorkoutLinks[0]).toMatchObject({
      status: "candidate",
      matchOutcome: "confident_match",
      confidence: 95,
      matcherVersion: "healthkit-strength-matcher-v5",
    });
  });

  it("does not treat an existing candidate as an authorized apply success without the matching audit", async () => {
    const records = await world();
    const dry = await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, now });
    await runHealthKitWorkoutLinkReassessment({ records, authorization: AUTH, apply: true, expected: dry.facts, now });
    const mutations = records.getMutationCount();
    const differentAuthorization = { ...AUTH, authorizationReference: "a-different-founder-authorization" };
    const current = await runHealthKitWorkoutLinkReassessment({ records, authorization: differentAuthorization, now });

    const result = await runHealthKitWorkoutLinkReassessment({
      records,
      authorization: differentAuthorization,
      apply: true,
      expected: current.facts,
      now,
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reasons: ["existing_reassessment_without_matching_authorization_audit"],
    });
    expect(records.getMutationCount()).toBe(mutations);
  });

  it("refuses if the Strength policy safety flags move, or date/workout/session uniqueness is absent", async () => {
    const unsafePolicy = await world({ linkAutoConfirm: true });
    expect(await runHealthKitWorkoutLinkReassessment({ records: unsafePolicy, authorization: AUTH, now }))
      .toMatchObject({ outcome: "refused", reasons: ["policy_safety_flags_not_preserved"] });

    const strategicPolicy = await world({ strategicEvidenceEligibility: "eligible" });
    expect(await runHealthKitWorkoutLinkReassessment({ records: strategicPolicy, authorization: AUTH, now }))
      .toMatchObject({ outcome: "refused", reasons: ["policy_safety_flags_not_preserved"] });

    const twoWorkouts = await world({ secondWorkout: true });
    expect(await runHealthKitWorkoutLinkReassessment({ records: twoWorkouts, authorization: AUTH, now }))
      .toMatchObject({ outcome: "refused", reasons: ["multiple_strength_workouts_on_date"] });

    const twoSessions = await world({ secondSession: true });
    const result = await runHealthKitWorkoutLinkReassessment({ records: twoSessions, authorization: AUTH, now });
    expect(result.outcome).toBe("refused");
    expect(result.matchOutcome).not.toBe("confident_match");
  });

  it("rejects invalid dates before reading state", async () => {
    const records = await world();
    await expect(runHealthKitWorkoutLinkReassessment({ records, authorization: { ...AUTH, localDate: "2026-02-30" }, now }))
      .rejects.toMatchObject({ code: "DATE_INVALID" });
    await expect(runHealthKitWorkoutLinkReassessment({ records, authorization: { ...AUTH, ownerUserId: "" }, now }))
      .rejects.toMatchObject({ code: "OWNER_REQUIRED" });
  });

  it("bundles the registered reassessment entry with apply safety requirements", async () => {
    const sha = "a".repeat(40);
    const dry = await buildHealthKitPayload({ kind: "link-reassess", sha, start: DAY, mode: "dry-run" });
    expect(dry.code).toContain("PHYSIQUEOS_HEALTHKIT_LINK_REASSESSMENT");
    await expect(buildHealthKitPayload({ kind: "link-reassess", sha, start: DAY, mode: "apply" }))
      .rejects.toThrow(/authorization-ref and --expected/);
  });
});

async function world({
  linkAutoConfirm = false,
  strategicEvidenceEligibility = "quarantined",
  secondWorkout = false,
  secondSession = false,
  loggerCommitTimestamp = "2026-09-23T14:56:31Z",
} = {}) {
  const evidence = [loggerSession("sep23"), ...(secondSession ? [loggerSession("other", "2026-09-23T13:54:00Z")] : [])];
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    canonicalEvidenceObjects: evidence,
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitCanonicalDays: [{ id: "day", version: 1, localDate: DAY, domain: "activity" }],
    healthKitObservations: [{ id: "observation", version: 1, observationType: "workout" }],
    healthKitConfiguration: [
      { id: "healthkit_canonical_daily_activation_policy", version: 1, status: "enabled", domains: ["activity", "nutrition"] },
      {
        id: "healthkit_workout_canonical_activation_policy",
        schemaVersion: "healthkit-workout-activation-policy-v1",
        version: 3,
        status: "enabled",
        domains: ["workout"],
        families: ["strength"],
        effectiveLocalDate: DAY,
        endLocalDate: null,
        openEnded: true,
        historicalBackfill: false,
        strategicEvidenceEligibility,
        linkAutoConfirm,
      },
    ],
  }, {
    storageMetadata: {
      canonicalEvidenceObjects: loggerCommitTimestamp === null ? [] : evidence.map((record, index) => ({
        recordId: record.canonicalId,
        createdAt: index === 0 ? loggerCommitTimestamp : "2026-09-23T14:57:00Z",
        updatedAt: index === 0 ? loggerCommitTimestamp : "2026-09-23T14:57:00Z",
      })),
    },
  });
  for (const workout of [canonicalWorkout("sep23-strength", "2026-09-23T13:47:54Z", "2026-09-23T14:57:12Z"),
    ...(secondWorkout ? [canonicalWorkout("sep23-strength-two", "2026-09-23T18:00:00Z", "2026-09-23T19:00:00Z")] : [])]) {
    await records.putIfAbsent({
      ownerUserId: OWNER,
      collection: "healthKitCanonicalWorkouts",
      recordId: workout.id,
      sourceIdentity: workout.id,
      payload: workout,
    });
  }
  return records;
}

function canonicalWorkout(externalId, startedAt, endedAt) {
  const observation = normalizeHealthKitObservationBatch({
    batchId: `batch-${externalId}`,
    principalDeviceId: "founder-iphone",
    observations: [{
      observationType: "workout",
      externalId,
      source: { bundleIdentifier: "com.apple.health.watch" },
      occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt, endedAt },
      workout: {
        activityType: "50",
        durationSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
        activeCalories: 400,
      },
    }],
  }).observations[0];
  return reconcileHealthKitCanonicalWorkout({ observation, ownerUserId: OWNER, now: NOW }).record;
}

function loggerSession(suffix, startedAt = "2026-09-23T13:53:26Z") {
  const canonicalId = `training|authoritative|training_logger_draft_${suffix}`;
  return {
    canonicalId,
    version: 1,
    quality: { status: "active" },
    payload: {
      id: `training_logger_draft_${suffix}`,
      evidence_type: "training",
      observed_at: DAY,
      captured_at: "2026-09-23T12:00:00.000Z",
      source: { application: "Training Logger", modality: "manual" },
      metadata: {
        activity_type: "Traditional Strength Training",
        logger_origin: "training_logger",
        logger_mode: "live",
        start_time: startedAt,
      },
      exercises: [{ name: "Strength movement", sets: [{ reps: 8, weight: 100 }] }],
    },
  };
}

function now() { return new Date(NOW); }
