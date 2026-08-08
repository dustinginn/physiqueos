import {
  PhaseActivationRecordStatus,
  activationRecordFingerprint,
  deepFreeze,
  immutablePhaseRecordContent,
  normalizePhaseSourceLineage,
  required,
  validatePhaseRecordEnvelope,
} from "./phaseActivationRecord";

export const PHASE_EXPECTED_TRAJECTORY_SCHEMA_VERSION = "phase_expected_trajectory_v1";
export const REQUIRED_TRAJECTORY_MILESTONE_TYPES = Object.freeze([
  "phase_starting_forecast", "first_phase_cadence_review", "first_post_transition_photo_event",
  "objective_comparison", "mid_phase_review", "final_goal_assessment",
]);

export function createPhaseExpectedTrajectory(input = {}) {
  const trajectoryId = required(input.trajectoryId ?? input.id, "trajectoryId");
  const record = {
    schemaVersion: PHASE_EXPECTED_TRAJECTORY_SCHEMA_VERSION,
    id: trajectoryId,
    trajectoryId,
    goalId: required(input.goalId ?? input.GoalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    revision: Number(input.revision ?? 0),
    status: input.status ?? PhaseActivationRecordStatus.DRAFT,
    createdAt: new Date(input.createdAt).toISOString(),
    acceptedAt: input.acceptedAt ?? null,
    acceptedBy: input.acceptedBy ?? null,
    acceptanceId: input.acceptanceId ?? null,
    acceptanceIdempotencyKey: input.acceptanceIdempotencyKey ?? null,
    acceptedRevision: input.acceptedRevision ?? null,
    rejectedAt: input.rejectedAt ?? null,
    rejectedBy: input.rejectedBy ?? null,
    supersededAt: input.supersededAt ?? null,
    supersededBy: input.supersededBy ?? null,
    supersedesId: input.supersedesId ?? null,
    sourceLineage: normalizePhaseSourceLineage(input.sourceLineage),
    timeline: structuredClone(input.timeline),
    objectiveTrajectory: structuredClone(input.objectiveTrajectory),
    guardrailTrajectory: structuredClone(input.guardrailTrajectory),
    weightTrajectory: structuredClone(input.weightTrajectory),
    trainingTrajectory: structuredClone(input.trainingTrajectory),
    milestones: structuredClone(input.milestones),
    expectedTrajectory: structuredClone(input.expectedTrajectory),
  };
  record.contentFingerprint = activationRecordFingerprint(immutablePhaseRecordContent(record));
  validatePhaseExpectedTrajectory(record);
  return deepFreeze(record);
}

export function validatePhaseExpectedTrajectory(record, options = {}) {
  validatePhaseRecordEnvelope(record, {
    idField: "trajectoryId", schemaVersion: PHASE_EXPECTED_TRAJECTORY_SCHEMA_VERSION,
    expectedGoalId: options.expectedGoalId, expectedPhaseId: options.expectedPhaseId,
  });
  if (!record.timeline?.projectedStartRule || !record.timeline?.goalTargetDate ||
      record.timeline.preActivationEvidenceOwnership !== "none") {
    throw new TypeError("Expected Trajectory timeline is incomplete.");
  }
  if (record.objectiveTrajectory?.fullTargetIsPromise !== false ||
      record.objectiveTrajectory?.partialProgressHasValue !== true ||
      record.objectiveTrajectory?.repeatValidationRequired !== true) {
    throw new TypeError("Objective trajectory must preserve uncertainty and repeat validation.");
  }
  if (record.guardrailTrajectory?.independentFromObjective !== true ||
      !record.guardrailTrajectory?.acceptedRange) {
    throw new TypeError("Guardrail trajectory must remain independent from Objective progress.");
  }
  if (!Array.isArray(record.milestones)) throw new TypeError("Trajectory milestones are required.");
  for (const type of REQUIRED_TRAJECTORY_MILESTONE_TYPES) {
    if (!record.milestones.some((item) => item.type === type)) {
      throw new TypeError(`Trajectory milestone ${type} is required.`);
    }
  }
  for (const milestone of record.milestones) {
    for (const key of ["milestoneId", "type", "expectedTiming", "purpose",
      "expectedEvidence", "uncertaintyReduced"]) {
      if (!milestone[key] || (Array.isArray(milestone[key]) && milestone[key].length === 0)) {
        throw new TypeError(`Trajectory milestone ${key} is required.`);
      }
    }
    if (typeof milestone.canTriggerStrategyReview !== "boolean" ||
        typeof milestone.canSupportCompletion !== "boolean") {
      throw new TypeError("Trajectory milestone decision capabilities must be explicit.");
    }
  }
  const segments = record.expectedTrajectory?.segments;
  if (!Array.isArray(segments) || segments.length === 0) throw new TypeError("Expected Trajectory segments are required.");
  for (const segment of segments) {
    if (!Array.isArray(segment.expectedObjectiveRanges) || segment.expectedObjectiveRanges.length === 0) {
      throw new TypeError("Each trajectory segment requires expected Objective ranges.");
    }
    for (const range of segment.expectedObjectiveRanges) {
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
        throw new TypeError("Expected Objective ranges must be finite ordered ranges.");
      }
    }
  }
  return true;
}
