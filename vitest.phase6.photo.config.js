import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/domain/interpreters/PhotoObservationModelV2.test.js",
      "src/domain/services/CanonicalPhotoSessionReadService.test.js",
      "src/domain/services/PendingPhotoReviewEditing.test.js",
      "src/domain/services/PhotoEventContextService.test.js",
      "src/domain/services/PhotoEventNarrativeService.test.js",
      "src/domain/services/PhotoPIObservationCompatibility.test.js",
      "src/screens/PhotoEventBriefingScreen.test.js",
      "src/screens/PhotosEvidenceContextProduction.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
