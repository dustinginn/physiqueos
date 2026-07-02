import { createFieldProvenance, createSource } from "./recordMetadata";

export const GoalType = {
  BODY_COMPOSITION: "body_composition",
  PERFORMANCE: "performance",
  HABIT: "habit",
  HEALTH_MARKER: "health_marker",
};

export const GoalStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};

export function createGoal(data = {}) {
  return {
    id: "",
    userId: "",
    title: "",
    type: GoalType.BODY_COMPOSITION,
    primary: false,
    status: GoalStatus.ACTIVE,
    startDate: "",
    targetDate: null,
    startValue: null,
    currentValue: null,
    targetValue: null,
    targetRange: null,
    unit: "",
    metricKey: "",
    confidence: null,
    source: createSource(),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
