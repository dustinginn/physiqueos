import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/database/phase2PostgresFoundation.test.js",
      "src/platform/auth/FounderAuthService.test.js",
      "src/platform/auth/PasskeyLifecycleService.test.js",
      "src/platform/object-storage/SpacesPrivateObjectProvider.test.js",
      "src/platform/object-storage/SpacesBucketProvisioner.test.js",
      "src/application/objects/PrivateObjectService.test.js",
      "src/platform/jobs/DurableOutboxWorker.test.js",
      "src/platform/database/PostgresOutboxStore.test.js",
      "src/platform/backup/phase2Operations.test.js",
      "src/platform/http/foundationServer.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
