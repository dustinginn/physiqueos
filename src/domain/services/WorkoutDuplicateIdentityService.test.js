import { describe, expect, it } from "vitest";
import { reconcileEvidencePackageIntoCanonicalHistory } from "./CanonicalEvidenceService";
import {
  assessWorkoutDuplicatePair,
  getWorkoutDuplicateIdentityKey,
} from "./WorkoutDuplicateIdentityService";
import { resolveTrainingExerciseIdentity } from "../models/trainingExerciseIdentity";

function outdoorWalk({
  id,
  start,
  end,
  durationSeconds,
  distance,
  activeCalories,
  totalCalories,
  averageHeartRate,
  averagePace,
  elevationGain,
  sourceRefs = [id],
  canonicalId = null,
} = {}) {
  return {
    id,
    evidence_type: "training",
    observed_at: "2026-07-27",
    source: {
      modality: "screenshot",
      application: "Apple Fitness",
      source_artifact_refs: sourceRefs,
    },
    metadata: {
      activity_type: "Outdoor Walk",
      start_time: start,
      end_time: end,
      duration_seconds: durationSeconds,
      distance,
      active_calories: activeCalories,
      total_calories: totalCalories,
      average_heart_rate: averageHeartRate,
      average_pace: averagePace,
      elevation_gain: elevationGain,
    },
    provenance: {
      source_artifact_refs: sourceRefs,
    },
    reconciliation: canonicalId ? { canonical_id: canonicalId } : undefined,
    exercises: [],
  };
}

function typedWorkout({
  id,
  start,
  end,
  durationSeconds,
  sourceRefs = [id],
  exercises = [],
  canonicalId = null,
} = {}) {
  return {
    id,
    evidence_type: "training",
    observed_at: "2026-07-27",
    source: {
      modality: "manual",
      source_artifact_refs: sourceRefs,
    },
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: start,
      end_time: end,
      duration_seconds: durationSeconds,
    },
    provenance: {
      source_artifact_refs: sourceRefs,
    },
    reconciliation: canonicalId ? { canonical_id: canonicalId } : undefined,
    exercises,
  };
}

