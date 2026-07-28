import { describe, expect, it } from "vitest";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
import { getPlaceholderEntries } from "./ProgressReportingService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";
import {
  assessWorkoutDuplicatePair,
  getWorkoutDuplicateIdentityKey,
} from "./WorkoutDuplicateIdentityService";

const workoutDate = "2026-07-27";

describe("July 27 Strength Training ingestion stabilization", () => {
  it("commits the source once, preserves all sessions, and evaluates only legitimate PRs", () => {
    const priorSessions = [july6Strength(), july13Strength()];
    const existingCanonicalObjects = canonicalize(priorSessions);
    const cardio = [outdoorWalk("IMG_1686.png", 897, 112, 103), outdoorWalk("IMG_1689.png", 956, 88, 88), stairStepper()];
    const cardioCanonicalObjects = canonicalize(cardio);
    const strength = july27Strength();

    cardio.forEach((session) => {
      expect(assessWorkoutDuplicatePair(strength, session).outcome).toBe("not_duplicate");
    });
    expect(assessWorkoutDuplicatePair(strength, structuredClone(strength)).outcome).toBe(
      "duplicate"
    );
    expect(getWorkoutDuplicateIdentityKey(strength)).toBe(
      "training|authoritative|IMG_1688.png"
    );

    const first = reconcileConfirmedEvidencePackage({
      evidencePackage: packageFor([strength]),
      existingCanonicalObjects: [...existingCanonicalObjects, ...cardioCanonicalObjects],
      userId: "founder",
    });
    expect(first.report.addedCanonicalIds).toEqual([
      "training|authoritative|IMG_1688.png",
    ]);

    const afterFirst = applyChangedObjects(
      [...existingCanonicalObjects, ...cardioCanonicalObjects],
      first.changedObjects
    );
    const second = reconcileConfirmedEvidencePackage({
      evidencePackage: packageFor([strength]),
      existingCanonicalObjects: afterFirst,
      userId: "founder",
    });
    expect(second.changedObjects).toEqual([]);

    const july27Sessions = activeTrainingPayloads(afterFirst).filter(
      (session) => session.observed_at === workoutDate
    );
    expect(july27Sessions).toHaveLength(4);
    expect(
      july27Sessions.filter((session) =>
        /traditional strength training/i.test(session.metadata.activity_type)
      )
    ).toHaveLength(1);
    expect(
      july27Sessions.filter((session) => session.metadata.activity_type === "Outdoor Walk")
    ).toHaveLength(2);
    expect(
      july27Sessions.filter((session) => session.metadata.activity_type === "Stair Stepper")
    ).toHaveLength(1);

    const canonicalStrength = afterFirst.find(
      (object) => object.canonicalId === "training|authoritative|IMG_1688.png"
    );
    expect(canonicalStrength.payload).toMatchObject({
      observed_at: workoutDate,
      metadata: {
        activity_type: "Traditional Strength Training",
        duration_seconds: 3053,
        active_calories: 215,
        average_heart_rate: 93,
      },
    });
    expect(
      canonicalStrength.payload.exercises.map((exercise) => [
        exercise.canonicalExerciseId,
        exercise.name,
        exercise.sets.length,
        sessionVolume(exercise),
      ])
    ).toEqual([
      ["shoulder_press_machine", "Shoulder Press Machine", 4, 6390],
      ["lateral_raise_machine", "Lateral Raises Machine", 4, 3600],
      ["cable_machine_front_raise", "Cable Machine Front Raises", 4, 6240],
    ]);

    const report = createTrainingPerformanceIntelligenceReport({
      canonicalObjects: afterFirst,
      generatedAt: "2026-07-27T23:59:00.000Z",
      now: "2026-07-27T23:59:00.000Z",
    });
    const events = produceTrainingPerformanceEvents({
      canonicalTrainingSession: canonicalStrength,
      trainingAnalysis: {
        id: "analysis_training_july_27",
        metadata: { trainingPerformance: report },
      },
      sourceEvidencePackageId: "package_july_27_strength",
      sourceReviewId: "review_july_27_strength",
      now: () => new Date("2026-07-27T23:59:00.000Z"),
    });

    expect(
      events.map((event) => [
        event.canonicalExerciseId,
        event.eventType,
        event.currentValue,
        event.previousBaselineValue,
        event.load,
      ])
    ).toEqual([
      ["cable_machine_front_raise", "session_volume_pr", 6240, 5470, null],
      ["shoulder_press_machine", "reps_at_load_pr", 15, 10, 140],
      ["shoulder_press_machine", "reps_at_load_pr", 9, 8, 150],
      ["shoulder_press_machine", "reps_at_load_pr", 11, 10, 140],
      ["cable_machine_front_raise", "reps_at_load_pr", 12, 10, 130],
      ["shoulder_press_machine", "session_volume_pr", 6390, 5960, null],
    ]);
    expect(events.some((event) => event.canonicalExerciseId === "lateral_raise_machine")).toBe(
      false
    );
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);

    const visibleRecords = getPlaceholderEntries("training", {
      trainingSessions: july27Sessions,
    });
    expect(visibleRecords).toHaveLength(4);
    expect(visibleRecords.map((record) => record.label)).toEqual(
      expect.arrayContaining([
        "Traditional Strength Training",
        "Outdoor Walk",
        "Stair Stepper",
      ])
    );
  });
});

