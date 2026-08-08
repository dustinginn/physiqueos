import { createHash } from "node:crypto";
import { addLocalDays, canonicalPhaseRevision, isActivePhaseStatus } from
  "../models/canonicalGoalPhase";
import { PhaseReviewUserDecision } from "../models/phaseReviewDecision";
import { validatePhaseStrategy } from "../models/phaseStrategy";
import { validatePhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { createPhase2StartingForecastInputPackage } from
  "./Phase2StartingForecastInputPackageService";
import { evaluatePhaseReviewEligibility } from "./PhaseReviewEligibilityService";

export const PHASE_REVIEW_AUTHORIZATION_VERSION = "phase_review_authorization_v1";
export const PhaseReviewAuthorizationErrorCode = Object.freeze({
  REQUEST_INVALID: "PHASE_REVIEW_ACTION_REQUEST_INVALID",
  FOUNDER_ACTOR_REQUIRED: "PHASE_REVIEW_FOUNDER_ACTOR_REQUIRED",
  GOAL_OWNERSHIP_MISMATCH: "PHASE_REVIEW_GOAL_OWNERSHIP_MISMATCH",
  LIFECYCLE_INELIGIBLE: "PHASE_REVIEW_LIFECYCLE_INELIGIBLE",
  ARTIFACT_INELIGIBLE: "PHASE_REVIEW_ARTIFACT_INELIGIBLE",
  APPROVAL_REQUIRED: "PHASE_REVIEW_EXPLICIT_APPROVAL_REQUIRED",
  APPROVAL_CONSUMED: "PHASE_REVIEW_APPROVAL_CONSUMED",
  EXPECTED_REVISION_MISMATCH: "PHASE_REVIEW_ACTION_EXPECTED_REVISION_MISMATCH",
  EXTENSION_INVALID: "PHASE_REVIEW_EXTENSION_INVALID",
  ACCEPTED_STRATEGY_REQUIRED: "PHASE_REVIEW_ACTION_ACCEPTED_STRATEGY_REQUIRED",
  ACCEPTED_TRAJECTORY_REQUIRED: "PHASE_REVIEW_ACTION_ACCEPTED_TRAJECTORY_REQUIRED",
  STARTING_FORECAST_INCOMPLETE: "PHASE_REVIEW_STARTING_FORECAST_INCOMPLETE",
  REPLAY_CONFLICT: "PHASE_REVIEW_ACTION_REPLAY_CONFLICT",
});

const REQUEST_KEYS = new Set(["goalId", "currentPhaseId", "decisionId", "selectedOutcome",
  "selectedDuration", "selectedReviewAt", "expectedPhaseRevision", "expectedStoreRevision",
  "idempotencyKey", "originatingArtifactId", "approvalId", "approvalToken"]);
REQUEST_KEYS.add("milestoneId");
REQUEST_KEYS.add("unresolvedReviewId");

export function validatePhaseReviewActionRequest(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !REQUEST_KEYS.has(key))) {
    throw authError("REQUEST_INVALID", "Phase Review action request contains unsupported fields.");
  }
  const selectedOutcome = required(input.selectedOutcome, "selectedOutcome");
  if (!Object.values(PhaseReviewUserDecision).includes(selectedOutcome)) {
    throw authError("REQUEST_INVALID", "Phase Review selected outcome is unsupported.");
  }
  const request = {
    goalId: required(input.goalId, "goalId"),
    currentPhaseId: required(input.currentPhaseId, "currentPhaseId"),
    decisionId: required(input.decisionId, "decisionId"),
    selectedOutcome,
    selectedDuration: input.selectedDuration == null ? null : required(input.selectedDuration, "selectedDuration"),
    selectedReviewAt: input.selectedReviewAt == null ? null : date(input.selectedReviewAt, "selectedReviewAt"),
    expectedPhaseRevision: integer(input.expectedPhaseRevision, "expectedPhaseRevision"),
    expectedStoreRevision: integer(input.expectedStoreRevision, "expectedStoreRevision"),
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    originatingArtifactId: required(input.originatingArtifactId, "originatingArtifactId"),
    approvalId: required(input.approvalId, "approvalId"),
    approvalToken: required(input.approvalToken, "approvalToken"),
    milestoneId: required(input.milestoneId, "milestoneId"),
    unresolvedReviewId: required(input.unresolvedReviewId, "unresolvedReviewId"),
  };
  if (selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE &&
      (request.selectedDuration || request.selectedReviewAt)) {
    throw authError("REQUEST_INVALID", "Begin cannot include extension fields.");
  }
  if (selectedOutcome === PhaseReviewUserDecision.EXTEND_CURRENT_PHASE &&
      !["1_week", "2_weeks", "3_weeks", "custom"].includes(request.selectedDuration)) {
    throw authError("EXTENSION_INVALID", "Extension duration must be 1, 2, 3 weeks, or custom.");
  }
  if (request.selectedDuration === "custom" && !request.selectedReviewAt) {
    throw authError("EXTENSION_INVALID", "Custom extension requires a review date.");
  }
  return deepFreeze(request);
}

