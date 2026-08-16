import { describe, expect, it } from "vitest";
import { resolveCanonicalPhaseReviewArtifactIdentity } from
  "./CanonicalPhaseReviewArtifactIdentityService";

describe("canonical Phase Review artifact identity", () => {
  it("resolves a production-shaped historical artifact without redundant top-level identity", () => {
    const value = fixture();
    expect(value.artifact.goalId).toBeUndefined();
    expect(value.artifact.phaseId).toBeUndefined();
    expect(resolve(value)).toEqual({
      schemaVersion: "canonical_phase_review_artifact_identity_v1",
      goalId: "goal-a",
      phaseId: "phase-a",
    });
  });

  it("preserves already-canonical top-level identity when every trusted source agrees", () => {
    const value = fixture();
    value.artifact.goalId = "goal-a";
    value.artifact.phaseId = "phase-a";
    expect(resolve(value)).toMatchObject({ goalId: "goal-a", phaseId: "phase-a" });
  });

  it.each([
    ["top-level Goal", (value) => { value.artifact.goalId = "goal-b"; },
      "goal_binding_mismatch"],
    ["top-level phase", (value) => { value.artifact.phaseId = "phase-b"; },
      "phase_binding_mismatch"],
    ["authorization Goal", (value) => { value.authorization.goalId = "goal-b"; },
      "goal_binding_mismatch"],
    ["authorization phase", (value) => { value.authorization.currentPhaseId = "phase-b"; },
      "phase_binding_mismatch"],
    ["Phase Review action Goal", (value) => {
      value.artifact.briefing.phaseReview.actionRequest.goalId = "goal-b";
    }, "goal_binding_mismatch"],
    ["Phase Review action phase", (value) => {
      value.artifact.briefing.phaseReview.actionRequest.currentPhaseId = "phase-b";
    }, "phase_binding_mismatch"],
    ["DEXA context Goal", (value) => {
      value.artifact.briefing.dexaEventNarrative.context.activeGoal.id = "goal-b";
    }, "goal_binding_mismatch"],
    ["DEXA context phase", (value) => {
      value.artifact.briefing.dexaEventNarrative.context.activePhase.id = "phase-b";
    }, "phase_binding_mismatch"],
    ["milestone Goal", (value) => {
      value.artifact.briefing.dexaEventNarrative.context.activePhase
        .reviewMilestone.goalId = "goal-b";
    }, "goal_binding_mismatch"],
    ["milestone phase", (value) => {
      value.artifact.briefing.dexaEventNarrative.context.activePhase
        .reviewMilestone.phaseId = "phase-b";
    }, "phase_binding_mismatch"],
    ["Confidence Goal", (value) => {
      value.artifact.briefing.dexaEventNarrative.goalConfidence
        .assessmentContext.goalId = "goal-b";
    }, "goal_binding_mismatch"],
    ["Confidence phase", (value) => {
      value.artifact.briefing.dexaEventNarrative.goalConfidence
        .assessmentContext.phaseId = "phase-b";
    }, "phase_binding_mismatch"],
  ])("rejects a contradictory %s identity", (_label, arrange, reason) => {
    const value = fixture();
    arrange(value);
    expect(() => resolve(value)).toThrow(expect.objectContaining({
      code: "PHASE_REVIEW_ARTIFACT_INELIGIBLE", reason,
    }));
  });

  it.each([
    ["Goal", (value) => { delete value.authorization.goalId; },
      "goal_identity_unresolved"],
    ["phase", (value) => { delete value.authorization.currentPhaseId; },
      "phase_identity_unresolved"],
  ])("rejects missing authorization %s identity even when context remains", (
    _label, arrange, reason
  ) => {
    const value = fixture();
    arrange(value);
    expect(() => resolve(value)).toThrow(expect.objectContaining({ reason }));
  });

  it("rejects when no trusted Goal identity remains", () => {
    const value = fixture();
    delete value.authorization.goalId;
    delete value.artifact.briefing.phaseReview.actionRequest.goalId;
    delete value.artifact.briefing.dexaEventNarrative.context.activeGoal.id;
    delete value.artifact.briefing.dexaEventNarrative.context.activePhase
      .reviewMilestone.goalId;
    delete value.artifact.briefing.dexaEventNarrative.goalConfidence.assessmentContext.goalId;
    expect(() => resolve(value)).toThrow(expect.objectContaining({
      reason: "goal_identity_unresolved",
    }));
  });

  it("rejects when no trusted phase identity remains", () => {
    const value = fixture();
    delete value.authorization.currentPhaseId;
    delete value.artifact.briefing.phaseReview.actionRequest.currentPhaseId;
    delete value.artifact.briefing.phaseReview.currentPhase.id;
    delete value.artifact.briefing.dexaEventNarrative.context.activePhase.id;
    delete value.artifact.briefing.dexaEventNarrative.context.activePhase
      .reviewMilestone.phaseId;
    delete value.artifact.briefing.dexaEventNarrative.goalConfidence.assessmentContext.phaseId;
    expect(() => resolve(value)).toThrow(expect.objectContaining({
      reason: "phase_identity_unresolved",
    }));
  });

  it("rejects a Goal that is absent from the canonical collection", () => {
    const value = fixture();
    setGoal(value, "missing-goal");
    expect(() => resolve(value)).toThrow(expect.objectContaining({
      reason: "goal_binding_mismatch",
    }));
  });

  it("rejects a phase outside the resolved Goal or outside its current phase pointer", () => {
    const missing = fixture();
    setPhase(missing, "phase-b");
    expect(() => resolve(missing)).toThrow(expect.objectContaining({
      reason: "phase_binding_mismatch",
    }));
    const stale = fixture();
    stale.store.goals[0].phases.push({ id: "phase-b", goalId: "goal-a", status: "active" });
    setPhase(stale, "phase-b");
    expect(() => resolve(stale)).toThrow(expect.objectContaining({
      reason: "phase_binding_mismatch",
    }));
  });

  it("rejects malformed present identity instead of treating it as missing", () => {
    const value = fixture();
    value.artifact.goalId = "";
    expect(() => resolve(value)).toThrow(expect.objectContaining({
      reason: "trusted_context_malformed",
    }));
  });
});

