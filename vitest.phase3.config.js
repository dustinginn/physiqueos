import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/contracts/v1/destination.test.js",
      "src/application/time/applicationDateContext.test.js",
      "src/application/media/AuthorizedMediaService.test.js",
      "src/application/read-models/Phase3ReadModelService.test.js",
      "src/application/read-models/WebParityComposition.test.js",
      "src/application/commands/Phase3CommandParity.test.js",
      "src/application/briefings/BriefingReadService.test.js",
      "src/application/training/TrainingReadService.test.js",
      "src/application/training/TrainingNavigationReadService.test.js",
      "src/application/progress/ProgressHubReadService.test.js",
      "src/application/platform/openApiConsistency.test.js",
      "src/domain/services/EvidenceHubUsageService.test.js",
      "src/domain/services/ProgressReadSafety.test.js",
      "src/screens/ProgressHubScreen.test.js",
      "src/screens/ProgressHubPrefetch.test.jsx",
      "src/app/progress/training/TrainingProductionTimeline.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
