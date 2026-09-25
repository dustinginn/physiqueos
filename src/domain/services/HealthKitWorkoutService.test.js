import { describe, expect, it } from "vitest";
import { normalizeHealthKitObservationBatch } from "./HealthKitObservationService.js";
import {
  HealthKitWorkoutFamily,
  classifyHealthKitWorkoutType,
  composeDailyActiveEnergyWithWorkouts,
  deriveHealthKitWorkoutLocalDate,
  getHealthKitCanonicalWorkoutRecordId,
  reconcileHealthKitCanonicalWorkout,
} from "./HealthKitWorkoutService.js";

const OWNER = "user_founder_001";
const NOW = "2026-09-23T20:00:00.000Z";
const HK_UUID = "9f3c2a10-1111-4222-8333-444455556666";

describe("HealthKit workout type classification", () => {
  it("classifies the numeric HKWorkoutActivityType raw values Native actually sends", () => {
    expect(classifyHealthKitWorkoutType("50")).toMatchObject({ family: "strength", canonicalType: "traditional_strength_training", basis: "numeric_raw_value" });
    expect(classifyHealthKitWorkoutType("20")).toMatchObject({ family: "strength", canonicalType: "functional_strength_training" });
    expect(classifyHealthKitWorkoutType("52")).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(classifyHealthKitWorkoutType("37")).toMatchObject({ family: "cardio", canonicalType: "running" });
    expect(classifyHealthKitWorkoutType("13")).toMatchObject({ family: "cardio", canonicalType: "cycling" });
  });

  it("classifies the equivalent display names identically", () => {
    expect(classifyHealthKitWorkoutType("Traditional Strength Training").family).toBe("strength");
    expect(classifyHealthKitWorkoutType("Functional Strength Training").canonicalType).toBe("functional_strength_training");
    expect(classifyHealthKitWorkoutType("Outdoor Walk")).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(classifyHealthKitWorkoutType("Outdoor Run")).toMatchObject({ family: "cardio", canonicalType: "running" });
    expect(classifyHealthKitWorkoutType("Cycling")).toMatchObject({ family: "cardio", canonicalType: "cycling" });
  });

  it("never guesses: any other type, numeric or named, stays unsupported", () => {
    for (const type of ["16", "44", "24", "35", "46", "3000", "Elliptical", "Stair Climbing", "Swimming", "Yoga", "", null, undefined]) {
      expect(classifyHealthKitWorkoutType(type).family, String(type)).toBe(HealthKitWorkoutFamily.UNSUPPORTED);
    }
  });
});

