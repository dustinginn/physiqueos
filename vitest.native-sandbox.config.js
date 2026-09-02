import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/sandbox/**/*.test.js",
      "src/platform/auth/FounderAuthService.test.js",
      "src/platform/auth/nativeFounderAuthRuntime.test.js",
      "src/platform/auth/requestAuthenticator.test.js",
      "src/application/weight/FounderWeightSummaryReadService.test.js",
      "src/platform/accessGate/publicRoutes.test.js",
      "src/application/evidence/AsyncEvidenceIntakeService.test.js",
      "src/domain/services/EvidenceReviewService.test.js",
      "src/domain/services/EvidenceReviewBackgroundContinuation.test.js",
      "src/domain/services/WeightPIObservationService.test.js",
      "src/platform/database/PostgresEvidenceIntakeStore.test.js",
      "src/platform/database/PostgresEvidenceReviewReadStore.test.js",
      "src/platform/database/PostgresOutboxStore.test.js",
      "src/platform/jobs/DurableOutboxWorker.test.js",
      "src/platform/jobs/EvidenceIntakeInterpretationWorker.test.js",
      "src/platform/jobs/EvidenceReviewContinuationWorker.test.js",
      "src/platform/jobs/BriefingCadenceWorker.test.js",
      "src/domain/services/CanonicalBriefingConfidencePublicationService.test.js",
      "src/domain/services/MonthlyBriefingPresentationService.test.js",
      "src/domain/services/MonthlyNarrativeCompositionService.test.js",
      "db/migrations/000013_native_sandbox_bootstrap_pairing.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
