import { getProductionApplicationComposition } from "../../application/composition/productionApplicationComposition.js";

export async function getProviderProductReadiness() {
  const compatibilityMode = process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  try {
    const composition = await getProductionApplicationComposition();
    const [user, objectStorage] = await Promise.all([
      composition.repositories.users.getCurrentUser(),
      composition.objectProvider.healthCheck(),
    ]);
    if (!user?.id || user.id !== composition.ownerUserId || objectStorage?.reachable !== true) {
      return result("not-ready", compatibilityMode, "PROVIDER_PRODUCT_DEPENDENCY_REJECTED");
    }
    if (!compatibilityMode) {
      const authority = await composition.authorityStore?.read?.();
      const state = authority?.state;
      if (!state || !["provider-prepared", "provider-authoritative", "recovery-required"].includes(state.authority)) {
        return result("not-ready", false, "PROVIDER_RUNTIME_AUTHORITY_UNAVAILABLE");
      }
      if (state.readsEnabled !== true) return result("not-ready", false, "PROVIDER_READS_PAUSED");
    }
    return result("ready", compatibilityMode, null);
  } catch (error) {
    return result("not-ready", compatibilityMode, error?.code ?? "PROVIDER_PRODUCT_READINESS_FAILED");
  }
}

function result(status, compatibilityMode, code) {
  return Object.freeze({
    status,
    service: "physiqueos-product",
    runtime: "digitalocean-app-platform",
    persistence: compatibilityMode ? "postgres-compatibility" : "postgres-canonical",
    objectStorage: "private-spaces",
    compatibilityMode,
    ...(code ? { code } : {}),
  });
}
