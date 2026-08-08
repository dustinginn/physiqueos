import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest";
import { resolvePITrainingGoalConfidenceState } from "./PITrainingGoalConfidenceStateResolver";
import {
  createPIDomainConsumptionIdentity,
  createPILowerLevelTriggerCandidate,
  createPISemanticFingerprint,
  PILowerLevelTriggerType,
} from "./PILowerLevelConfidenceContracts";
import {
  detectPILowerLevelConfidenceSemanticChange,
} from "./PILowerLevelConfidenceSemanticChangeService";

export const PI_TRAINING_FINALIZATION_VERSION =
  "pi_training_confidence_finalization_v1";
export const PI_TRAINING_WORK_VERSION = "pi_training_confidence_work_v1";
export const PI_TRAINING_RECEIPT_VERSION =
  "pi_training_finalization_receipt_v1";
export const PI_TRAINING_MAX_ATTEMPTS = 5;
export const PI_TRAINING_STALE_CLAIM_MS = 15 * 60 * 1000;
export const PI_TRAINING_TRANSIENT_RETENTION_DAYS = 90;

export const PITrainingFinalizationOutcome = Object.freeze({
  PUBLISHED_SUCCESSOR: "published_successor",
  MATCHED: "matched",
  NOT_MATERIAL: "not_material",
  AWAITING_FINALIZATION: "awaiting_final_training_interpretation",
  ALREADY_CONSUMED: "already_consumed",
  CADENCE_OWNED: "cadence_owned",
  EVENT_OWNED: "event_owned",
  CONTEXT_PRECEDENCE_BLOCKED: "context_precedence_blocked",
  BASELINE_CONFLICT: "baseline_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
  ATTEMPT_LIMIT_REACHED: "attempt_limit_reached",
  WORK_NOT_FOUND: "work_not_found",
  BRIEFING_INPUT_READY: "briefing_input_ready",
});

export function createPITrainingConfidenceWork(input = {}) {
  const identity = {
    version: PI_TRAINING_WORK_VERSION,
    triggerType: PILowerLevelTriggerType.TRAINING,
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    canonicalTrainingSessionId: required(
      input.canonicalTrainingSessionId,
      "canonicalTrainingSessionId"
    ),
  };
  const finalized = normalizeFinalization(input);
  const createdAt = timestamp(input.createdAt);
  return freeze({
    schemaVersion: PI_TRAINING_WORK_VERSION,
    id: `pi_training_work|${hash(stable(identity))}`,
    ...identity,
    ...finalized,
    reason: workReason(input.reason),
    evidenceCutoff: timestamp(input.evidenceCutoff),
    expectedSourceFingerprint: sourceFingerprint(identity, finalized),
    status: "pending",
    attemptCount: 0,
    processingStartedAt: null,
    lastError: null,
    completionReceiptId: null,
    receiptIds: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  });
}

