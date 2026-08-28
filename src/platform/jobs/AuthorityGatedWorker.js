import { RuntimeAuthority, assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";

export function createAuthorityGatedWorker({
  worker, authorityStore, heartbeat, workerId, buildId, compatibilityMode = false,
  compatibilityEnvironment = null, compatibilityDatabaseName = null, preAuthorityTopics = [], now = () => new Date(),
} = {}) {
  if (!worker?.runOnce || !authorityStore?.read) throw new Error("Authority-gated worker requires a worker and runtime-authority store.");
  const allowedControlPlaneTopics = normalizePreAuthorityTopics(preAuthorityTopics);
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
        const details = Object.freeze({
          authority: state.authority,
          workerAuthority: state.workerAuthority,
          stateVersion: state.version,
          firstProviderWriteBoundaryRecorded,
          controlPlaneOnly: allowedControlPlaneTopics.length > 0,
        });
        if (allowedControlPlaneTopics.length > 0) {
          return worker.runOnce({
            allowedTopics: allowedControlPlaneTopics,
            heartbeatStatus: "paused_authority",
            heartbeatDetails: details,
          });
        }
        await heartbeat?.({ workerId, buildId, status: "paused_authority", observedAt: now(), details });
        return Object.freeze({ outcome: "idle", authority: state.authority });
      }
      return worker.runOnce();
    },
    markStopping: () => worker.markStopping(),
    isStopping: () => worker.isStopping(),
  });
}

function normalizePreAuthorityTopics(topics) {
  if (!Array.isArray(topics)) throw new Error("Pre-authority topics must be an array.");
  const normalized = topics.map((topic) => String(topic ?? ""));
  if (normalized.some((topic) => !topic || topic.trim() !== topic) || new Set(normalized).size !== normalized.length) {
    throw new Error("Pre-authority topics must be unique non-empty exact identities.");
  }
  return Object.freeze(normalized);
}

function hasRecordedFirstProviderWriteBoundary(state) {
  const recordedAt = state?.firstProviderCanonicalWriteAt;
  const commandId = state?.firstProviderCommandId;
  if (typeof recordedAt !== "string" || recordedAt.length === 0 || recordedAt.trim() !== recordedAt) return false;
  if (typeof commandId !== "string" || !commandId.trim()) return false;
  const timestamp = Date.parse(recordedAt);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === recordedAt;
}
