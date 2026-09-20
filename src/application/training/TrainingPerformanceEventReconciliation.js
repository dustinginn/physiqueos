import { produceTrainingPerformanceEvents } from "../../domain/services/TrainingPerformanceEventProducer.js";
import { createTrainingPerformanceIntelligenceReport } from "../../domain/services/TrainingPerformanceIntelligenceService.js";
import { TrainingPerformanceEventPersistenceOutcome } from "../../domain/services/TrainingPerformanceEventPersistenceService.js";
import { createPISemanticFingerprint } from "../../domain/services/PILowerLevelConfidenceContracts.js";
import {
  createPILowerLevelConfidenceWorkEnqueueService,
  isPITrainingConfidenceEnqueueEnabled,
} from "../../domain/services/PILowerLevelConfidenceWorkEnqueueService.js";

// One idempotent downstream performance-event reconciliation for a committed
// canonical Training session, used by BOTH ingress paths:
//   - review confirmation (`training_performance_events` orchestrator step)
//   - the Logger command (`commitTrainingSession`)
// Event ids are derived from the canonical session, exercise and achievement
// values only, so the same session yields the same events whichever path
// delivers it, and persistence matches existing ids instead of duplicating them.
//
// Semantics, unchanged from the review path:
//   - a PR means the session beat the all-time prior best for the same exercise,
//     variant and relationship context (previous-exposure improvement is a
//     separate, transient Native comparison and never a durable event);
//   - only the most recent active exposure of an exercise is evaluated, so a
//     backdated session that is not the latest exposure produces no event for
//     that exercise (baselines are never rewritten retroactively);
//   - only active canonical sessions are sources or baselines.
export const TRAINING_PERFORMANCE_EVENT_FAILURE_OUTCOMES = Object.freeze([
  TrainingPerformanceEventPersistenceOutcome.COLLISION,
  TrainingPerformanceEventPersistenceOutcome.CONCURRENCY_CONFLICT,
  TrainingPerformanceEventPersistenceOutcome.PERSISTENCE_FAILURE,
  TrainingPerformanceEventPersistenceOutcome.COMMITTED_PUBLICATION_FAILURE,
]);

// The deterministic report the review path also derives: active canonical
// Training only. `id` and `createdAt` are functions of the source package so a
// replay of the same command reproduces the same batch.
export function createCommittedTrainingPerformanceAnalysis({
  canonicalObjects = [],
  packageId,
  capturedAt,
} = {}) {
  if (!packageId || !capturedAt) {
    throw new Error("A committed Training analysis needs its package id and capture time.");
  }
  const report = createTrainingPerformanceIntelligenceReport({
    canonicalObjects,
    generatedAt: capturedAt,
    now: capturedAt,
  });
  return Object.freeze({
    id: `analysis_training_${packageId}`,
    createdAt: capturedAt,
    metadata: { trainingPerformance: report },
  });
}

