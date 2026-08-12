import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/application/training/TrainingReadService.test.js",
      "src/app/log/training/TrainingLoggerMutationBoundary.test.js",
      "src/app/log/training/TrainingLoggerProductionState.test.js",
      "src/domain/models/trainingExerciseIdentity.test.js",
      "src/domain/models/trainingExecutionVariant.test.js",
      "src/domain/services/August10FalseTrainingRetractionService.test.js",
      "src/domain/services/CanonicalTrainingExecutionVariant.test.js",
      "src/domain/services/TrainingLoggerAppleHealthService.test.js",
      "src/domain/services/TrainingLoggerCanonicalPipeline.test.js",
      "src/domain/services/TrainingLoggerDraftRecoveryService.test.js",
      "src/domain/services/TrainingLoggerProgressionService.test.js",
      "src/domain/services/TrainingLoggerSuggestionService.test.js",
      "src/domain/services/TrainingSupersetPerformanceContext.test.js",
      "src/navigation/trainingTimelineNavigation.test.js",
      "src/screens/TrainingDayScreen.test.js",
      "src/screens/TrainingKnowledgeScreen.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
