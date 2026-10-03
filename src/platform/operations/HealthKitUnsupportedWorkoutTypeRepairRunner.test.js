import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { HealthKitReconciliationState } from "../../domain/services/HealthKitObservationService.js";
import { getHealthKitCanonicalWorkoutRecordId } from "../../domain/services/HealthKitWorkoutService.js";
import {
  HealthKitGraduationPurpose,
  overlayGraduatedHealthKitCardioWorkouts,
  resolveHealthKitGraduationPolicy,
} from "../../domain/services/HealthKitGraduation.js";
import {
  HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR_AUDIT_RECORD_ID as AUDIT_ID,
  createRepairScopedRecordStore,
  runHealthKitUnsupportedWorkoutTypeRepair,
} from "./HealthKitUnsupportedWorkoutTypeRepairRunner.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";
import {
  OCT2_OWNER,
  oct2ActivityDayEvidence,
  oct2CanonicalWorkout,
  oct2CooldownInput,
  oct2GraduationPolicyRecord,
  oct2SourceOnlyObservationRecord,
  oct2StairStepperInput,
  oct2WalkInput,
  oct2WorkoutPolicyRecord,
} from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "f".repeat(40);
const NOW = "2026-10-03T17:00:00.000Z";
const now = () => new Date(NOW);
const AUTH_REF = "founder-chat-2026-10-03-authorize-oct2-stair-cooldown-repair";

const stairRecord = () => oct2SourceOnlyObservationRecord(oct2StairStepperInput());
const cooldownRecord = () => oct2SourceOnlyObservationRecord(oct2CooldownInput());
const ids = () => [stairRecord().id, cooldownRecord().id];