// Apple's HKWorkoutActivityType raw value is identical for the indoor and
// outdoor variant of a cardio activity; only the separate, explicit
// HKMetadataKeyIndoorWorkout boolean distinguishes them. These tests cover
// classifyHealthKitWorkoutType's second, optional argument end to end.
describe("indoor/outdoor cardio specialization (explicit signal only)", () => {
  it("specializes every supported cardio type into its indoor variant when the signal is explicitly true, without changing family", () => {
    expect(classifyHealthKitWorkoutType("52", { isIndoorWorkout: true }))
      .toMatchObject({ family: "cardio", canonicalType: "indoor_walking" });
    expect(classifyHealthKitWorkoutType("37", { isIndoorWorkout: true }))
      .toMatchObject({ family: "cardio", canonicalType: "indoor_running" });
    expect(classifyHealthKitWorkoutType("13", { isIndoorWorkout: true }))
      .toMatchObject({ family: "cardio", canonicalType: "indoor_cycling" });
  });

  it("specializes every supported cardio type into its outdoor variant when the signal is explicitly false, without changing family", () => {
    expect(classifyHealthKitWorkoutType("52", { isIndoorWorkout: false }))
      .toMatchObject({ family: "cardio", canonicalType: "outdoor_walking" });
    expect(classifyHealthKitWorkoutType("37", { isIndoorWorkout: false }))
      .toMatchObject({ family: "cardio", canonicalType: "outdoor_running" });
    expect(classifyHealthKitWorkoutType("13", { isIndoorWorkout: false }))
      .toMatchObject({ family: "cardio", canonicalType: "outdoor_cycling" });
  });

  it("keeps the exact generic canonicalType -- never guessed toward indoor or outdoor -- when the signal is absent, null, or omitted entirely", () => {
    expect(classifyHealthKitWorkoutType("52")).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(classifyHealthKitWorkoutType("52", {})).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(classifyHealthKitWorkoutType("52", { isIndoorWorkout: null })).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(classifyHealthKitWorkoutType("52", { isIndoorWorkout: undefined })).toMatchObject({ family: "cardio", canonicalType: "walking" });
  });

  it("never lets the indoor/outdoor signal change family classification -- cardio stays cardio either way", () => {
    const indoor = classifyHealthKitWorkoutType("52", { isIndoorWorkout: true });
    const outdoor = classifyHealthKitWorkoutType("52", { isIndoorWorkout: false });
    expect(indoor.family).toBe("cardio");
    expect(outdoor.family).toBe("cardio");
    expect(indoor.canonicalType).not.toBe(outdoor.canonicalType);
  });

  it("leaves Strength completely byte-identical whether or not an indoor/outdoor signal is supplied -- it never applies outside cardio", () => {
    const withoutSignal = classifyHealthKitWorkoutType("50");
    const withTrueSignal = classifyHealthKitWorkoutType("50", { isIndoorWorkout: true });
    const withFalseSignal = classifyHealthKitWorkoutType("50", { isIndoorWorkout: false });
    expect(withTrueSignal).toEqual(withoutSignal);
    expect(withFalseSignal).toEqual(withoutSignal);
    expect(withoutSignal).toMatchObject({ family: "strength", canonicalType: "traditional_strength_training" });
  });

  it("never lets an unsupported/unrecognized activity type silently become a known specific type just because an indoor/outdoor signal was supplied", () => {
    for (const type of ["16", "44", "3000", "Elliptical", "Swimming", "Yoga"]) {
      const withIndoorTrue = classifyHealthKitWorkoutType(type, { isIndoorWorkout: true });
      const withIndoorFalse = classifyHealthKitWorkoutType(type, { isIndoorWorkout: false });
      expect(withIndoorTrue, String(type)).toMatchObject({ family: HealthKitWorkoutFamily.UNSUPPORTED, canonicalType: null });
      expect(withIndoorFalse, String(type)).toMatchObject({ family: HealthKitWorkoutFamily.UNSUPPORTED, canonicalType: null });
      // Specifically never "indoor_walking" or any other known specific type.
      expect(withIndoorTrue.canonicalType).not.toBe("indoor_walking");
      expect(withIndoorFalse.canonicalType).not.toBe("outdoor_walking");
    }
  });
});

// End-to-end: the same signal, carried through normalizeHealthKitObservationBatch
// (HealthKitObservationService.js) and into reconcileHealthKitCanonicalWorkout
// (the same constructor both first-delivery ingestion and the deferred
// reconciliation runner use), produces the correct canonical record.
describe("indoor/outdoor signal end to end (observation normalization -> canonical workout)", () => {
  it("an Outdoor Walk source (isIndoorWorkout: false) canonicalizes to family cardio with canonicalType outdoor_walking", () => {
    const record = reconcile(workout({ activityType: "52", isIndoorWorkout: false })).record;
    expect(record.current).toMatchObject({ family: "cardio", canonicalType: "outdoor_walking" });
  });

  it("an Indoor Walk source (isIndoorWorkout: true) canonicalizes to family cardio with canonicalType indoor_walking", () => {
    const record = reconcile(workout({ activityType: "52", isIndoorWorkout: true })).record;
    expect(record.current).toMatchObject({ family: "cardio", canonicalType: "indoor_walking" });
  });

  it("keeps Indoor and Outdoor distinct even when every other telemetry field (duration, calories, heart rate, distance) is identical", () => {
    const shared = {
      activityType: "52", durationSeconds: 1200, activeCalories: 160, averageHeartRate: 124,
      startedAt: "2026-09-23T10:00:00-07:00", endedAt: "2026-09-23T10:20:00-07:00",
    };
    const indoor = reconcile(workout({ ...shared, externalId: "indoor-walk-uuid", isIndoorWorkout: true })).record;
    const outdoor = reconcile(workout({ ...shared, externalId: "outdoor-walk-uuid", isIndoorWorkout: false })).record;
    expect(indoor.current.telemetry).toEqual(outdoor.current.telemetry);
    expect(indoor.current.family).toBe(outdoor.current.family);
    expect(indoor.current.canonicalType).not.toBe(outdoor.current.canonicalType);
    expect(indoor.current.canonicalType).toBe("indoor_walking");
    expect(outdoor.current.canonicalType).toBe("outdoor_walking");
  });

  it("never overwrites family with the more specific canonicalType, or vice versa -- both are independently correct on the same record", () => {
    const indoor = reconcile(workout({ activityType: "37", isIndoorWorkout: true })).record;
    expect(indoor.current.family).toBe("cardio");
    expect(indoor.current.canonicalType).toBe("indoor_running");
    // The family classification is untouched by knowing the specific type.
    expect(indoor.current.family).not.toBe("indoor_running");
    // The specific type is untouched by (never collapsed to) the family.
    expect(indoor.current.canonicalType).not.toBe("cardio");
  });

  it("never infers indoor/outdoor from GPS-shaped telemetry (distance present) when no explicit signal was ever sent -- stays the generic type", () => {
    const record = reconcile(workout({ activityType: "52", durationSeconds: 1800, activeCalories: 200 })).record;
    // No isIndoorWorkout key at all in the observation, despite distance-like
    // telemetry (duration/calories consistent with an outdoor GPS walk).
    expect(record.current).toMatchObject({ family: "cardio", canonicalType: "walking" });
    expect(record.current.canonicalType).not.toBe("indoor_walking");
    expect(record.current.canonicalType).not.toBe("outdoor_walking");
  });

  it("a legacy/historical payload with no isIndoorWorkout field normalizes and canonicalizes exactly as it did before this change (backward compatibility)", () => {
    const legacyObservation = normalize(workout({ activityType: "52" }));
    expect(legacyObservation.measurement).not.toHaveProperty("isIndoorWorkout");
    const record = reconcile(workout({ activityType: "52" })).record;
    expect(record.current.canonicalType).toBe("walking");
    expect(record.current.family).toBe("cardio");
  });
});

