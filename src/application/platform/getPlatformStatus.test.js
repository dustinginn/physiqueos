import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal";
import { createFeatureFlagEvaluator } from "../../platform/features/featureFlags";
import { createReadinessModel } from "../../platform/observability/health";
import { createGetPlatformStatusHandler } from "./getPlatformStatus";

describe("platform status application handler", () => {
  it("is presentation-independent and requires a principal", async () => {
    const buildIdentity = Object.freeze({ buildId: "synthetic", apiVersion: "v1", contractVersion: "1" });
    const handler = createGetPlatformStatusHandler({
      buildIdentity,
      featureFlags: createFeatureFlagEvaluator({ flags: [{ key: "shared_platform.database", enabled: false }] }),
      readiness: createReadinessModel({ buildIdentity, checks: [{ name: "database", ready: false }] }),
    });
    await expect(handler({ principal: null })).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
    const principal = createAuthenticationPrincipal({ userId: "synthetic-user", deviceId: "synthetic-device", sessionId: "synthetic-session" });
    await expect(handler({ principal })).resolves.toMatchObject({ contractVersion: "1", apiVersion: "v1", destination: { id: "platform.status" }, capabilities: [{ key: "shared_platform.database", enabled: false }] });
  });
});
