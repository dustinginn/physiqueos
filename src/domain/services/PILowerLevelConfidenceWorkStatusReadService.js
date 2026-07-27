import {
  PI_ENERGY_MAX_ATTEMPTS,
  PI_ENERGY_STALE_CLAIM_MS,
} from "./PIEnergyConfidenceFinalizationService";
import {
  PI_TRAINING_MAX_ATTEMPTS,
  PI_TRAINING_STALE_CLAIM_MS,
} from "./PITrainingConfidenceFinalizationService";

export function createPILowerLevelConfidenceWorkStatusReadService({
  readStore,
  now = () => new Date(),
  latestWorkerRun = () => null,
} = {}) {
  if (typeof readStore !== "function") {
    throw new Error("Lower-level work status requires a store reader.");
  }
  return Object.freeze({
    getStatus() {
      const store = readStore();
      return Object.freeze({
        generatedAt: now().toISOString(),
        domains: {
          energy: status(
            store.piEnergyConfidenceWorkItems,
            PI_ENERGY_MAX_ATTEMPTS,
            PI_ENERGY_STALE_CLAIM_MS,
            now()
          ),
          training: status(
            store.piTrainingConfidenceWorkItems,
            PI_TRAINING_MAX_ATTEMPTS,
            PI_TRAINING_STALE_CLAIM_MS,
            now()
          ),
        },
        latestWorkerRun: latestWorkerRun(),
      });
    },
  });
}

function status(items = [], attemptLimit, staleMs, at) {
  const staleBefore = at.getTime() - staleMs;
  const stale = items.filter((item) =>
    item.status === "processing" &&
    Date.parse(item.processingStartedAt) <= staleBefore
  );
  const pending = items.filter((item) => item.status === "pending");
  const awaiting = items.filter((item) =>
    ["awaiting_pair", "awaiting_final_training_interpretation"]
      .includes(item.status)
  );
  const processing = items.filter((item) => item.status === "processing");
  const failed = items.filter((item) => item.status === "failed");
  const terminal = items.filter((item) =>
    !pending.includes(item) &&
    !awaiting.includes(item) &&
    !processing.includes(item) &&
    !failed.includes(item)
  );
  return Object.freeze({
    pendingCount: pending.length,
    awaitingCount: awaiting.length,
    processingCount: processing.length,
    failedCount: failed.length,
    staleClaimCount: stale.length,
    terminalCount: terminal.length,
    oldestPendingTimestamp:
      [...pending, ...awaiting].sort(
        (left, right) => left.createdAt.localeCompare(right.createdAt)
      )[0]?.createdAt ?? null,
    workIds: items.map((item) => item.id).sort(),
    sources: items.map((item) =>
      item.changedLocalDate ?? item.canonicalTrainingSessionId
    ).filter(Boolean).sort(),
    retryEligibleWorkIds: items.filter((item) =>
      item.attemptCount < attemptLimit &&
      (
        pending.includes(item) ||
        awaiting.includes(item) ||
        stale.includes(item)
      )
    ).map((item) => item.id).sort(),
  });
}
