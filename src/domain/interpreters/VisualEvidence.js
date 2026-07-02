export const VisualEvidenceSourceType = {
  PROGRESS_PHOTO: "progress_photo",
};

export function createVisualEvidence(data = {}) {
  return {
    id: "",
    sourceId: "",
    sourceType: "",
    imageRef: "",
    evidenceDate: "",
    uploadDate: null,
    viewType: "unknown",
    capturedAt: "",
    uploadedAt: null,
    imagePath: "",
    view: "unknown",
    pose: "unknown",
    tags: [],
    relatedGoals: [],
    relatedGoalIds: [],
    comparisonTarget: null,
    observations: [],
    biggestImprovements: [],
    remainingFocus: [],
    confidenceImpact: {
      level: "moderate",
      summary: "",
      factors: [],
      limitations: [],
    },
    limitations: [],
    extractionConfidence: "medium",
    originalUserNotes: null,
    timelinePlacement: "",
    metadata: {},
    ...data,
  };
}
