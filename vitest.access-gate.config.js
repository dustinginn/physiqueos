import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/platform/accessGate/accessGateConfig.test.js",
      "src/platform/accessGate/sessionToken.test.js",
      "src/platform/accessGate/publicRoutes.test.js",
      "src/platform/accessGate/safeRedirect.test.js",
      "src/platform/accessGate/timingSafeCompare.test.js",
      "src/platform/accessGate/loginRateLimiter.test.js",
      "src/platform/http/trustedApplicationOrigin.test.js",
      "src/middleware.test.js",
      "src/app/api/private-evidence/[...path]/route.test.js",
      "src/app/api/v1/media/read/route.test.js",
      "src/platform/health/ProviderProductReadiness.test.js",
      "src/app/founder-gate/actions.test.js",
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
