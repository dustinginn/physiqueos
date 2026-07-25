import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProtocolTransitionBuilderScreen from "../../../../../screens/ProtocolTransitionBuilderScreen";
import {
  applyProtocolDisposition,
  applyProtocolDraftPayload,
} from "../../../../../domain/services/GoalProtocolTransitionService";
import {
  buildDexaCadencePayload,
  buildPhotoCadencePayload,
  validateDexaCadencePayload,
  validatePhotoCadencePayload,
} from "../../../../../presentation/protocolCadencePresentation";
import { buildProtocolReviewReconciliation } from "../../../../../presentation/protocolReviewGroups";
import { presentProtocolTransitionPlan } from "../../../../../presentation/protocolTransitionReviewPresentation";

const transitionContext = {
  pendingGoalDraftId: "lean_mass_goal",
  acceptedPrimaryGoal: { id: "lean_mass_goal", type: "build_lean_mass" },
  calibrationState: { value: "calibration" },
  supportingObjectives: [],
  openingBaseline: { dexaWeight: 167.4 },
  sourceSnapshot: null,
  selectedDisposition: "update",
  returnRoute: "/preview/goals/transition/protocols?section=protocols",
  detailRoute: "/preview/goals/transition/protocols?section=protocols",
};

function virtualReview(id, category) {
  return {
    id,
    category,
    protocolType: category,
    displayName: category === "photos" ? "Progress Photos" : "DEXA",
    sourceProtocolId: `virtual_${category}`,
    sourceVersionId: null,
    sourceSnapshot: null,
    currentGoalId: "visible_abs",
    currentSummary: `Current ${category} plan`,
    intendedDisposition: "update",
    recommendation: category === "photos" ? "update" : "keep",
    reviewStatus: "editing",
    proposedChanges: {},
    available: false,
  };
}

function peptideReview(id, name) {
  return {
    id,
    category: "peptide",
    protocolType: "peptide",
    displayName: "Peptide",
    sourceProtocolId: `source_${id}`,
    sourceVersionId: `${id}_v1`,
    sourceSnapshot: { id: `source_${id}`, name },
    currentGoalId: "visible_abs",
    currentSummary: `${name} current plan`,
    intendedDisposition: "update",
    recommendation: "keep",
    reviewStatus: "editing",
    proposedChanges: {},
    available: true,
  };
}

function baseDraft(reviews) {
  return {
    id: "protocol_transition",
    pendingGoalDraftId: "lean_mass_goal",
    protocolReviews: reviews,
    protocolDrafts: [],
    completedProtocolIds: [],
    generatedRoutine: [],
    generatedCommitments: [],
    updatedAt: "2026-07-20T00:00:00.000Z",
    handoff: {
      completedSourceGoalId: "visible_abs",
      newGoalDraftId: "lean_mass_goal",
      primaryGoal: { id: "lean_mass_goal", type: "build_lean_mass" },
      progressMeasurement: {
        outcomeMeasures: [
          { id: "lean", evidenceType: "dexa_lean_mass", accepted: true },
          { id: "fat", evidenceType: "dexa_fat_mass", accepted: true },
          { id: "bf", evidenceType: "dexa_body_fat", accepted: true },
        ],
        predictiveSignals: [{ id: "photos", evidenceType: "progress_photos", accepted: true }],
      },
    },
  };
}

describe("Progress Photos cadence completion", () => {
  it.each(["weekly", "every_two_weeks", "monthly"])("accepts %s with weekday and daypart", (frequency) => {
    const payload = buildPhotoCadencePayload({
      frequency,
      dayOfWeek: "saturday",
      daypart: "afternoon",
    }, transitionContext);
    expect(validatePhotoCadencePayload(payload).valid).toBe(true);
    expect(presentProtocolTransitionPlan("photos", payload).sections[0].primaryValue)
      .toMatch(/Saturday afternoon/);
  });

  it("rejects missing frequency or weekday", () => {
    expect(validatePhotoCadencePayload(buildPhotoCadencePayload({
      dayOfWeek: "saturday",
      daypart: "afternoon",
    }, transitionContext)).valid).toBe(false);
    expect(validatePhotoCadencePayload(buildPhotoCadencePayload({
      frequency: "every_two_weeks",
      daypart: "afternoon",
    }, transitionContext)).valid).toBe(false);
  });

  it("renders the virtual decision screen without source-backed metadata", () => {
    const review = virtualReview("photos", "photos");
    const html = renderToStaticMarkup(React.createElement(ProtocolTransitionBuilderScreen, {
      action: async () => null,
      protocolDraft: null,
      review,
      transitionContext,
    }));
    expect(html).toContain("How often would you like to take progress photos?");
    expect(html).toContain("Which day works best?");
    expect(html).not.toContain("Cannot read properties");
  });
});

