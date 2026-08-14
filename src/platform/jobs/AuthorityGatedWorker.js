import { assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";

export function createAuthorityGatedWorker({
  worker, authorityStore, heartbeat, workerId, buildId, compatibilityMode = false,
  compatibilityEnvironment = null, compatibilityDatabaseName = null, now = () => new Date(),
} = {}) {
  if (!worker?.runOnce || !authorityStore?.read) throw new Error("Authority-gated worker requires a worker and runtime-authority store.");
  return Object.freeze({
    async runOnce() {
      const { state } = await authorityStore.read();
      if (compatibilityMode) {
        assertCompatibilityRuntimeAuthorityState(state, {
          environment: compatibilityEnvironment,
          databaseName: compatibilityDatabaseName,
        });
        return worker.runOnce();
      }
      if (state.workerAuthority !== "provider" || state.publicRuntimeAuthority !== "provider" || state.canonicalStoreEpoch !== "postgres-canonical") {
        await heartbeat?.({ workerId, buildId, status: "paused_authority", observedAt: now(), details: {
          authority: state.authority,
          workerAuthority: state.workerAuthority,
          stateVersion: state.version,
        } });
        return Object.freeze({ outcome: "idle", authority: state.authority });
      }
      return worker.runOnce();
    },
    markStopping: () => worker.markStopping(),
    isStopping: () => worker.isStopping(),
  });
}
