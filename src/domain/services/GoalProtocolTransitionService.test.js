import { describe, expect, it, vi } from "vitest";
import { createGoalProtocolTransitionRepository } from "../../data/repositories/GoalProtocolTransitionRepository";
import {
  applyProtocolDisposition,
  applyProtocolDraftPayload,
  buildAtomicGoalTransitionActivationContract,
  buildGoalProtocolTransitionDraft,
  createGoalProtocolTransitionService,
  validateGoalProtocolTransition,
} from "./GoalProtocolTransitionService";

const categories = ["energy", "nutrition", "training", "activity", "recovery", "weight", "photos", "dexa", "briefings"];
const protocols = categories.map((category) => ({
  id: `source_${category}`,
  userId: "u",
  protocolType: category,
  name: category,
  status: "active",
  currentVersionId: `source_${category}_v1`,
  relatedGoalIds: ["goal_visible_abs"],
  notes: `Current ${category} strategy`,
}));

const handoff = {
  transitionDraftId: "goal_transition_visible_abs",
  completedSourceGoalId: "goal_visible_abs",
  newGoalDraftId: "objective_lean_mass",
  primaryGoal: { id: "objective_lean_mass", title: "Build Lean Mass" },
  guardrails: [{ id: "guardrail", text: "Stay lean", accepted: true }],
  progressMeasurement: { outcomeMeasures: [] },
  calibrationState: { value: "calibration" },
  supportingObjectives: [{ id: "chest", title: "Chest", accepted: false }],
  briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  openingEvidenceBaseline: { leanMass: 147.5 },
  inheritedProtocolReferences: protocols.map((protocol) => ({
    reviewId: `goal_review_${protocol.protocolType}`,
    protocolId: protocol.id,
    sourceVersionId: protocol.currentVersionId,
    protocolType: protocol.protocolType,
  })),
  intendedProtocolDispositions: protocols.map((protocol) => ({
    reviewId: `goal_review_${protocol.protocolType}`,
    protocolId: protocol.id,
    disposition: ["energy", "nutrition", "activity", "photos", "briefings"].includes(protocol.protocolType) ? "modify" : "keep",
    proposedChanges: {},
  })),
  returnRoute: "/preview/goals/transition?section=review",
};

function fixture() {
  const records = [];
  const production = {
    goals: { updateGoal: vi.fn(), saveGoal: vi.fn() },
    protocols: { updateProtocol: vi.fn(), saveProtocol: vi.fn() },
    commitments: { save: vi.fn() },
    scheduler: { update: vi.fn() },
  };
  const repositories = {
    goalProtocolTransitionDrafts: createGoalProtocolTransitionRepository(records),
    ...production,
  };
  return { records, repositories, service: createGoalProtocolTransitionService({ repositories, now: () => new Date("2026-07-19T20:00:00Z") }) };
}

function readyDraft() {
  let draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols, createdAt: new Date("2026-07-19T20:00:00Z") });
  for (const review of draft.protocolReviews.filter((item) => item.intendedDisposition === "update")) {
    draft = applyProtocolDraftPayload(draft, review.id, { reviewed: true }, new Date("2026-07-19T20:01:00Z"));
  }
  return draft;
}

