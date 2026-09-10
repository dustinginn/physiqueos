import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/application/native/**/*.test.js",
      "src/app/api/v1/native/NativeProductionRoutes.test.js",
      "src/platform/auth/nativeFounderAuthRuntime.test.js",
      "src/platform/auth/nativeSandboxAuthRuntime.test.js",
      "src/platform/sandbox/NativeSandboxAuthority.test.js",
      "src/application/commands/Phase3CommandParity.test.js",
      "src/application/weight/FounderWeightSummaryReadService.test.js",
      "src/application/core/CoreNavigationReadService.test.js",
      "src/application/training/TrainingNavigationReadService.test.js",
      "src/application/progress/ProgressEvidenceReadService.test.js",
      "src/application/progress/ProgressPhotosReadService.test.js",
      "src/application/briefings/BriefingNavigationReadService.test.js",
      "src/application/timeline/EvidenceTimelineReadService.test.js",
      "src/domain/services/CanonicalNutritionDayService.test.js",
      "src/domain/services/CanonicalActivityDayService.test.js",
      "src/domain/services/EnergyEvidenceService.test.js",
      "src/domain/services/CanonicalEvidenceScopedReconciliation.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
