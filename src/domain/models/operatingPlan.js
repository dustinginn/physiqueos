import { createFieldProvenance, createSource } from "./recordMetadata";

export function createOperatingPlan(data = {}) {
  return {
    id: "",
    userId: "",
    primaryGoalId: "",
    supportingObjectiveIds: [],
    nutrition: {
      estimatedDailyCaloricIntake: {
        min: null,
        max: null,
        unit: "kcal",
      },
      proteinPriority: null,
      preferredSources: [],
    },
    training: {
      weekdayPattern: [],
      weekendPattern: [],
      estimatedWorkoutDurationMinutes: null,
      estimatedTrainingActiveCalories: null,
      estimatedDailyActiveCalories: null,
      activeCalorieMarginOfErrorPercent: null,
      notes: "",
    },
    protocols: {
      activeProtocolIds: [],
      supplementProtocolIds: [],
      futureDoseChangesCreatePriorities: true,
    },
    evidenceProtocols: {
      morningWeight: null,
      progressPhotos: [],
      dexa: null,
    },
    reminderPreferences: {
      notificationOwnership: "",
      ownedReminderTypes: [],
      avoidDuplicatingSources: [],
    },
    acquisitionPreferences: {},
    source: createSource({ type: "manual", confidence: "high" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
