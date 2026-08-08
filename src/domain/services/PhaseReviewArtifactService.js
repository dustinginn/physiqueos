import { createHash } from "node:crypto";
import { evaluatePhaseReviewEligibility } from "./PhaseReviewEligibilityService";

export function createPhaseReviewArtifactPackage({ context, forecastAssessment,
  narrativeAssessment, confidenceAssessment } = {}) {
  if (!context?.reviewMilestone) return null;
  const eligibility = evaluatePhaseReviewEligibility(context);
  if (!eligibility.eligible || !eligibility.recommendationAllowed) return null;
  const goal = context.activeGoal;
  const phase = context.activePhase;
  const nextPhase = (goal?.phases ?? []).find((item) =>
    Number(item.order) === Number(phase.order) + 1) ?? null;
  const recommendation = recommend({ forecastAssessment, narrativeAssessment, nextPhase });
  const artifactId = context.currentArtifact?.id ?? context.currentArtifact?.artifactId;
  const milestone = context.reviewMilestone;
  const approvalId = `phase_review_approval|${milestone.unresolvedReviewId}|${artifactId}`;
  const approvalToken = digest(`phase_review_ui|${approvalId}|${context.expectedStoreRevision}`);
  const baseRequest = {
    goalId: goal.id, currentPhaseId: phase.id,
    expectedPhaseRevision: Number(phase.revision ?? 0),
    expectedStoreRevision: Number(context.expectedStoreRevision ?? 0),
    originatingArtifactId: artifactId, approvalId, approvalToken,
    milestoneId: milestone.milestoneId,
    unresolvedReviewId: milestone.unresolvedReviewId,
  };
  const presentation = {
    schemaVersion: "phase_review_presentation_v1", previewOnly: false,
    eligible: true, unresolved: true,
    milestoneId: milestone.milestoneId,
    unresolvedReviewId: milestone.unresolvedReviewId,
    recommendation: recommendation.presentationOutcome,
    recommendationLabel: recommendation.presentationOutcome === "begin_next_phase"
      ? `Begin ${nextPhase?.name ?? "Next Phase"}` : `Continue ${phase.name}`,
    explanation: recommendation.explanation,
    currentPhase: { id: phase.id, name: phase.name,
      shortName: `Phase ${Number(phase.order ?? 0) + 1}` },
    nextPhase: nextPhase ? { id: nextPhase.id, name: nextPhase.name,
      shortName: `Phase ${Number(nextPhase.order ?? 1) + 1}` } : null,
    originalReviewDate: milestone.earliestEligibleDate,
    recommendedDurationDays: 14, nextPhaseReviewIntervalDays: 28,
    durationOptions: [7, 14, 21, "custom"],
    reasoningLineage: lineage(milestone, forecastAssessment, narrativeAssessment),
    decisionSource: "canonical_phase_review_milestone",
    actionRequest: eligibility.authorizationAllowed ? baseRequest : null,
  };
  const authorization = eligibility.authorizationAllowed ? {
    schemaVersion: "phase_review_artifact_authorization_v2",
    eligible: true, approvalId, approvalTokenHash: digest(approvalToken),
    userDecisionExplicit: true, goalId: goal.id, currentPhaseId: phase.id,
    expectedPhaseRevision: Number(phase.revision ?? 0),
    expectedStoreRevision: Number(context.expectedStoreRevision ?? 0),
    allowedOutcomes: ["begin_next_phase", "extend_current_phase"],
    recommendedOutcome: recommendation.authorizationOutcome,
    recommendedDuration: recommendation.authorizationOutcome === "extend_current_phase" ? 14 : null,
    recommendedReviewAt: null, rationale: recommendation.explanation,
    decisionSource: "canonical_phase_review_milestone",
    originatingForecastId: forecastAssessment?.id ?? null,
    originatingInterpretationId: forecastAssessment?.structuredInterpretationId ?? null,
    confidenceAssessmentId: confidenceAssessment?.id ?? null,
    reasoningLineage: lineage(milestone, forecastAssessment, narrativeAssessment),
    milestoneId: milestone.milestoneId,
    unresolvedReviewId: milestone.unresolvedReviewId,
    designatedArtifactType: context.artifactType,
    designatedArtifactIdentity: milestone.designatedArtifactIdentity,
    designatedEvidenceIdentity: milestone.designatedEvidenceIdentity,
    reviewRequired: milestone.reviewRequired,
    consumed: false,
  } : null;
  const binding = {
    schemaVersion: "phase_review_eligibility_binding_v1",
    artifactType: context.artifactType,
    artifactIdentity: artifactId,
    eventIdentity: context.eventIdentity ?? null,
    evidenceIdentity: context.evidenceIdentity ?? null,
    artifactTimestamp: context.artifactTimestamp ?? null,
    publicationTimestamp: context.publicationTimestamp ?? null,
  };
  return deepFreeze({ eligibility, presentation, authorization, binding });
}

function recommend({ forecastAssessment, narrativeAssessment, nextPhase }) {
  const coaching = narrativeAssessment?.recommendedCoachingDirection?.state;
  const continueCurrent = !nextPhase || ["strategy_review_recommended",
    "prepare_adjustment", "continue_calibration"].includes(coaching) ||
    ["forecast_at_risk", "forecast_unlikely"].includes(forecastAssessment?.goalForecastStatus);
  return { presentationOutcome: continueCurrent ? "continue_current_phase" : "begin_next_phase",
    authorizationOutcome: continueCurrent ? "extend_current_phase" : "begin_next_phase",
    explanation: narrativeAssessment?.recommendedCoachingDirection?.text ??
      (continueCurrent ? "Current evidence supports extending this phase before deciding again." :
        "Current evidence supports beginning the next planned phase.") };
}
function lineage(milestone, forecast, narrative) {
  return [...milestone.lineage,
    ...(forecast?.id ? [{ type: "forecast", id: forecast.id }] : []),
    ...(narrative?.id ? [{ type: "narrative", id: narrative.id }] : [])];
}
function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