function canonicalize(evidenceObjects) {
  return reconcileConfirmedEvidencePackage({
    evidencePackage: packageFor(evidenceObjects),
    existingCanonicalObjects: [],
    userId: "founder",
  }).changedObjects;
}

function packageFor(evidenceObjects) {
  return {
    package_id: "package_july_27_strength",
    evidence_objects: evidenceObjects,
  };
}

function applyChangedObjects(existing, changed) {
  const byId = new Map(existing.map((object) => [object.canonicalId, object]));
  changed.forEach((object) => byId.set(object.canonicalId, object));
  return [...byId.values()];
}

function activeTrainingPayloads(objects) {
  return objects
    .filter(
      (object) =>
        object.quality?.status !== "superseded" &&
        object.payload?.evidence_type === "training"
    )
    .map((object) => object.payload);
}

function july27Strength() {
  return strengthSession({
    id: "training_2026-07-27_traditional_strength_training",
    date: workoutDate,
    duration: 3053,
    sourceRefs: ["IMG_1688.png", "typed_evidence_0"],
    activeCalories: 215,
    averageHeartRate: 93,
    exercises: [
      exercise("Shoulder press machine", [[15, 140], [9, 150], [11, 140], [10, 140]]),
      exercise("Lateral raises machine", [[12, 75], [12, 75], [12, 75], [12, 75]]),
      exercise("Cable machine front raises", [[12, 130], [12, 130], [12, 130], [12, 130]]),
    ],
  });
}

function july13Strength() {
  return strengthSession({
    id: "training_2026-07-13_strength",
    date: "2026-07-13",
    duration: 3276,
    sourceRefs: ["IMG_1512.png", "typed_evidence_0"],
    activeCalories: 234,
    averageHeartRate: 100,
    exercises: [
      exercise("Shoulder Press Machine", [[15, 120], [12, 130], [10, 140], [8, 150]]),
      exercise("Lateral Raises Machine", [[12, 75], [12, 75], [12, 75], [12, 75]]),
      exercise("Cable Machine Front Raises", [[13, 110], [12, 120], [10, 130], [10, 130]]),
    ],
  });
}

function july6Strength() {
  return strengthSession({
    id: "training_2026-07-06_strength",
    date: "2026-07-06",
    duration: 3361,
    sourceRefs: ["IMG_1376.png", "typed_evidence_0"],
    activeCalories: 237,
    averageHeartRate: 99,
    exercises: [
      exercise("Shoulder Press Machine", [[15, 120], [12, 130], [10, 140], [8, 150]]),
      exercise("Lateral Raises Machine", [[12, 70], [12, 70], [12, 70], [12, 70]]),
    ],
  });
}

function strengthSession({
  id,
  date,
  duration,
  sourceRefs,
  activeCalories,
  averageHeartRate,
  exercises,
}) {
  return {
    id,
    evidence_type: "training",
    observed_at: date,
    source: { modality: "screenshot", source_artifact_refs: sourceRefs },
    provenance: { source_artifact_refs: sourceRefs },
    metadata: {
      activity_type: "Traditional Strength Training",
      duration_seconds: duration,
      active_calories: activeCalories,
      average_heart_rate: averageHeartRate,
    },
    exercises,
  };
}

function exercise(name, sets) {
  return {
    name,
    sets: sets.map(([reps, weight], index) => ({
      set_number: index + 1,
      reps,
      weight,
      weight_unit: "lb",
      volume: reps * weight,
    })),
  };
}

function outdoorWalk(sourceRef, duration, activeCalories, averageHeartRate) {
  return {
    id: `walk_${sourceRef}`,
    evidence_type: "training",
    observed_at: workoutDate,
    source: { modality: "screenshot", source_artifact_refs: [sourceRef] },
    provenance: { source_artifact_refs: [sourceRef] },
    metadata: {
      activity_type: "Outdoor Walk",
      duration_seconds: duration,
      active_calories: activeCalories,
      average_heart_rate: averageHeartRate,
    },
    exercises: [],
  };
}

function stairStepper() {
  return {
    id: "stair_IMG_1687.png",
    evidence_type: "training",
    observed_at: workoutDate,
    source: { modality: "screenshot", source_artifact_refs: ["IMG_1687.png"] },
    provenance: { source_artifact_refs: ["IMG_1687.png"] },
    metadata: {
      activity_type: "Stair Stepper",
      duration_seconds: 672,
      active_calories: 132,
      average_heart_rate: 139,
    },
    exercises: [],
  };
}

function sessionVolume(exerciseEntry) {
  return exerciseEntry.sets.reduce(
    (sum, set) => sum + Number(set.volume ?? set.reps * set.weight),
    0
  );
}
