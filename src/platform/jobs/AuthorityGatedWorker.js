import { RuntimeAuthority, assertCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";

export function createAuthorityGatedWorker({
  worker, authorityStore, heartbeat, workerId, buildId, compatibilityMode = false,
  compatibilityEnvironment = null, compatibilityDatabaseName = null, preAuthorityTopics = [], now = () => new Date(),
  authorityRefreshIntervalMs = 15_000, heartbeatIntervalMs = 30_000, onTelemetry = null,
} = {}) {
  if (!worker?.runOnce || !authorityStore?.read) throw new Error("Authority-gated worker requires a worker and runtime-authority store.");
  if (!Number.isFinite(authorityRefreshIntervalMs) || authorityRefreshIntervalMs <= 0) throw new Error("Authority refresh interval must be positive.");
  if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) throw new Error("Authority heartbeat interval must be positive.");
  const allowedControlPlaneTopics = normalizePreAuthorityTopics(preAuthorityTopics);
  let cachedAuthority = null;
  let cachedAtMs = null;
  let lastPausedHeartbeatAtMs = null;

  async function readAuthority() {
    const atMs = now().getTime();
    const elapsedMs = cachedAtMs === null ? null : atMs - cachedAtMs;
    if (cachedAuthority === null || elapsedMs < 0 || elapsedMs >= authorityRefreshIntervalMs) {
      cachedAuthority = await authorityStore.read();
      cachedAtMs = atMs;
      onTelemetry?.(Object.freeze({ event: "worker.authority_refresh", intervalMs: authorityRefreshIntervalMs }));
    }
    return cachedAuthority;
  }

  async function heartbeatPaused(details) {
    if (!heartbeat) return;
    const observedAt = now();
    const observedAtMs = observedAt.getTime();
    const elapsedMs = lastPausedHeartbeatAtMs === null ? null : observedAtMs - lastPausedHeartbeatAtMs;
    if (elapsedMs !== null && elapsedMs >= 0 && elapsedMs < heartbeatIntervalMs) return;
    await heartbeat({ workerId, buildId, status: "paused_authority", observedAt, details });
    lastPausedHeartbeatAtMs = observedAtMs;
    onTelemetry?.(Object.freeze({ event: "worker.heartbeat", status: "paused_authority", intervalMs: heartbeatIntervalMs }));
  }

  return Object.freeze({
    async runOnce() {
      const { state } = await readAuthority();
      if (compatibilityMode) {
        assertCompatibilityRuntimeAuthorityState(state, {
          environment: compatibilityEnvironment,
          databaseName: compatibilityDatabaseName,
        });
        cachedAuthority = null;
        cachedAtMs = null;
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
        await heartbeatPaused(details);
        return Object.freeze({ outcome: "idle", authority: state.authority });
      }
      // Positive authority is never cached across a claim boundary: a
      // cutover pause/fence must be observed before every possible claim.
      // Only a paused state is safe to reuse for the short bounded interval.
      cachedAuthority = null;
      cachedAtMs = null;
      const result = await worker.runOnce();
      return result;
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
