import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";
import { validatePIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";

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
    getGoalConfidenceAssessmentAtOrBefore({ goalId, phaseId, cutoff } = {}) {
      const cutoffTime = Date.parse(cutoff);
      if (!goalId || !phaseId || !Number.isFinite(cutoffTime)) return null;
      const eligible = source.listHistory(goalId, phaseId)
        .filter((record) => isCanonicalAssessmentEligible(record?.assessment, {
          cutoffTime,
          goalId,
          phaseId,
        }))
        .sort((left, right) =>
          assessmentTime(right.assessment) - assessmentTime(left.assessment) ||
          String(right.id).localeCompare(String(left.id))
        );
      const selected = eligible[0];
      if (!selected) return null;
      return Object.freeze({
        assessment: selected.assessment,
        historyRecordId: selected.id,
        selectedAtOrBefore: new Date(cutoffTime).toISOString(),
        source: "canonical_pi_history_at_or_before",
      });
    },
  });
}

function isCanonicalAssessmentEligible(assessment, {
  cutoffTime,
  goalId,
  phaseId,
}) {
  if (!assessment ||
      assessment.goalId !== goalId ||
      assessment.phaseId !== phaseId ||
      assessmentTime(assessment) > cutoffTime ||
      Date.parse(assessment.evidenceCutoff) > cutoffTime) return false;
  try {
    return validatePIGoalConfidenceAssessment(assessment);
  } catch {
    return false;
  }
}

function assessmentTime(assessment) {
  return Date.parse(assessment?.provenance?.generatedAt);
}
