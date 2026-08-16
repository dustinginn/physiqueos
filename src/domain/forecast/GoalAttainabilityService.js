export const GOAL_ATTAINABILITY_VERSION = "goal_attainability_v1";

export function evaluateGoalAttainability({ goalContract, timeline } = {}) {
  const progress = goalContract?.quantitativeProgress ?? null;
  if (progress?.status !== "available") {
    return unavailable(progress?.uncertainty?.[0] ?? "quantitative_progress_unavailable",
      progress, timeline);
  }
  if (timeline?.constraintType !== "firm") {
    return unavailable("completion_timing_not_firm", progress, timeline);
  }
  const objectiveId = goalContract.objectives?.find((item) => item.required !== false)
    ?.objectiveId ?? null;
  const segments = goalContract.expectedTrajectory?.segments ?? [];
  const activeNow = activeSegment(segments, timeline?.evidenceCutoff);
  const active = activeNow ?? upcomingSegment(segments, timeline?.evidenceCutoff);
  const preActivation = !activeNow && Boolean(active);
  const activeRange = rangeFor(active, objectiveId);
  if (!active || !activeRange) {
    return unavailable("authorized_expected_trajectory_unavailable", progress, timeline);
  }

  const scope = active.progressScope === "phase" ? "phase" : "goal";
  const observed = scope === "phase" ? progress.phase?.cumulativeProgress :
    progress.cumulativeProgress;
  if (!Number.isFinite(Number(observed))) {
    return unavailable(scope === "phase" ? "phase_progress_baseline_unavailable" :
      "goal_progress_unavailable", progress, timeline);
  }
  const trajectoryPosition = preActivation ? "not_started" :
    position(Number(observed), activeRange);
  const terminalRange = terminalObjectiveRange(segments, objectiveId, scope);
  const remainingEnvelope = terminalRange ? Math.max(0,
    Number(terminalRange.max) - Number(observed)) : null;
  const remainingFeasibility = remainingEnvelope == null ? "unknown" :
    progress.remainingGap <= remainingEnvelope + 0.001 ? "inside_expected_envelope" :
      "outside_expected_envelope";
  const paceState = pace({ trajectoryPosition, observed,
    remainingFeasibility, timeline, remainingGap: progress.remainingGap,
    preActivation, cumulativeGoalProgress: progress.cumulativeProgress });
  const outlook = timeline.phase === "overdue" && progress.remainingGap > 0
    ? "unlikely" : ["positive_but_behind", "stalled", "regressing"]
      .includes(paceState) || remainingFeasibility === "outside_expected_envelope"
      ? "at_risk" : paceState === "unassessable" ? "uncertain" : "feasible";

  return freeze({
    schemaVersion: GOAL_ATTAINABILITY_VERSION,
    status: "assessed",
    outlook,
    paceState,
    progressScope: scope,
    objectiveId,
    activeTrajectorySegmentId: active.segmentId,
    trajectoryPhase: preActivation ? "upcoming" : "current",
    activeExpectationId: activeRange.expectationId ?? null,
    observedProgress: round(observed),
    expectedProgressRange: rangeSnapshot(activeRange),
    cumulativeGoalProgress: progress.cumulativeProgress,
    requiredGoalProgress: progress.requiredProgress,
    remainingGoalGap: progress.remainingGap,
    progressFraction: progress.progressFraction,
    remainingExpectedCapacity: remainingEnvelope == null ? null : round(remainingEnvelope),
    remainingFeasibility,
    baselineRef: progress.baseline?.sourceRef ?? null,
    currentMeasurementRef: progress.current?.sourceRef ?? null,
    phaseBaselineRef: progress.phase?.baseline?.sourceRef ?? null,
    timeline: timelineSnapshot(timeline),
    rationale: rationale(paceState, remainingFeasibility),
  });
}

function activeSegment(segments, cutoff) {
  const at = dateOnly(cutoff);
  if (!at) return null;
  return segments.find((item) => {
    const start = dateOnly(item.startBoundary);
    const end = dateOnly(item.endBoundary);
    return (!start || start <= at) && (!end || end >= at);
  }) ?? null;
}