export function authorizePhaseReviewRequest({ store, request, actor, now = () => new Date() } = {}) {
  if (actor?.id !== "user_founder_001" || store?.user?.id !== actor.id) {
    throw authError("FOUNDER_ACTOR_REQUIRED", "Authenticated Founder actor is required.");
  }
  const goal = (store.goals ?? []).find((item) => item.id === request.goalId);
  if (!goal || goal.userId !== actor.id || goal.status !== "active" || goal.primary !== true) {
    throw authError("GOAL_OWNERSHIP_MISMATCH", "The active primary Goal is not owned by the Founder actor.");
  }
  const existing = findReplay(store, request);
  const artifact = [...(store.dailyBriefings ?? []),
    ...(store.confidenceInitializationArtifacts ?? [])]
    .find((item) => item.id === request.originatingArtifactId);
  const eligibility = artifact?.phaseReviewAuthorization;
  const eligibilityBinding = artifact?.phaseReviewEligibilityBinding;
  if (!artifact || !eligibility || eligibility.eligible !== true ||
      eligibility.goalId !== request.goalId ||
      eligibility.currentPhaseId !== request.currentPhaseId ||
      !Array.isArray(eligibility.allowedOutcomes) ||
      !eligibility.allowedOutcomes.includes(request.selectedOutcome)) {
    throw authError("ARTIFACT_INELIGIBLE", "Originating Phase Review artifact is not eligible.");
  }
  if (!eligibilityBinding || eligibilityBinding.artifactIdentity !== artifact.id) {
    throw authError("ARTIFACT_INELIGIBLE", "Artifact eligibility binding is missing or mismatched.");
  }
  if (eligibility.milestoneId !== request.milestoneId ||
      eligibility.unresolvedReviewId !== request.unresolvedReviewId ||
      eligibility.consumed === true || eligibility.reviewRequired !== true) {
    throw authError("ARTIFACT_INELIGIBLE", "Artifact authorization does not match the unresolved review milestone.");
  }
  if (eligibility.approvalId !== request.approvalId ||
      eligibility.approvalTokenHash !== sha256(request.approvalToken) ||
      eligibility.userDecisionExplicit !== true) {
    throw authError("APPROVAL_REQUIRED", "Explicit artifact-bound approval is required.");
  }
  if (!existing && eligibility.expiresAt && Date.parse(eligibility.expiresAt) <= now().getTime()) {
    throw authError("APPROVAL_REQUIRED", "Phase Review approval expired before execution.");
  }
  const consumed = (store.phaseReviewDecisions ?? []).find((item) =>
    item.originatingArtifactId === artifact.id || item.reasoningLineage?.some((line) =>
      line.type === "phase_review_authorization" && line.id === request.approvalId));
  if (consumed && consumed.decisionId !== request.decisionId) {
    throw authError("APPROVAL_CONSUMED", "Phase Review approval was consumed by another decision.");
  }
  if (existing) return deepFreeze({ replay: true, decision: structuredClone(existing),
    authorization: authorization(existing, actor.id), artifactId: artifact.id });

  if (Number(store.revision ?? 0) !== request.expectedStoreRevision) {
    throw authError("EXPECTED_REVISION_MISMATCH", "Founder-store revision changed after approval.");
  }
  const current = goal.phases?.find((item) => item.id === request.currentPhaseId);
  if (!current || !isActivePhaseStatus(current.status) ||
      canonicalPhaseRevision(current) !== request.expectedPhaseRevision) {
    throw authError("EXPECTED_REVISION_MISMATCH", "Reviewed phase status or revision changed.");
  }
  if (current.completionDecisionRequired === false) {
    throw authError("LIFECYCLE_INELIGIBLE", "The current phase does not require a completion decision.");
  }
  const milestoneEligibility = evaluatePhaseReviewEligibility({
    activeGoal: goal, activePhase: current, reviewMilestone: current.reviewMilestone,
    currentArtifact: { ...artifact, evidenceTypes: [artifactType(artifact)],
      evidenceIdentities: [artifactEvidenceIdentity(artifact)].filter(Boolean) },
    artifactType: artifactType(artifact), evidenceIdentity: artifactEvidenceIdentity(artifact),
    artifactTimestamp: eligibilityBinding.artifactTimestamp ?? artifact.evidenceCutoff ??
      artifact.trigger?.occurredAt ?? artifact.generatedAt,
    publicationTimestamp: eligibilityBinding.publicationTimestamp ?? artifact.generatedAt,
    currentDate: now().toISOString(),
    reviewState: current.reviewState, decisionHistory: store.phaseReviewDecisions ?? [],
  });
  if (!milestoneEligibility.eligible || !milestoneEligibility.authorizationAllowed ||
      milestoneEligibility.designatedReviewIdentity !== request.milestoneId ||
      milestoneEligibility.unresolvedReviewId !== request.unresolvedReviewId ||
      eligibility.designatedArtifactType !== artifactType(artifact) ||
      (eligibility.designatedArtifactIdentity && eligibility.designatedArtifactIdentity !== artifact.id) ||
      (eligibility.designatedEvidenceIdentity &&
        eligibility.designatedEvidenceIdentity !== artifactEvidenceIdentity(artifact))) {
    throw authError("ARTIFACT_INELIGIBLE", "Artifact no longer satisfies the unresolved review milestone.");
  }
  if (eligibility.expectedPhaseRevision !== request.expectedPhaseRevision ||
      eligibility.expectedStoreRevision !== request.expectedStoreRevision) {
    throw authError("EXPECTED_REVISION_MISMATCH", "Approval is not bound to the expected revisions.");
  }
  const next = goal.phases?.find((item) => Number(item.order) === Number(current.order) + 1) ?? null;
  const originalReview = current.originalPlannedReviewAt ??
    current.reviewMilestone?.originatingMilestoneAt ?? current.plannedReviewAt;
  let selectedReviewAt = null;
  let projectedNextPhaseStart = null;
  let expectedStrategyRevision = null;
  let expectedTrajectoryRevision = null;
  if (request.selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE) {
    if (!next || next.status !== "planned" || next.startedAt || next.startDate) {
      throw authError("LIFECYCLE_INELIGIBLE", "The next phase is not planned and unstarted.");
    }
    const strategy = exactlyOneAccepted(store.phaseStrategies, request.goalId, next.id,
      "ACCEPTED_STRATEGY_REQUIRED");
    const trajectory = exactlyOneAccepted(store.phaseExpectedTrajectories, request.goalId, next.id,
      "ACCEPTED_TRAJECTORY_REQUIRED");
    try { validatePhaseStrategy(strategy, { expectedGoalId: goal.id, expectedPhaseId: next.id }); }
    catch (error) { throw authError("ACCEPTED_STRATEGY_REQUIRED", error.message); }
    try { validatePhaseExpectedTrajectory(trajectory, { expectedGoalId: goal.id, expectedPhaseId: next.id }); }
    catch (error) { throw authError("ACCEPTED_TRAJECTORY_REQUIRED", error.message); }
    expectedStrategyRevision = strategy.revision;
    expectedTrajectoryRevision = trajectory.revision;
    projectedNextPhaseStart = addLocalDays(now().toISOString().slice(0, 10), 1);
    const prospective = prospectiveGoal(goal, current, next, projectedNextPhaseStart, now().toISOString());
    try {
      const inputPackage = createPhase2StartingForecastInputPackage({ store, goal: prospective,
        activePhase: prospective.phases.find((item) => item.id === next.id),
        acceptedStrategy: strategy, acceptedTrajectory: trajectory,
        decision: decisionBase({ request, eligibility, actor, current, next, originalReview,
          projectedNextPhaseStart, expectedStrategyRevision, expectedTrajectoryRevision,
          decidedAt: now().toISOString() }) });
      if (!inputPackage.goalBaseline || !inputPackage.latestConfidenceContext) {
        throw new Error("Starting Forecast baseline or canonical Confidence context is missing.");
      }
    } catch (error) {
      throw authError("STARTING_FORECAST_INCOMPLETE", error.message);
    }
  } else {
    selectedReviewAt = resolveExtensionDate(request, current.plannedReviewAt);
    const targetDate = goal.timeline?.targetDate ?? goal.target?.targetDate;
    if (selectedReviewAt <= current.plannedReviewAt || (targetDate && selectedReviewAt > targetDate)) {
      throw authError("EXTENSION_INVALID", "Extension must follow the current review and remain within the Goal timeline.");
    }
    projectedNextPhaseStart = selectedReviewAt;
  }
  const decidedAt = now().toISOString();
  const decision = decisionBase({ request, eligibility, actor, current, next, originalReview,
    selectedReviewAt, projectedNextPhaseStart, expectedStrategyRevision,
    expectedTrajectoryRevision, decidedAt });
  return deepFreeze({ replay: false, decision,
    authorization: authorization(decision, actor.id), artifactId: artifact.id });
}

