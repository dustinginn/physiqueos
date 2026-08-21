import { RuntimeAuthority, assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";

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
      const firstProviderWriteBoundaryRecorded = hasRecordedFirstProviderWriteBoundary(state);
      if (state.authority !== RuntimeAuthority.PROVIDER || state.workerAuthority !== "provider" ||
          state.publicRuntimeAuthority !== "provider" || state.canonicalStoreEpoch !== "postgres-canonical" ||
          !firstProviderWriteBoundaryRecorded) {
        await heartbeat?.({ workerId, buildId, status: "paused_authority", observedAt: now(), details: {
          authority: state.authority,
          workerAuthority: state.workerAuthority,
          stateVersion: state.version,
          firstProviderWriteBoundaryRecorded,
        } });
        return Object.freeze({ outcome: "idle", authority: state.authority });
      }
      return worker.runOnce();
    },
    markStopping: () => worker.markStopping(),
    isStopping: () => worker.isStopping(),
  });
}

function hasRecordedFirstProviderWriteBoundary(state) {
  const recordedAt = state?.firstProviderCanonicalWriteAt;
  const commandId = state?.firstProviderCommandId;
  if (typeof recordedAt !== "string" || recordedAt.length === 0 || recordedAt.trim() !== recordedAt) return false;
  if (typeof commandId !== "string" || !commandId.trim()) return false;
  const timestamp = Date.parse(recordedAt);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === recordedAt;
}
