import { createFieldProvenance, createSource } from "./recordMetadata";

export function createOperatingRhythm(data = {}) {
  return {
    id: "",
    userId: "",
    typicalWakeTime: null,
    typicalBedtime: null,
    fastingWindow: {
      startsAt: null,
      endsAt: null,
      notes: "",
    },
    weekday: {
      wakeTime: null,
      workoutWindow: null,
      evidenceTiming: [],
      notes: "",
    },
    weekend: {
      wakeTime: null,
      workoutWindow: null,
      evidenceTiming: [],
      notes: "",
    },
    protocolTiming: [],
    shouldLearnAutomatically: true,
    source: createSource({ type: "manual", confidence: "high" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
