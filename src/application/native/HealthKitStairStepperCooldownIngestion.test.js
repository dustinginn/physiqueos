import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createV3EvidenceUniverse } from "../../domain/intelligence/V3EvidenceUniverse.js";
import {
  OCT2_DATE,
  OCT2_OWNER,
  oct2CooldownInput,
  oct2SourceOnlyObservationRecord,
  oct2StairStepperInput,
  oct2WorkoutPolicyRecord,
} from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";

// First delivery of the Oct 2 workouts under the live Workout policy shape
// (v4: families cardio + strength, open-ended, linkAutoConfirm false).
const DAILY_POLICY_ID = "healthkit_canonical_daily_activation_policy";
const SENTINELS = [
  "goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses", "dailyBriefings",
  "briefingReconciliationWorkItems", "operatingPlan", "protocols", "trainingPerformanceEvents", "canonicalExerciseLibrary",
];

function store({ observations = [], dailyPolicy = false } = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OCT2_OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: observations,
    healthKitCanonicalDays: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitConfiguration: [
      oct2WorkoutPolicyRecord(),
      ...(dailyPolicy ? [{
        id: DAILY_POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled",
        domains: ["activity", "nutrition"], effectiveLocalDate: "2026-09-22", endLocalDate: null, openEnded: true,
        strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1,
      }] : []),
    ],
    canonicalEvidenceObjects: [],
    evidencePackages: [],
    ...Object.fromEntries(SENTINELS.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
}

function ingest(records, observations, batchId) {
  return createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-10-02T22:54:44.000Z") })
    .ingestHealthKitObservations({
      ownerUserId: OCT2_OWNER,
      principal: { userId: OCT2_OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: "2026-10-02T22:54:44.000Z", clientTimeZone: "America/Los_Angeles", idempotencyKey: `key-${batchId}` },
      payload: { batchId, observations },
    });
}

function activitySummary(moveCalories = 905) {
  return {
    observationType: "activity_summary",
    externalId: `activity-summary:${OCT2_DATE}`,
    source: { bundleIdentifier: "com.apple.Health" },
    occurrence: { localDate: OCT2_DATE, timeZone: "America/Los_Angeles" },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts", coverage: "complete_day", sourceRevision: 1,
      dailyActivity: { move_calories: moveCalories, exercise_minutes: 52, stand_hours: 12 },
    },
  };
}

describe("first delivery of the Oct 2 Stair Stepper (44) and Cooldown (80)", () => {
  it("canonicalizes Stair Stepper as Cardio and Cooldown as OTHER history, touching nothing else", async () => {
    const records = store();
    const before = records.snapshot();
    const result = await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "b1");
    expect(result.result.workoutCanonicalizedCount).toBe(2);
    expect(result.result.observations.map((observation) => observation.reconciliation.workoutFamily)).toEqual(["cardio", "other"]);
    for (const observation of result.result.observations) expect(observation.reconciliation).toMatchObject({
      state: "workout_canonicalized", canonicalStore: "healthKitCanonicalWorkouts",
      evidenceEligibility: "quarantined", activityInteraction: "descriptive_never_additive",
    });
    const after = records.snapshot();
    const byType = Object.fromEntries(after.healthKitCanonicalWorkouts.map((workout) => [workout.current.canonicalType, workout]));
    expect(Object.keys(byType).sort()).toEqual(["cooldown", "stair_climbing"]);
    expect(byType.stair_climbing).toMatchObject({
      localDate: OCT2_DATE,
      current: { family: "cardio", strategicRole: "graduation_candidate", appleActivityType: "44" },
      coexistence: { state: "no_other_source" },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(byType.cooldown).toMatchObject({
      localDate: OCT2_DATE,
      current: { family: "other", strategicRole: "history_only", appleActivityType: "80" },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(byType.cooldown.coexistence).toBeUndefined();
    expect(after.healthKitWorkoutLinks).toEqual([]);
    expect(after.healthKitWorkoutLinkClaims).toEqual([]);
    for (const name of [...SENTINELS, "canonicalEvidenceObjects", "evidencePackages"]) expect(after[name]).toEqual(before[name]);
  });

  it("is idempotent on replay", async () => {
    const records = store();
    await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "b1");
    const snapshot = records.snapshot();
    const replay = await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "b2");
    expect(replay.result).toMatchObject({ createdCount: 0, matchedCount: 2 });
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual(snapshot.healthKitCanonicalWorkouts);
    expect(records.snapshot().healthKitObservations).toEqual(snapshot.healthKitObservations);
  });

  it("leaves the canonical Activity day byte-identical (workout energy is never added to the daily total)", async () => {
    const records = store({ dailyPolicy: true });
    await ingest(records, [activitySummary(905)], "b1");
    const day = structuredClone(records.snapshot().healthKitCanonicalDays[0]);
    await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "b2");
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalWorkouts).toHaveLength(2);
    expect(snapshot.healthKitCanonicalDays).toEqual([day]);
    expect(snapshot.healthKitCanonicalDays[0].current.values.dailyActivity).toMatchObject({ move_calories: 905, exercise_minutes: 52 });
    expect(snapshot.healthKitCanonicalDays[0].current.workoutActiveCaloriesAdditive).toBe(false);
  });

  it("keeps both raw canonical workouts out of the V3 evidence universe (strategic use only ever via graduation)", async () => {
    const records = store();
    await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "b1");
    const universe = createV3EvidenceUniverse({
      store: records.snapshot(), goal: { id: "g" }, phase: { id: "p", startedAt: "2026-09-01" }, evidenceCutoff: "2026-10-04T06:59:59.999Z",
    });
    expect(JSON.stringify(universe)).not.toMatch(/healthkit|stair|cooldown/i);
  });
});

describe("observations stored BEFORE the classifier supported 44/80", () => {
  it("are never canonicalized or rewritten by a replay: only the bounded, authorized repair reconsiders them", async () => {
    const stored = [oct2SourceOnlyObservationRecord(oct2StairStepperInput()), oct2SourceOnlyObservationRecord(oct2CooldownInput())];
    const records = store({ observations: stored });
    const before = records.snapshot();
    const replay = await ingest(records, [oct2StairStepperInput(), oct2CooldownInput()], "replay");
    expect(replay.result.workoutCanonicalizedCount).toBe(0);
    for (const observation of replay.result.observations) {
      expect(observation.reconciliation).toEqual({ state: "source_only", reason: "unsupported_workout_type" });
    }
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
    expect(records.snapshot().healthKitObservations).toEqual(before.healthKitObservations);
  });

  it("still keeps a genuinely unsupported type raw on first delivery and on replay", async () => {
    const elliptical = oct2CooldownInput({ externalId: "oct2-elliptical-uuid", activityType: "16" });
    const records = store();
    const first = await ingest(records, [elliptical], "b1");
    expect(first.result.observations[0].reconciliation).toEqual({ state: "source_only", reason: "unsupported_workout_type" });
    const replay = await ingest(records, [elliptical], "b2");
    expect(replay.result.observations[0].reconciliation).toEqual({ state: "source_only", reason: "unsupported_workout_type" });
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });
});