function upcomingSegment(segments, cutoff) {
  const at = dateOnly(cutoff);
  if (!at) return null;
  return [...segments].filter((item) => {
    const start = dateOnly(item.startBoundary);
    return start && start > at;
  }).sort((left, right) => String(left.startBoundary)
    .localeCompare(String(right.startBoundary)))[0] ?? null;
}

function rangeFor(segment, objectiveId) {
  return segment?.expectedObjectiveRanges?.find((item) =>
    item.objectiveRef === objectiveId && finiteRange(item)) ?? null;
}

function terminalObjectiveRange(segments, objectiveId, scope) {
  return [...segments].reverse().map((segment) => ({ segment,
    range: rangeFor(segment, objectiveId) })).find(({ segment, range }) =>
    range && (segment.progressScope === "phase" ? "phase" : "goal") === scope)?.range ?? null;
}

function position(value, range) {
  if (value > Number(range.max)) return "ahead";
  if (value >= Number(range.min)) return "on_expected_trajectory";
  return "below_expected_trajectory";
}

function pace({ trajectoryPosition, observed, remainingFeasibility, timeline,
  remainingGap, preActivation, cumulativeGoalProgress }) {
  if (timeline?.phase === "overdue" && remainingGap > 0) return "regressing";
  if (preActivation) {
    if (remainingFeasibility !== "outside_expected_envelope") return "unassessable";
    return Number(cumulativeGoalProgress) > 0 ? "positive_but_behind" : "stalled";
  }
  if (trajectoryPosition === "ahead") return "ahead";
  if (trajectoryPosition === "on_expected_trajectory" &&
      remainingFeasibility !== "outside_expected_envelope") return "on_expected_trajectory";
  if (observed < 0) return "regressing";
  if (observed === 0) return "stalled";
  return "positive_but_behind";
}

function unavailable(reason, progress, timeline) {
  return freeze({
    schemaVersion: GOAL_ATTAINABILITY_VERSION,
    status: "unassessable",
    outlook: "uncertain",
    paceState: "unassessable",
    progressScope: null,
    objectiveId: null,
    activeTrajectorySegmentId: null,
    trajectoryPhase: null,
    activeExpectationId: null,
    observedProgress: null,
    expectedProgressRange: null,
    cumulativeGoalProgress: progress?.cumulativeProgress ?? null,
    requiredGoalProgress: progress?.requiredProgress ?? null,
    remainingGoalGap: progress?.remainingGap ?? null,
    progressFraction: progress?.progressFraction ?? null,
    remainingExpectedCapacity: null,
    remainingFeasibility: "unknown",
    baselineRef: progress?.baseline?.sourceRef ?? null,
    currentMeasurementRef: progress?.current?.sourceRef ?? null,
    phaseBaselineRef: progress?.phase?.baseline?.sourceRef ?? null,
    timeline: timelineSnapshot(timeline),
    rationale: reason,
  });
}

function timelineSnapshot(timeline = {}) {
  return {
    constraintType: timeline.constraintType ?? "unknown",
    totalDays: timeline.totalDays ?? null,
    elapsedDays: timeline.elapsedDays ?? null,
    remainingDays: timeline.remainingDays ?? null,
    elapsedFraction: timeline.elapsedFraction ?? null,
    remainingFraction: timeline.remainingFraction ?? null,
  };
}
function rangeSnapshot(range) { return { min: Number(range.min), max: Number(range.max),
  unit: range.unit ?? null }; }
function finiteRange(range) { return Number.isFinite(Number(range?.min)) &&
  Number.isFinite(Number(range?.max)) && Number(range.min) <= Number(range.max); }
function rationale(paceState, feasibility) { return feasibility === "outside_expected_envelope"
  ? "remaining_gap_exceeds_authorized_expected_envelope" : `pace_${paceState}`; }
function dateOnly(value) { return String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null; }
function round(value, digits = 3) { return Number(Number(value).toFixed(digits)); }
function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze); return Object.freeze(value); }