export function mergePITrainingConfidenceWork(existing, incoming) {
  if (!existing) return incoming;
  if (existing.id !== incoming.id) throw new Error("Training work IDs differ.");
  const mergedFinalization = {
    finalizedTrainingReportId:
      incoming.finalizedTrainingReportId ?? existing.finalizedTrainingReportId,
    sourceTrainingEvidenceIds: strings([
      ...existing.sourceTrainingEvidenceIds,
      ...incoming.sourceTrainingEvidenceIds,
    ]),
    performanceEventBatchId:
      incoming.performanceEventBatchId ?? existing.performanceEventBatchId,
    performanceEventIds: strings([
      ...existing.performanceEventIds,
      ...incoming.performanceEventIds,
    ]),
    categoryRollupFingerprint:
      incoming.categoryRollupFingerprint ?? existing.categoryRollupFingerprint,
    analysisComplete: incoming.analysisComplete || existing.analysisComplete,
    performanceEventGenerationComplete:
      incoming.performanceEventGenerationComplete ||
      existing.performanceEventGenerationComplete,
    performanceEventPersistenceComplete:
      incoming.performanceEventPersistenceComplete ||
      existing.performanceEventPersistenceComplete,
    pendingReconciliation:
      incoming.pendingReconciliation ?? existing.pendingReconciliation,
  };
  const expectedSourceFingerprint = sourceFingerprint(existing, mergedFinalization);
  if (
    expectedSourceFingerprint === existing.expectedSourceFingerprint &&
    !["failed", "awaiting_final_training_interpretation"].includes(existing.status)
  ) return existing;
  return freeze({
    ...existing,
    ...mergedFinalization,
    reason: incoming.reason,
    evidenceCutoff:
      Date.parse(incoming.evidenceCutoff) > Date.parse(existing.evidenceCutoff)
        ? incoming.evidenceCutoff : existing.evidenceCutoff,
    expectedSourceFingerprint,
    status: "pending",
    processingStartedAt: null,
    lastError: null,
    completionReceiptId: null,
    completedAt: null,
    updatedAt: incoming.updatedAt,
  });
}

export function createPITrainingFinalizationReceipt(input = {}) {
  const identity = {
    version: PI_TRAINING_RECEIPT_VERSION,
    workId: required(input.workId, "workId"),
    triggerId: required(input.triggerId, "triggerId"),
    interpretationFingerprint: required(
      input.trainingInterpretationFingerprint,
      "trainingInterpretationFingerprint"
    ),
    consumptionId: required(input.trainingConsumptionId, "trainingConsumptionId"),
  };
  return freeze({
    schemaVersion: PI_TRAINING_RECEIPT_VERSION,
    id: `pi_training_receipt|${hash(stable(identity))}`,
    ...identity,
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    canonicalTrainingSessionId: required(
      input.canonicalTrainingSessionId,
      "canonicalTrainingSessionId"
    ),
    finalizedTrainingInterpretationId: required(
      input.finalizedTrainingInterpretationId,
      "finalizedTrainingInterpretationId"
    ),
    trainingConsumptionId: identity.consumptionId,
    finalizedReportId: required(input.finalizedReportId, "finalizedReportId"),
    performanceEventBatchId: required(
      input.performanceEventBatchId,
      "performanceEventBatchId"
    ),
    performanceEventIds: strings(input.performanceEventIds),
    categoryRollupFingerprint: required(
      input.categoryRollupFingerprint,
      "categoryRollupFingerprint"
    ),
    exerciseTrendFingerprint: required(
      input.exerciseTrendFingerprint,
      "exerciseTrendFingerprint"
    ),
    priorTrainingState: input.priorTrainingState ?? null,
    currentTrainingState: required(
      input.currentTrainingState,
      "currentTrainingState"
    ),
    semanticChangeOutcome: required(
      input.semanticChangeOutcome,
      "semanticChangeOutcome"
    ),
    publicationEligibility: Boolean(input.publicationEligibility),
    confidencePublicationOutcome: required(
      input.confidencePublicationOutcome,
      "confidencePublicationOutcome"
    ),
    publishedAssessmentId: input.publishedAssessmentId ?? null,
    firstConsumedAssessmentId: input.firstConsumedAssessmentId ?? null,
    priorReceiptId: input.priorReceiptId ?? null,
    completedAt: timestamp(input.completedAt),
    confidenceModelVersion:
      input.confidenceModelVersion ?? "pi_goal_confidence_assessment_v1",
    trainingInterpretationVersion: required(
      input.trainingInterpretationVersion,
      "trainingInterpretationVersion"
    ),
  });
}

