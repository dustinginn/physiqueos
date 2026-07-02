import { createFieldProvenance, createSource } from "./recordMetadata";

export const EvidenceReliability = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

export function createWeightEntry(data = {}) {
  return {
    id: "",
    userId: "",
    measuredAt: "",
    weight: {
      value: null,
      unit: "lb",
    },
    relatedGoalIds: [],
    context: {
      timing: null,
      nutritionState: null,
      intakeState: null,
      scale: null,
      conditions: [],
      confidence: null,
      notes: null,
      isDefault: true,
    },
    source: createSource({ type: "manual", confidence: "high" }),
    fieldProvenance: createFieldProvenance(),
    reliability: EvidenceReliability.HIGH,
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
