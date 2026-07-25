import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoalProtocolTransitionRepository } from "../../../../../data/repositories/GoalProtocolTransitionRepository";
import { stablePreviewProtocolId } from "../../../../../domain/models/goalProtocolTransitionDraft";
import {
  createGoalProtocolTransitionService,
  isLegacyIncompletePeptideUpdate,
} from "../../../../../domain/services/GoalProtocolTransitionService";
import { buildProtocolReviewReconciliation } from "../../../../../presentation/protocolReviewGroups";
import ProtocolTransitionPreviewScreen from "../../../../../screens/ProtocolTransitionPreviewScreen";

const diagnostic = vi.hoisted(() => ({
  loadProtocolTransitionPreview: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: diagnostic.revalidatePath }));
vi.mock("./context", () => ({ loadProtocolTransitionPreview: diagnostic.loadProtocolTransitionPreview }));
import { saveProtocolDispositionAction, saveTransitionProtocolDraftAction } from "./actions";

const RETA = "protocol_transition_goal_transition_goal_visible_abs_at_rest_review_protocol_retatrutide_founder";
const TESA = "protocol_transition_goal_transition_goal_visible_abs_at_rest_review_protocol_tesamorelin_founder";

function authoritativePreview() {
  const runtime = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "private/founder/runtime-store.json"), "utf8"));
  return {
    draft: structuredClone(runtime.goalProtocolTransitionDrafts.find((item) =>
      item.id === "protocol_transition_goal_transition_goal_visible_abs_at_rest"
    )),
    historicalProtocols: structuredClone(runtime.protocols),
  };
}