describe("effective date authority", () => {
  it("comes from the workout's own start in its own time zone, not the client label or ingestion time", () => {
    // 23:50 PDT on Sep 23 is 06:50Z on Sep 24.
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "2026-09-23T23:50:00-07:00", timeZone: "America/Los_Angeles" })).toBe("2026-09-23");
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "2026-09-24T06:50:00Z", timeZone: "America/Los_Angeles" })).toBe("2026-09-23");
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "2026-09-24T06:50:00Z", timeZone: "Europe/Paris" })).toBe("2026-09-24");
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "not a date", timeZone: "America/Los_Angeles" })).toBeNull();
  });

  it("is DST-safe across the fall-back day", () => {
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "2026-11-01T08:30:00Z", timeZone: "America/Los_Angeles" })).toBe("2026-11-01");
    expect(deriveHealthKitWorkoutLocalDate({ startedAt: "2026-11-02T07:30:00Z", timeZone: "America/Los_Angeles" })).toBe("2026-11-01");
  });

  it("corrects a mislabeled client date and records that it did", () => {
    const { record } = reconcile(workout({ clientLocalDate: "2026-09-24", startedAt: "2026-09-23T23:50:00-07:00", endedAt: "2026-09-24T00:40:00-07:00" }));
    expect(record.localDate).toBe("2026-09-23");
    expect(record.current).toMatchObject({ localDateBasis: "workout_start_in_workout_time_zone", clientLocalDate: "2026-09-24", localDateCorrected: true });
  });
});