describe("DEXA cadence completion", () => {
  it.each(["every_four_weeks", "every_six_weeks", "every_eight_weeks", "every_twelve_weeks"])("accepts %s", (frequency) => {
    const payload = buildDexaCadencePayload({ frequency }, transitionContext);
    expect(validateDexaCadencePayload(payload).valid).toBe(true);
    expect(payload.measures).toEqual(["lean_mass", "fat_mass", "body_fat_percentage"]);
    expect(presentProtocolTransitionPlan("dexa", payload).sections[0].primaryValue).toMatch(/weeks/);
  });

  it("rejects a missing interval", () => {
    expect(validateDexaCadencePayload(buildDexaCadencePayload({}, transitionContext)).valid).toBe(false);
  });
});

describe("grouped Peptide completion", () => {
  it("keeps distinct identities and resolves only after both underlying reviews resolve", () => {
    const reta = peptideReview("reta", "Retatrutide");
    const tesa = peptideReview("tesa", "Tesamorelin");
    let draft = baseDraft([reta, tesa]);

    draft = applyProtocolDisposition(draft, reta.id, "keep");
    let page = buildProtocolReviewReconciliation(draft);
    expect(page.groups.find((group) => group.id === "peptides").resolved).toBe(false);
    expect(page.unresolvedGroupNames).toEqual(["Peptides"]);

    draft = applyProtocolDisposition(draft, tesa.id, "keep");
    page = buildProtocolReviewReconciliation(draft);
    const peptideDrafts = draft.protocolDrafts.filter((item) => item.protocolType === "peptide");
    expect(new Set(peptideDrafts.map((item) => item.id)).size).toBe(2);
    expect(peptideDrafts.map((item) => item.reviewId)).toEqual(expect.arrayContaining([reta.id, tesa.id]));
    expect(page.groups.find((group) => group.id === "peptides")).toMatchObject({
      resolved: true,
      statusLabel: "Ready for new goal",
    });
    expect(page.unresolvedGroupNames).not.toContain("Peptides");
  });

  it.each(["keep", "update", "pause", "leave_behind"])("recognizes a valid %s item outcome", (disposition) => {
    const review = peptideReview("reta", "Retatrutide");
    let draft = applyProtocolDisposition(baseDraft([review]), review.id, disposition);
    if (disposition === "update") {
      draft = applyProtocolDraftPayload(draft, review.id, { scheduleChoice: "keep_current" });
    }
    expect(buildProtocolReviewReconciliation(draft).unresolvedCount).toBe(0);
  });
});

describe("final Protocol Review progression", () => {
  it("removes Photos, DEXA, then Peptides and reaches zero unresolved", () => {
    const photos = virtualReview("photos", "photos");
    const dexa = virtualReview("dexa", "dexa");
    const reta = peptideReview("reta", "Retatrutide");
    const tesa = peptideReview("tesa", "Tesamorelin");
    let draft = baseDraft([photos, dexa, reta, tesa]);
    let page = buildProtocolReviewReconciliation(draft);
    expect(page.unresolvedGroupNames).toEqual(["Progress Photos", "DEXA", "Peptides"]);

    draft = applyProtocolDraftPayload(draft, photos.id, buildPhotoCadencePayload({
      frequency: "every_two_weeks",
      dayOfWeek: "saturday",
      daypart: "afternoon",
    }, transitionContext));
    page = buildProtocolReviewReconciliation(draft);
    expect(page.unresolvedGroupNames).toEqual(["DEXA", "Peptides"]);

    draft = applyProtocolDraftPayload(draft, dexa.id, buildDexaCadencePayload({
      frequency: "every_six_weeks",
    }, transitionContext));
    page = buildProtocolReviewReconciliation(draft);
    expect(page.unresolvedGroupNames).toEqual(["Peptides"]);

    draft = applyProtocolDisposition(draft, reta.id, "keep");
    expect(buildProtocolReviewReconciliation(draft).unresolvedGroupNames).toEqual(["Peptides"]);
    draft = applyProtocolDisposition(draft, tesa.id, "pause");
    page = buildProtocolReviewReconciliation(draft);
    expect(page).toMatchObject({
      unresolvedCount: 0,
      unresolvedGroupNames: [],
      isReadyForNext: true,
    });
    expect(page.validation.valid).toBe(true);
  });
});
