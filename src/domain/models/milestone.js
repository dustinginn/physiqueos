import { createFieldProvenance, createSource } from "./recordMetadata";

export const MilestoneStatus = {
  UPCOMING: "upcoming",
  AT_RISK: "at_risk",
  ACHIEVED: "achieved",
  MISSED: "missed",
};

export function createMilestone(data = {}) {
  return {
    id: "",
    userId: "",
    goalId: "",
    title: "",
    metricKey: "",
    targetValue: null,
    unit: "",
    targetDate: null,
    achievedAt: null,
    status: MilestoneStatus.UPCOMING,
    source: createSource(),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
