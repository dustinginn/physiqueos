import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import {
  HealthKitReconciliationState,
  createHealthKitObservationRecord,
  normalizeHealthKitObservationBatch,
} from "../../domain/services/HealthKitObservationService.js";
import { getHealthKitCanonicalWorkoutRecordId, reconcileHealthKitCanonicalWorkout } from "../../domain/services/HealthKitWorkoutService.js";
import { WORKOUT_FAMILY_OUT_OF_SCOPE_REASON } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { runHealthKitDeferredWorkoutReconciliation } from "./HealthKitDeferredWorkoutReconciliationRunner.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";

const OWNER = "user_founder_001";
const DAY = "2026-09-24";
const NOW = "2026-09-24T20:00:00.000Z";
const AUTH_1 = { ownerUserId: OWNER, authorizationReference: "founder-chat-approved-sep24-indoor-walk-1" };
const AUTH_2 = { ownerUserId: OWNER, authorizationReference: "founder-chat-approved-sep24-indoor-walk-2" };

describe("guarded deferred HealthKit workout reconciliation operation", () => {
  it("refuses a parameter shape that isn't exactly one observation identity (no bulk list, no date range)", async () => {
    const { records, walk1Record, walk2Record } = await world();

    await expect(runHealthKitDeferredWorkoutReconciliation({ records, authorization: { ownerUserId: OWNER }, now }))
      .rejects.toMatchObject({ code: "OBSERVATION_ID_REQUIRED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: "" }, now,
    })).rejects.toMatchObject({ code: "OBSERVATION_ID_REQUIRED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: [walk1Record.id, walk2Record.id] }, now,
    })).rejects.toMatchObject({ code: "BULK_OR_RANGE_NOT_SUPPORTED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationIds: [walk1Record.id, walk2Record.id] }, now,
    })).rejects.toMatchObject({ code: "BULK_OR_RANGE_NOT_SUPPORTED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, startLocalDate: DAY, endLocalDate: DAY }, now,
    })).rejects.toMatchObject({ code: "BULK_OR_RANGE_NOT_SUPPORTED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, localDate: DAY }, now,
    })).rejects.toMatchObject({ code: "BULK_OR_RANGE_NOT_SUPPORTED" });
    expect(records.getMutationCount()).toBe(0);
  });

  it("refuses an unknown observation identity, and a wrong-reason or wrong-family deferred observation, cleanly", async () => {
    const { records, walk1Record } = await world();

    const missing = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: "healthkit_observation_does_not_exist", authorizationReference: "" }, now,
    });
    expect(missing).toMatchObject({ outcome: "refused", reasons: ["observation_not_found"] });

    // Wrong reason: deferred, but for a different (permanent) reason.
    const wrongReasonRecords = await world({ walk1ReconciliationReason: "before_activation_date" });
    const wrongReason = await runHealthKitDeferredWorkoutReconciliation({
      records: wrongReasonRecords.records,
      authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" },
      now,
    });
    expect(wrongReason).toMatchObject({
      outcome: "refused",
      reasons: ["not_a_family_scope_deferred_observation"],
      reconciliationReason: "before_activation_date",
    });

    // Wrong family: a Strength observation deferred for exactly this runner's
    // supported reason, but Strength's relationship pipeline is out of scope.
    const strengthDeferred = await worldWithStrengthDeferred();
    const wrongFamily = await runHealthKitDeferredWorkoutReconciliation({
      records: strengthDeferred.records,
      authorization: { ownerUserId: OWNER, observationId: strengthDeferred.observationRecord.id, authorizationReference: "" },
      now,
    });
    expect(wrongFamily).toMatchObject({ outcome: "refused", reasons: ["family_not_supported_by_this_runner"], family: "strength" });

    expect(records.getMutationCount()).toBe(0);
  });

  it("refuses when the CURRENT live policy does not (yet) include the observation's family", async () => {
    const { records, walk1Record } = await world({ cardioInScope: false });
    const result = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });
    expect(result).toMatchObject({ outcome: "refused", reasons: ["family_still_not_in_activation_scope"], family: "cardio" });
    expect(records.getMutationCount()).toBe(0);
  });

  it("reuses assessHealthKitWorkoutCanonicalization exactly: a family in scope but a window that excludes this workout's day is still refused", async () => {
    const { records, walk1Record } = await world({ cardioInScope: true, effectiveLocalDate: "2026-09-25" });
    const result = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });
    expect(result).toMatchObject({ outcome: "refused", reasons: ["before_activation_date"] });
    expect(records.getMutationCount()).toBe(0);
  });

  it("dry-run predicts the exact canonical workout id and mutations, and writes nothing", async () => {
    const { records, walk1Record } = await world();
    const before = records.snapshot();

    const result = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });

    expect(result).toMatchObject({
      outcome: "dry_run",
      observationId: walk1Record.id,
      canonicalWorkoutId: getHealthKitCanonicalWorkoutRecordId(walk1Record),
      canonicalType: "walking",
      workoutFamily: "cardio",
      coexistenceState: "no_other_source",
    });
    expect(result.predictedMutations).toHaveLength(4);
    expect(result.predictedMutations.slice(0, 3)).toEqual([
      { collection: "healthKitCanonicalWorkouts", recordId: getHealthKitCanonicalWorkoutRecordId(walk1Record), operation: "create" },
      { collection: "healthKitCanonicalWorkouts", recordId: getHealthKitCanonicalWorkoutRecordId(walk1Record), operation: "update_coexistence" },
      { collection: "healthKitObservations", recordId: walk1Record.id, operation: "update_reconciliation" },
    ]);
    expect(result.predictedMutations[3]).toMatchObject({ collection: "healthKitConfiguration", operation: "create" });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
  });

  it("apply requires an explicit authorizationReference even with fresh facts", async () => {
    const { records, walk1Record } = await world();
    const dry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" },
      apply: true,
      expected: dry.facts,
      now,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    expect(records.getMutationCount()).toBe(0);
  });

  it("is drift-fenced against the policy, the canonical workout set, and the strategic (graduation) policy digest", async () => {
    const { records, walk1Record } = await world({ includeGraduationPolicy: true });
    const dry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });

    // Drift the workout policy record between dry-run and apply.
    const policyDrifted = await runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ...AUTH_1, observationId: walk1Record.id },
      apply: true,
      expected: { ...dry.facts, workoutPolicyDigest: "stale" },
      now,
    });
    expect(policyDrifted).toMatchObject({ outcome: "drifted", drift: ["workoutPolicyDigest"] });

    // Drift the canonical-workout-set digest.
    const workoutSetDrifted = await runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ...AUTH_1, observationId: walk1Record.id },
      apply: true,
      expected: { ...dry.facts, canonicalWorkoutsDigest: "stale" },
      now,
    });
    expect(workoutSetDrifted).toMatchObject({ outcome: "drifted", drift: ["canonicalWorkoutsDigest"] });

    // Drift the strategic-state (graduation policy) digest.
    const strategicDrifted = await runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ...AUTH_1, observationId: walk1Record.id },
      apply: true,
      expected: { ...dry.facts, graduationPolicyDigest: "stale" },
      now,
    });
    expect(strategicDrifted).toMatchObject({ outcome: "drifted", drift: ["graduationPolicyDigest"] });

    // Drift links/claims digest.
    const linksDrifted = await runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ...AUTH_1, observationId: walk1Record.id },
      apply: true,
      expected: { ...dry.facts, linksDigest: "stale", claimsDigest: "stale" },
      now,
    });
    expect(linksDrifted).toMatchObject({ outcome: "drifted", drift: expect.arrayContaining(["linksDigest", "claimsDigest"]) });

    expect(records.getMutationCount()).toBe(0);
    expect(records.snapshot().healthKitCanonicalWorkouts).toHaveLength(1);
  });

  it("applies: creates exactly one canonical cardio workout, byte-identical telemetry, exact ingestion-shaped reconciliation, and only the read-only coexistence patch as a side effect", async () => {
    const { records, walk1Record } = await world();
    const before = records.snapshot();
    const dry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });

    const applied = await runHealthKitDeferredWorkoutReconciliation({
      records,
      authorization: { ...AUTH_1, observationId: walk1Record.id },
      apply: true,
      expected: dry.facts,
      now,
    });

    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);

    const after = records.snapshot();
    const canonicalWorkoutId = getHealthKitCanonicalWorkoutRecordId(walk1Record);
    expect(after.healthKitCanonicalWorkouts).toHaveLength(before.healthKitCanonicalWorkouts.length + 1);
    const workout = after.healthKitCanonicalWorkouts.find((item) => item.id === canonicalWorkoutId);
    expect(workout.current).toMatchObject({
      family: "cardio",
      canonicalType: "walking",
      startedAt: walk1Record.occurrence.startedAt,
      endedAt: walk1Record.occurrence.endedAt,
      telemetry: {
        durationSeconds: walk1Record.measurement.durationSeconds,
        activeCalories: walk1Record.measurement.activeCalories,
        distance: walk1Record.measurement.distance,
        averageHeartRate: walk1Record.measurement.averageHeartRate,
      },
    });
    expect(workout.contentAuthority).toEqual({ telemetry: "healthkit", trainingContent: "workout_logger" });
    expect(workout.evidenceEligibility).toMatchObject({ state: "quarantined", strategic: false });
    // The only Workout-collection side effect for cardio: a read-only
    // coexistence patch, never a link, a claim, or a Logger mutation.
    expect(workout.coexistence).toEqual({ state: "no_other_source", unverifiableCount: 0, candidates: [] });

    const observation = after.healthKitObservations.find((item) => item.id === walk1Record.id);
    expect(observation.reconciliation).toEqual({
      state: HealthKitReconciliationState.WORKOUT_CANONICALIZED,
      canonicalStore: "healthKitCanonicalWorkouts",
      canonicalId: canonicalWorkoutId,
      canonicalRevision: 1,
      canonicalAction: "create",
      workoutFamily: "cardio",
      evidenceEligibility: "quarantined",
      activityInteraction: "descriptive_never_additive",
    });
    // Indistinguishable in shape from a normally-canonicalized observation:
    // exactly the same reconciliation keys ingestion itself would write.
    expect(Object.keys(observation.reconciliation).sort()).toEqual(
      ["activityInteraction", "canonicalAction", "canonicalId", "canonicalRevision", "canonicalStore", "evidenceEligibility", "state", "workoutFamily"].sort()
    );

    expect(after.healthKitWorkoutLinks).toEqual(before.healthKitWorkoutLinks);
    expect(after.healthKitWorkoutLinkClaims).toEqual(before.healthKitWorkoutLinkClaims);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    expect(after.healthKitConfiguration.filter((item) => item.id?.includes("activation_policy")))
      .toEqual(before.healthKitConfiguration.filter((item) => item.id?.includes("activation_policy")));
    const audit = after.healthKitConfiguration.find((item) => item.kind === "healthkit_deferred_workout_reconciliation_audit");
    expect(audit).toMatchObject({ observationId: walk1Record.id, canonicalWorkoutId, workoutFamily: "cardio", strategicEvidenceEligibility: "quarantined" });
  });

  it("keeps two authorized Indoor Walk identities distinct from each other and from the existing Strength workout", async () => {
    const { records, walk1Record, walk2Record, strengthWorkout } = await world();
    const strengthBeforeDigest = JSON.stringify(records.snapshot().healthKitCanonicalWorkouts.find((item) => item.id === strengthWorkout.id));

    const dry1 = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });
    const applied1 = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ...AUTH_1, observationId: walk1Record.id }, apply: true, expected: dry1.facts, now,
    });

    const dry2 = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk2Record.id, authorizationReference: "" }, now,
    });
    const applied2 = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ...AUTH_2, observationId: walk2Record.id }, apply: true, expected: dry2.facts, now,
    });

    expect(applied1.outcome).toBe("applied");
    expect(applied2.outcome).toBe("applied");
    expect(applied1.canonicalWorkoutId).not.toBe(applied2.canonicalWorkoutId);
    expect(applied1.canonicalWorkoutId).not.toBe(strengthWorkout.id);
    expect(applied2.canonicalWorkoutId).not.toBe(strengthWorkout.id);

    const after = records.snapshot();
    expect(after.healthKitCanonicalWorkouts).toHaveLength(3);
    const strengthAfterDigest = JSON.stringify(after.healthKitCanonicalWorkouts.find((item) => item.id === strengthWorkout.id));
    expect(strengthAfterDigest).toEqual(strengthBeforeDigest);
  });

  it("is idempotent: replaying the identical authorized apply is a safe already_reconciled no-op with zero additional writes", async () => {
    const { records, walk1Record } = await world();
    const dry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: walk1Record.id, authorizationReference: "" }, now,
    });
    await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ...AUTH_1, observationId: walk1Record.id }, apply: true, expected: dry.facts, now,
    });
    const mutations = records.getMutationCount();

    const replayDry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ...AUTH_1, observationId: walk1Record.id }, now,
    });
    const replayApply = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ...AUTH_1, observationId: walk1Record.id }, apply: true, expected: dry.facts, now,
    });

    expect(replayDry).toMatchObject({ outcome: "already_reconciled", canonicalWorkoutId: getHealthKitCanonicalWorkoutRecordId(walk1Record) });
    expect(replayApply).toMatchObject({ outcome: "already_reconciled", canonicalWorkoutId: getHealthKitCanonicalWorkoutRecordId(walk1Record) });
    expect(records.getMutationCount()).toBe(mutations);
    expect(records.snapshot().healthKitCanonicalWorkouts).toHaveLength(2);
  });

  it("returns an explicit already_canonicalized no-op (not an error, and distinct from already_reconciled) for an identity that was never actually a runner-eligible deferred observation", async () => {
    const preCanonicalized = await worldWithAlreadyCanonicalizedWalk();
    const result = await runHealthKitDeferredWorkoutReconciliation({
      records: preCanonicalized.records,
      authorization: { ownerUserId: OWNER, observationId: preCanonicalized.observationRecord.id, authorizationReference: "" },
      now,
    });
    expect(result.outcome).toBe("already_canonicalized");
    expect(result.outcome).not.toBe("already_reconciled");
    expect(preCanonicalized.records.getMutationCount()).toBe(0);

    // Even under a matching-looking authorization reference, absent a real
    // matching audit row this remains the generic no-op, never the apply
    // idempotency outcome.
    const resultWithRef = await runHealthKitDeferredWorkoutReconciliation({
      records: preCanonicalized.records,
      authorization: { ownerUserId: OWNER, observationId: preCanonicalized.observationRecord.id, authorizationReference: "some-unrelated-reference" },
      now,
    });
    expect(resultWithRef.outcome).toBe("already_canonicalized");
  });

  it("bundles the registered deferred-workout-reconcile entry with apply safety requirements", async () => {
    const sha = "a".repeat(40);
    const dry = await buildHealthKitPayload({ kind: "deferred-workout-reconcile", sha, observationId: "healthkit_observation_example", mode: "dry-run" });
    expect(dry.code).toContain("PHYSIQUEOS_HEALTHKIT_DEFERRED_WORKOUT_RECONCILIATION");
    await expect(buildHealthKitPayload({ kind: "deferred-workout-reconcile", sha, observationId: "healthkit_observation_example", mode: "apply" }))
      .rejects.toThrow(/authorization-ref and --expected/);
    await expect(buildHealthKitPayload({ kind: "deferred-workout-reconcile", sha, mode: "dry-run" }))
      .rejects.toThrow(/--observation-id/);
  });
});

