import {
  createPIEnergyConfidenceWork,
  createPIEnergyRollingWindow,
  mergePIEnergyConfidenceWork,
} from "./PIEnergyConfidenceFinalizationService";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";
import {
  createPITrainingConfidenceWork,
  mergePITrainingConfidenceWork,
} from "./PITrainingConfidenceFinalizationService";
import { createPISemanticFingerprint } from "./PILowerLevelConfidenceContracts";

export const PILowerLevelEnqueueOutcome = Object.freeze({
  ENQUEUED: "enqueued",
  MATCHED: "matched",
  REACTIVATED: "reactivated",
  DISABLED: "disabled",
});

export function isPILowerLevelConfidenceEnqueueEnabled(environment = process.env) {
  return environment.PI_LOWER_LEVEL_CONFIDENCE_ENQUEUE_ENABLED === "true";
}

export function isPIEnergyConfidenceEnqueueEnabled(environment = process.env) {
  return environment.PI_LOWER_LEVEL_CONFIDENCE_ENERGY_ENQUEUE_ENABLED === "true";
}

export function isPITrainingConfidenceEnqueueEnabled(
  environment = process.env
) {
  return environment.PI_LOWER_LEVEL_CONFIDENCE_TRAINING_ENQUEUE_ENABLED ===
    "true";
}

