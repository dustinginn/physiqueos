import { describe, expect, it } from "vitest";
import { createPhaseReviewArtifactPackage } from "./PhaseReviewArtifactService";
import { resolvePhaseReviewArtifactRead } from "./PhaseReviewArtifactReadService";

describe("Phase Review artifact generation and read model", () => {
  it("generates a milestone-bound payload and authorization for an eligible DEXA", () => {
    const value = createPhaseReviewArtifactPackage({ context: context(),
      forecastAssessment: { id: "forecast", goalForecastStatus: "forecast_likely" },
      narrativeAssessment: { id: "narrative", recommendedCoachingDirection: {
        state: "stay_the_course", text: "The evidence supports the planned transition." } },
      confidenceAssessment: { id: "confidence" } });
    expect(value.presentation).toMatchObject({ eligible: true, unresolved: true,
      milestoneId: "milestone", unresolvedReviewId: "review",
      recommendation: "begin_next_phase" });
    expect(value.authorization).toMatchObject({ eligible: true,
      designatedArtifactType: "dexa_event", milestoneId: "milestone",
      unresolvedReviewId: "review", consumed: false });
    expect(value.binding).toMatchObject({ artifactType: "dexa_event",
      artifactIdentity: "artifact", evidenceIdentity: "scan" });
    expect(value.presentation.actionRequest).toMatchObject({ milestoneId: "milestone",
      unresolvedReviewId: "review", originatingArtifactId: "artifact" });
  });

  it("generates no payload without an eligible milestone", () => {
    expect(createPhaseReviewArtifactPackage({ context: { ...context(),
      artifactType: "weekly" } })).toBeNull();
  });

  it("renders active controls only for unresolved authorization and resolved history read-only", () => {
    const generated = createPhaseReviewArtifactPackage({ context: context() });
    const artifact = { id: "artifact", briefing: { phaseReview: generated.presentation },
      phaseReviewAuthorization: generated.authorization };
    expect(resolvePhaseReviewArtifactRead({ artifact })).toMatchObject({ readOnly: false });
    expect(resolvePhaseReviewArtifactRead({ artifact: { ...artifact,
      phaseReviewAuthorization: { ...artifact.phaseReviewAuthorization,
        milestoneId: "different-milestone" } } })).toBeNull();
    expect(resolvePhaseReviewArtifactRead({ artifact, decisionHistory: [{
      decisionId: "decision", milestoneId: "milestone", unresolvedReviewId: "review",
    }] })).toMatchObject({ readOnly: true, review: { eligible: false, unresolved: false,
      actionRequest: null } });
  });

  it("re-evaluates an unconsumed review without rewriting its published recommendation", () => {
    const generated = createPhaseReviewArtifactPackage({ context: context() });
    const artifact = { id: "artifact", trigger: { evidenceType: "dexa", evidenceId: "scan" },
      briefing: { phaseReview: generated.presentation, dexaEventNarrative: { interpretation: {
        opening: "Measured lean tissue increased 0.8 lb. One scan cannot prove maintenance.",
        fatLoss: "Body fat is below your chosen 8–9% range.",
        supportingEvidence: "Training stayed productive and evidence remained stable.",
      }, goalConfidence: { primaryReason: "Continued observation is required." } } },
      phaseReviewAuthorization: generated.authorization,
      phaseReviewEligibilityBinding: generated.binding };
    const goal = { id: "goal", timeline: { targetDate: "2026-10-31" },
      guardrails: [{ text: "Maintain 8–9% body fat." }], phases: context().activeGoal.phases };
    const result = resolvePhaseReviewArtifactRead({ artifact, store: { revision: 8,
      goals: [goal], dexaScans: [{ id: "scan", measuredAt: "2026-08-15",
        bodyFatPercentage: 7.6 }] }, asOf: "2026-08-15" });
    expect(result.review).toMatchObject({ originalRecommendation: "continue_current_phase",
      recommendation: "begin_next_phase", actionRequest: { expectedStoreRevision: 8 },
      currentRecommendation: { evidenceConclusion: "sufficiently_resolved_to_proceed",
        guardrail: { status: "below", deviationMagnitude: "slight",
          exactMembershipPreserved: true } } });
    expect(artifact.briefing.phaseReview.recommendation).toBe("continue_current_phase");
  });
});

function context() { const phase = { id: "p1", goalId: "goal", name: "Current", order: 0,
  status: "active", revision: 0, completionDecisionRequired: true };
  return { activeGoal: { id: "goal", phases: [phase, { id: "p2", goalId: "goal",
    name: "Next", order: 1, status: "planned" }] }, activePhase: phase,
    reviewMilestone: { schemaVersion: "phase_review_milestone_v1",
      milestoneId: "milestone", goalId: "goal", phaseId: "p1",
      milestoneType: "planned_phase_review", reviewType: "phase_completion_review",
      requiredEvidence: [], eligibleArtifactTypes: ["dexa_event"],
      designatedArtifactIdentity: null, designatedEvidenceIdentity: null,
      earliestEligibleDate: "2026-08-15", latestEligibleDate: null,
      earlyReviewPolicy: "prohibited", reviewRequired: true, unresolvedReviewId: "review",
      resolvedReviewId: null, decisionRequired: true, recommendationRequired: true,
      consumed: false, lineage: [{ type: "test", id: "lineage" }], revision: 0 },
    currentArtifact: { id: "artifact", evidenceTypes: ["dexa_event"],
      evidenceIdentities: ["scan"] }, artifactType: "dexa_event", evidenceIdentity: "scan",
    artifactTimestamp: "2026-08-15", publicationTimestamp: "2026-08-15T18:00:00.000Z",
    currentDate: "2026-08-15", decisionHistory: [], expectedStoreRevision: 7 }; }
