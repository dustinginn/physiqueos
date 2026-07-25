import { describe, expect, it } from "vitest";
import {
  applyProtocolDisposition,
  buildGoalProtocolTransitionDraft,
} from "./GoalProtocolTransitionService";
import { reconcileProtocolTransition } from "./ProtocolTransitionReconciliationService";

const sourceGoalId = "goal_visible_abs";
const pendingGoalDraftId = "objective_lean_mass";

function acceptedEvidence(evidenceType, role = "predictive") {
  return {
    id: `accepted_${evidenceType}`,
    evidenceType,
    role,
    accepted: true,
  };
}

function handoff(overrides = {}) {
  return {
    transitionDraftId: "goal_transition_visible_abs",
    completedSourceGoalId: sourceGoalId,
    newGoalDraftId: pendingGoalDraftId,
    primaryGoal: { id: pendingGoalDraftId, type: "build_lean_mass", title: "Build Lean Mass" },
    guardrails: [{ id: "body_fat", text: "Maintain the body-fat guardrail.", accepted: true }],
    progressMeasurement: {
      outcomeMeasures: [
        acceptedEvidence("dexa_lean_mass", "outcome"),
        acceptedEvidence("dexa_fat_mass", "outcome"),
        acceptedEvidence("dexa_body_fat", "outcome"),
      ],
      predictiveSignals: [
        acceptedEvidence("scale_weight"),
        acceptedEvidence("progress_photos"),
      ],
      protocolCadences: {
        photos: "Every six weeks",
        dexa: "Every four months",
      },
    },
    calibrationState: { value: "calibration" },
    supportingObjectives: [],
    briefingCadence: { type: "twice_weekly" },
    openingEvidenceBaseline: { leanMass: 147.5 },
    inheritedProtocolReferences: [],
    intendedProtocolDispositions: [],
    ...overrides,
  };
}

function virtualReview(category, overrides = {}) {
  return {
    id: `transition_review_virtual_${category}`,
    sourceProtocolId: `virtual_${category}`,
    sourceVersionId: null,
    protocolType: category,
    category,
    displayName: category,
    currentSummary: `Current ${category} plan`,
    currentGoalId: sourceGoalId,
    intendedDisposition: "replace",
    recommendation: "keep",
    recommendationReason: "Keep this plan.",
    reviewStatus: "blocked",
    replacementProtocolDraftId: null,
    proposedChanges: {},
    sourceSnapshot: null,
    available: false,
    ...overrides,
  };
}

function isolatedDraft(reviews, acceptedHandoff = handoff()) {
  return {
    id: "protocol_transition_goal_transition_visible_abs",
    goalTransitionDraftId: acceptedHandoff.transitionDraftId,
    sourceGoalId,
    pendingGoalDraftId,
    status: "draft",
    protocolReviews: reviews,
    protocolDrafts: [],
    completedProtocolIds: [],
    generatedRoutine: [],
    generatedCommitments: [],
    readyForActivation: false,
    handoff: acceptedHandoff,
  };
}

