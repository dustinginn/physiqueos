import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/migration/phase5SyntheticPackage.test.js",
      "src/platform/migration/phase5Schema.test.js",
      "src/platform/database/phase5ProviderComposition.test.js",
      "src/platform/object-storage/OpaqueSpacesMediaGateway.test.js",
      "src/platform/observability/phase5OperationalReadiness.test.js",
      "src/platform/cutover/phase5ReadinessPolicy.test.js",
      "src/platform/migration/phase4Schema.test.js",
      "src/platform/database/phase4PersistenceSecurity.test.js",
      "src/application/commands/CanonicalPersistenceCommandPorts.test.js",
      "src/application/platform/openApiConsistency.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