function buildWalkObservation({ externalId, startedAt, endedAt, activeCalories, averageHeartRate, distance }) {
  return normalizeHealthKitObservationBatch({
    batchId: `walk-batch-${externalId}`,
    principalDeviceId: "founder-iphone",
    observations: [{
      observationType: "workout",
      externalId,
      source: { bundleIdentifier: "com.apple.health.watch" },
      occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt, endedAt },
      workout: {
        activityType: "52",
        durationSeconds: (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
        activeCalories,
        averageHeartRate,
        distance,
        distanceUnit: "m",
      },
    }],
  }).observations[0];
}

function strengthCanonicalWorkout(externalId, startedAt, endedAt) {
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

function workoutPolicyRecordFor({ cardioInScope, effectiveLocalDate }) {
  return {
    id: "healthkit_workout_canonical_activation_policy",
    schemaVersion: "healthkit-workout-activation-policy-v1",
    version: 4,
    status: "enabled",
    domains: ["workout"],
    families: cardioInScope ? ["cardio", "strength"] : ["strength"],
    effectiveLocalDate,
    endLocalDate: null,
    openEnded: true,
    historicalBackfill: false,
    strategicEvidenceEligibility: "quarantined",
    linkAutoConfirm: false,
  };
}

async function world({
  cardioInScope = true,
  effectiveLocalDate = "2026-09-13",
  walk1ReconciliationReason = WORKOUT_FAMILY_OUT_OF_SCOPE_REASON,
  includeGraduationPolicy = false,
} = {}) {
  const walk1 = buildWalkObservation({
    externalId: "sep24-indoor-walk-1", startedAt: "2026-09-24T18:04:20Z", endedAt: "2026-09-24T18:22:07Z",
    activeCalories: 157.58, averageHeartRate: 121.07, distance: 1624.58,
  });
  const walk2 = buildWalkObservation({
    externalId: "sep24-indoor-walk-2", startedAt: "2026-09-24T18:50:11Z", endedAt: "2026-09-24T19:06:39Z",
    activeCalories: 188.13, averageHeartRate: 142.68, distance: 1626.56,
  });
  const walk1Record = {
    ...createHealthKitObservationRecord({
      observation: walk1,
      reconciliation: { state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED, reason: walk1ReconciliationReason },
      ownerUserId: OWNER,
      receivedAt: NOW,
    }),
    version: 1,
  };
  const walk2Record = {
    ...createHealthKitObservationRecord({
      observation: walk2,
      reconciliation: { state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED, reason: WORKOUT_FAMILY_OUT_OF_SCOPE_REASON },
      ownerUserId: OWNER,
      receivedAt: NOW,
    }),
    version: 1,
  };
  const strengthWorkout = strengthCanonicalWorkout("sep24-strength", "2026-09-24T13:00:00Z", "2026-09-24T14:00:00Z");

  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    canonicalEvidenceObjects: [],
    healthKitCanonicalWorkouts: [strengthWorkout],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitObservations: [walk1Record, walk2Record],
    healthKitConfiguration: [
      workoutPolicyRecordFor({ cardioInScope, effectiveLocalDate }),
      ...(includeGraduationPolicy ? [{ id: "healthkit_canonical_graduation_policy", version: 1, status: "enabled" }] : []),
    ],
  });
  return { records, walk1Record, walk2Record, strengthWorkout };
}

