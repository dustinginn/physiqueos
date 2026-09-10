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
    const selection = selectAuthoritativeAssessment({
      records: sourceStore.goalConfidenceHistory ?? [],
      goalId,
      userFacingOnly: true,
    });
    if (selection.ambiguous) return unavailable(
      "canonical_publication_chronology_ambiguous", goalId, null);
    const winner = selection.selected;
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
      const selection = selectAuthoritativeAssessment({
        records: listHistory(goalId, phaseId),
        goalId,
        phaseId,
        cutoff: at,
      });
      if (selection.ambiguous) return null;
      const selected = selection.selected;
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
    getAssessmentForEvidenceCutoff({ goalId, phaseId = null, cutoff } = {}) {
      const at = Date.parse(cutoff);
      if (!Number.isFinite(at)) return null;
      const selection = selectAuthoritativeAssessment({
        records: listHistory(goalId, phaseId),
        goalId,
        phaseId,
        cutoff: at,
        allowPublicationAfterCutoff: true,
        orderByEvidenceCutoff: true,
      });
      if (selection.ambiguous || !selection.selected) return null;
      return Object.freeze({
        ...selection.selected,
        historyRecordId: selection.selected.record.id,
        selectedAtOrBefore: new Date(at).toISOString(),
        source: "canonical_confidence_evidence_cutoff",
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

function selectAuthoritativeAssessment({
  records,
  goalId,
  phaseId = null,
  cutoff = null,
  userFacingOnly = false,
  allowPublicationAfterCutoff = false,
  orderByEvidenceCutoff = false,
}) {
  let candidates = records
    .filter((record) => record.goalId === goalId &&
      (phaseId == null || record.phaseId === phaseId))
    .map((record) => ({
      record,
      assessment: normalizeAssessment(record.assessment, record),
    }))
    .filter(({ record, assessment }) => assessment &&
      (!userFacingOnly || publishesUserFacingConfidence(
        record.publisherType ?? assessment.publisherType
      )));
  if (cutoff != null) {
    candidates = candidates.filter(({ record, assessment }) =>
      sourceCutoffTime(assessment) <= cutoff &&
      (allowPublicationAfterCutoff ||
        publicationTimeOf(record, assessment) <= cutoff)
    );
  }
  const superseded = new Set(candidates.map(({ assessment }) =>
    assessment.replacementLineage?.replacesAssessmentId
  ).filter(Boolean));
  candidates = candidates.filter(({ assessment }) => !superseded.has(assessment.id));
  candidates.sort(orderByEvidenceCutoff
    ? compareEvidenceChronology
    : comparePublicationChronology);
  if (hasAmbiguousPublication(candidates[0], candidates[1])) {
    return { selected: null, ambiguous: true };
  }
  return { selected: candidates[0] ?? null, ambiguous: false };
}

function compareEvidenceChronology(left, right) {
  return sourceCutoffTime(right.assessment) - sourceCutoffTime(left.assessment) ||
    publicationTimeOf(right.record, right.assessment) -
      publicationTimeOf(left.record, left.assessment) ||
    persistedTime(right.record) - persistedTime(left.record) ||
    String(right.assessment.id).localeCompare(String(left.assessment.id));
}

function comparePublicationChronology(left, right) {
  return publicationTimeOf(right.record, right.assessment) -
      publicationTimeOf(left.record, left.assessment) ||
    sourceCutoffTime(right.assessment) - sourceCutoffTime(left.assessment) ||
    persistedTime(right.record) - persistedTime(left.record) ||
    String(right.assessment.id).localeCompare(String(left.assessment.id));
}

function hasAmbiguousPublication(left, right) {
  if (!left || !right) return false;
  return publicationTimeOf(left.record, left.assessment) ===
      publicationTimeOf(right.record, right.assessment) &&
    sourceCutoffTime(left.assessment) === sourceCutoffTime(right.assessment) &&
    left.assessment.publisherType === right.assessment.publisherType &&
    left.assessment.briefingArtifactId === right.assessment.briefingArtifactId &&
    left.assessment.evidenceWindowId === right.assessment.evidenceWindowId &&
    left.assessment.id !== right.assessment.id;
}

function sourceCutoffTime(assessment) {
  const parsed = Date.parse(assessment?.sourceCutoff ?? assessment?.evidenceCutoff);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function persistedTime(record) {
  const parsed = Date.parse(record?.persistedAt);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}
