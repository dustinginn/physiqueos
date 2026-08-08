import { describe, expect, it } from "vitest";
import {
  createFounderBuildLeanMassPhaseRepairPlan,
  projectFounderBuildLeanMassPhaseCorrection,
  resolveCommittedPhaseContext,
} from "./FounderPhaseCorrectionService";
import { normalizeAuthoredGoalPhases } from "../models/authoredGoalPhase";
import { evaluatePhaseReviewEligibility } from "./PhaseReviewEligibilityService";

function goal() {
  return {
    id: "goal_transition_live_goal_visible_abs_at_rest_test",
    userId: "user_founder_001", type: "build_lean_mass", title: "Build Lean Mass",
    primary: true, status: "active", timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
    phases: [
      { id: "p1", goalId: "goal_transition_live_goal_visible_abs_at_rest_test", name: "Establish Maintenance", purpose: "Establish maintenance.", order: 0, status: "active", startDate: "2026-07-20", timingMode: "fixed_duration", duration: { value: 4, unit: "weeks" }, transitionPolicy: "evidence_review", successCriteria: [], guardrails: [] },
      { id: "p2", goalId: "goal_transition_live_goal_visible_abs_at_rest_test", name: "Lean Mass Build", purpose: "Build lean mass.", order: 1, status: "upcoming", startDate: null, targetDate: "2026-10-31", timingMode: "target_date", transitionPolicy: "manual_review", successCriteria: [], guardrails: [] },
    ],
  };
}

describe("Founder phase correction", () => {
  it("builds a deterministic, read-only July 19 / August 15 repair", () => {
    const source = goal(); const before = structuredClone(source);
    const first = createFounderBuildLeanMassPhaseRepairPlan(source);
    const second = createFounderBuildLeanMassPhaseRepairPlan(source);
    expect(first.afterFingerprint).toBe(second.afterFingerprint);
    expect(first.persistenceAuthorized).toBe(false);
    expect(source).toEqual(before);
    expect(first.candidate.timeline.startDate).toBe("2026-07-19");
    expect(first.candidate.phases[0]).toMatchObject({ startedAt: "2026-07-19", plannedReviewAt: "2026-08-15", status: "active", completedAt: null });
    expect(first.candidate.phases[1]).toMatchObject({ status: "planned", startedAt: null, projectedNextPhaseStart: "2026-08-16" });
  });

  it("keeps Phase 1 committed after the review date until a decision", () => {
    const context = resolveCommittedPhaseContext(goal(), { asOf: "2026-08-20" });
    expect(context.activePhase).toMatchObject({ id: "p1", status: "active", effectiveReviewState: "due" });
    expect(context.plannedPhases[0]).toMatchObject({ id: "p2", status: "planned" });
    expect(projectFounderBuildLeanMassPhaseCorrection(goal()).phases[0].completedAt).toBeNull();
  });

  it("represents the August 15 Founder DEXA as a canonical milestone", () => {
    const projected = projectFounderBuildLeanMassPhaseCorrection(goal());
    const phase = projected.phases[0];
    expect(phase.reviewMilestone).toMatchObject({
      goalId: projected.id, phaseId: phase.id, eligibleArtifactTypes: ["dexa_event"],
      earliestEligibleDate: "2026-08-15", earlyReviewPolicy: "prohibited",
      reviewRequired: true, decisionRequired: true, consumed: false,
    });
    const input = { activeGoal: projected, activePhase: phase,
      reviewMilestone: phase.reviewMilestone,
      currentArtifact: { id: "aug-15-dexa", evidenceTypes: ["dexa_event"] },
      artifactType: "dexa_event", eventIdentity: "aug-15-dexa",
      evidenceIdentity: "scan-aug-15", publicationTimestamp: "2026-08-15T18:00:00.000Z",
      currentDate: "2026-08-15", reviewState: "due", decisionHistory: [] };
    expect(evaluatePhaseReviewEligibility({ ...input, artifactTimestamp: "2026-08-15" }))
      .toMatchObject({ eligible: true, authorizationAllowed: true });
    expect(evaluatePhaseReviewEligibility({ ...input, artifactTimestamp: "2026-08-14" }))
      .toMatchObject({ eligible: false, reason: "before_earliest_eligible_date" });
  });

  it("round-trips the additive lifecycle fields through legacy Goal editing", () => {
    const projected = projectFounderBuildLeanMassPhaseCorrection(goal());
    const persisted = normalizeAuthoredGoalPhases(projected.phases, {
      goalId: projected.id,
      existingPhases: projected.phases,
      now: new Date("2026-08-02T12:00:00Z"),
    });
    expect(persisted[0]).toMatchObject({ startedAt: "2026-07-19", plannedReviewAt: "2026-08-15", completionDecisionRequired: true });
    expect(persisted[1]).toMatchObject({ status: "planned", projectedNextPhaseStart: "2026-08-16" });
  });

  it("never projects the pre-transition correction over a committed Phase 2 activation", () => {
    const transitioned = goal();
    transitioned.currentPhaseId = "p2";
    transitioned.phases[0] = { ...transitioned.phases[0], status: "completed",
      completedAt: "2026-08-15T19:00:00.000Z" };
    transitioned.phases[1] = { ...transitioned.phases[1], status: "active",
      startedAt: "2026-08-16", startDate: "2026-08-16" };
    const projected = projectFounderBuildLeanMassPhaseCorrection(transitioned);
    expect(projected.currentPhaseId).toBe("p2");
    expect(projected.phases[0].status).toBe("completed");
    expect(projected.phases[1]).toMatchObject({ status: "active",
      startedAt: "2026-08-16" });
  });
});