// A Strength observation deferred for exactly this runner's supported reason
// (family_not_in_activation_scope), used to prove the runner refuses any
// family other than cardio rather than partially reproducing Strength's
// relationship pipeline.
async function worldWithStrengthDeferred() {
  const observation = normalizeHealthKitObservationBatch({
    batchId: "batch-sep24-strength-deferred",
    principalDeviceId: "founder-iphone",
    observations: [{
      observationType: "workout",
      externalId: "sep24-strength-deferred",
      source: { bundleIdentifier: "com.apple.health.watch" },
      occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt: "2026-09-24T13:00:00Z", endedAt: "2026-09-24T14:00:00Z" },
      workout: { activityType: "50", durationSeconds: 3600, activeCalories: 400 },
    }],
  }).observations[0];
  const observationRecord = {
    ...createHealthKitObservationRecord({
      observation,
      reconciliation: { state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED, reason: WORKOUT_FAMILY_OUT_OF_SCOPE_REASON },
      ownerUserId: OWNER,
      receivedAt: NOW,
    }),
    version: 1,
  };
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    canonicalEvidenceObjects: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitObservations: [observationRecord],
    healthKitConfiguration: [workoutPolicyRecordFor({ cardioInScope: true, effectiveLocalDate: "2026-09-13" })],
  });
  return { records, observationRecord };
}

