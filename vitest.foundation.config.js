import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/contracts/v1/foundationContracts.test.js",
      "src/application/commands/executeIdempotentCommand.test.js",
      "src/application/platform/getPlatformStatus.test.js",
      "src/platform/auth/foundationIdentity.test.js",
      "src/platform/database/foundationDatabase.test.js",
      "src/platform/migration/migrationManifest.test.js",
      "src/platform/object-storage/InMemoryPrivateObjectStorage.test.js",
      "src/platform/observability/foundationObservability.test.js",
      "src/app/api/v1/FoundationApiRoutes.test.js"
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