export async function reconcileTrainingPerformanceEvents({
  canonicalSessions = [],
  trainingAnalysis,
  sourceReviewId,
  sourceEvidencePackageId,
  persistence,
  lowerLevelEnabled = isPITrainingConfidenceEnqueueEnabled(),
  coordinator = createPILowerLevelConfidenceWorkEnqueueService(),
  now = () => new Date(),
} = {}) {
  if (!persistence?.persistEventBatch) {
    throw new Error("Training performance-event reconciliation requires a persistence service.");
  }
  if (!trainingAnalysis?.id) {
    throw new Error("Persisted Training analysis is unavailable for performance-event generation.");
  }
  const events = canonicalSessions.flatMap((canonicalSession) =>
    produceTrainingPerformanceEvents({
      canonicalTrainingSession: canonicalSession,
      trainingAnalysis,
      sourceReviewId,
      sourceEvidencePackageId,
      now,
    })
  );
  const eventIds = events.map((event) => event.id).sort();
  const canonicalSessionIds = canonicalSessions.map((session) => session.canonicalId).sort();
  const batchId = `training_event_batch|${createPISemanticFingerprint({
    packageId: sourceEvidencePackageId,
    analysisId: trainingAnalysis.id,
    sessionIds: canonicalSessionIds,
    eventIds,
  }).slice(7)}`;
  const batch = {
    id: batchId,
    status: "finalized",
    sourceCommitId: "pending_source_commit",
    sourceEvidencePackageId,
    sourceReviewId,
    finalizedReportId: trainingAnalysis.id,
    canonicalTrainingSessionIds: canonicalSessionIds,
    performanceEventIds: eventIds,
    zeroEventCompletion: eventIds.length === 0,
    finalizedAt: trainingAnalysis.createdAt,
  };
  const outcome = await persistence.persistEventBatch(events, lowerLevelEnabled ? {
    batchId,
    batch,
    mutateCandidate: (candidate) => {
      for (const canonicalSession of canonicalSessions) {
        const sessionId = canonicalSession.payload?.id ?? canonicalSession.id;
        const sessionEvents = events.filter((event) => event.sourceSessionId === sessionId);
        coordinator.stageTrainingFinalization(candidate, {
          canonicalTrainingSessionId: canonicalSession.canonicalId,
          finalizedTrainingReportId: trainingAnalysis.id,
          sourceTrainingEvidenceIds: [canonicalSession.canonicalId],
          performanceEventBatchId: batchId,
          performanceEventIds: sessionEvents.map((event) => event.id),
          zeroEventCompletion: sessionEvents.length === 0,
          categoryRollupFingerprint: createPISemanticFingerprint(
            trainingAnalysis.metadata?.trainingPerformance?.categoryObservations ?? []
          ),
          sourceSemanticFingerprint: createPISemanticFingerprint({
            canonicalSession,
            finalizedReportId: trainingAnalysis.id,
            performanceEventIds: sessionEvents.map((event) => event.id).sort(),
          }),
          evidenceCutoff: `${String(canonicalSession.payload?.observed_at ?? "").slice(0, 10)}T23:59:59.999Z`,
        });
      }
    },
    finalizeCandidate: ({ stagedState, commitId }) => {
      stagedState.trainingPerformanceEventBatches =
        (stagedState.trainingPerformanceEventBatches ?? []).map((item) =>
          item.id === batchId ? { ...item, sourceCommitId: commitId } : item
        );
      stagedState.piTrainingConfidenceWorkItems =
        (stagedState.piTrainingConfidenceWorkItems ?? []).map((work) => {
          const sourceCommitLinks = (work.sourceCommitLinks ?? []).map((link) =>
            link.commitId === "pending_source_commit" ? { ...link, commitId } : link
          );
          return sourceCommitLinks.some((link, index) => link !== work.sourceCommitLinks?.[index])
            ? { ...work, sourceCommitLinks }
            : work;
        });
    },
    validateFinalized: (candidate) =>
      canonicalSessions.every((canonicalSession) =>
        candidate.piTrainingConfidenceWorkItems?.some((work) =>
          work.canonicalTrainingSessionId === canonicalSession.canonicalId &&
          work.performanceEventBatchId === batchId
        )
      ),
    selectFinalized: (candidate) => ({
      lowerLevelWorkIds: canonicalSessions.map((canonicalSession) =>
        candidate.piTrainingConfidenceWorkItems?.find((work) =>
          work.canonicalTrainingSessionId === canonicalSession.canonicalId &&
          work.performanceEventBatchId === batchId
        )?.id
      ).filter(Boolean),
    }),
  } : {});

  return {
    events,
    batchId: lowerLevelEnabled ? batchId : null,
    persistence: outcome,
    failed: TRAINING_PERFORMANCE_EVENT_FAILURE_OUTCOMES.includes(outcome.outcome),
  };
}