function fixture() {
  const goalId = "goal-a";
  const phaseId = "phase-a";
  const authorization = { goalId, currentPhaseId: phaseId };
  const artifact = { id: "artifact-a", briefing: {
    phaseReview: { currentPhase: { id: phaseId },
      actionRequest: { goalId, currentPhaseId: phaseId } },
    dexaEventNarrative: {
      context: { activeGoal: { id: goalId }, activePhase: { id: phaseId,
        reviewMilestone: { goalId, phaseId } } },
      goalConfidence: { assessmentContext: { goalId, phaseId } },
    },
  } };
  const store = { goals: [{ id: goalId, currentPhaseId: phaseId,
    phases: [{ id: phaseId, goalId, status: "active" }] }] };
  return { store, artifact, authorization };
}
function resolve(value) {
  return resolveCanonicalPhaseReviewArtifactIdentity(value);
}
function setGoal(value, goalId) {
  value.authorization.goalId = goalId;
  value.artifact.briefing.phaseReview.actionRequest.goalId = goalId;
  value.artifact.briefing.dexaEventNarrative.context.activeGoal.id = goalId;
  value.artifact.briefing.dexaEventNarrative.context.activePhase.reviewMilestone.goalId = goalId;
  value.artifact.briefing.dexaEventNarrative.goalConfidence.assessmentContext.goalId = goalId;
}
function setPhase(value, phaseId) {
  value.authorization.currentPhaseId = phaseId;
  value.artifact.briefing.phaseReview.actionRequest.currentPhaseId = phaseId;
  value.artifact.briefing.phaseReview.currentPhase.id = phaseId;
  value.artifact.briefing.dexaEventNarrative.context.activePhase.id = phaseId;
  value.artifact.briefing.dexaEventNarrative.context.activePhase.reviewMilestone.phaseId = phaseId;
  value.artifact.briefing.dexaEventNarrative.goalConfidence.assessmentContext.phaseId = phaseId;
}
