import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/cutover/migrationControlState.test.js",
      "src/platform/cutover/canonicalWriteSurfaceInventory.test.js",
      "src/platform/cutover/CanonicalApplicationCompositionSelector.test.js",
      "src/platform/cutover/ProductionApplicationCompositionRuntime.test.js",
      "src/platform/cutover/ProductionMigrationOrchestrator.test.js",
      "src/platform/cutover/ProductionMigrationRunner.test.js",
      "src/platform/backup/DigitalOceanManagedPostgresBackupFreshness.test.js",
      "src/platform/cutover/EpochBoundOutboxHandler.test.js",
      "src/platform/cutover/MigrationOperationalStatus.test.js",
      "src/platform/cutover/CanonicalLegacyWriteFenceIntegration.test.js",
      "src/application/commands/CanonicalStoreEpochProtection.test.js",
      "src/data/repositories/ProductionRepositoryFacade.test.js",
      "scripts/ValidationBuildIsolation.test.js",
      "scripts/ProductionMigrationRemediationWiring.test.js",
      "scripts/ProductionMigrationEntrypoint.test.js",
      "src/platform/migration/ProductionSpacesMediaMigration.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
