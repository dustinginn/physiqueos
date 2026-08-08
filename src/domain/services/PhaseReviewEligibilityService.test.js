import { describe, expect, it } from "vitest";
import { evaluatePhaseReviewEligibility } from "./PhaseReviewEligibilityService";

describe("canonical Phase Review eligibility", () => {
  for (const artifactType of ["dexa_event", "weekly", "monthly", "photo_event", "future_biomarker_review"]) {
    it(`allows contract-designated ${artifactType} artifacts`, () => {
      expect(evaluatePhaseReviewEligibility(scenario({ artifactType,
        eligibleArtifactTypes: [artifactType] }))).toMatchObject({ eligible: true,
        recommendationAllowed: true, authorizationAllowed: true,
        unresolvedReviewId: "review-1", designatedReviewIdentity: "milestone-1" });
    });
  }

  it("rejects routine Phase 2 DEXA when no review milestone exists", () => {
    expect(evaluatePhaseReviewEligibility({ activeGoal: goal(), activePhase: {
      ...phase(), id: "p2", status: "active" }, artifactType: "dexa_event" }))
      .toMatchObject({ eligible: false, reason: "milestone_invalid" });
  });

  it("applies early review policies without artifact-specific branches", () => {
    expect(evaluatePhaseReviewEligibility(scenario({ artifactTimestamp: "2026-08-14" })))
      .toMatchObject({ eligible: false, reason: "before_earliest_eligible_date" });
    expect(evaluatePhaseReviewEligibility(scenario({ artifactTimestamp: "2026-08-14",
      earlyReviewPolicy: "recommendation_only" }))).toMatchObject({ eligible: true,
      recommendationAllowed: true, authorizationAllowed: false });
    expect(evaluatePhaseReviewEligibility(scenario({ artifactTimestamp: "2026-08-14",
      earlyReviewPolicy: "allowed" }))).toMatchObject({ eligible: true,
      authorizationAllowed: true });
    expect(evaluatePhaseReviewEligibility(scenario({ artifactTimestamp: "2026-08-14",
      earlyReviewPolicy: "user_initiated", userInitiatedReview: true })))
      .toMatchObject({ eligible: true, authorizationAllowed: true });
    expect(evaluatePhaseReviewEligibility(scenario({ artifactTimestamp: "2026-08-14",
      earlyReviewPolicy: "evidence_threshold", evidenceThresholdSatisfied: true })))
      .toMatchObject({ eligible: true, authorizationAllowed: true });
  });

  it("rejects wrong designated artifacts, evidence, and consumed reviews", () => {
    expect(evaluatePhaseReviewEligibility(scenario({ designatedArtifactIdentity: "other" })))
      .toMatchObject({ eligible: false, reason: "designated_artifact_mismatch" });
    expect(evaluatePhaseReviewEligibility(scenario({ designatedEvidenceIdentity: "other" })))
      .toMatchObject({ eligible: false, reason: "designated_evidence_mismatch" });
    expect(evaluatePhaseReviewEligibility(scenario({ consumed: true,
      resolvedReviewId: "decision-1" }))).toMatchObject({ eligible: false,
      reason: "review_resolved" });
  });
});

function scenario(overrides = {}) {
  const artifactType = overrides.artifactType ?? "dexa_event";
  const reviewMilestone = milestone({ ...overrides,
    eligibleArtifactTypes: overrides.eligibleArtifactTypes ?? ["dexa_event"] });
  return { activeGoal: goal(), activePhase: phase(), reviewMilestone,
    currentArtifact: { id: "artifact-1", evidenceTypes: [artifactType],
      evidenceIdentities: ["evidence-1"],
      userInitiatedReview: overrides.userInitiatedReview === true,
      evidenceThresholdSatisfied: overrides.evidenceThresholdSatisfied === true },
    artifactType, eventIdentity: "artifact-1", evidenceIdentity: "evidence-1",
    artifactTimestamp: overrides.artifactTimestamp ?? "2026-08-15",
    publicationTimestamp: "2026-08-15T18:00:00.000Z", currentDate: "2026-08-15",
    reviewState: "due", decisionHistory: [] };
}
function goal() { return { id: "goal", phases: [phase(), { id: "p2", goalId: "goal",
  name: "Next", order: 1, status: "planned" }] }; }
function phase() { return { id: "p1", goalId: "goal", name: "Current", order: 0,
  status: "active", revision: 0, completionDecisionRequired: true }; }
function milestone(overrides = {}) { return { schemaVersion: "phase_review_milestone_v1",
  milestoneId: "milestone-1", goalId: "goal", phaseId: "p1",
  milestoneType: "planned_phase_review", reviewType: "phase_completion_review",
  requiredEvidence: [], eligibleArtifactTypes: overrides.eligibleArtifactTypes ?? ["dexa_event"],
  designatedArtifactIdentity: overrides.designatedArtifactIdentity ?? null,
  designatedEvidenceIdentity: overrides.designatedEvidenceIdentity ?? null,
  earliestEligibleDate: "2026-08-15", latestEligibleDate: null,
  earlyReviewPolicy: overrides.earlyReviewPolicy ?? "prohibited", reviewRequired: true,
  unresolvedReviewId: "review-1", resolvedReviewId: overrides.resolvedReviewId ?? null,
  decisionRequired: true, recommendationRequired: true,
  consumed: overrides.consumed === true, lineage: [{ type: "test", id: "lineage" }], revision: 0 }; }
