import { createFieldProvenance, createSource } from "./recordMetadata";

export function createDailyCheckIn(data = {}) {
  return {
    id: "",
    userId: "",
    date: "",
    weightEntryId: null,
    relatedGoalIds: [],
    completedFocusItems: [],
    nutrition: {
      proteinTargetHit: null,
      calorieTargetHit: null,
      estimatedCalories: null,
      estimatedCaloriesIn: null,
      estimatedCaloriesBurned: null,
      proteinTarget: null,
      proteinAchieved: null,
      relatedGoalIds: [],
      notes: "",
    },
    activity: {
      activityRingClosed: null,
      workoutCompleted: null,
      steps: null,
    },
    recovery: {
      sleepHours: null,
      sleepTargetHit: null,
    },
    protocols: {
      completedProtocolIds: [],
      changeNote: null,
    },
    mood: null,
    notes: "",
    source: createSource({ type: "manual" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
