import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/database/phase2PostgresFoundation.test.js",
      "src/platform/database/PostgresIdentityStore.senderConstrained.test.js",
      "src/platform/auth/FounderAuthService.test.js",
      "src/platform/auth/FounderAuthService.senderConstrained.test.js",
      "db/migrations/000015_sender_constrained_refresh_recovery.test.js",
      "src/platform/auth/PasskeyLifecycleService.test.js",
      "src/platform/object-storage/SpacesPrivateObjectProvider.test.js",
      "src/platform/object-storage/SpacesBucketProvisioner.test.js",
      "src/application/objects/PrivateObjectService.test.js",
      "src/platform/jobs/DurableOutboxWorker.test.js",
      "src/platform/jobs/workerLoop.test.js",
      "src/platform/database/PostgresOutboxStore.test.js",
      "src/platform/backup/phase2Operations.test.js",
      "src/platform/http/foundationServer.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