describe("supported virtual Keep preview drafts", () => {
  it("creates a ready Weight Tracking draft with activation provenance", () => {
    const review = virtualReview("weight");
    const next = applyProtocolDisposition(isolatedDraft([review]), review.id, "keep");
    const preview = next.protocolDrafts[0];

    expect(preview).toMatchObject({
      reviewId: review.id,
      pendingGoalDraftId,
      sourceProtocolId: "virtual_weight",
      sourceVersionId: null,
      sourceGoalId,
      derivationType: "cloned",
      protocolType: "weight",
      status: "ready",
      payload: {
        collectionCadence: "daily_morning",
        interpretationWindow: "weekly_trend",
        evidenceType: "scale_weight",
        goalDraftId: pendingGoalDraftId,
      },
      validation: { valid: true, reasons: [] },
      virtualProvenance: {
        sourceGoalId,
        sourceReviewId: review.id,
        virtualCategory: "weight",
        pendingGoalDraftId,
      },
    });
    expect(next.protocolReviews[0].replacementProtocolDraftId).toBe(preview.id);
    expect(next.completedProtocolIds).toContain(review.id);
    expect(reconcileProtocolTransition(next).ready).toBe(true);
  });

  it.each([
    ["photos", "Every six weeks", "progress_photos"],
    ["dexa", "Every four months", "dexa"],
  ])("creates a ready %s draft only with accepted plan context", (category, cadence, evidenceType) => {
    const review = virtualReview(category);
    const next = applyProtocolDisposition(isolatedDraft([review]), review.id, "keep");
    expect(next.protocolDrafts[0]).toMatchObject({
      status: "ready",
      payload: { cadence, evidenceType, goalDraftId: pendingGoalDraftId },
      validation: { valid: true, reasons: [] },
    });
    expect(reconcileProtocolTransition(next).ready).toBe(true);
  });

  it.each([
    ["photos", "Choose how often you want to take progress photos."],
    ["dexa", "Choose your DEXA schedule before continuing."],
  ])("keeps %s unresolved with a precise reason when cadence is absent", (category, reason) => {
    const acceptedHandoff = handoff({
      progressMeasurement: {
        ...handoff().progressMeasurement,
        protocolCadences: {},
      },
    });
    const review = virtualReview(category);
    const next = applyProtocolDisposition(isolatedDraft([review], acceptedHandoff), review.id, "keep");

    expect(next.protocolDrafts[0]).toMatchObject({
      status: "draft",
      validation: { valid: false, reasons: [reason] },
    });
    expect(next.completedProtocolIds).not.toContain(review.id);
    expect(reconcileProtocolTransition(next)).toMatchObject({
      ready: false,
      unresolvedReviewIds: [review.id],
    });
  });

  it("creates the explicit Recovery carry-forward plan for a supported virtual Keep", () => {
    const review = virtualReview("recovery", { sourceProtocolId: "virtual_recovery" });
    const next = applyProtocolDisposition(isolatedDraft([review]), review.id, "keep");
    expect(next.protocolDrafts).toHaveLength(1);
    expect(next.protocolDrafts[0]).toMatchObject({
      category: "recovery",
      entryType: "virtual_plan",
      virtualPlanId: "virtual_recovery",
      status: "ready",
      payload: { strategyChoice: "carry_forward", routineStatus: "continued" },
    });
    expect(reconcileProtocolTransition(next).ready).toBe(true);
  });

  it("does not silently repair an existing accepted virtual Keep during read-only loading", async () => {
    const accepted = virtualReview("weight", {
      intendedDisposition: "keep",
      reviewStatus: "accepted",
    });
    const persisted = isolatedDraft([accepted]);
    const repository = {
      getLatestActiveForGoalTransition: async () => structuredClone(persisted),
    };
    const { createGoalProtocolTransitionService } = await import("./GoalProtocolTransitionService");
    const loaded = await createGoalProtocolTransitionService({
      repositories: { goalProtocolTransitionDrafts: repository },
    }).getOrPreview({ handoff: persisted.handoff, historicalProtocols: [] });
    expect(loaded.protocolDrafts).toEqual([]);
    expect(loaded.validation.valid).toBe(false);
  });
});

describe("collision-safe preview identities", () => {
  it("keeps repeated Peptide and Supplement draft IDs distinct", () => {
    const protocols = [
      ["retatrutide", "peptide"],
      ["tesamorelin", "peptide"],
      ["creatine", "supplement"],
      ["magnesium", "supplement"],
    ].map(([id, category]) => ({
      id,
      protocolType: category,
      currentVersionId: `${id}_v1`,
      name: id,
      status: "active",
    }));
    const acceptedHandoff = handoff({
      inheritedProtocolReferences: protocols.map((protocol) => ({
        reviewId: `goal_review_${protocol.id}`,
        protocolId: protocol.id,
        sourceVersionId: protocol.currentVersionId,
        protocolType: protocol.protocolType,
      })),
      intendedProtocolDispositions: protocols.map((protocol) => ({
        reviewId: `goal_review_${protocol.id}`,
        protocolId: protocol.id,
        disposition: "keep",
        proposedChanges: {},
      })),
    });
    const draft = buildGoalProtocolTransitionDraft({
      handoff: acceptedHandoff,
      historicalProtocols: protocols,
    });
    const ids = draft.protocolDrafts.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.find((id) => id.includes("retatrutide"))).not.toBe(ids.find((id) => id.includes("tesamorelin")));
    expect(ids.find((id) => id.includes("creatine"))).not.toBe(ids.find((id) => id.includes("magnesium")));
  });

  it("keeps Weight, Photos, and DEXA draft IDs stable and distinct", () => {
    const reviews = ["weight", "photos", "dexa"].map((category) => virtualReview(category));
    let draft = isolatedDraft(reviews);
    for (const review of reviews) draft = applyProtocolDisposition(draft, review.id, "keep");
    const ids = draft.protocolDrafts.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    const repeated = applyProtocolDisposition(draft, reviews[0].id, "keep");
    expect(repeated.protocolDrafts.find((item) => item.reviewId === reviews[0].id).id)
      .toBe(draft.protocolDrafts.find((item) => item.reviewId === reviews[0].id).id);
  });
});
