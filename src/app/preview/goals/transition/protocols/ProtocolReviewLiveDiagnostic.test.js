import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoalProtocolTransitionRepository } from "../../../../../data/repositories/GoalProtocolTransitionRepository";
import { createGoalProtocolTransitionService } from "../../../../../domain/services/GoalProtocolTransitionService";
import { buildProtocolReviewReconciliation } from "../../../../../presentation/protocolReviewGroups";

const diagnostic = vi.hoisted(() => ({
  loadProtocolTransitionPreview: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: diagnostic.revalidatePath }));
vi.mock("./context", () => ({
  loadProtocolTransitionPreview: diagnostic.loadProtocolTransitionPreview,
}));

import { saveProtocolDispositionAction } from "./actions";

const handoff = {
  transitionDraftId: "goal_transition_goal_visible_abs_at_rest",
  completedSourceGoalId: "goal_visible_abs_at_rest",
  newGoalDraftId: "goal_transition_goal_visible_abs_at_rest_objective_lean_mass",
  primaryGoal: {
    id: "goal_transition_goal_visible_abs_at_rest_objective_lean_mass",
    type: "build_lean_mass",
    title: "Build Lean Mass",
  },
  progressMeasurement: {
    predictiveSignals: [{
      id: "goal_transition_goal_visible_abs_at_rest_evidence_scale_weight",
      evidenceType: "scale_weight",
      accepted: true,
    }],
  },
};

function copiedLiveDraft() {
  return {
    id: "protocol_transition_goal_transition_goal_visible_abs_at_rest",
    goalTransitionDraftId: handoff.transitionDraftId,
    pendingGoalDraftId: handoff.newGoalDraftId,
    status: "draft",
    createdAt: "2026-07-19T18:51:47.313Z",
    updatedAt: "2026-07-19T18:51:47.313Z",
    protocolReviews: [{
      id: "protocol_transition_goal_transition_goal_visible_abs_at_rest_review_virtual_weight",
      sourceProtocolId: "virtual_weight",
      sourceVersionId: null,
      protocolType: "weight",
      category: "weight",
      displayName: "Weight Tracking",
      currentSummary: "Daily morning weights interpreted through the weekly trend.",
      currentGoalId: "goal_visible_abs_at_rest",
      intendedDisposition: "replace",
      recommendation: "keep",
      recommendationReason: "Keep the current weight-tracking plan.",
      reviewStatus: "blocked",
      replacementProtocolDraftId: null,
      proposedChanges: {},
      sourceSnapshot: null,
      available: false,
    }],
    protocolDrafts: [],
    completedProtocolIds: [],
    generatedRoutine: [],
    generatedCommitments: [],
    readyForActivation: false,
    handoff,
  };
}

describe("High-risk live Protocol Review diagnostic", () => {
  let productionProtocols;

  beforeEach(() => {
    diagnostic.revalidatePath.mockClear();
    const records = [copiedLiveDraft()];
    productionProtocols = {
      createProtocol: vi.fn(),
      updateProtocol: vi.fn(),
      saveProtocol: vi.fn(),
    };
    const repositories = {
      goalProtocolTransitionDrafts: createGoalProtocolTransitionRepository(records),
      protocols: productionProtocols,
    };
    const service = createGoalProtocolTransitionService({
      repositories,
      now: () => new Date("2026-07-20T01:00:00.000Z"),
    });
    diagnostic.loadProtocolTransitionPreview.mockResolvedValue({
      draft: records[0],
      handoff,
      historicalProtocols: [],
      service,
    });
  });

  it("resolves an unavailable virtual Weight review after the public Keep action and route reload", async () => {
    const reviewId = "protocol_transition_goal_transition_goal_visible_abs_at_rest_review_virtual_weight";
    const before = buildProtocolReviewReconciliation(copiedLiveDraft());

    const actionResponse = await saveProtocolDispositionAction({
      reviewId,
      disposition: "keep",
    });
    const routeReload = await diagnostic.loadProtocolTransitionPreview();
    const persistedDraft = await routeReload.service.getOrPreview({
      handoff: routeReload.handoff,
      historicalProtocols: routeReload.historicalProtocols,
    });
    const page = buildProtocolReviewReconciliation(persistedDraft);
    const weight = persistedDraft.protocolReviews.find((review) => review.id === reviewId);

    expect(diagnostic.revalidatePath).toHaveBeenCalledWith("/preview/goals/transition/protocols");
    expect(actionResponse.id).toBe(persistedDraft.id);
    expect(before.unresolvedCount).toBe(1);
    expect(page.unresolvedCount).toBe(0);
    expect(weight).toMatchObject({
      intendedDisposition: "keep",
      reviewStatus: "accepted",
    });
    expect(persistedDraft.protocolDrafts.find((draft) => draft.reviewId === reviewId)).toMatchObject({
      status: "ready",
      sourceProtocolId: "virtual_weight",
      sourceVersionId: null,
      sourceGoalId: "goal_visible_abs_at_rest",
      virtualProvenance: {
        sourceReviewId: reviewId,
        virtualCategory: "weight",
        pendingGoalDraftId: handoff.newGoalDraftId,
      },
    });
    expect(page.groups.find((group) => group.id === "weight")).toMatchObject({
      resolved: true,
      statusLabel: "Ready for new goal",
    });
    expect(page.unresolvedGroupNames).not.toContain("Weight Tracking");
    expect(productionProtocols.createProtocol).not.toHaveBeenCalled();
    expect(productionProtocols.updateProtocol).not.toHaveBeenCalled();
    expect(productionProtocols.saveProtocol).not.toHaveBeenCalled();
  });
});
