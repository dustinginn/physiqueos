import { createUser } from "../../domain/models/user";

export const founderUser = createUser({
  id: "user_founder_001",
  displayName: "Dustin",
  firstName: "Dustin",
  lastName: null,
  email: null,
  timezone: null,
  dateOfBirth: null,
  sex: null,
  height: {
    value: 76,
    unit: "in",
  },
  avatarUrl: null,
  preferences: {
    weightUnit: "lb",
    primaryBodyCompositionSource: "dexa",
    weightConflictRule: "manual_morning_weight_overrides_imports",
    defaultWeighInContext: {
      timing: "morning",
      nutritionState: "fasted",
      intakeState: "before_food_water",
      scale: "normal_home_scale",
      confidence: "high",
    },
  },
  source: {
    type: "manual",
    name: "Founder Alpha",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: "Verified founder profile baseline.",
  },
  fieldProvenance: {
    imported: [
      "displayName",
      "firstName",
      "height.value",
      "height.unit",
      "preferences.weightUnit",
      "preferences.primaryBodyCompositionSource",
      "preferences.weightConflictRule",
      "preferences.defaultWeighInContext",
    ],
    computed: [],
  },
  createdAt: null,
  updatedAt: null,
});
