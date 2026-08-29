import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/migration/phase4Schema.test.js",
      "src/platform/migration/phase4CanonicalExport.test.js",
      "src/platform/migration/migrationManifest.test.js",
      "src/platform/database/phase4PostgresComposition.test.js",
      "src/platform/migration/MigrationSourceIdentity.test.js",
      "src/platform/migration/phase4LocalMediaMigration.test.js",
      "src/contracts/v1/mediaIdentifiers.test.js",
      "src/application/commands/CanonicalPersistenceCommandPorts.test.js",
      "src/platform/database/phase4PersistenceSecurity.test.js",
      "src/platform/database/PostgresTrainingNavigationReadStore.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