export function createPILowerLevelConfidenceWorkEnqueueService({
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    stageEnergySourceChange(store, input = {}) {
      const context = resolveContext(store, input);
      const window = createPIEnergyRollingWindow({
        changedLocalDate: input.changedLocalDate,
      });
      const sourceFingerprint = createPISemanticFingerprint({
        canonicalEvidenceId: input.canonicalEvidenceId,
        sourceChangeType: input.sourceChangeType,
        sourceSemanticFingerprint: input.sourceSemanticFingerprint,
        linkedCounterpartId: input.linkedCounterpartId ?? null,
        rmrSourceId: input.rmrSourceId ?? null,
      });
      const incoming = createPIEnergyConfidenceWork({
        ...context,
        changedLocalDate: input.changedLocalDate,
        rollingWindowId: window.id,
        evidenceCutoff: input.evidenceCutoff ?? window.evidenceCutoff,
        sourceNutritionId: input.domain === "nutrition"
          ? input.canonicalEvidenceId : input.linkedCounterpartId,
        sourceActivityId: input.domain === "activity"
          ? input.canonicalEvidenceId : input.linkedCounterpartId,
        reason: input.reason ?? (
          input.domain === "nutrition"
            ? "nutrition_committed"
            : "activity_committed"
        ),
        createdAt: input.createdAt ?? now().toISOString(),
      });
      const linked = Object.freeze({
        ...incoming,
        sourceCommitLinks: mergeLinks([], {
          commitId: input.sourceCommitId ?? "pending_source_commit",
          canonicalEvidenceId: input.canonicalEvidenceId,
          sourceChangeType: input.sourceChangeType,
          sourceSemanticFingerprint: input.sourceSemanticFingerprint,
          linkedCounterpartId: input.linkedCounterpartId ?? null,
          rmrSourceId: input.rmrSourceId ?? null,
        }),
        sourceLinkageFingerprint: sourceFingerprint,
      });
      store.piEnergyConfidenceWorkItems ??= [];
      const index = store.piEnergyConfidenceWorkItems.findIndex(
        (item) => item.id === linked.id
      );
      const existing = index < 0 ? null : store.piEnergyConfidenceWorkItems[index];
      let merged = mergePIEnergyConfidenceWork(existing, linked);
      if (existing) {
        merged = Object.freeze({
          ...merged,
          sourceCommitLinks: mergeLinks(
            existing.sourceCommitLinks,
            linked.sourceCommitLinks[0]
          ),
          sourceLinkageFingerprint: sourceFingerprint,
        });
      }
      if (existing && stable(existing) === stable(merged)) {
        return result(PILowerLevelEnqueueOutcome.MATCHED, existing);
      }
      if (index < 0) store.piEnergyConfidenceWorkItems.push(merged);
      else store.piEnergyConfidenceWorkItems[index] = merged;
      return result(
        existing
          ? PILowerLevelEnqueueOutcome.REACTIVATED
          : PILowerLevelEnqueueOutcome.ENQUEUED,
        merged
      );
    },

    stageTrainingFinalization(store, input = {}) {
      const context = resolveContext(store, input);
      const incoming = createPITrainingConfidenceWork({
        ...context,
        canonicalTrainingSessionId: input.canonicalTrainingSessionId,
        finalizedTrainingReportId: input.finalizedTrainingReportId,
        sourceTrainingEvidenceIds: input.sourceTrainingEvidenceIds,
        performanceEventBatchId: input.performanceEventBatchId,
        performanceEventIds: input.performanceEventIds,
        categoryRollupFingerprint: input.categoryRollupFingerprint,
        analysisComplete: true,
        performanceEventGenerationComplete: true,
        performanceEventPersistenceComplete: true,
        pendingReconciliation: false,
        reason: "performance_event_batch_finalized",
        evidenceCutoff: input.evidenceCutoff,
        createdAt: input.createdAt ?? now().toISOString(),
      });
      const sourceLink = {
        commitId: input.sourceCommitId ?? "pending_source_commit",
        canonicalTrainingSessionId: input.canonicalTrainingSessionId,
        finalizedTrainingReportId: input.finalizedTrainingReportId,
        performanceEventBatchId: input.performanceEventBatchId,
        performanceEventIds: sorted(input.performanceEventIds),
        zeroEventCompletion: input.zeroEventCompletion === true,
        categoryRollupFingerprint: input.categoryRollupFingerprint,
        sourceSemanticFingerprint: input.sourceSemanticFingerprint,
      };
      const linked = Object.freeze({
        ...incoming,
        sourceCommitLinks: mergeLinks([], sourceLink),
        sourceLinkageFingerprint:
          createPISemanticFingerprint(sourceLink),
      });
      store.piTrainingConfidenceWorkItems ??= [];
      const index = store.piTrainingConfidenceWorkItems.findIndex(
        (item) => item.id === linked.id
      );
      const existing = index < 0 ? null : store.piTrainingConfidenceWorkItems[index];
      let merged = mergePITrainingConfidenceWork(existing, linked);
      if (existing) {
        merged = Object.freeze({
          ...merged,
          sourceCommitLinks: mergeLinks(
            existing.sourceCommitLinks,
            linked.sourceCommitLinks[0]
          ),
          sourceLinkageFingerprint: linked.sourceLinkageFingerprint,
        });
      }
      if (existing && stable(existing) === stable(merged)) {
        return result(PILowerLevelEnqueueOutcome.MATCHED, existing);
      }
      if (index < 0) store.piTrainingConfidenceWorkItems.push(merged);
      else store.piTrainingConfidenceWorkItems[index] = merged;
      return result(
        existing
          ? PILowerLevelEnqueueOutcome.REACTIVATED
          : PILowerLevelEnqueueOutcome.ENQUEUED,
        merged
      );
    },
  });
}

function resolveContext(store, input) {
  const goal = (store.goals ?? []).find(
    (item) => item.primary && item.status === "active"
  );
  const phase = goal ? resolveCommittedPhaseContext(goal, { asOf: input.evidenceCutoff ?? new Date() }).activePhase : null;
  const operatingState = goal?.openingApproach?.value ??
    goal?.operatingState?.value ?? goal?.operatingState;
  if (!goal || !phase || !operatingState) {
    throw new Error("Active Goal, phase, and operating state are required.");
  }
  if (input.goalId && input.goalId !== goal.id) {
    throw new Error("Enqueue Goal context changed.");
  }
  return {
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
  };
}

function mergeLinks(values = [], value) {
  const byFingerprint = new Map();
  [...(values ?? []), value].filter(Boolean).forEach((item) => {
    byFingerprint.set(createPISemanticFingerprint(item), item);
  });
  return [...byFingerprint.values()].sort((left, right) =>
    stable(left).localeCompare(stable(right))
  );
}
function sorted(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function result(outcome, work) {
  return Object.freeze({
    outcome,
    workId: work.id,
    expectedSourceFingerprint: work.expectedSourceFingerprint,
  });
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
