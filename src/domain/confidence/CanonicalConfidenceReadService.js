import {
  validateCanonicalConfidenceAssessment,
} from "./CanonicalConfidenceAssessmentModel";
import { adaptV1ConfidenceAssessment } from "./ConfidenceV1CompatibilityAdapter";

export function createCanonicalConfidenceReadService({ store = {} } = {}) {
  const sourceStore = store ?? {};
  return Object.freeze({
    getCurrent({ goalId, phaseId = null } = {}) {
      const snapshots = (sourceStore.goalConfidenceSnapshots ?? []).filter((item) =>
        item.goalId === goalId && (phaseId == null || item.phaseId === phaseId));
      if (snapshots.length !== 1) return unavailable(
        snapshots.length ? "canonical_boundary_ambiguous" : "canonical_series_unavailable",
        goalId, phaseId);
      const snapshot = snapshots[0];
      const matching = (sourceStore.goalConfidenceHistory ?? []).filter((item) =>
        item.assessmentId === snapshot.currentAssessmentId);
      if (matching.length !== 1) return unavailable(
        "canonical_snapshot_or_history_invalid", goalId, phaseId);
      const record = matching[0];
      const assessment = normalizeAssessment(record.assessment, record);
      if (!assessment || assessment.goalId !== goalId ||
          (phaseId != null && assessment.phaseId !== phaseId) ||
          snapshot.currentScore !== assessment.currentPercentage ||
          snapshot.scoreBand !== assessment.confidenceBand) {
        return unavailable("canonical_snapshot_or_history_invalid", goalId, phaseId);
      }
      return Object.freeze({
        status: assessment.schemaVersion === "canonical_confidence_assessment_v2"
          ? "canonical_v2" : "canonical_v1_compatibility",
        source: assessment.schemaVersion === "canonical_confidence_assessment_v2"
          ? "canonical_confidence_v2_snapshot" : "canonical_pi_v1_snapshot",
        canonicalSeries: true,
        assessment,
        snapshot: structuredClone(snapshot),
        historyRecord: structuredClone(record),
      });
    },
    getAssessmentAtOrBefore({ goalId, phaseId = null, cutoff } = {}) {
      const at = Date.parse(cutoff);
      if (!Number.isFinite(at)) return null;
      return (sourceStore.goalConfidenceHistory ?? [])
        .filter((record) => record.goalId === goalId &&
          (phaseId == null || record.phaseId === phaseId))
        .map((record) => ({ record, assessment: normalizeAssessment(
          record.assessment, record) }))
        .filter(({ assessment }) => assessment &&
          Date.parse(assessment.sourceCutoff) <= at &&
          Date.parse(assessment.publicationTimestamp ?? assessment.sourceCutoff) <= at)
        .sort((left, right) => Date.parse(right.assessment.sourceCutoff) -
          Date.parse(left.assessment.sourceCutoff))[0] ?? null;
    },
  });
}

function normalizeAssessment(assessment, record) {
  if (assessment?.schemaVersion === "canonical_confidence_assessment_v2") {
    try {
      validateCanonicalConfidenceAssessment(assessment);
      return assessment;
    } catch {
      return null;
    }
  }
  return adaptV1ConfidenceAssessment(assessment, record);
}
function unavailable(reason, goalId, phaseId) {
  return Object.freeze({
    status: "unavailable", source: "canonical_confidence_unavailable",
    canonicalSeries: false, assessment: null, snapshot: null,
    historyRecord: null, reason, goalId: goalId ?? null, phaseId,
  });
}
