import {
  validateCanonicalConfidenceAssessment,
} from "./CanonicalConfidenceAssessmentModel";
import { adaptV1ConfidenceAssessment } from "./ConfidenceV1CompatibilityAdapter";
import { publishesUserFacingConfidence } from "./ConfidencePublisherRegistry";

export function createCanonicalConfidenceReadService({ store = {}, repository = null } = {}) {
  const sourceStore = store ?? {};

  function listHistory(goalId, phaseId = null) {
    if (repository?.listHistory && phaseId != null) {
      return repository.listHistory(goalId, phaseId);
    }
    return (sourceStore.goalConfidenceHistory ?? []).filter((record) =>
      record.goalId === goalId && (phaseId == null || record.phaseId === phaseId));
  }

  function getCurrent({ goalId, phaseId = null } = {}) {
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
      publisherType: record.publisherType ?? null,
    });
  }

  // The latest user-facing Confidence for a goal, independent of which phase it belongs to:
  // the newest goalConfidenceHistory record whose publisherType is an actual briefing (see
  // ConfidencePublisherRegistry's USER_FACING_CONFIDENCE_PUBLISHER_TYPES). A phase-initialization
  // (Starting Forecast) record is internal Forecast context, never a candidate here.
  function getLatestUserFacingConfidence({ goalId } = {}) {
    const candidates = (sourceStore.goalConfidenceHistory ?? [])
      .filter((record) => record.goalId === goalId && publishesUserFacingConfidence(record.publisherType))
      .map((record) => ({ record, assessment: normalizeAssessment(record.assessment, record) }))
      .filter(({ assessment }) => assessment)
      .sort((left, right) => publicationTimeOf(right.record, right.assessment) -
        publicationTimeOf(left.record, left.assessment));
    const winner = candidates[0];
    if (!winner) return unavailable("canonical_series_unavailable", goalId, null);
    return Object.freeze({
      status: winner.assessment.schemaVersion === "canonical_confidence_assessment_v2"
        ? "canonical_v2" : "canonical_v1_compatibility",
      source: winner.assessment.schemaVersion === "canonical_confidence_assessment_v2"
        ? "canonical_confidence_v2_latest_briefing" : "canonical_pi_v1_latest_briefing",
      canonicalSeries: true,
      assessment: winner.assessment,
      snapshot: null,
      historyRecord: structuredClone(winner.record),
      publisherType: winner.record.publisherType ?? null,
    });
  }

  // The Confidence surface Home/Goal should actually display: the active phase's own current
  // record if a briefing has already published in that phase, otherwise the goal's latest
  // user-facing Confidence from any phase (typically the immediately prior phase's last
  // briefing). This is what keeps Home from jumping to a phase-initialization Starting
  // Forecast the moment a new phase begins, with nothing shown to the user explaining why.
  function getCurrentUserFacing({ goalId, phaseId = null } = {}) {
    const phaseScoped = getCurrent({ goalId, phaseId });
    if (phaseScoped.assessment && publishesUserFacingConfidence(phaseScoped.publisherType)) {
      return phaseScoped;
    }
    return getLatestUserFacingConfidence({ goalId });
  }

  return Object.freeze({
    getCurrent,
    getLatestUserFacingConfidence,
    getCurrentUserFacing,
    getAssessmentAtOrBefore({ goalId, phaseId = null, cutoff } = {}) {
      const at = Date.parse(cutoff);
      if (!Number.isFinite(at)) return null;
      const selected = listHistory(goalId, phaseId)
        .map((record) => ({ record, assessment: normalizeAssessment(
          record.assessment, record) }))
        .filter(({ assessment }) => assessment &&
          Date.parse(assessment.sourceCutoff) <= at &&
          Date.parse(assessment.publicationTimestamp ?? assessment.sourceCutoff) <= at)
        .sort((left, right) => Date.parse(right.assessment.sourceCutoff) -
          Date.parse(left.assessment.sourceCutoff))[0] ?? null;
      if (!selected) return null;
      return Object.freeze({
        ...selected,
        historyRecordId: selected.record.id,
        selectedAtOrBefore: new Date(at).toISOString(),
        source: selected.assessment.schemaVersion ===
          "canonical_confidence_assessment_v2"
          ? "canonical_confidence_v2_history_at_or_before"
          : "canonical_pi_history_at_or_before",
      });
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
    historyRecord: null, reason, goalId: goalId ?? null, phaseId, publisherType: null,
  });
}
function publicationTimeOf(record, assessment) {
  const value = record?.persistedAt ?? assessment?.publicationTimestamp ?? assessment?.sourceCutoff;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}