// An observation already canonicalized through some OTHER path (ordinary
// ingestion, unrelated to this runner) — proves already_canonicalized is a
// distinct no-op from the apply-idempotency already_reconciled outcome.
async function worldWithAlreadyCanonicalizedWalk() {
  const walk = buildWalkObservation({
    externalId: "sep24-indoor-walk-already-canonical", startedAt: "2026-09-24T18:04:20Z", endedAt: "2026-09-24T18:22:07Z",
    activeCalories: 157.58, averageHeartRate: 121.07, distance: 1624.58,
  });
  const canonicalWorkout = reconcileHealthKitCanonicalWorkout({ observation: walk, ownerUserId: OWNER, now: NOW }).record;
  const observationRecord = {
    ...createHealthKitObservationRecord({
      observation: walk,
      reconciliation: {
        state: HealthKitReconciliationState.WORKOUT_CANONICALIZED,
        canonicalStore: "healthKitCanonicalWorkouts",
        canonicalId: canonicalWorkout.id,
        canonicalRevision: 1,
        canonicalAction: "create",
        workoutFamily: "cardio",
        evidenceEligibility: "quarantined",
        activityInteraction: "descriptive_never_additive",
      },
      ownerUserId: OWNER,
      receivedAt: NOW,
    }),
    version: 1,
  };
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    canonicalEvidenceObjects: [],
    healthKitCanonicalWorkouts: [canonicalWorkout],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitObservations: [observationRecord],
    healthKitConfiguration: [workoutPolicyRecordFor({ cardioInScope: true, effectiveLocalDate: "2026-09-13" })],
  });
  return { records, observationRecord, canonicalWorkout };
}

function now() { return new Date(NOW); }