function decisionBase({ request, eligibility, actor, current, next, originalReview,
  selectedReviewAt = null, projectedNextPhaseStart, expectedStrategyRevision,
  expectedTrajectoryRevision, decidedAt }) {
  return {
    decisionId: request.decisionId, goalId: request.goalId,
    milestoneId: request.milestoneId, unresolvedReviewId: request.unresolvedReviewId,
    currentPhaseId: current.id, nextPhaseId: next?.id ?? null,
    originalPlannedReviewAt: originalReview,
    recommendedOutcome: eligibility.recommendedOutcome,
    recommendedDuration: eligibility.recommendedDuration ?? null,
    recommendedReviewAt: eligibility.recommendedReviewAt ?? null,
    rationale: eligibility.rationale ?? "Authorized Phase Review artifact recommendation.",
    selectedOutcome: request.selectedOutcome,
    selectedDuration: request.selectedOutcome === "extend_current_phase" ? request.selectedDuration : null,
    selectedReviewAt,
    projectedNextPhaseStart,
    decidedAt,
    decisionSource: eligibility.decisionSource ?? "authorized_phase_review_artifact",
    originatingArtifactId: request.originatingArtifactId,
    originatingBriefingId: request.originatingArtifactId,
    originatingForecastId: eligibility.originatingForecastId ?? null,
    originatingInterpretationId: eligibility.originatingInterpretationId ?? null,
    confidenceAssessmentId: eligibility.confidenceAssessmentId ?? null,
    reasoningLineage: [{ id: request.approvalId, type: "phase_review_authorization" },
      ...(eligibility.reasoningLineage ?? [])],
    idempotencyKey: request.idempotencyKey,
    expectedCurrentPhaseStatus: current.status,
    expectedCurrentPhaseRevision: request.expectedPhaseRevision,
    expectedStrategyRevision,
    expectedTrajectoryRevision,
    actorId: actor.id,
  };
}
function artifactType(artifact) {
  if (artifact.phaseReviewEligibilityBinding?.artifactType) {
    return artifact.phaseReviewEligibilityBinding.artifactType;
  }
  if (artifact.trigger?.evidenceType === "dexa") return "dexa_event";
  if (["photo", "photo_session", "progress_photo"].includes(artifact.trigger?.evidenceType)) {
    return "photo_event";
  }
  if (artifact.cadence) return artifact.cadence;
  return artifact.artifactType ?? "unknown";
}
function artifactEvidenceIdentity(artifact) {
  return artifact.phaseReviewEligibilityBinding?.evidenceIdentity ??
    artifact.trigger?.evidenceId ?? artifact.evidenceWindow?.id ?? null;
}
function findReplay(store, request) {
  const matches = (store.phaseReviewDecisions ?? []).filter((item) =>
    item.decisionId === request.decisionId || item.idempotencyKey === request.idempotencyKey);
  if (!matches.length) return null;
  if (matches.length !== 1) throw authError("REPLAY_CONFLICT", "Phase Review replay identity is ambiguous.");
  const item = matches[0];
  if (item.decisionId !== request.decisionId || item.idempotencyKey !== request.idempotencyKey ||
      item.goalId !== request.goalId || item.currentPhaseId !== request.currentPhaseId ||
      item.selectedOutcome !== request.selectedOutcome || item.originatingArtifactId !== request.originatingArtifactId ||
      item.actorId !== "user_founder_001") {
    throw authError("REPLAY_CONFLICT", "Phase Review replay does not match the committed decision.");
  }
  return item;
}
function exactlyOneAccepted(records = [], goalId, phaseId, code) {
  const matches = records.filter((item) => item.goalId === goalId && item.phaseId === phaseId &&
    item.status === "accepted");
  if (matches.length !== 1) throw authError(code, `Exactly one accepted ${code.includes("STRATEGY") ? "Strategy" : "trajectory"} is required.`);
  return matches[0];
}
function resolveExtensionDate(request, currentReview) {
  if (request.selectedDuration === "custom") return request.selectedReviewAt;
  const days = { "1_week": 7, "2_weeks": 14, "3_weeks": 21 }[request.selectedDuration];
  return addLocalDays(currentReview, days);
}
function prospectiveGoal(goal, current, next, start, decidedAt) {
  const value = structuredClone(goal);
  const currentCopy = value.phases.find((item) => item.id === current.id);
  const nextCopy = value.phases.find((item) => item.id === next.id);
  currentCopy.status = "completed"; currentCopy.completedAt = decidedAt;
  nextCopy.status = "active"; nextCopy.startedAt = start; nextCopy.startDate = start;
  nextCopy.projectedNextPhaseStart = null; value.currentPhaseId = next.id;
  value.projectedNextPhaseId = null; value.updatedAt = decidedAt;
  return value;
}
function authorization(decision, actorId) { return { authorized: true,
  scope: "phase_review_decision", decisionId: decision.decisionId, actorId }; }
function sha256(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function authError(shortCode, message) { const error = new Error(message);
  error.name = "PhaseReviewAuthorizationError";
  error.code = PhaseReviewAuthorizationErrorCode[shortCode] ?? shortCode; return error; }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw authError("REQUEST_INVALID", `${field} is required.`); return value.trim(); }
function integer(value, field) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0)
  throw authError("REQUEST_INVALID", `${field} must be a non-negative integer.`); return parsed; }
function date(value, field) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)
  throw authError("REQUEST_INVALID", `${field} must be YYYY-MM-DD.`); return value; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
