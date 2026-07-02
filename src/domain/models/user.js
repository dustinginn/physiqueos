import { createFieldProvenance, createSource } from "./recordMetadata";

export const UserStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
};

export function createUser(data = {}) {
  return {
    id: "",
    displayName: "",
    firstName: "",
    lastName: "",
    email: "",
    timezone: "UTC",
    dateOfBirth: null,
    sex: null,
    height: {
      value: null,
      unit: "in",
    },
    avatarUrl: "",
    preferences: {
      weightUnit: "lb",
      primaryBodyCompositionSource: null,
      weightConflictRule: null,
      defaultWeighInContext: {
        timing: null,
        nutritionState: null,
        intakeState: null,
        scale: null,
        confidence: null,
      },
    },
    status: UserStatus.ACTIVE,
    source: createSource(),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