function world({
  observations = null,
  extraObservations = [],
  workoutPolicy = oct2WorkoutPolicyRecord(),
  graduationPolicy = oct2GraduationPolicyRecord(),
} = {}) {
  const walkObservation = {
    ...oct2SourceOnlyObservationRecord(oct2WalkInput()),
    reconciliation: { state: HealthKitReconciliationState.WORKOUT_CANONICALIZED, canonicalId: getHealthKitCanonicalWorkoutRecordId(oct2SourceOnlyObservationRecord(oct2WalkInput())) },
  };
  // Never touched: same type on another date, and an unsupported type on the same date.
  const oct1StairStepper = oct2SourceOnlyObservationRecord(oct2StairStepperInput({
    externalId: "oct1-stair-stepper-uuid", startedAt: "2026-10-01T22:38:12Z", endedAt: "2026-10-01T22:49:31Z",
  }));
  oct1StairStepper.occurrence.localDate = "2026-10-01";
  oct1StairStepper.occurrenceDate = "2026-10-01";
  const oct2Elliptical = oct2SourceOnlyObservationRecord(oct2CooldownInput({ externalId: "oct2-elliptical-uuid", activityType: "16" }));
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OCT2_OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: observations ?? [stairRecord(), cooldownRecord(), walkObservation, oct1StairStepper, oct2Elliptical, ...extraObservations],
    healthKitConfiguration: [workoutPolicy, graduationPolicy].filter(Boolean),
    healthKitCanonicalWorkouts: [{ ...oct2CanonicalWorkout(oct2WalkInput()), version: 2 }],
    healthKitCanonicalDays: [{
      id: "healthkit_canonical_day_activity_2026-10-02", domain: "activity", localDate: "2026-10-02", userId: OCT2_OWNER, revision: 3, version: 3,
      current: { coverage: "complete_day", values: { dailyActivity: { move_calories: 905, exercise_minutes: 52 } }, workoutActiveCaloriesAdditive: false },
    }],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    canonicalEvidenceObjects: [oct2ActivityDayEvidence()],
  }, {
    storageMetadata: {
      dailyBriefings: [{ recordId: "weekly-2026-09-27", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z" }],
      goalConfidenceHistory: [{ recordId: "assessment-1", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z" }],
    },
  });
}

const run = (records, { apply = false, authorization = {}, deployment = { expectedSha: SHA, runtimeSha: SHA }, expected = null } = {}) =>
  runHealthKitUnsupportedWorkoutTypeRepair({
    records, apply, expected, deployment, now,
    authorization: { ownerUserId: OCT2_OWNER, ...authorization },
  });

async function applyFromDryRun(records, overrides = {}) {
  const dry = await run(records);
  expect(dry.outcome).toBe("dry_run");
  return run(records, {
    apply: true,
    expected: dry.facts,
    authorization: { observationIds: ids(), authorizationReference: AUTH_REF },
    ...overrides,
  });
}

describe("bounded Oct 2 unsupported-workout-type repair: parameter guards", () => {
  it("refuses any owner but the Founder, any scope-widening parameter, and a malformed id list, writing nothing", async () => {
    const records = world();
    const before = records.snapshot();
    await expect(runHealthKitUnsupportedWorkoutTypeRepair({ records, authorization: { ownerUserId: "someone_else" }, now }))
      .rejects.toMatchObject({ code: "OWNER_MISMATCH" });
    for (const key of ["observationId", "localDate", "startLocalDate", "activityTypes", "dateRange"]) {
      await expect(run(records, { authorization: { [key]: "x" } })).rejects.toMatchObject({ code: "SCOPE_PARAMETERS_NOT_SUPPORTED" });
    }
    for (const observationIds of [[ids()[0]], [...ids(), "third"], [ids()[0], ids()[0]], "a,b", [ids()[0], ""]]) {
      await expect(run(records, { authorization: { observationIds } })).rejects.toMatchObject({ code: "OBSERVATION_IDS_INVALID" });
    }
    expect(records.snapshot()).toEqual(before);
  });

  it("requires both ids, the expected deployed SHA equal to the runtime SHA, and an authorization reference for apply", async () => {
    const records = world();
    const before = records.snapshot();
    const base = { apply: true, expected: {}, authorization: { observationIds: ids(), authorizationReference: AUTH_REF } };
    await expect(run(records, { ...base, authorization: { authorizationReference: AUTH_REF } })).rejects.toMatchObject({ code: "OBSERVATION_IDS_REQUIRED" });
    await expect(run(records, { ...base, deployment: { expectedSha: "", runtimeSha: SHA } })).rejects.toMatchObject({ code: "EXPECTED_DEPLOYED_SHA_REQUIRED" });
    await expect(run(records, { ...base, deployment: { expectedSha: SHA, runtimeSha: OTHER_SHA } })).rejects.toMatchObject({ code: "RUNTIME_SHA_MISMATCH" });
    await expect(run(records, { ...base, authorization: { observationIds: ids(), authorizationReference: " " } })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    await expect(run(records, { deployment: { expectedSha: SHA, runtimeSha: OTHER_SHA } })).rejects.toMatchObject({ code: "RUNTIME_SHA_MISMATCH" });
    expect(records.snapshot()).toEqual(before);
  });
});

describe("bounded Oct 2 unsupported-workout-type repair: dry run (default)", () => {
  it("prints the exact canonical records it would create and writes nothing", async () => {
    const records = world();
    const before = records.snapshot();
    const result = await run(records);
    expect(result.outcome).toBe("dry_run");
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
    expect(result.selection.selected.map((item) => [item.activityType, item.effectiveLocalDate, item.reconciliationState])).toEqual([
      ["44", "2026-10-02", "source_only"], ["80", "2026-10-02", "source_only"],
    ]);
    // The near misses are reported, never selected.
    expect(result.selection.nearMisses.map((item) => item.activityType).sort()).toEqual(["44"]);
    const [stair, cooldown] = result.targets;
    expect(stair).toMatchObject({
      observationId: stairRecord().id, activityType: "44", label: "Stair Stepper",
      canonicalWorkoutId: getHealthKitCanonicalWorkoutRecordId(stairRecord()), localDate: "2026-10-02",
      canonicalRecord: {
        current: { family: "cardio", canonicalType: "stair_climbing", strategicRole: "graduation_candidate", sourceObservationId: stairRecord().id },
        evidenceEligibility: { state: "quarantined", strategic: false },
        activityInteraction: { additiveToDailyActivity: false },
        coexistence: { state: "no_other_source", unverifiableCount: 0, candidates: [] },
        activation: { policyRecordId: "healthkit_workout_canonical_activation_policy", families: ["cardio", "strength"] },
      },
      observationReconciliationBefore: { state: "source_only", reason: "unsupported_workout_type" },
      observationReconciliationPatch: {
        state: "workout_canonicalized", canonicalStore: "healthKitCanonicalWorkouts", canonicalAction: "create",
        canonicalId: getHealthKitCanonicalWorkoutRecordId(stairRecord()), workoutFamily: "cardio",
        evidenceEligibility: "quarantined", activityInteraction: "descriptive_never_additive", canonicalRevision: 1,
      },
      strategicEffect: { strategicRole: "graduation_candidate", strategicallyEligibleType: true, joinsStrategicEvidenceUnderCurrentGraduationPolicy: true, storedBriefingsRegenerated: false },
    });
    expect(cooldown).toMatchObject({
      observationId: cooldownRecord().id, activityType: "80", label: "Cooldown",
      canonicalRecord: { current: { family: "cardio", canonicalType: "cooldown", strategicRole: "history_only" } },
      strategicEffect: { strategicRole: "history_only", strategicallyEligibleType: false, joinsStrategicEvidenceUnderCurrentGraduationPolicy: false },
    });
    expect(result.predictedMutations).toHaveLength(7);
    expect(new Set(result.predictedMutations.map((item) => item.collection)))
      .toEqual(new Set(["healthKitConfiguration", "healthKitCanonicalWorkouts", "healthKitObservations"]));
    expect(result.facts.strategicArtifactMetadataDigests.dailyBriefings.count).toBe(1);
  });
});

describe("bounded Oct 2 unsupported-workout-type repair: fails closed unless the selection is exactly the two records", () => {
  it("refuses when one of the two has already moved to another state (reported as a near miss)", async () => {
    const flipped = { ...cooldownRecord(), reconciliation: { state: "workout_canonicalization_deferred", reason: "canonical_workout_evidence_eligibility_boundary_not_yet_separate" } };
    const records = world({ observations: [stairRecord(), flipped] });
    const result = await run(records);
    expect(result).toMatchObject({ outcome: "refused", reasons: ["selection_not_exactly_one_stair_stepper_and_one_cooldown"] });
    expect(result.selection.selected.map((item) => item.activityType)).toEqual(["44"]);
    expect(result.selection.nearMisses.map((item) => [item.activityType, item.reconciliationState])).toEqual([["80", "workout_canonicalization_deferred"]]);
  });

  it("refuses a third matching record instead of picking two", async () => {
    const second = oct2SourceOnlyObservationRecord(oct2StairStepperInput({ externalId: "oct2-second-stair-uuid", startedAt: "2026-10-02T23:10:00Z", endedAt: "2026-10-02T23:20:00Z" }));
    const result = await run(world({ extraObservations: [second] }));
    expect(result).toMatchObject({ outcome: "refused", reasons: ["selection_not_exactly_one_stair_stepper_and_one_cooldown"] });
    expect(result.selection.selected).toHaveLength(3);
  });

  it("refuses a record owned by anyone else, and named ids that are not exactly the selection", async () => {
    const foreign = { ...cooldownRecord(), userId: "user_other" };
    expect(await run(world({ observations: [stairRecord(), foreign] })))
      .toMatchObject({ outcome: "refused", reasons: ["selected_observation_owner_or_purpose_mismatch"] });
    expect(await run(world(), { authorization: { observationIds: [stairRecord().id, "healthkit_observation_other"] } }))
      .toMatchObject({ outcome: "refused", reasons: ["authorized_observation_ids_do_not_match_selection"] });
  });

  it("refuses when the CURRENT Workout policy would not canonicalize the workouts", async () => {
    expect(await run(world({ workoutPolicy: oct2WorkoutPolicyRecord({ families: ["strength"] }) })))
      .toMatchObject({ outcome: "refused", reasons: ["cardio_not_in_current_workout_activation_scope"] });
    expect(await run(world({ workoutPolicy: oct2WorkoutPolicyRecord({ effectiveLocalDate: "2026-10-03" }) })))
      .toMatchObject({ outcome: "refused", reasons: ["before_activation_date"] });
    expect(await run(world({ workoutPolicy: null })))
      .toMatchObject({ outcome: "refused", reasons: ["cardio_not_in_current_workout_activation_scope"] });
  });

  it("refuses when a canonical record already exists at a predicted identity", async () => {
    const records = world();
    await records.putIfAbsent({ collection: "healthKitCanonicalWorkouts", recordId: getHealthKitCanonicalWorkoutRecordId(cooldownRecord()), payload: { id: getHealthKitCanonicalWorkoutRecordId(cooldownRecord()) } });
    expect(await run(records)).toMatchObject({ outcome: "refused", reasons: ["canonical_workout_record_already_exists"] });
  });
});

describe("bounded Oct 2 unsupported-workout-type repair: apply", () => {
  it("refuses (writes nothing) when anything drifted since the dry run", async () => {
    const records = world();
    const dry = await run(records);
    const walk = (await records.list({ collection: "healthKitCanonicalWorkouts" }))[0];
    await records.put({ collection: "healthKitCanonicalWorkouts", recordId: walk.id, expectedVersion: walk.version, payload: { ...walk, updatedAt: NOW } });
    const before = records.snapshot();
    const result = await run(records, { apply: true, expected: dry.facts, authorization: { observationIds: ids(), authorizationReference: AUTH_REF } });
    expect(result).toMatchObject({ outcome: "drifted", drift: ["canonicalWorkoutsDigest"] });
    expect(records.snapshot()).toEqual(before);
  });

  it("creates exactly the two predicted canonical workouts and reconciles exactly the two observations, nothing else", async () => {
    const records = world();
    const before = records.snapshot();
    const dry = await run(records);
    const result = await applyFromDryRun(records);
    expect(result.outcome).toBe("applied");
    expect(Object.values(result.invariants).every(Boolean)).toBe(true);
    const after = records.snapshot();
    const targetIds = new Set(ids());
    const createdIds = new Set(dry.targets.map((target) => target.canonicalWorkoutId));
    for (const target of dry.targets) {
      const stored = after.healthKitCanonicalWorkouts.find((workout) => workout.id === target.canonicalWorkoutId);
      expect(stored.current).toEqual(target.canonicalRecord.current);
      expect(stored.coexistence).toEqual(target.canonicalRecord.coexistence);
      const observation = after.healthKitObservations.find((item) => item.id === target.observationId);
      expect(observation.reconciliation).toEqual(target.observationReconciliationPatch);
    }
    expect(after.healthKitObservations.filter((item) => !targetIds.has(item.id)))
      .toEqual(before.healthKitObservations.filter((item) => !targetIds.has(item.id)));
    expect(after.healthKitCanonicalWorkouts.filter((item) => !createdIds.has(item.id))).toEqual(before.healthKitCanonicalWorkouts);
    for (const name of ["healthKitCanonicalDays", "canonicalEvidenceObjects", "healthKitWorkoutLinks", "healthKitWorkoutLinkClaims", "user"]) {
      expect(after[name]).toEqual(before[name]);
    }
    const configuration = after.healthKitConfiguration.filter((item) => item.id !== AUDIT_ID);
    expect(configuration).toEqual(before.healthKitConfiguration);
    expect(after.healthKitConfiguration.find((item) => item.id === AUDIT_ID)).toMatchObject({
      kind: "healthkit_unsupported_workout_type_repair_audit", authorizationReference: AUTH_REF, deployedSha: SHA,
      targets: [
        { activityType: "44", canonicalType: "stair_climbing", strategicRole: "graduation_candidate" },
        { activityType: "80", canonicalType: "cooldown", strategicRole: "history_only" },
      ],
    });
  });

  it("makes the repaired Stair Stepper (and never the Cooldown) visible to strategic graduation afterwards", async () => {
    const records = world();
    await applyFromDryRun(records);
    const { objects } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [oct2ActivityDayEvidence()],
      canonicalWorkouts: await records.list({ collection: "healthKitCanonicalWorkouts" }),
      policy: resolveHealthKitGraduationPolicy(oct2GraduationPolicyRecord()),
      purpose: HealthKitGraduationPurpose.EVIDENCE,
    });
    expect(objects.filter((object) => object.healthKitProjection).map((object) => object.payload.metadata.activity_type).sort())
      .toEqual(["Outdoor Walk", "Stair Stepper"]);
  });

  it("reports no strategic join when the live graduation policy is invalid (fail-closed, as the reader resolves it)", async () => {
    const invalid = { ...oct2GraduationPolicyRecord(), schemaVersion: "unknown" };
    const result = await run(world({ graduationPolicy: invalid }));
    expect(result.targets.map((target) => target.strategicEffect.joinsStrategicEvidenceUnderCurrentGraduationPolicy)).toEqual([false, false]);
    expect(result.targets[0].strategicEffect.strategicallyEligibleType).toBe(true);
  });

  it("is idempotent: any re-run after success is the explicit zero-write no-op already_repaired", async () => {
    const records = world();
    await applyFromDryRun(records);
    const snapshot = records.snapshot();
    const mutations = records.getMutationCount();
    const dry = await run(records);
    expect(dry).toMatchObject({ outcome: "already_repaired", auditRecordId: AUDIT_ID });
    expect(dry.targets.map((target) => target.activityType)).toEqual(["44", "80"]);
    const again = await run(records, { apply: true, expected: dry.facts, authorization: { observationIds: ids(), authorizationReference: "another-reference" } });
    expect(again.outcome).toBe("already_repaired");
    expect(records.snapshot()).toEqual(snapshot);
    expect(records.getMutationCount()).toBe(mutations);
  });

  it("refuses when the audit row exists but the state no longer matches it", async () => {
    const records = world();
    await records.putIfAbsent({ collection: "healthKitConfiguration", recordId: AUDIT_ID, payload: { id: AUDIT_ID, kind: "healthkit_unsupported_workout_type_repair_audit", targets: [] } });
    expect(await run(records)).toMatchObject({ outcome: "refused", reasons: ["audit_row_present_state_inconsistent"] });
  });
});

describe("repair-scoped record store", () => {
  it("refuses every write outside the exact collection/record scope and counts the allowed ones", async () => {
    const records = world();
    const guarded = createRepairScopedRecordStore(records, { healthKitObservations: [stairRecord().id] });
    await expect(guarded.put({ collection: "dailyBriefings", recordId: "weekly-2026-09-27", payload: {} })).rejects.toMatchObject({ code: "WRITE_OUTSIDE_REPAIR_SCOPE" });
    await expect(guarded.putIfAbsent({ collection: "healthKitObservations", recordId: cooldownRecord().id, payload: {} })).rejects.toMatchObject({ code: "WRITE_OUTSIDE_REPAIR_SCOPE" });
    await expect(guarded.put({ collection: "healthKitCanonicalDays", recordId: "healthkit_canonical_day_activity_2026-10-02", payload: {} })).rejects.toMatchObject({ code: "WRITE_OUTSIDE_REPAIR_SCOPE" });
    expect(guarded.writeCount()).toBe(0);
    await guarded.put({ collection: "healthKitObservations", recordId: stairRecord().id, expectedVersion: 1, payload: stairRecord() });
    expect(guarded.writeCount()).toBe(1);
  });
});

describe("guarded production payload (bundled entry)", () => {
  it("registers unsupported-workout-repair with dry-run default and apply-only requirements", async () => {
    const dry = await buildHealthKitPayload({ kind: "unsupported-workout-repair", sha: SHA, mode: "dry-run" });
    expect(dry.code).toContain("PHYSIQUEOS_HEALTHKIT_UNSUPPORTED_WORKOUT_REPAIR");
    expect(dry.code).toContain("RUNTIME_SHA_MISMATCH");
    await expect(buildHealthKitPayload({ kind: "unsupported-workout-repair", sha: SHA, mode: "apply", authorizationReference: AUTH_REF, expected: "{}" }))
      .rejects.toThrow(/--observation-ids/);
    await expect(buildHealthKitPayload({ kind: "unsupported-workout-repair", sha: SHA, mode: "apply", observationIds: ids().join(",") }))
      .rejects.toThrow(/authorization-ref and --expected/);
    await expect(buildHealthKitPayload({ kind: "unsupported-workout-repair", sha: SHA, mode: "dry-run", observationIds: ids()[0] }))
      .rejects.toThrow(/exactly two distinct/);
    await expect(buildHealthKitPayload({ kind: "unsupported-workout-repair", sha: "not-a-sha", mode: "dry-run" })).rejects.toThrow(/--sha/);
  });
});
