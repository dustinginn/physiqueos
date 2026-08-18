import { getProductionApplicationComposition } from "../../application/composition/productionApplicationComposition.js";
import { assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";
import { getAccessGateStatus } from "../accessGate/accessGateConfig.js";

export async function getProviderProductReadiness() {
  const compatibilityMode = process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  const accessGateReady = getAccessGateStatus(process.env).ready;
  if (!accessGateReady) return result("not-ready", compatibilityMode, accessGateReady, "ACCESS_GATE_NOT_CONFIGURED");
  try {
    const composition = await getProductionApplicationComposition();
    const [user, objectStorage] = await Promise.all([
      composition.repositories.users.getCurrentUser(),
      composition.objectProvider.healthCheck(),
    ]);
    if (!user?.id || user.id !== composition.ownerUserId || objectStorage?.reachable !== true) {
      return result("not-ready", compatibilityMode, accessGateReady, "PROVIDER_PRODUCT_DEPENDENCY_REJECTED");
    }
    const authority = await composition.authorityStore?.read?.();
    const state = authority?.state;
    if (compatibilityMode) {
      assertCompatibilityRuntimeAuthorityState(state, {
        environment: process.env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT,
        databaseName: process.env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME,
      });
    } else {
      if (!state || !["provider-prepared", "provider-authoritative", "recovery-required"].includes(state.authority)) {
        return result("not-ready", false, accessGateReady, "PROVIDER_RUNTIME_AUTHORITY_UNAVAILABLE");
      }
      if (state.readsEnabled !== true) return result("not-ready", false, accessGateReady, "PROVIDER_READS_PAUSED");
    }
    return result("ready", compatibilityMode, accessGateReady, null);
  } catch (error) {
    return result("not-ready", compatibilityMode, accessGateReady, error?.code ?? "PROVIDER_PRODUCT_READINESS_FAILED");
  }
}

function result(status, compatibilityMode, accessGateReady, code) {
  return Object.freeze({
    status,
    service: "physiqueos-product",
    runtime: "digitalocean-app-platform",
    persistence: compatibilityMode ? "postgres-compatibility" : "postgres-canonical",
    objectStorage: "private-spaces",
    compatibilityMode,
    accessGateReady,
    ...(compatibilityMode ? {
      authoritative: false,
      productionWritesAllowed: false,
      combinedExecutionAllowed: false,
    } : {}),
    ...(code ? { code } : {}),
  });
}
