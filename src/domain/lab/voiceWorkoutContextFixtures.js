const APPLE_WATCH_SOURCE = {
  modality: "integration",
  application: "Apple Health",
  integration: "Apple Watch",
};

export const voiceWorkoutContextFixtures = [
  {
    id: "none",
    label: "None",
    workout: null,
  },
  {
    id: "today_strength",
    label: "Today's strength workout",
    workout: createAppleWatchWorkout({
      id: "apple_watch_strength_2026_07_09",
      observedAt: "2026-07-09",
      artifactRef: "apple_watch_workout_2026_07_09",
    }),
  },
  {
    id: "yesterday_strength",
    label: "Yesterday's strength workout",
    workout: createAppleWatchWorkout({
      id: "apple_watch_strength_2026_07_08",
      observedAt: "2026-07-08",
      artifactRef: "apple_watch_workout_2026_07_08",
      activeCalories: 418,
      durationSeconds: 2820,
    }),
  },
  {
    id: "custom_strength_with_pull_up",
    label: "Custom workout fixture",
    workout: createAppleWatchWorkout({
      id: "apple_watch_strength_custom",
      observedAt: "2026-07-09",
      artifactRef: "apple_watch_workout_custom",
      exercises: [{
        id: "pull-up",
        name: "Pull-Up",
        sets: [],
      }],
    }),
  },
];

export const sameDayAppleWatchWorkoutFixtures = [
  createAppleWatchWorkout({
    id: "apple_watch_stair_stepper_2026_07_09",
    activityType: "Stair Stepper",
    observedAt: "2026-07-09",
    artifactRef: "apple_watch_stair_stepper_2026_07_09",
    durationSeconds: 1200,
    activeCalories: 182,
  }),
  voiceWorkoutContextFixtures.find((fixture) => fixture.id === "today_strength").workout,
  createAppleWatchWorkout({
    id: "apple_watch_walk_2026_07_09",
    activityType: "Outdoor Walk",
    observedAt: "2026-07-09",
    artifactRef: "apple_watch_walk_2026_07_09",
    durationSeconds: 1500,
    activeCalories: 126,
  }),
];

function createAppleWatchWorkout({
  activeCalories = 454,
  activityType = "Traditional Strength Training",
  artifactRef,
  durationSeconds = 3000,
  exercises = [],
  id,
  observedAt,
}) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    captured_at: "2026-07-10T02:00:00.000Z",
    source: {
      ...APPLE_WATCH_SOURCE,
      source_artifact_refs: [artifactRef],
    },
    metadata: {
      activity_type: activityType,
      duration_seconds: durationSeconds,
      active_calories: activeCalories,
      total_calories: null,
      average_heart_rate: null,
      effort_level: null,
      workout_focus: null,
      location: null,
    },
    exercises,
    values: [],
    confidence: { extraction: "high", interpretation: "high" },
    quality: { status: "partial", limitations: [] },
    provenance: { source_artifact_refs: [artifactRef] },
  };
}
