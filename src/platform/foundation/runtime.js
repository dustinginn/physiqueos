import { createGetPlatformStatusHandler } from "../../application/platform/getPlatformStatus";
import { createInactiveFoundationAuthenticator } from "../auth/requestAuthenticator";
import { createFeatureFlagEvaluator } from "../features/featureFlags";
import { readBuildIdentity } from "../observability/buildIdentity";
import { createLivenessModel, createReadinessModel } from "../observability/health";
import { createStructuredLogger } from "../observability/structuredLogger";

const startedAt = new Date().toISOString();

export const foundationBuildIdentity = readBuildIdentity();
export const foundationFeatureFlags = createFeatureFlagEvaluator({
  flags: [
    { key: "shared_platform.authentication", enabled: false },
    { key: "shared_platform.database", enabled: false },
    { key: "shared_platform.object_storage", enabled: false },
    { key: "shared_platform.worker", enabled: false },
  ],
});
export const foundationReadiness = createReadinessModel({
  buildIdentity: foundationBuildIdentity,
  checks: [
    { name: "authentication", ready: false, code: "FOUNDATION_AUTH_INACTIVE" },
    { name: "database", ready: false, code: "FOUNDATION_DATABASE_INACTIVE" },
    { name: "object_storage", ready: false, code: "FOUNDATION_OBJECT_STORAGE_INACTIVE" },
    { name: "worker", ready: false, code: "FOUNDATION_WORKER_INACTIVE" },
  ],
});
export const foundationLiveness = createLivenessModel({ buildIdentity: foundationBuildIdentity, startedAt });
export const foundationAuthenticator = createInactiveFoundationAuthenticator();
export const foundationLogger = createStructuredLogger({ buildIdentity: foundationBuildIdentity });
export const getFoundationPlatformStatus = createGetPlatformStatusHandler({
  buildIdentity: foundationBuildIdentity,
  featureFlags: foundationFeatureFlags,
  readiness: foundationReadiness,
});