describe("stable identity and revisions", () => {
  it("keeps the exact V1 identity for a first or unstated revision and adds the revision only after 1", () => {
    const v1 = normalize(workout()).id;
    expect(normalize(workout({ sourceRevision: 1 })).id).toBe(v1);
    expect(normalize(workout({ sourceRevision: 2 })).id).not.toBe(v1);
    expect(normalize(workout({ sourceRevision: 3 })).id).not.toBe(normalize(workout({ sourceRevision: 2 })).id);
  });

  it("derives one canonical record id per SOURCE workout, without exposing the HealthKit identifier", () => {
    const first = normalize(workout());
    const second = normalize(workout({ sourceRevision: 2 }));
    expect(getHealthKitCanonicalWorkoutRecordId(first)).toBe(getHealthKitCanonicalWorkoutRecordId(second));
    expect(getHealthKitCanonicalWorkoutRecordId(first)).toMatch(/^healthkit_canonical_workout_[0-9a-f]{40}$/);
    expect(getHealthKitCanonicalWorkoutRecordId(first)).not.toContain(HK_UUID);
    const other = normalize(workout({ externalId: "another-uuid" }));
    expect(getHealthKitCanonicalWorkoutRecordId(other)).not.toBe(getHealthKitCanonicalWorkoutRecordId(first));
    const record = reconcile(workout()).record;
    expect(JSON.stringify(record)).not.toContain(HK_UUID);
  });

  it("creates once, then an identical replay is a no-op", () => {
    const created = reconcile(workout());
    expect(created.action).toBe("create");
    expect(created.record).toMatchObject({ revision: 1, localDate: "2026-09-23", evidenceEligibility: { state: "quarantined", strategic: false } });
    const replay = reconcile(workout(), created.record);
    expect(replay.action).toBe("replay");
    expect(replay.record).toBe(created.record);
  });

  it("advances the SAME canonical record when Apple revises duration, calories or heart rate", () => {
    const first = reconcile(workout({ durationSeconds: 3000, activeCalories: 300, averageHeartRate: 110 })).record;
    const revised = reconcile(workout({ sourceRevision: 2, durationSeconds: 3600, activeCalories: 410, averageHeartRate: 121 }), first);
    expect(revised.action).toBe("update");
    expect(revised.record.id).toBe(first.id);
    expect(revised.record.revision).toBe(2);
    expect(revised.record.current.telemetry).toMatchObject({ durationSeconds: 3600, activeCalories: 410, averageHeartRate: 121 });
    expect(revised.record.revisionHistory).toHaveLength(1);
    expect(revised.record.revisionHistory[0].telemetry).toMatchObject({ durationSeconds: 3000, activeCalories: 300 });
    expect(revised.record.priorSemanticFingerprint).toBe(first.semanticFingerprint);
  });

  it("never lets an older or equal source revision displace a newer canonical record", () => {
    const newer = reconcile(workout({ sourceRevision: 3, activeCalories: 500 })).record;
    const older = reconcile(workout({ sourceRevision: 2, activeCalories: 450 }), newer);
    expect(older).toMatchObject({ action: "superseded", reason: "newer_source_revision_already_canonical" });
    expect(older.record.current.telemetry.activeCalories).toBe(500);
  });

  it("does not bump the revision when a newer source revision changes nothing semantic", () => {
    const first = reconcile(workout()).record;
    const same = reconcile(workout({ sourceRevision: 2 }), first);
    expect(same.action).toBe("update");
    expect(same.record.revision).toBe(1);
    expect(same.record.revisionHistory).toHaveLength(0);
    expect(same.record.provenance.sourceObservationIds).toHaveLength(2);
  });
});

describe("authority boundaries", () => {
  it("carries Apple telemetry only and never exercises, sets, reps, or load", () => {
    const { record } = reconcile(workout({ activityType: "50" }));
    expect(Object.keys(record.current.telemetry).sort()).toEqual(
      ["activeCalories", "averageHeartRate", "distance", "distanceUnit", "durationSeconds", "totalCalories"]);
    expect(JSON.stringify(record)).not.toMatch(/exercises|"sets"|reps|weight_lb|load/);
    expect(record.contentAuthority).toEqual({ telemetry: "healthkit", trainingContent: "workout_logger" });
  });

  it("never adds workout energy on top of the daily active-energy total", () => {
    const strength = reconcile(workout({ activeCalories: 400 })).record;
    const walk = reconcile(workout({ externalId: "walk-uuid", activityType: "52", activeCalories: 150, startedAt: "2026-09-23T07:00:00-07:00", endedAt: "2026-09-23T07:40:00-07:00" })).record;
    const composed = composeDailyActiveEnergyWithWorkouts({ dailyMoveCalories: 900, canonicalWorkouts: [strength, walk] });
    expect(composed).toEqual({
      activeEnergy: 900,
      workoutEnergyIncludedInDailyTotal: 550,
      workoutEnergyAdded: 0,
      policy: "workout_energy_is_descriptive_never_additive",
    });
    expect(strength.activityInteraction).toEqual({ policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false });
  });
});

function reconcile(input, existing = null) {
  return reconcileHealthKitCanonicalWorkout({ observation: normalize(input), existing, ownerUserId: OWNER, now: NOW });
}

function normalize(input) {
  return normalizeHealthKitObservationBatch({ batchId: "b", observations: [input], principalDeviceId: "founder-iphone" }).observations[0];
}

function workout({
  activityType = "50", externalId = HK_UUID, startedAt = "2026-09-23T10:00:00-07:00", endedAt = "2026-09-23T11:00:00-07:00",
  clientLocalDate = "2026-09-23", durationSeconds = 3600, activeCalories = 400, averageHeartRate = 122, sourceRevision,
  isIndoorWorkout,
} = {}) {
  return {
    observationType: "workout",
    externalId,
    source: { bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch", productType: "Watch7,5" },
    occurrence: { localDate: clientLocalDate, timeZone: "America/Los_Angeles", startedAt, endedAt },
    workout: {
      activityType, durationSeconds, activeCalories, averageHeartRate,
      ...(sourceRevision ? { sourceRevision } : {}),
      ...(typeof isIndoorWorkout === "boolean" ? { isIndoorWorkout } : {}),
    },
  };
}