describe("GoalProtocolTransitionService", () => {
  it("initializes from the accepted Goal Creation handoff without persisting on read", async () => {
    const { records, service } = fixture();
    const draft = await service.getOrPreview({ handoff, historicalProtocols: protocols });
    expect(draft).toMatchObject({ goalTransitionDraftId: handoff.transitionDraftId, sourceGoalId: handoff.completedSourceGoalId, pendingGoalDraftId: handoff.newGoalDraftId, status: "draft" });
    expect(draft.handoff.openingEvidenceBaseline).toEqual(handoff.openingEvidenceBaseline);
    expect(records).toHaveLength(0);
  });

  it("reuses one active persisted transition instead of duplicating it", async () => {
    const { records, service } = fixture();
    const first = await service.saveDisposition({ handoff, historicalProtocols: protocols, reviewId: `${draftId()}_review_source_training`, disposition: "keep" });
    const second = await service.getOrPreview({ handoff, historicalProtocols: protocols });
    expect(second.id).toBe(first.id);
    expect(records).toHaveLength(1);
  });

  it("loads every inherited protocol and any additional source-goal protocol", () => {
    const extra = { ...protocols[0], id: "source_medication", protocolType: null, category: "medication", name: "Retatrutide" };
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: [...protocols, extra] });
    expect(draft.protocolReviews).toHaveLength(10);
    expect(draft.protocolReviews.some((item) => item.sourceProtocolId === extra.id)).toBe(true);
    expect(draft.protocolReviews.find((item) => item.sourceProtocolId === extra.id).displayName).toBe("Medication");
  });

  it("presents category names and meaningful current-strategy summaries", () => {
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    expect(draft.protocolReviews.find((item) => item.category === "nutrition")).toMatchObject({
      displayName: "Nutrition",
      currentSummary: "High-protein nutrition designed for fat loss with a controlled calorie deficit.",
    });
    expect(draft.protocolReviews.find((item) => item.category === "activity")).toMatchObject({
      displayName: "Activity",
    });
    expect(draft.protocolReviews.find((item) => item.category === "briefings")).toMatchObject({
      displayName: "Coaching Updates",
    });
    expect(draft.protocolReviews.every((item) => !/unavailable/i.test(item.currentSummary))).toBe(true);
  });

  it("preserves complete historical snapshots and creates new preview IDs for keep and update", () => {
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    const trainingReview = draft.protocolReviews.find((item) => item.category === "training");
    const trainingDraft = draft.protocolDrafts.find((item) => item.reviewId === trainingReview.id);
    const energyReview = draft.protocolReviews.find((item) => item.category === "energy");
    const energyDraft = draft.protocolDrafts.find((item) => item.reviewId === energyReview.id);
    expect(trainingReview.sourceSnapshot).toEqual(protocols.find((item) => item.protocolType === "training"));
    expect(trainingDraft).toMatchObject({ derivationType: "cloned", sourceProtocolId: "source_training", sourceVersionId: "source_training_v1", status: "ready" });
    expect(energyDraft).toMatchObject({ derivationType: "updated", sourceProtocolId: "source_energy", status: "draft" });
    expect(trainingDraft.id).not.toBe(trainingReview.sourceProtocolId);
    expect(energyDraft.id).not.toBe(energyReview.sourceProtocolId);
  });

  it("requires a valid replacement while pause and leave behind create no future protocol", () => {
    const base = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    const activity = base.protocolReviews.find((item) => item.category === "activity");
    const replaced = applyProtocolDisposition(base, activity.id, "replace");
    expect(validateGoalProtocolTransition(replaced).valid).toBe(false);
    expect(replaced.protocolDrafts.find((item) => item.reviewId === activity.id)).toMatchObject({ derivationType: "replaced", status: "draft" });
    const paused = applyProtocolDisposition(base, activity.id, "pause");
    expect(paused.protocolDrafts.some((item) => item.reviewId === activity.id)).toBe(false);
    const left = applyProtocolDisposition(base, activity.id, "leave_behind");
    expect(left.protocolDrafts.some((item) => item.reviewId === activity.id)).toBe(false);
  });

  it("scopes training recommendations to accepted muscle priorities", () => {
    const noPriority = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    expect(noPriority.protocolReviews.find((item) => item.category === "training").recommendation).toBe("keep");
    const prioritized = buildGoalProtocolTransitionDraft({ handoff: { ...handoff, supportingObjectives: [{ id: "chest", title: "Chest", accepted: true }] }, historicalProtocols: protocols });
    expect(prioritized.protocolReviews.find((item) => item.category === "training")).toMatchObject({ recommendation: "update" });
    expect(prioritized.protocolReviews.find((item) => item.category === "nutrition").recommendationReason).not.toMatch(/Chest/);
  });

  it("flows accepted briefing cadence into the future briefing protocol", () => {
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    const review = draft.protocolReviews.find((item) => item.category === "briefings");
    const protocolDraft = draft.protocolDrafts.find((item) => item.reviewId === review.id);
    expect(protocolDraft.payload).toMatchObject({ cadence: "Twice weekly", days: ["Wednesday", "Sunday"], dailyEvidenceCollection: true });
  });

  it("generates routine and commitments only from active future protocol drafts with provenance", () => {
    const base = readyDraft();
    const activity = base.protocolReviews.find((item) => item.category === "activity");
    const paused = applyProtocolDisposition(base, activity.id, "pause");
    expect(paused.generatedRoutine.some((item) => item.sourceProtocolId === activity.sourceProtocolId)).toBe(false);
    expect(paused.generatedCommitments.every((item) => item.sourcePreviewProtocolId && item.sourceProtocolId)).toBe(true);
  });

  it("blocks readiness while required updates remain incomplete", () => {
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    expect(draft.validation.valid).toBe(false);
    expect(draft.validation.unresolvedReviewIds.length).toBeGreaterThan(0);
  });

  it("marks only the preview transition ready and never mutates production state", async () => {
    const { records, repositories, service } = fixture();
    records.push(readyDraft());
    const ready = await service.markReady({ handoff, historicalProtocols: protocols });
    expect(ready).toMatchObject({ status: "ready", readyForActivation: true });
    expect(repositories.goals.updateGoal).not.toHaveBeenCalled();
    expect(repositories.goals.saveGoal).not.toHaveBeenCalled();
    expect(repositories.protocols.updateProtocol).not.toHaveBeenCalled();
    expect(repositories.protocols.saveProtocol).not.toHaveBeenCalled();
    expect(repositories.commitments.save).not.toHaveBeenCalled();
    expect(repositories.scheduler.update).not.toHaveBeenCalled();
  });

  it("survives repository recreation using the same persisted collection", async () => {
    const records = [];
    const first = createGoalProtocolTransitionRepository(records);
    const draft = buildGoalProtocolTransitionDraft({ handoff, historicalProtocols: protocols });
    await first.save(draft);
    const refreshed = createGoalProtocolTransitionRepository(records);
    expect(await refreshed.getLatestActiveForGoalTransition(handoff.transitionDraftId)).toEqual(draft);
  });

  it("represents atomic activation as an unimplemented all-or-rollback boundary", () => {
    const contract = buildAtomicGoalTransitionActivationContract();
    expect(contract).toMatchObject({ boundary: "GoalTransitionActivationService.applyAtomically", implemented: false });
    expect(contract.operations).toContain("persistAtomicallyOrRollback");
    expect(contract.operations).toContain("createNewProtocolsWithProvenance");
  });
});

function draftId() {
  return `protocol_transition_${handoff.transitionDraftId}`;
}
