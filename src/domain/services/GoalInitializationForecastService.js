import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import {
  adaptBriefingArtifactToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
} from "../confidence/ProductionConfidenceContextAdapter";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";

export const GOAL_INITIALIZATION_FORECAST_VERSION =
  "goal_initialization_forecast_v2";

export function createGoalInitializationForecastService({
  publicationService = createCanonicalBriefingConfidencePublicationService(),
  now = () => new Date(),
} = {}) {
  const finalizer = createBriefingForecastFinalizer({ publicationService, now });
  return Object.freeze({
    async initialize({ userId, activeGoal, activePhase, occurrenceId,
      startingForecastContext, evidenceDescriptors = [], sourceLineage = {},
      activatedAt = activeGoal?.activatedAt ?? now().toISOString() } = {}) {
      if (!userId || !activeGoal?.id || !activePhase?.id || !occurrenceId) {
        return failure("goal_initialization_context_incomplete");
      }
      const baseline = publicationService.captureBaseline();
      const existing = (baseline.store.goalConfidenceSnapshots ?? []).find((item) =>
        item.goalId === activeGoal.id && item.phaseId === activePhase.id);
      if (existing) return failure("goal_confidence_series_already_initialized");
      const goalContract = adaptProductionGoalToCanonicalContract(activeGoal, {
        activePhase,
      });
      const artifactId = `goal_initialization|${occurrenceId}`;
      const cutoff = iso(activatedAt);
      const artifact = {
        id: artifactId,
        artifactType: "goal_initialization",
        schemaVersion: GOAL_INITIALIZATION_FORECAST_VERSION,
        userId,
        goalId: activeGoal.id,
        phaseId: activePhase.id,
        occurrenceId,
        activatedAt: cutoff,
      };
      const result = await finalizer.finalize({
        publisherType: "goal_initialization", userId, occurrenceId,
        artifactId, cadenceOrEventType: "goal_initialization",
        goalContract, phaseId: activePhase.id,
        evidenceWindow: { id: `goal_initialization_window|${occurrenceId}`,
          start: cutoff, cutoff, closed: true },
        strategyContext: goalContract.strategyHypothesis,
        executionContext: { adequacy: startingForecastContext?.historicalExecution ??
          "unknown", elapsedTimeAdequacy: "not_started",
          refs: startingForecastContext?.historyRefs ?? [] },
        evidenceDescriptors: evidenceDescriptors.length ? evidenceDescriptors :
          adaptBriefingArtifactToEvidenceDescriptors({ artifact: {
            ...artifact, evidenceCutoff: cutoff,
          } }),
        previousCanonicalAssessment: null,
        publicationCutoff: cutoff, finalizedAt: now().toISOString(),
        idempotencyKey: `confidence_v2|goal_initialization|${occurrenceId}`,
        expectedPriorAssessmentId: null,
        expectedPriorArtifactId: null,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        startingForecastContext,
        sourceLineage: { ...sourceLineage, occurrenceId,
          activationGoalId: activeGoal.id },
        elapsedTimeAdequacy: "not_started",
        composeArtifact: () => ({ artifact }),
      });
      return result;
    },
  });
}

function failure(status) {
  return { status, noOp: true, commitResult: { status, committed: false } };
}
function iso(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Goal activation timestamp is invalid.");
  return new Date(parsed).toISOString();
}
