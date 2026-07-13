import { createFieldProvenance, createSource } from "./recordMetadata";

export const ProtocolCategory = {
  MEDICATION: "medication",
  PEPTIDE: "peptide",
  SUPPLEMENT: "supplement",
  NUTRITION: "nutrition",
  TRAINING: "training",
  RECOVERY: "recovery",
  LIFESTYLE: "lifestyle",
  OTHER: "other",
};

export const ProtocolStatus = {
  DRAFT: "draft",
  PLANNED: "planned",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};

export function createProtocol(data = {}) {
  return {
    id: "",
    userId: "",
    protocolType: null,
    name: "",
    category: ProtocolCategory.LIFESTYLE,
    relatedGoalIds: [],
    startDate: "",
    endDate: null,
    status: ProtocolStatus.ACTIVE,
    currentVersionId: null,
    dose: {
      value: null,
      unit: "",
    },
    doseUnit: "",
    doseHistory: [],
    frequency: {
      interval: null,
      unit: "",
      daysOfWeek: [],
    },
    schedule: {
      type: "",
      nextScheduledAt: null,
    },
    notes: "",
    source: createSource({ type: "manual" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
