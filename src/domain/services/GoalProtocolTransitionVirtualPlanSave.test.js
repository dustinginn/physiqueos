import { describe, expect, it, vi } from "vitest";
import {
  applyProtocolDisposition,
  applyProtocolDraftPayload,
  buildGoalProtocolTransitionDraft,
  createGoalProtocolTransitionService,
  ProtocolTransitionErrorCode,
  resolveProtocolTransitionEntry,
} from "./GoalProtocolTransitionService";
import { reconcileProtocolTransition } from "./ProtocolTransitionReconciliationService";

const now = new Date("2026-07-21T05:00:00.000Z");
const transitionId = "goal_transition_live_goal_visible_abs_at_rest_fixture";
const handoff = {
  transitionDraftId: transitionId,
  completedSourceGoalId: "goal_visible_abs_at_rest",
  newGoalDraftId: "goal_build_lean_mass_draft",
  primaryGoal: { id: "goal_build_lean_mass_draft", title: "Build Lean Mass" },
  supportingObjectives: [],
  guardrails: [],
  progressMeasurement: { outcomeMeasures: [], predictiveSignals: [], explanatorySignals: [] },
  briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  inheritedProtocolReferences: [
    reference("energy"), reference("recovery"), reference("briefings"),
  ],
  intendedProtocolDispositions: [
    intent("energy", "modify"), intent("recovery", "keep"), intent("briefings", "modify"),
  ],
};

describe("Goal Protocol Transition virtual-plan save boundary", () => {
  it.each([
    ["energy", "virtual_energy"],
    ["briefings", "virtual_briefings"],
    ["recovery", "virtual_recovery"],
  ])("resolves %s authoritatively without a historical protocol", (category, sourceProtocolId) => {
    expect(resolveProtocolTransitionEntry({ category, sourceProtocolId })).toEqual({
      entryType: "virtual_plan",
      virtualPlanId: sourceProtocolId,
    });
  });

  it("saves Energy Balance selections, becomes ready, reopens them, and upserts", () => {
    const base = fixtureDraft();
    const review = byCategory(base, "energy");
    const payload = {
      mode: "Maintenance Calibration",
      calorieStrategy: "estimated_maintenance",
      activityStrategy: "reduce_slightly",
      evaluationCadence: "Weekly",
    };
    const first = applyProtocolDraftPayload(base, review.id, payload, now);
    const second = applyProtocolDraftPayload(first, review.id, payload, now);
    expect(second.protocolDrafts.filter((item) => item.reviewId === review.id)).toHaveLength(1);
    expect(draftFor(second, review)).toMatchObject({
      category: "energy",
      entryType: "virtual_plan",
      virtualPlanId: "virtual_energy",
      status: "ready",
      payload,
    });
    expect(reconcileProtocolTransition(second).reviews.find((item) => item.reviewId === review.id)?.resolved)
      .toBe(true);
  });

  it("saves Coaching Updates cadence and days, becomes ready, and upserts", () => {
    const base = fixtureDraft();
    const review = byCategory(base, "briefings");
    const payload = {
      cadence: "Twice weekly",
      days: ["Wednesday", "Sunday"],
      dailyEvidenceCollection: true,
    };
    const first = applyProtocolDraftPayload(base, review.id, payload, now);
    const second = applyProtocolDraftPayload(first, review.id, payload, now);
    expect(second.protocolDrafts.filter((item) => item.reviewId === review.id)).toHaveLength(1);
    expect(draftFor(second, review)).toMatchObject({
      category: "briefings",
      entryType: "virtual_plan",
      virtualPlanId: "virtual_briefings",
      status: "ready",
      payload,
    });
    expect(reconcileProtocolTransition(second).reviews.find((item) => item.reviewId === review.id)?.resolved)
      .toBe(true);
  });

  it("repairs the current Recovery accepted-without-plan shape on the next Keep save", () => {
    const base = fixtureDraft();
    const review = byCategory(base, "recovery");
    const currentLiveShape = {
      ...base,
      protocolDrafts: base.protocolDrafts.filter((item) => item.reviewId !== review.id),
      completedProtocolIds: base.completedProtocolIds.filter((id) => id !== review.id),
    };
    expect(reconcileProtocolTransition(currentLiveShape).reviews
      .find((item) => item.reviewId === review.id)?.resolved).toBe(false);
    const repaired = applyProtocolDisposition(currentLiveShape, review.id, "keep", now);
    expect(repaired.protocolDrafts.filter((item) => item.reviewId === review.id)).toHaveLength(1);
    expect(draftFor(repaired, review)).toMatchObject({
      category: "recovery",
      entryType: "virtual_plan",
      virtualPlanId: "virtual_recovery",
      status: "ready",
      sourceProtocolId: "virtual_recovery",
    });
    expect(reconcileProtocolTransition(repaired).reviews
      .find((item) => item.reviewId === review.id)?.resolved).toBe(true);
  });

  it("rejects unknown categories and wrong virtual identities with structured errors", () => {
    expect(caught(() => resolveProtocolTransitionEntry({ category: "unknown", sourceProtocolId: "x" })))
      .toMatchObject({ code: ProtocolTransitionErrorCode.CATEGORY_UNKNOWN });
    expect(caught(() => resolveProtocolTransitionEntry({ category: "weight", sourceProtocolId: "preview_weight" })))
      .toMatchObject({ code: ProtocolTransitionErrorCode.SOURCE_PROTOCOL_REQUIRED });
  });

  it("keeps a failed persistence unresolved and does not mutate the input", async () => {
    const base = fixtureDraft();
    const before = structuredClone(base);
    const repositories = {
      goalProtocolTransitionDrafts: {
        getLatestActiveForGoalTransition: vi.fn(async () => base),
        save: vi.fn(async () => { throw new Error("synthetic persistence failure"); }),
      },
    };
    const service = createGoalProtocolTransitionService({ repositories, now: () => now });
    const review = byCategory(base, "energy");
    await expect(service.saveProtocolDraft({
      handoff,
      reviewId: review.id,
      payload: { calorieStrategy: "increase_gradually", activityStrategy: "keep_current" },
    })).rejects.toThrow("synthetic persistence failure");
    expect(base).toEqual(before);
    expect(reconcileProtocolTransition(base).reviews
      .find((item) => item.reviewId === review.id)?.resolved).toBe(false);
  });

  it("saving one virtual category leaves every other decision unchanged", () => {
    const base = fixtureDraft();
    const energy = byCategory(base, "energy");
    const otherReviews = base.protocolReviews.filter((item) => item.id !== energy.id);
    const next = applyProtocolDraftPayload(base, energy.id, {
      calorieStrategy: "increase_gradually",
      activityStrategy: "keep_current",
    }, now);
    expect(next.protocolReviews.filter((item) => item.id !== energy.id)).toEqual(otherReviews);
  });
});

function fixtureDraft() {
  return buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: [], createdAt: now });
}

function reference(category) {
  return {
    reviewId: `goal_review_${category}`,
    protocolId: `virtual_${category}`,
    sourceVersionId: null,
    protocolType: category,
  };
}

function intent(category, disposition) {
  return {
    reviewId: `goal_review_${category}`,
    protocolId: `virtual_${category}`,
    disposition,
    proposedChanges: {},
  };
}

function byCategory(draft, category) {
  return draft.protocolReviews.find((item) => item.category === category);
}

function draftFor(draft, review) {
  return draft.protocolDrafts.find((item) => item.reviewId === review.id);
}

function caught(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail.");
}