export function createPITrainingConfidenceFinalizationService(options = {}) {
  const {
    filePath, liveStore, now = () => new Date(),
    createUnitOfWork = createFounderStoreUnitOfWork,
    readText = (target) => fs.readFileSync(target, "utf8"),
  } = options;
  if (!filePath || !liveStore) {
    throw new Error("Training finalization requires an explicitly bound store.");
  }
  const baseline = () => capture(filePath, readText);

  return freeze({
    captureBaseline: baseline,
    async enqueue(input) {
      const incoming = createPITrainingConfidenceWork({
        ...input, createdAt: input.createdAt ?? now().toISOString(),
      });
      const before = baseline();
      const existing = (before.store.piTrainingConfidenceWorkItems ?? [])
        .find((item) => item.id === incoming.id);
      const merged = mergePITrainingConfidenceWork(existing, incoming);
      if (existing && stable(existing) === stable(merged)) {
        return outcome(PITrainingFinalizationOutcome.MATCHED, {
          work: existing,
        });
      }
      return commit({
        before, filePath, liveStore, now, createUnitOfWork,
        mutate(candidate) {
          collections(candidate);
          const index = candidate.piTrainingConfidenceWorkItems
            .findIndex((item) => item.id === incoming.id);
          if (index < 0) candidate.piTrainingConfidenceWorkItems.push(merged);
          else candidate.piTrainingConfidenceWorkItems[index] = merged;
        },
        validate: (candidate) =>
          candidate.piTrainingConfidenceWorkItems
            .filter((item) => item.id === incoming.id).length === 1,
        success: (value) => outcome("pending", {
          committed: true, work: merged, ...value,
        }),
      });
    },
    listRecoverableWork({
      at = now(), maximumAttempts = PI_TRAINING_MAX_ATTEMPTS,
    } = {}) {
      const cutoff = at.getTime() - PI_TRAINING_STALE_CLAIM_MS;
      return freeze((baseline().store.piTrainingConfidenceWorkItems ?? [])
        .filter((item) => item.attemptCount < maximumAttempts && (
          ["pending", "awaiting_final_training_interpretation"]
            .includes(item.status) ||
          (
            item.status === "processing" &&
            Date.parse(item.processingStartedAt) <= cutoff
          )
        ))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    },
    async claim(workId, { at = now() } = {}) {
      const before = baseline();
      const work = (before.store.piTrainingConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return outcome(PITrainingFinalizationOutcome.WORK_NOT_FOUND);
      if (terminal(work.status)) {
        return outcome(PITrainingFinalizationOutcome.MATCHED, { work });
      }
      if (work.attemptCount >= PI_TRAINING_MAX_ATTEMPTS) {
        return outcome(PITrainingFinalizationOutcome.ATTEMPT_LIMIT_REACHED);
      }
      const stale = at.getTime() - PI_TRAINING_STALE_CLAIM_MS;
      if (work.status === "processing" &&
          Date.parse(work.processingStartedAt) > stale) {
        return outcome(PITrainingFinalizationOutcome.MATCHED, { work });
      }
      const stamp = at.toISOString();
      return commit({
        before, filePath, liveStore, now, createUnitOfWork,
        mutate(candidate) {
          const item = candidate.piTrainingConfidenceWorkItems
            .find((entry) => entry.id === workId);
          item.status = "processing";
          item.processingStartedAt = stamp;
          item.updatedAt = stamp;
        },
        validate: (candidate) =>
          candidate.piTrainingConfidenceWorkItems
            .find((entry) => entry.id === workId)?.processingStartedAt === stamp,
        success: (value) => outcome("processing", {
          committed: true, workId, ...value,
        }),
      });
    },
    preview(workId, expectations = {}) {
      const before = baseline();
      if (
        expectations.expectedRevision != null &&
        expectations.expectedRevision !== before.revision ||
        expectations.expectedSemanticDigest != null &&
        expectations.expectedSemanticDigest !== before.semanticDigest
      ) return outcome(PITrainingFinalizationOutcome.BASELINE_CONFLICT);
      const work = (before.store.piTrainingConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return outcome(PITrainingFinalizationOutcome.WORK_NOT_FOUND);
      try {
        const prepared = prepare(before.store, work, before, now());
        const priorScore = latestScore(before.store);
        const nextScore =
          prepared.publication?.assessment?.score?.current ?? priorScore;
        return outcome(
          prepared.matchedReceipt
            ? PITrainingFinalizationOutcome.MATCHED
            : prepared.outcome,
          {
            workId,
            expectedScoreMovement: nextScore - priorScore,
            ownership: prepared.outcome,
            wouldPublish: Boolean(prepared.publication),
          }
        );
      } catch (error) {
        return outcome(
          String(error?.message).includes("stale_goal_phase_context")
            ? PITrainingFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED
            : PITrainingFinalizationOutcome.PERSISTENCE_FAILURE,
          { error: String(error?.message ?? error) }
        );
      }
    },
    async finalize(workId, expectations = {}) {
      const before = baseline();
      if (
        expectations.expectedRevision != null &&
        expectations.expectedRevision !== before.revision
      ) return outcome(PITrainingFinalizationOutcome.BASELINE_CONFLICT);
      if (
        expectations.expectedSemanticDigest != null &&
        expectations.expectedSemanticDigest !== before.semanticDigest
      ) return outcome(PITrainingFinalizationOutcome.BASELINE_CONFLICT);
      const work = (before.store.piTrainingConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return outcome(PITrainingFinalizationOutcome.WORK_NOT_FOUND);
      const existingReceipt = (before.store.piTrainingFinalizationReceipts ?? [])
        .find((item) => item.id === work.completionReceiptId);
      if (existingReceipt && terminal(work.status)) {
        return outcome(PITrainingFinalizationOutcome.MATCHED, {
          work, receipt: existingReceipt,
          persistedOutcome: work.status,
        });
      }
      if (work.attemptCount >= PI_TRAINING_MAX_ATTEMPTS) {
        return outcome(PITrainingFinalizationOutcome.ATTEMPT_LIMIT_REACHED);
      }
      let prepared;
      try {
        prepared = prepare(before.store, work, before, now());
      } catch (error) {
        return persistFailure({
          before, work, error, filePath, liveStore, now, createUnitOfWork,
        });
      }
      if (prepared.matchedReceipt) {
        return outcome(PITrainingFinalizationOutcome.MATCHED, {
          receipt: prepared.matchedReceipt,
        });
      }
      return commit({
        before, filePath, liveStore, now, createUnitOfWork,
        mutate(candidate) {
          collections(candidate);
          const item = candidate.piTrainingConfidenceWorkItems
            .find((entry) => entry.id === work.id);
          if (!item) throw new Error("Training work is missing.");
          candidate.piTrainingFinalizationReceipts.push(prepared.receipt);
          Object.assign(item, {
            status: prepared.terminalStatus,
            attemptCount: work.attemptCount + 1,
            completionReceiptId: prepared.receipt.id,
            receiptIds: strings([
              ...(work.receiptIds ?? []), prepared.receipt.id,
            ]),
            processingStartedAt: null,
            lastError: null,
            completedAt: prepared.receipt.completedAt,
            updatedAt: prepared.receipt.completedAt,
          });
        },
        validate(candidate) {
          const receipt = candidate.piTrainingFinalizationReceipts
            .filter((item) => item.id === prepared.receipt.id);
          const item = candidate.piTrainingConfidenceWorkItems
            .find((entry) => entry.id === work.id);
          return receipt.length === 1 &&
            item?.completionReceiptId === prepared.receipt.id;
        },
        success: (value) => outcome(prepared.outcome, {
          committed: true, receipt: prepared.receipt,
          assessmentId: prepared.receipt.publishedAssessmentId, ...value,
        }),
      });
    },
    async pruneTransient({ at = now() } = {}) {
      const before = baseline();
      const cutoff = at.getTime() -
        PI_TRAINING_TRANSIENT_RETENTION_DAYS * 86400000;
      const receipts = before.store.piTrainingFinalizationReceipts ?? [];
      const retained = (before.store.piTrainingConfidenceWorkItems ?? [])
        .filter((item) =>
          ["pending", "processing", "awaiting_final_training_interpretation"]
            .includes(item.status) ||
          Date.parse(item.completedAt ?? item.updatedAt) >= cutoff ||
          (item.receiptIds ?? []).some((id) =>
            receipts.find((receipt) => receipt.id === id)?.publishedAssessmentId
          )
        );
      if (retained.length ===
          (before.store.piTrainingConfidenceWorkItems ?? []).length) {
        return outcome(PITrainingFinalizationOutcome.MATCHED);
      }
      return commit({
        before, filePath, liveStore, now, createUnitOfWork,
        mutate(candidate) {
          candidate.piTrainingConfidenceWorkItems = retained;
        },
        validate: () => true,
        success: (value) => outcome("pruned", { committed: true, ...value }),
      });
    },
  });
}

function prepare(store, work, before, completedAt) {
  const goal = (store.goals ?? []).find((item) => item.id === work.goalId);
  const phase = goal?.phases?.find((item) => item.id === work.phaseId);
  const operatingState = goal?.openingApproach?.value ??
    goal?.operatingState?.value ?? goal?.operatingState;
  if (!goal || !phase || phase.status !== "active" ||
      operatingState !== work.operatingState) {
    throw new Error("stale_goal_phase_context");
  }
  const canonical = (store.canonicalEvidenceObjects ?? []).find((item) =>
    item.quality?.status !== "superseded" &&
    item.evidence_type === "training" &&
    (
      item.canonicalId === work.canonicalTrainingSessionId ||
      item.payload?.id === work.canonicalTrainingSessionId
    )
  );
  const analysis = (store.analyses ?? []).find((item) =>
    item.id === work.finalizedTrainingReportId
  );
  const report = analysis?.metadata?.trainingPerformance ?? null;
  const interpretation = resolvePITrainingGoalConfidenceState({
    goalId: goal.id,
    phaseId: phase.id,
    semanticGoalType: "build_lean_mass",
    semanticPhaseType: "establish_maintenance",
    operatingState,
    canonicalSessionId: canonical?.payload?.id ?? canonical?.canonicalId ?? null,
    finalizedReportId: analysis?.id ?? null,
    performanceEventIds: work.performanceEventIds,
    evidenceCutoff: work.evidenceCutoff,
    analysisComplete: work.analysisComplete && Boolean(analysis),
    performanceEventGenerationComplete:
      work.performanceEventGenerationComplete,
    performanceEventPersistenceComplete:
      work.performanceEventPersistenceComplete &&
      Boolean(work.performanceEventBatchId),
    pendingReconciliation: work.pendingReconciliation,
    trainingReport: report,
  });
  const priorReceipt = latestReceipt(store, work);
  const current = confidence(store, goal.id, phase.id);
  const represented = representedBy(current?.assessment, interpretation);
  const priorState = priorReceipt
    ? receiptState(priorReceipt)
    : represented
      ? interpretation
      : contributorState(current?.assessment);
  const consumption = createPIDomainConsumptionIdentity({
    domain: "training",
    sourceInterpretationId: interpretation.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    evidenceCutoff: interpretation.evidenceCutoff,
    sourceEvidenceIds: work.sourceTrainingEvidenceIds,
    transitionFromState: priorState?.state ?? null,
    transitionToState: interpretation.state,
    domainIdentity: {
      canonicalSessionId: work.canonicalTrainingSessionId,
      performanceEventIds: work.performanceEventIds,
      finalizedReportId: work.finalizedTrainingReportId ??
        "awaiting_finalized_report",
      categoryTrendFingerprint: interpretation.categoryTrendFingerprint,
      interpretationVersion: interpretation.interpretationVersion,
    },
  });
  const contextType = current?.assessment?.context?.type ?? null;
  const ownership = represented ? owner(contextType) : "lower_level";
  const change = detectPILowerLevelConfidenceSemanticChange({
    domain: "training",
    priorState,
    nextState: interpretation,
    consumptionId: consumption.id,
    priorConsumedTransitionIds:
      current?.assessment?.contributors?.flatMap(
        (item) => item.consumedTransitionIds ?? []
      ) ?? [],
    ownership,
  });
  const candidateOutcome = represented
    ? representedOutcome(contextType)
    : change.outcome === "already_represented" && priorReceipt
      ? PITrainingFinalizationOutcome.NOT_MATERIAL
      : mapOutcome(change.outcome);
  const finalOutcome = candidateOutcome ===
      PITrainingFinalizationOutcome.PUBLISHED_SUCCESSOR
    ? PITrainingFinalizationOutcome.BRIEFING_INPUT_READY
    : candidateOutcome;
  const trigger = createPILowerLevelTriggerCandidate({
    triggerType: PILowerLevelTriggerType.TRAINING,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    sourceEvidenceIds: work.sourceTrainingEvidenceIds,
    finalizedInterpretationId: interpretation.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    evidenceCutoff: interpretation.evidenceCutoff,
    semanticChangeType: change.semanticChangeType ?? change.outcome,
    publicationEligibility: change.material,
    expectedCurrentSnapshotId: current?.snapshot?.id ?? null,
    expectedRevision: before.revision,
    expectedSemanticDigest: before.semanticDigest,
    consumption,
    priorConsumedTransitionIdentity:
      priorReceipt?.trainingConsumptionId ?? null,
    ownership,
  });
  const receiptIdentity = `pi_training_receipt|${hash(stable({
    version: PI_TRAINING_RECEIPT_VERSION,
    workId: work.id,
    triggerId: trigger.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    consumptionId: consumption.id,
  }))}`;
  const matchedReceipt = (store.piTrainingFinalizationReceipts ?? [])
    .find((item) => item.id === receiptIdentity);
  if (matchedReceipt) return { matchedReceipt };
  const assessmentId = null;
  const receipt = createPITrainingFinalizationReceipt({
    workId: work.id,
    triggerId: trigger.id,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    canonicalTrainingSessionId: work.canonicalTrainingSessionId,
    finalizedTrainingInterpretationId: interpretation.id,
    trainingInterpretationFingerprint:
      interpretation.interpretationFingerprint,
    trainingConsumptionId: consumption.id,
    finalizedReportId: work.finalizedTrainingReportId ??
      "awaiting_finalized_report",
    performanceEventBatchId: work.performanceEventBatchId ??
      "awaiting_event_batch",
    performanceEventIds: work.performanceEventIds,
    categoryRollupFingerprint: interpretation.categoryTrendFingerprint,
    exerciseTrendFingerprint: interpretation.exerciseTrendFingerprint,
    priorTrainingState: priorState?.state ?? null,
    currentTrainingState: interpretation.state,
    semanticChangeOutcome: change.outcome,
    publicationEligibility: change.material,
    confidencePublicationOutcome: finalOutcome,
    publishedAssessmentId: assessmentId,
    firstConsumedAssessmentId: assessmentId,
    priorReceiptId: priorReceipt?.id ?? null,
    completedAt: completedAt.toISOString(),
    trainingInterpretationVersion: interpretation.interpretationVersion,
  });
  return {
    outcome: finalOutcome,
    terminalStatus:
      finalOutcome === PITrainingFinalizationOutcome.ALREADY_CONSUMED
        ? "cadence_owned" : finalOutcome,
    receipt,
  };
}

function normalizeFinalization(input) {
  return {
    finalizedTrainingReportId: input.finalizedTrainingReportId ?? null,
    sourceTrainingEvidenceIds: strings(input.sourceTrainingEvidenceIds),
    performanceEventBatchId: input.performanceEventBatchId ?? null,
    performanceEventIds: strings(input.performanceEventIds),
    categoryRollupFingerprint: input.categoryRollupFingerprint ?? null,
    analysisComplete: input.analysisComplete === true,
    performanceEventGenerationComplete:
      input.performanceEventGenerationComplete === true,
    performanceEventPersistenceComplete:
      input.performanceEventPersistenceComplete === true,
    pendingReconciliation: input.pendingReconciliation === true,
  };
}
function sourceFingerprint(identity, finalized) {
  return createPISemanticFingerprint({
    canonicalTrainingSessionId: identity.canonicalTrainingSessionId,
    ...finalized,
  });
}
function workReason(value) {
  const allowed = [
    "canonical_training_committed", "analysis_finalized",
    "performance_event_batch_finalized", "training_correction_committed",
  ];
  if (!allowed.includes(value)) throw new Error("Unsupported Training work reason.");
  return value;
}
function confidence(store, goalId, phaseId) {
  const snapshot = (store.goalConfidenceSnapshots ?? [])
    .find((item) => item.goalId === goalId && item.phaseId === phaseId);
  const history = (store.goalConfidenceHistory ?? [])
    .find((item) => item.id === snapshot?.historyRecordId);
  return snapshot && history ? { snapshot, assessment: history.assessment } : null;
}
function representedBy(assessment, interpretation) {
  if (!assessment || Date.parse(assessment.evidenceCutoff) <
      Date.parse(interpretation.evidenceCutoff)) return false;
  if (assessment.context?.type === "training_interpretation") return false;
  return assessment.contributors?.some((item) => item.domain === "training");
}
function contributorState(assessment) {
  const value = assessment?.contributors?.find((item) => item.domain === "training");
  if (!value) return null;
  const text = `${value.reason ?? ""}`.toLowerCase();
  const state = text.includes("regress") ? "broad_regression" :
    text.includes("stagn") ? "stagnating" :
      text.includes("meaningful breadth") ? "broad_constructive" :
        text.includes("stable") ? "stable" : "insufficient";
  return {
    state, direction: value.direction, strength: value.strength,
    finalized: value.evidenceCompleteness === "complete",
  };
}
function receiptState(value) {
  return {
    state: value.currentTrainingState,
    direction: value.currentTrainingState === "broad_constructive"
      ? "positive" : value.currentTrainingState === "broad_regression"
        ? "negative" : "neutral",
    strength: ["broad_constructive", "broad_regression"]
      .includes(value.currentTrainingState) ? "high" : "moderate",
    finalized: true,
    interpretationFingerprint: value.interpretationFingerprint,
  };
}
function latestReceipt(store, work) {
  return (store.piTrainingFinalizationReceipts ?? [])
    .filter((item) => item.goalId === work.goalId && item.phaseId === work.phaseId)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt)).at(-1) ?? null;
}
function owner(type) {
  return ["photo_event", "dexa_event", "phase_transition"].includes(type)
    ? "event" : "cadence";
}
function representedOutcome(type) {
  if (["midweek_partial_window", "weekly_closed_window"].includes(type)) {
    return PITrainingFinalizationOutcome.CADENCE_OWNED;
  }
  if (["photo_event", "dexa_event"].includes(type)) {
    return PITrainingFinalizationOutcome.EVENT_OWNED;
  }
  if (type === "phase_transition") {
    return PITrainingFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED;
  }
  return PITrainingFinalizationOutcome.ALREADY_CONSUMED;
}
function mapOutcome(value) {
  return ({
    material_change: PITrainingFinalizationOutcome.PUBLISHED_SUCCESSOR,
    non_material_change: PITrainingFinalizationOutcome.NOT_MATERIAL,
    already_represented: PITrainingFinalizationOutcome.ALREADY_CONSUMED,
    insufficient_interpretation:
      PITrainingFinalizationOutcome.AWAITING_FINALIZATION,
    awaiting_training_finalization:
      PITrainingFinalizationOutcome.AWAITING_FINALIZATION,
    higher_level_event_owned: PITrainingFinalizationOutcome.EVENT_OWNED,
  })[value] ?? PITrainingFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED;
}
function terminal(value) {
  return [
    "briefing_input_ready", "published_successor", "matched", "not_material", "cadence_owned",
    "event_owned", "context_precedence_blocked",
  ].includes(value);
}

async function persistFailure(args) {
  const { before, work, error, filePath, liveStore, now, createUnitOfWork } = args;
  const status = work.attemptCount + 1 >= PI_TRAINING_MAX_ATTEMPTS
    ? "failed" : "pending";
  return commit({
    before, filePath, liveStore, now, createUnitOfWork,
    mutate(candidate) {
      const item = candidate.piTrainingConfidenceWorkItems
        .find((entry) => entry.id === work.id);
      item.status = status;
      item.attemptCount = work.attemptCount + 1;
      item.lastError = String(error?.message ?? error);
      item.updatedAt = now().toISOString();
    },
    validate: (candidate) =>
      candidate.piTrainingConfidenceWorkItems
        .find((entry) => entry.id === work.id)?.attemptCount ===
          work.attemptCount + 1,
    success: (value) => outcome(
      status === "failed" ? PITrainingFinalizationOutcome.ATTEMPT_LIMIT_REACHED :
        PITrainingFinalizationOutcome.PERSISTENCE_FAILURE,
      { committed: true, error: String(error?.message ?? error), ...value }
    ),
  });
}
async function commit({
  before, filePath, liveStore, now, createUnitOfWork, mutate, validate,
  finalizeCandidate, validateFinalized, success,
}) {
  const transaction = createUnitOfWork({
    filePath, liveStore, stageFrom: before.store, now,
    validatePersistedBaseline: (current) => ({
      valid: current.revision === before.revision &&
        createFounderRuntimeSemanticDigest(current) === before.semanticDigest,
    }),
  }).begin();
  try {
    await transaction.mutate(mutate);
    const committed = await transaction.commit({
      validate: (candidate) => ({ valid: validate(candidate) }),
      finalizeCandidate, validateFinalized,
    });
    return success({
      revision: committed.revision, commitId: committed.commitId,
    });
  } catch (error) {
    if ([FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT,
      FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED].includes(error?.code)) {
      return outcome(PITrainingFinalizationOutcome.BASELINE_CONFLICT);
    }
    if (error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
        error.committed) {
      return outcome(
        PITrainingFinalizationOutcome.COMMITTED_PUBLICATION_FAILURE,
        { committed: true, commitId: error.commitId }
      );
    }
    return outcome(PITrainingFinalizationOutcome.PERSISTENCE_FAILURE, {
      error: String(error?.message ?? error),
    });
  }
}
function capture(filePath, readText) {
  const store = JSON.parse(readText(filePath));
  return freeze({
    store, revision: store.revision ?? 0,
    semanticDigest: createFounderRuntimeSemanticDigest(store),
  });
}
function collections(store) {
  store.piTrainingConfidenceWorkItems ??= [];
  store.piTrainingFinalizationReceipts ??= [];
  store.goalConfidenceSnapshots ??= [];
  store.goalConfidenceHistory ??= [];
  store.goalConfidenceContinuitySeeds ??= [];
}
function latestScore(store) {
  return store.goalConfidenceHistory?.at(-1)?.assessment?.score?.current ?? 0;
}
function outcome(value, extra = {}) {
  return freeze({ outcome: value, committed: false, ...extra });
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}
function timestamp(value) {
  if (!Number.isFinite(Date.parse(value))) throw new Error("Timestamp is invalid.");
  return new Date(value).toISOString();
}
function strings(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
