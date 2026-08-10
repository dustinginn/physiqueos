import {
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore";

export function createFounderBriefingReconciliationPersistenceService({
  filePath = resolveFounderRuntimeStorePath(),
  liveStore = getFounderRuntimeStore(),
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
} = {}) {
  return Object.freeze({
    async saveWorkItem(workItem) {
      if (!workItem?.id) throw new Error("Briefing reconciliation work item ID is required.");
      const transaction = createUnitOfWork({
        filePath,
        liveStore,
        stageFrom: liveStore,
        now,
        lockContext: { operation: "briefing_reconciliation_state" },
      }).begin();
      await transaction.mutate((candidate) => {
        candidate.briefingReconciliationWorkItems ??= [];
        const index = candidate.briefingReconciliationWorkItems
          .findIndex((item) => item.id === workItem.id);
        const current = index >= 0
          ? candidate.briefingReconciliationWorkItems[index]
          : null;
        assertCompatibleTransition(current, workItem);
        if (index >= 0) {
          candidate.briefingReconciliationWorkItems[index] =
            structuredClone(workItem);
        } else {
          candidate.briefingReconciliationWorkItems.push(
            structuredClone(workItem)
          );
        }
      });
      const committed = await transaction.commit({
        validateFinalized(candidate) {
          const persisted = candidate.briefingReconciliationWorkItems
            ?.find((item) => item.id === workItem.id);
          return Boolean(persisted &&
            persisted.status === workItem.status &&
            persisted.inputFingerprint === workItem.inputFingerprint);
        },
      });
      return Object.freeze({
        commitId: committed.commitId,
        revision: committed.revision,
        workItem: structuredClone(workItem),
      });
    },
  });
}

function assertCompatibleTransition(current, next) {
  if (!current) return;
  if (current.inputFingerprint !== next.inputFingerprint) {
    const error = new Error(
      "Briefing reconciliation inputs changed before state persistence."
    );
    error.code = "briefing_reconciliation_input_conflict";
    throw error;
  }
  const allowed = {
    revision_pending: new Set(["revising"]),
    failed: new Set(["revising"]),
    revising: new Set(["failed", "current_after_revision"]),
  };
  if (current.status === next.status) return;
  if (!allowed[current.status]?.has(next.status)) {
    const error = new Error(
      `Invalid briefing reconciliation transition: ${current.status} -> ${next.status}.`
    );
    error.code = "briefing_reconciliation_transition_conflict";
    throw error;
  }
}