describe("WorkoutDuplicateIdentityService", () => {
  it("classifies identical authoritative workout identities as duplicates", () => {
    const left = outdoorWalk({
      id: "walk-a",
      start: "06:53",
      end: "07:09",
      durationSeconds: 956,
      distance: 0.98,
      activeCalories: 88,
      totalCalories: 115,
      averageHeartRate: 88,
      averagePace: "16'15\"/mi",
      elevationGain: 21,
      canonicalId: "apple-health-uuid-123",
    });
    const right = outdoorWalk({
      id: "walk-b",
      start: "08:11",
      end: "08:26",
      durationSeconds: 897,
      distance: 0.98,
      activeCalories: 112,
      totalCalories: 137,
      averageHeartRate: 103,
      averagePace: "15'14\"/mi",
      elevationGain: 7,
      canonicalId: "apple-health-uuid-123",
    });

    const result = assessWorkoutDuplicatePair(left, right);

    expect(result.outcome).toBe("duplicate");
    expect(result.confidence).toBe(100);
    expect(result.reasons.join(" ")).toMatch(/shared authoritative identity/i);
  });

  it("rejects workouts that only match on distance when their windows do not overlap", () => {
    const result = assessWorkoutDuplicatePair(
      outdoorWalk({
        id: "walk-a",
        start: "06:53",
        end: "07:09",
        durationSeconds: 956,
        distance: 0.98,
        activeCalories: 88,
        totalCalories: 115,
        averageHeartRate: 88,
        averagePace: "16'15\"/mi",
        elevationGain: 21,
      }),
      outdoorWalk({
        id: "walk-b",
        start: "08:11",
        end: "08:26",
        durationSeconds: 897,
        distance: 0.98,
        activeCalories: 112,
        totalCalories: 137,
        averageHeartRate: 103,
        averagePace: "15'14\"/mi",
        elevationGain: 7,
      })
    );

    expect(result.outcome).toBe("not_duplicate");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Start times differ by 78 minutes", "No temporal overlap"])
    );
  });

  it("keeps matching duration or calories alone below the duplicate threshold", () => {
    const left = outdoorWalk({
      id: "walk-a",
      start: "06:53",
      end: "07:09",
      durationSeconds: 956,
      distance: 0.98,
      activeCalories: 88,
      totalCalories: 115,
      averageHeartRate: 88,
      averagePace: "16'15\"/mi",
      elevationGain: 21,
    });
    const right = outdoorWalk({
      id: "walk-b",
      start: "08:11",
      end: "08:26",
      durationSeconds: 956,
      distance: 1.41,
      activeCalories: 88,
      totalCalories: 137,
      averageHeartRate: 110,
      averagePace: "15'14\"/mi",
      elevationGain: 7,
    });

    const result = assessWorkoutDuplicatePair(left, right);

    expect(result.outcome).toBe("not_duplicate");
    expect(result.confidence).toBeLessThan(80);
  });

  it("generates a structured explanation for diagnostics", () => {
    const result = assessWorkoutDuplicatePair(
      typedWorkout({
        id: "typed-a",
        start: "17:00",
        end: "17:42",
        durationSeconds: 2520,
        sourceRefs: ["typed_ref_shared"],
        exercises: [
          { name: "Spider Curls", sets: [{ reps: 14, weight: 40 }] },
          { name: "EZ Bar Curls", sets: [{ reps: 13, weight: 70 }] },
        ],
      }),
      typedWorkout({
        id: "typed-b",
        start: "17:00",
        end: "17:42",
        durationSeconds: 2520,
        sourceRefs: ["typed_ref_shared"],
        exercises: [
          { name: "Spider Curls", sets: [{ reps: 14, weight: 40 }] },
          { name: "EZ Bar Curls", sets: [{ reps: 13, weight: 70 }] },
        ],
      })
    );

    expect(result.outcome).toBe("duplicate");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("keeps distinct outdoor walks separate in canonical reconciliation", () => {
    const packageEvidence = {
      package_id: "pkg_walks",
      evidence_objects: [
        outdoorWalk({
          id: "walk-a",
          start: "06:53",
          end: "07:09",
          durationSeconds: 956,
          distance: 0.98,
          activeCalories: 88,
          totalCalories: 115,
          averageHeartRate: 88,
          averagePace: "16'15\"/mi",
          elevationGain: 21,
        }),
        outdoorWalk({
          id: "walk-b",
          start: "08:11",
          end: "08:26",
          durationSeconds: 897,
          distance: 0.98,
          activeCalories: 112,
          totalCalories: 137,
          averageHeartRate: 103,
          averagePace: "15'14\"/mi",
          elevationGain: 7,
        }),
      ],
    };

    const result = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: packageEvidence,
      existingCanonicalObjects: [],
      userId: "founder",
    });

    const activeWalks = result.filter((object) => object.quality?.status === "active");

    expect(activeWalks).toHaveLength(2);
    expect(activeWalks.map((object) => object.canonicalId)).toHaveLength(2);
  });

  it("keeps same-source duplicate imports on one canonical workout", () => {
    const packageEvidence = {
      package_id: "pkg_duplicate",
      evidence_objects: [
        outdoorWalk({
          id: "walk-a",
          start: "06:53",
          end: "07:09",
          durationSeconds: 956,
          distance: 0.98,
          activeCalories: 88,
          totalCalories: 115,
          averageHeartRate: 88,
          averagePace: "16'15\"/mi",
          elevationGain: 21,
          sourceRefs: ["apple_health_uuid_001"],
          canonicalId: "apple_health_uuid_001",
        }),
        outdoorWalk({
          id: "walk-b",
          start: "06:53",
          end: "07:09",
          durationSeconds: 956,
          distance: 0.98,
          activeCalories: 88,
          totalCalories: 115,
          averageHeartRate: 88,
          averagePace: "16'15\"/mi",
          elevationGain: 21,
          sourceRefs: ["apple_health_uuid_001"],
          canonicalId: "apple_health_uuid_001",
        }),
      ],
    };

    const result = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: packageEvidence,
      existingCanonicalObjects: [],
      userId: "founder",
    });

    const activeWalks = result.filter((object) => object.quality?.status === "active");

    expect(activeWalks).toHaveLength(1);
    expect(activeWalks[0].canonicalId).toBe("apple_health_uuid_001");
  });

  it("assigns a temporal identity key before supporting metrics", () => {
    const identityKey = getWorkoutDuplicateIdentityKey(
      outdoorWalk({
        id: "walk-a",
        start: "06:53",
        end: "07:09",
        durationSeconds: 956,
        distance: 0.98,
        activeCalories: 88,
        totalCalories: 115,
        averageHeartRate: 88,
        averagePace: "16'15\"/mi",
        elevationGain: 21,
        sourceRefs: [],
      })
    );

    expect(identityKey).toContain("temporal");
    expect(identityKey).not.toContain("0.98");
  });

  it("does not treat package-local typed evidence refs as authoritative workout identity", () => {
    const julySeventeen = typedWorkout({
      id: "strength-july-17",
      start: "06:39",
      end: "08:11",
      durationSeconds: 5533,
      sourceRefs: ["IMG_1602.png", "typed_evidence_0"],
      exercises: [
        { name: "Shoulder Press Machine", sets: [{ reps: 12, weight: 130 }] },
      ],
    });
    const julyTwentySeven = typedWorkout({
      id: "strength-july-27",
      start: "07:09",
      end: "08:00",
      durationSeconds: 3053,
      sourceRefs: ["IMG_1688.png", "typed_evidence_0"],
      exercises: [
        { name: "Shoulder Press Machine", sets: [{ reps: 15, weight: 140 }] },
      ],
    });
    julySeventeen.observed_at = "2026-07-17";

    const result = assessWorkoutDuplicatePair(julySeventeen, julyTwentySeven);

    expect(result.outcome).toBe("not_duplicate");
    expect(result.signals.authoritative).toEqual([]);
    expect(result.reasons).toContain(
      "Different workout dates: 2026-07-17 vs 2026-07-27"
    );
    expect(getWorkoutDuplicateIdentityKey(julyTwentySeven)).toBe(
      "training|authoritative|IMG_1688.png"
    );
  });

  it("still recognizes an exact screenshot re-upload when typed refs are present", () => {
    const firstUpload = typedWorkout({
      id: "strength-july-27-first",
      start: "07:09",
      end: "08:00",
      durationSeconds: 3053,
      sourceRefs: ["IMG_1688.png", "typed_evidence_0"],
    });
    const retry = typedWorkout({
      id: "strength-july-27-retry",
      start: "07:09",
      end: "08:00",
      durationSeconds: 3053,
      sourceRefs: ["IMG_1688.png", "typed_evidence_0"],
    });

    const result = assessWorkoutDuplicatePair(firstUpload, retry);

    expect(result.outcome).toBe("duplicate");
    expect(result.signals.authoritative).toEqual(["IMG_1688.png"]);
  });

  it("keeps different-day typed strength uploads as separate canonical sessions", () => {
    const prior = typedWorkout({
      id: "strength-july-17",
      start: "06:39",
      end: "08:11",
      durationSeconds: 5533,
      sourceRefs: ["IMG_1602.png", "typed_evidence_0"],
    });
    prior.observed_at = "2026-07-17";
    const current = typedWorkout({
      id: "strength-july-27",
      start: "07:09",
      end: "08:00",
      durationSeconds: 3053,
      sourceRefs: ["IMG_1688.png", "typed_evidence_0"],
    });

    const result = reconcileEvidencePackageIntoCanonicalHistory({
      evidencePackage: {
        package_id: "pkg_typed_strength_sessions",
        evidence_objects: [prior, current],
      },
      existingCanonicalObjects: [],
      userId: "founder",
    });
    const activeStrengthSessions = result.filter(
      (object) =>
        object.quality?.status === "active" &&
        object.payload?.metadata?.activity_type === "Traditional Strength Training"
    );

    expect(activeStrengthSessions).toHaveLength(2);
    expect(activeStrengthSessions.map((object) => object.canonicalId).sort()).toEqual([
      "training|authoritative|IMG_1602.png",
      "training|authoritative|IMG_1688.png",
    ]);
  });

  it("preserves the machine and cable exercise identities from the July 27 session", () => {
    expect(resolveTrainingExerciseIdentity("Shoulder Press Machine")).toMatchObject({
      canonicalExerciseId: "shoulder_press_machine",
      canonicalExerciseName: "Shoulder Press Machine",
    });
    expect(resolveTrainingExerciseIdentity("Lateral Raises Machine")).toMatchObject({
      canonicalExerciseId: "lateral_raise_machine",
      canonicalExerciseName: "Lateral Raises Machine",
    });
    expect(resolveTrainingExerciseIdentity("Cable Machine Front Raises")).toMatchObject({
      canonicalExerciseId: "cable_machine_front_raise",
      canonicalExerciseName: "Cable Machine Front Raises",
    });
  });
});
