import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";

export function createPIGoalConfidenceReadService({ repository, store } = {}) {
  const source = repository ?? createGoalConfidenceRepository({
    snapshots: store?.goalConfidenceSnapshots ?? [],
    history: store?.goalConfidenceHistory ?? [],
    continuitySeeds: store?.goalConfidenceContinuitySeeds ?? [],
  });
  return Object.freeze({
    getGoalConfidenceSeries({ goalId, phaseId, historyLimit = null } = {}) {
      const currentSnapshot = source.getCurrentSnapshot(goalId, phaseId);
      const history = source.listHistory(goalId, phaseId, { limit: historyLimit });
      const continuitySeed = source.getContinuitySeed(goalId, phaseId);
      const latestCanonicalAssessment =
        history.find((item) =>
          item.assessmentId === currentSnapshot?.currentAssessmentId)?.assessment ??
        null;
      const priorCanonicalAssessment = currentSnapshot?.previousCanonicalAssessmentId
        ? history.find((item) =>
          item.assessmentId ===
            currentSnapshot.previousCanonicalAssessmentId)?.assessment ?? null
        : null;
      return Object.freeze({
        currentSnapshot,
        history,
        continuitySeed,
        latestCanonicalAssessment,
        priorCanonicalAssessment,
        canonicalSeriesExists: history.length > 0 && Boolean(currentSnapshot),
        legacySeedOnly: Boolean(continuitySeed) &&
          history.length === 0 && !currentSnapshot,
      });
    },
  });
}
