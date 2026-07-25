import { describe, expect, it } from "vitest";
import { applyProtocolDisposition, applyProtocolDraftPayload } from "../../../../../domain/services/GoalProtocolTransitionService";
import { buildProtocolReviewReconciliation } from "../../../../../presentation/protocolReviewGroups";

function review(id, category, disposition, status, name = null) {
  return {
    id,
    sourceProtocolId: `source_${id}`,
    sourceVersionId: `source_${id}_v1`,
    protocolType: category,
    category,
    displayName: category === "weight" ? "Weight Tracking" : category === "photos" ? "Progress Photos" : category === "peptide" ? "Peptide" : "DEXA",
    currentSummary: `Current ${category} plan`,
    intendedDisposition: disposition,
    recommendation: disposition === "keep" ? "keep" : "update",
    recommendationReason: "Coach recommendation",
    reviewStatus: status,
    replacementProtocolDraftId: null,
    proposedChanges: {},
    sourceSnapshot: { id: `source_${id}`, name: name ?? category, category },
    available: true,
  };
}

function draftFor(reviewId) {
  return { id: `draft_${reviewId}`, reviewId, pendingGoalDraftId: "new_goal", sourceProtocolId: `source_${reviewId}`, sourceVersionId: `source_${reviewId}_v1`, derivationType: "updated", protocolType: "test", status: "draft", payload: {} };
}

function initialDraft() {
  const weight = review("weight", "weight", "keep", "pending");
  const photos = review("photos", "photos", "update", "editing");
  const dexa = review("dexa", "dexa", "keep", "pending");
  const reta = review("reta", "peptide", "update", "editing", "Retatrutide");
  const tesa = review("tesa", "peptide", "update", "editing", "Tesamorelin");
  return {
    id: "transition",
    pendingGoalDraftId: "new_goal",
    protocolReviews: [weight, photos, dexa, reta, tesa],
    protocolDrafts: [draftFor(photos.id), draftFor(reta.id), draftFor(tesa.id)],
    completedProtocolIds: [],
    generatedRoutine: [],
    generatedCommitments: [],
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("Protocol Review mutation-to-list reconciliation", () => {
  it("updates cards, banner, counts, grouped outcomes, and Next from each complete draft", () => {
    let draft = initialDraft();
    let page = buildProtocolReviewReconciliation(draft);
    expect(page.unresolvedGroupNames).toEqual(["Weight Tracking", "Progress Photos", "DEXA", "Peptides"]);
    expect(page.unresolvedCount).toBe(5);
    expect(page.isReadyForNext).toBe(false);

    draft = applyProtocolDisposition(draft, "weight", "keep");
    page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "weight")).toMatchObject({ resolved: true, statusLabel: "Ready for new goal" });
    expect(page.unresolvedGroupNames).toEqual(["Progress Photos", "DEXA", "Peptides"]);
    expect(page.unresolvedCount).toBe(4);

    draft = applyProtocolDraftPayload(draft, "photos", {
      recurrence: { frequency: "every_two_weeks", interval: 2, unit: "week", dayOfWeek: "saturday", daypart: "afternoon" },
      purpose: "visual_body_composition_monitoring",
      comparisonApproach: "comparable_progress_session",
      guardrailRelationship: "monitor_body_fat_while_building_lean_mass",
      evidenceType: "progress_photos",
      goalDraftId: "new_goal",
    });
    page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "photos")).toMatchObject({ resolved: true, statusLabel: "Updated plan prepared" });
    expect(page.unresolvedGroupNames).toEqual(["DEXA", "Peptides"]);
    expect(page.unresolvedCount).toBe(3);

    draft = applyProtocolDisposition(draft, "dexa", "keep");
    page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "dexa")).toMatchObject({ resolved: true, statusLabel: "Ready for new goal" });
    expect(page.unresolvedGroupNames).toEqual(["Peptides"]);

    draft = applyProtocolDisposition(draft, "reta", "keep");
    page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "peptides")).toMatchObject({ resolved: false, primaryAction: "Continue Peptide Review" });
    expect(page.unresolvedGroupNames).toEqual(["Peptides"]);
    expect(page.unresolvedCount).toBe(1);

    draft = applyProtocolDisposition(draft, "tesa", "pause");
    page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "peptides")).toMatchObject({ resolved: true, statusLabel: "Decisions reviewed", primaryAction: "Review Peptide Plan" });
    expect(page.unresolvedGroupNames).toEqual([]);
    expect(page.unresolvedCount).toBe(0);
    expect(page.preparedCount).toBe(5);
    expect(page.isReadyForNext).toBe(true);
    expect(page.validation.valid).toBe(true);
  });

  it("reopening and canceling without mutation preserves the last valid reconciliation", () => {
    let draft = applyProtocolDisposition(initialDraft(), "weight", "keep");
    const before = buildProtocolReviewReconciliation(draft);
    const after = buildProtocolReviewReconciliation(structuredClone(draft));
    expect(after).toEqual(before);
    expect(after.groups.find((group) => group.id === "weight").resolved).toBe(true);
  });
});
