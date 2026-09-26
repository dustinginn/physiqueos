import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
  overlayGraduatedHealthKitCardioWorkouts,
  resolveHealthKitGraduationPolicy,
} from "./HealthKitGraduation.js";
import { isHealthKitDerivedRecord } from "./HealthKitEvidenceEligibilityPolicy.js";

const DATE = "2026-09-26";
const WALK_ID = (n) => `healthkit_canonical_workout_${String(n).padStart(40, "0")}`;

function canonicalWorkout({
  n, family = "cardio", canonicalType = "outdoor_walking", localDate = DATE,
  startedAt = `${DATE}T15:30:03.000Z`, endedAt = `${DATE}T15:45:55.000Z`, timeZone = "America/Chicago",
  seconds = 952.67, meters = 1312.66, kcal = 86.07, hr = 92.13,
} = {}) {
  return {
    id: WALK_ID(n), schemaVersion: "healthkit-canonical-workout-v1", userId: "user_founder_001", version: 1, revision: 1, localDate,
    semanticFingerprint: `sha256_${String(n).padStart(64, "0")}`, priorSemanticFingerprint: null, revisionHistory: [],
    createdAt: `${DATE}T16:46:22.814Z`, updatedAt: `${DATE}T16:46:22.814Z`,
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: { policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false },
    current: {
      family, canonicalType, appleActivityType: "52", localDate, localDateBasis: "workout_start_in_workout_time_zone", timeZone, startedAt, endedAt, sourceRevision: 1,
      sourceObservationId: `obs_${n}`,
      source: { bundleIdentifier: "com.apple.health.fixture", sourceName: "Apple Watch", productType: "Watch7,12" },
      telemetry: { durationSeconds: seconds, activeCalories: kcal, totalCalories: null, distance: meters, distanceUnit: "m", averageHeartRate: hr },
    },
    coexistence: { candidates: [], state: "no_other_source", unverifiableCount: 0 },
    evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
    linkAssessment: null,
    provenance: { application: "Apple Health", integration: "HealthKit", modality: "direct", basis: "healthkit_workout_observation",
      bundleIdentifier: "com.apple.health.fixture", currentSourceObservationId: `obs_${n}`, sourceObservationIds: [`obs_${n}`] },
  };
}

function activityDayEvidence({ date = DATE, moveCalories = 238.75 } = {}) {
  return {
    canonicalId: `activity_day|${date}`, evidence_type: "activity_day",
    payload: {
      id: `activity_day|${date}`, evidence_type: "activity_day", observed_at: date,
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      daily_activity: { move_calories: moveCalories, exercise_minutes: 23 },
      derived_metrics: {}, metadata: { coverage: "partial_day" }, quality: { status: "partial" }, provenance: {},
    },
  };
}

const enabledPolicy = (overrides = {}) => resolveHealthKitGraduationPolicy({
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  id: "healthkit_canonical_graduation_policy",
  projection: { enabled: false },
  evidenceEligibility: { enabled: true, domains: ["cardio_training"], startLocalDate: "2026-09-23", endLocalDate: null },
  historicalBriefingRegeneration: false,
  ...overrides,
});