describe("High-risk live Peptides diagnostic", () => {
  let repository;
  let service;
  let handoff;
  let historicalProtocols;

  beforeEach(() => {
    diagnostic.revalidatePath.mockClear();
    const copy = authoritativePreview();
    repository = createGoalProtocolTransitionRepository([copy.draft]);
    historicalProtocols = copy.historicalProtocols;
    handoff = structuredClone(copy.draft.handoff);
    service = createGoalProtocolTransitionService({
      repositories: { goalProtocolTransitionDrafts: repository },
      now: () => new Date("2026-07-20T02:00:00.000Z"),
    });
    diagnostic.loadProtocolTransitionPreview.mockImplementation(async () => ({
      draft: await repository.getById(copy.draft.id),
      handoff,
      historicalProtocols,
      service,
    }));
  });

  it("loads the compatibility-repaired peptide decisions with exact lifecycle and provenance", async () => {
    const before = JSON.stringify(await repository.getById("protocol_transition_goal_transition_goal_visible_abs_at_rest"));
    const loaded = await service.getOrPreview({ handoff, historicalProtocols });
    const reta = review(loaded, RETA);
    const tesa = review(loaded, TESA);
    const retaDraft = protocolDraft(loaded, RETA);
    const tesaDraft = protocolDraft(loaded, TESA);

    expect(reta).toMatchObject({
      sourceProtocolId: "protocol_retatrutide_founder",
      currentGoalId: "goal_visible_abs_at_rest",
      intendedDisposition: "keep",
      reviewStatus: "accepted",
      sourceSnapshot: {
        status: "active",
        dose: { value: 2, unit: "mg" },
        schedule: { dayOfWeek: "thursday", timeOfDay: "night", doseChanges: "weekly_progression_with_planned_taper" },
      },
    });
    expect(reta.sourceSnapshot.doseHistory.find((item) => item.startDate === "2026-07-23"))
      .toMatchObject({ dose: 1.5, doseUnit: "mg", status: "planned" });
    expect(tesa).toMatchObject({
      sourceProtocolId: "protocol_tesamorelin_founder",
      currentGoalId: "goal_visible_abs_at_rest",
      intendedDisposition: "keep",
      reviewStatus: "accepted",
      sourceSnapshot: {
        dose: { value: 0.5, unit: "mg" },
        schedule: {
          daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
          timeOfDay: "night",
          timingContext: "fasted_before_bed",
        },
      },
    });
    expect(retaDraft).toMatchObject({ sourceProtocolId: reta.sourceProtocolId, derivationType: "cloned", status: "ready" });
    expect(tesaDraft).toMatchObject({ sourceProtocolId: tesa.sourceProtocolId, derivationType: "cloned", status: "ready" });
    expect(retaDraft.id).not.toBe(tesaDraft.id);
    expect(buildProtocolReviewReconciliation(loaded)).toMatchObject({
      unresolvedCount: 0,
      unresolvedGroupNames: [],
      isReadyForNext: true,
    });
    expect(JSON.stringify(await repository.getById(loaded.id))).toBe(before);
  });

  it("keeps an already accepted peptide idempotently without changing its sibling", async () => {
    const initial = await service.getOrPreview({ handoff, historicalProtocols });
    const siblingReview = structuredClone(review(initial, TESA));
    const siblingDraft = structuredClone(protocolDraft(initial, TESA));
    await saveProtocolDispositionAction({ reviewId: RETA, disposition: "keep" });
    const saved = await service.getOrPreview({ handoff, historicalProtocols });
    expect(review(saved, RETA)).toMatchObject({ intendedDisposition: "keep", reviewStatus: "accepted" });
    expect(protocolDraft(saved, RETA)).toMatchObject({ derivationType: "cloned", status: "ready" });
    expect(review(saved, TESA)).toEqual(siblingReview);
    expect(protocolDraft(saved, TESA)).toEqual(siblingDraft);
    expect(buildProtocolReviewReconciliation(saved).isReadyForNext).toBe(true);
    expect(diagnostic.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("supports an explicit Retatrutide update while preserving source dose and taper provenance", async () => {
    const initial = await service.getOrPreview({ handoff, historicalProtocols });
    const source = review(initial, RETA).sourceSnapshot;
    await saveProtocolDispositionAction({ reviewId: RETA, disposition: "update" });
    const editing = await service.getOrPreview({ handoff, historicalProtocols });
    expect(review(editing, RETA)).toMatchObject({ intendedDisposition: "update", reviewStatus: "editing" });
    expect(protocolDraft(editing, RETA)).toMatchObject({
      sourceProtocolId: "protocol_retatrutide_founder",
      derivationType: "updated",
      status: "draft",
    });
    const payload = {
      scheduleChoice: "keep_current",
      preservedSourcePlan: {
        dose: source.dose,
        schedule: source.schedule,
        doseHistory: source.doseHistory,
      },
    };
    await saveTransitionProtocolDraftAction({ reviewId: RETA, payload });
    const saved = await service.getOrPreview({ handoff, historicalProtocols });
    expect(review(saved, RETA)).toMatchObject({
      intendedDisposition: "update",
      reviewStatus: "reviewed",
      proposedChanges: payload,
    });
    expect(protocolDraft(saved, RETA)).toMatchObject({ status: "ready", payload });
    expect(protocolDraft(saved, RETA).payload.preservedSourcePlan.doseHistory)
      .toEqual(source.doseHistory);
    expect(buildProtocolReviewReconciliation(saved).isReadyForNext).toBe(true);
  });

  it("recognizes only the historical incomplete-update compatibility shape", async () => {
    const current = await service.getOrPreview({ handoff, historicalProtocols });
    expect(isLegacyIncompletePeptideUpdate(current, review(current, RETA), protocolDraft(current, RETA))).toBe(false);
    const legacyReview = {
      ...review(current, RETA),
      intendedDisposition: "update",
      reviewStatus: "editing",
      replacementProtocolDraftId: null,
    };
    const legacyDraft = {
      ...protocolDraft(current, RETA),
      id: `${current.id}_preview_peptide_updated`,
      derivationType: "updated",
      status: "draft",
      payload: {},
    };
    const legacy = {
      ...current,
      completedProtocolIds: current.completedProtocolIds.filter((id) => id !== RETA),
    };
    expect(isLegacyIncompletePeptideUpdate(legacy, legacyReview, legacyDraft)).toBe(true);
    expect(isLegacyIncompletePeptideUpdate(legacy, legacyReview, {
      ...legacyDraft,
      id: stablePreviewProtocolId(legacy.id, legacyReview.id, legacyReview.category, "updated"),
    })).toBe(false);
    expect(isLegacyIncompletePeptideUpdate(legacy, legacyReview, {
      ...legacyDraft,
      payload: { scheduleChoice: "keep_current" },
    })).toBe(false);
  });

  it("does not run legacy cleanup against the supported repaired topology", async () => {
    const initial = await service.getOrPreview({ handoff, historicalProtocols });
    const initialDraftIds = initial.protocolDrafts.map((item) => item.id).sort();
    await saveProtocolDispositionAction({ reviewId: RETA, disposition: "keep" });
    const saved = await service.getOrPreview({ handoff, historicalProtocols });
    expect(saved.protocolDrafts.map((item) => item.id).sort()).toEqual(initialDraftIds);
    expect(new Set([protocolDraft(saved, RETA).id, protocolDraft(saved, TESA).id]).size).toBe(2);
    expect(review(saved, RETA).replacementProtocolDraftId).toBe(protocolDraft(saved, RETA).id);
    expect(review(saved, TESA).replacementProtocolDraftId).toBe(protocolDraft(saved, TESA).id);
  });

  it("presents the supported reviewed peptide decisions without internal compatibility language", async () => {
    const current = await service.getOrPreview({ handoff, historicalProtocols });
    const html = renderToStaticMarkup(React.createElement(ProtocolTransitionPreviewScreen, {
      draft: current,
      initialMode: "edit",
      initialProtocol: "peptides",
      initialSection: "protocols",
      markReadyAction: async () => current,
      saveDispositionAction: async () => current,
    }));
    for (const text of [
      "Retatrutide",
      "2 mg once weekly on Thursday night, with the planned taper retained.",
      "Tesamorelin",
      "0.5 mg Sunday through Thursday nights, after fasting for at least 3 hours before bed.",
      "Reviewed",
      "Keep This Plan",
      "Update",
    ]) expect(html).toContain(text);
    for (const internal of ["preview_peptide_updated", "replacementProtocolDraftId", "compatibility repair", "incomplete payload"]) {
      expect(html).not.toContain(internal);
    }
  });
});

function review(draft, id) {
  return draft.protocolReviews.find((item) => item.id === id);
}
function protocolDraft(draft, reviewId) {
  return draft.protocolDrafts.find((item) => item.reviewId === reviewId);
}
