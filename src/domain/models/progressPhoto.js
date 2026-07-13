import { createFieldProvenance, createSource } from "./recordMetadata";

export const ProgressPhotoView = {
  FRONT: "front",
  BACK: "back",
  SIDE: "side",
  UNKNOWN: "unknown",
};

export const ProgressPhotoPose = {
  RELAXED: "relaxed",
  FLEXED: "flexed",
  UNKNOWN: "unknown",
};

export function createProgressPhoto(data = {}) {
  return {
    id: "",
    userId: "",
    date: "",
    capturedAt: null,
    uploadedAt: null,
    imagePath: "",
    relatedGoalIds: [],
    view: ProgressPhotoView.UNKNOWN,
    pose: ProgressPhotoPose.UNKNOWN,
    conditions: {
      morning: null,
      fasted: null,
      sameLighting: null,
      sameMirror: null,
      postWorkout: null,
      pump: null,
      notes: null,
    },
    linkedWeightEntryId: null,
    nearestDexaScanId: null,
    source: createSource({ type: "photo", confidence: "medium" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