describe("Phase 1 Cardio strategic graduation", () => {
  it("graduates an in-scope canonical Cardio workout into eligible Training evidence with the correct specific type", () => {
    const workout = canonicalWorkout({ n: 1 });
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [workout], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    expect(applied).toHaveLength(1);
    expect(objects).toHaveLength(1);
    const projected = objects[0];
    expect(projected.payload.evidence_type).toBe("training");
    expect(projected.payload.metadata.activity_type).toBe("Outdoor Walk");
    expect(projected.payload.evidenceEligibility).toEqual({
      state: "eligible", strategic: true, decidedBy: "healthkit-graduation-projection-v1",
    });
    expect(projected.payload.provenance.healthkit_family).toBe("cardio");
    expect(projected.payload.provenance.healthkit_canonical_type).toBe("outdoor_walking");
    expect(projected.healthKitProjection.readOnly).toBe(true);
  });

  it("stamps the standard canonical-evidence-object WRAPPER fields (evidence_type, quality, lastObservedAt) outside payload -- the same shape overlayGraduatedHealthKitDays already stamps for Activity/Nutrition -- so downstream consumers that read those fields at the top level (not payload) actually see the graduated object", () => {
    const workout = canonicalWorkout({ n: 1, localDate: "2026-09-23" });
    const { objects } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [workout], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    const graduated = objects[0];
    expect(graduated.evidence_type).toBe("training");
    expect(graduated.quality).toEqual({ status: "active" });
    expect(graduated.lastObservedAt).toBe("2026-09-23");
    expect(graduated.firstObservedAt).toBe("2026-09-23");
    expect(graduated.userId).toBe(workout.userId);
    expect(typeof graduated.createdAt).toBe("string");
  });

  it("stays fully quarantined when the evidenceEligibility scope is disabled -- the blanket default", () => {
    const workout = canonicalWorkout({ n: 1 });
    const disabled = resolveHealthKitGraduationPolicy(null);
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [workout], policy: disabled, purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([]);
  });

  it("never graduates a Strength-family workout even if it happens to fall inside the exact same scope window -- Strength keeps its own separate reconciliation semantics and stays quarantined regardless", () => {
    const strengthWorkout = canonicalWorkout({ n: 2, family: "strength", canonicalType: "traditional_strength_training" });
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [strengthWorkout], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([]);
  });

  it("respects the exact-start-date scope boundary -- a workout before the authorized start date does not graduate", () => {
    const before = canonicalWorkout({ n: 3, localDate: "2026-09-20", startedAt: "2026-09-20T15:00:00.000Z", endedAt: "2026-09-20T15:15:00.000Z" });
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [before], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([]);
  });

  it("respects an exact end date -- a workout after an authorized window's end does not graduate", () => {
    const after = canonicalWorkout({ n: 4, localDate: "2026-10-05", startedAt: "2026-10-05T15:00:00.000Z", endedAt: "2026-10-05T15:15:00.000Z" });
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [after], policy: enabledPolicy({ evidenceEligibility: { enabled: true, domains: ["cardio_training"], startLocalDate: "2026-09-23", endLocalDate: "2026-09-30" } }), purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([]);
  });

  it("does not re-graduate a Cardio workout the graduation-independent coexistence check already recognizes as an existing screenshot workout -- no duplicate evidence", () => {
    const workout = canonicalWorkout({ n: 5, localDate: "2026-09-22" });
    const screenshotEvidence = {
      canonicalId: "evidence_1", id: "evidence_1",
      payload: {
        id: "evidence_1", evidence_type: "training", observed_at: "2026-09-22", captured_at: "2026-09-22T10:30:03-05:00",
        exercises: [], metadata: { activity_type: "Outdoor Walk", duration_seconds: 953, active_calories: 86, distance: 0.82, distance_unit: "mi", average_heart_rate: 92, average_pace: null, effort_level: null, location: null, start_time: null, end_time: null, total_calories: null },
        source: { application: "screenshot", integration: "apple_health", modality: "image", source_artifact_refs: ["a.jpg"] },
        provenance: {}, quality: { status: "active" }, values: {},
      },
    };
    const workoutMatchingScreenshot = {
      ...workout,
      coexistence: { state: "matches_existing_evidence_workout", candidates: [{ canonicalId: "evidence_1" }], unverifiableCount: 0 },
    };
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [screenshotEvidence], canonicalWorkouts: [workoutMatchingScreenshot],
      policy: enabledPolicy({ evidenceEligibility: { enabled: true, domains: ["cardio_training"], startLocalDate: "2026-09-20", endLocalDate: null } }),
      purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([screenshotEvidence]);
  });

  it("projects as quarantined (not eligible) for a PROJECTION-purpose read, exactly mirroring Activity/Nutrition graduation's own purpose split", () => {
    const workout = canonicalWorkout({ n: 6 });
    const projectionPolicy = resolveHealthKitGraduationPolicy({
      schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
      projection: { enabled: true, domains: ["cardio_training"], startLocalDate: "2026-09-23", endLocalDate: null },
      evidenceEligibility: { enabled: false },
      historicalBriefingRegeneration: false,
    });
    const { objects } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [workout], policy: projectionPolicy, purpose: Purpose.PROJECTION,
    });
    expect(objects[0].payload.evidenceEligibility).toEqual({
      state: "quarantined", strategic: false, decidedBy: "healthkit-graduation-projection-v1",
    });
  });

  it("never touches or duplicates the separate activity_day evidence object -- no Activity/workout double counting in strategic interpretation", () => {
    const workout = canonicalWorkout({ n: 7 });
    const activityDay = activityDayEvidence();
    const { objects } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [activityDay], canonicalWorkouts: [workout], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    // The activity_day object is passed through completely unchanged (same reference, same value) --
    // the workout's own active_calories is present only in the new, separate "training" object.
    expect(objects).toHaveLength(2);
    expect(objects.find((object) => object.evidence_type === "activity_day")).toBe(activityDay);
    const trainingObject = objects.find((object) => object.payload?.evidence_type === "training");
    expect(trainingObject.payload.metadata.active_calories).toBe(86);
    expect(activityDay.payload.daily_activity.move_calories).toBe(238.75); // unchanged
  });

  it("is correctly detected as a HealthKit-derived record by the existing quarantine-detection helper even once graduated -- the write guard for the strategic Evidence COLLECTION is untouched and would still refuse a persist attempt", () => {
    const workout = canonicalWorkout({ n: 8 });
    const { objects } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [], canonicalWorkouts: [workout], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    // Provenance/source lineage still marks this as HealthKit-derived; the projected object
    // is never itself written to canonicalEvidenceObjects (this overlay is read-time only).
    expect(isHealthKitDerivedRecord(objects[0])).toBe(true);
  });

  it("produces zero objects and zero applications for an empty workout list -- purely additive, never breaks an empty read", () => {
    const { objects, applied } = overlayGraduatedHealthKitCardioWorkouts({
      canonicalObjects: [{ id: "unrelated" }], canonicalWorkouts: [], policy: enabledPolicy(), purpose: Purpose.EVIDENCE,
    });
    expect(applied).toEqual([]);
    expect(objects).toEqual([{ id: "unrelated" }]);
  });
});
