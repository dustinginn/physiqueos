import { describe, expect, it } from "vitest";
import {
  buildGoalTransitionProtocolReviewHandoff,
  GOAL_TRANSITION_PROTOCOL_REVIEW_ROUTE,
  GOAL_TRANSITION_REVIEW_RETURN_ROUTE,
} from "./goalTransitionProtocolReviewHandoff";

const draft = {
  id: "goal_transition_visible_abs",
  sourceGoalId: "goal_visible_abs",
  primaryObjective: { id: "objective_lean_mass", type: "build_lean_mass", title: "Build Lean Mass" },
  guardrails: [{ id: "guardrail_body_fat", text: "Maintain 8–9% body fat.", accepted: true }],
  evidenceStrategy: { outcomeMeasures: [{ id: "dexa", accepted: true }] },
  operatingState: { value: "calibration", accepted: true },
  supportingObjectives: [{ id: "chest", title: "Chest", accepted: true }],
  briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  openingBaseline: { date: "2026-07-18", leanMass: 147.5 },
  protocolReviews: [{
    id: "review_nutrition",
    protocolId: "nutrition",
    sourceVersionId: "nutrition-v1",
    protocolType: "nutrition",
    selectedDisposition: "modify",
    proposedChanges: {},
  }],
};

describe("Goal Creation to Protocol Review handoff", () => {
  it("uses a stable future destination and review return route", () => {
    const handoff = buildGoalTransitionProtocolReviewHandoff(draft);
    expect(handoff.destination).toBe(GOAL_TRANSITION_PROTOCOL_REVIEW_ROUTE);
    expect(handoff.returnRoute).toBe(GOAL_TRANSITION_REVIEW_RETURN_ROUTE);
  });

  it("retains the accepted goal definition, baseline, and protocol decisions", () => {
    const handoff = buildGoalTransitionProtocolReviewHandoff(draft);
    expect(handoff).toMatchObject({
      transitionDraftId: draft.id,
      completedSourceGoalId: draft.sourceGoalId,
      newGoalDraftId: draft.primaryObjective.id,
      primaryGoal: draft.primaryObjective,
      calibrationState: draft.operatingState,
      briefingCadence: draft.briefingCadence,
      openingEvidenceBaseline: draft.openingBaseline,
      inheritedProtocolReferences: [{
        protocolId: "nutrition",
        sourceVersionId: "nutrition-v1",
      }],
      intendedProtocolDispositions: [{
        protocolId: "nutrition",
        disposition: "modify",
      }],
    });
  });

  it("returns detached context without rewriting historical references", () => {
    const handoff = buildGoalTransitionProtocolReviewHandoff(draft);
    handoff.inheritedProtocolReferences[0].sourceVersionId = "changed";
    handoff.primaryGoal.title = "Changed";
    expect(draft.protocolReviews[0].sourceVersionId).toBe("nutrition-v1");
    expect(draft.primaryObjective.title).toBe("Build Lean Mass");
  });
});
