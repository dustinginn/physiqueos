export function createMobileEvidenceReviewFixture({ newExercise = false, noneIncluded = false } = {}) {
  const evidenceObjects = [
    training("fixture-training-jul-13", "2026-07-13", "Traditional Strength Training"),
    training("fixture-stair-stepper-jul-13", "2026-07-13", "Stair Stepper", []),
  ];
  if (newExercise) {
    evidenceObjects[0].exercises.splice(1, 0, {
      id: "provisional_exercise_fixture",
      name: "Bicep Curl Machine",
      canonicalExerciseId: null,
      resolutionStatus: "unresolved_provisional",
      sets: Array.from({ length: 4 }, (_, index) => ({
        set_number: index + 1,
        reps: 18,
        weight: 75,
        weight_unit: "lb",
        provenance_ref: "typed_evidence_0",
      })),
      provisionalExercise: {
        provisionalExerciseId: "provisional_exercise_fixture",
        rawSubmittedName: "Bicep Curl Machine",
        normalizedDisplayName: "Bicep Curl Machine",
        resolutionStatus: "unresolved",
        suggestedCanonicalName: "Bicep Curl Machine",
        suggestedPrimaryMuscleGroup: "Biceps",
        suggestedMovementPattern: "Elbow Flexion",
        suggestedEquipment: "Machine",
        suggestedLaterality: "Bilateral",
        suggestedAliases: ["Machine Bicep Curl", "Biceps Curl Machine"],
      },
    });
  }
  return {
    id: "fixture-mobile-review",
    userId: "fixture-user",
    status: "pending",
    createdAt: "2026-07-13T05:00:00.000Z",
    updatedAt: "2026-07-13T05:00:00.000Z",
    interpretedEvidence: {
      package_id: "fixture-mobile-review-package",
      evidence_objects: evidenceObjects,
      provenance: { source_artifacts: [
        { id: "screenshot_0", kind: "screenshot", file_name: "IMG_1455.png", mime_type: "image/png" },
        { id: "screenshot_1", kind: "screenshot", file_name: "IMG_1453.png", mime_type: "image/png" },
        { id: "typed_evidence_0", kind: "typed_evidence", file_name: "additional-evidence.txt", mime_type: "text/plain", text: "Shoulder Press Machine\nLateral Raises Machine\nCable Machine Front Raises\n13r 110p\n12r 120p\n10r 130p\n10r 130p\nStair Stepper" },
      ] },
    },
    evidenceTypes: ["training"],
    confirmation: null,
    commitProgress: {},
    itemDecisions: {
      "fixture-training-jul-13": { included: !noneIncluded },
      "fixture-stair-stepper-jul-13": { included: false },
    },
  };
}

function training(id, observedAt, activityType, exercises = null) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    metadata: { activity_type: activityType, active_calories: 483, duration_seconds: 4602, average_heart_rate: 114 },
    exercises: exercises ?? [
      { name: "Pull-Ups", equipment: "bodyweight", sets: [{ reps: 12, weight: 0 }, { reps: 10, weight: 0 }, { reps: 8, weight: 0 }] },
      { name: "Hanging Leg Raises", equipment: "bodyweight", sets: [{ reps: 15, weight: 0 }, { reps: 15, weight: 0 }] },
      { name: "Iso Lateral High Rows", sets: [{ reps: 15, weight: 140 }, { reps: 12, weight: 180 }] },
      { name: "Cable Crunches", sets: [{ reps: 20, weight: 110 }, { reps: 20, weight: 110 }] },
      { name: "Seater cable row", sets: [{ reps: 15, weight: 110 }, { reps: 13, weight: 110 }, { reps: 15, weight: 110 }] },
      { name: "Planks", sets: [{ duration_seconds: 75 }, { duration_seconds: 75 }, { duration_seconds: 75 }] },
      { name: "Shoulder Press Machine", sets: [{ reps: 12, weight: 90 }] },
      { name: "Lateral Raises Machine", sets: [{ reps: 12, weight: 70 }] },
      { name: "Front Raises", sets: [{ reps: 13, weight: 110 }, { reps: 12, weight: 120 }, { reps: 10, weight: 130 }, { reps: 10, weight: 130 }] },
    ],
    provenance: { source_artifact_refs: ["IMG_1455.png", "typed_evidence_0"] },
  };
}
