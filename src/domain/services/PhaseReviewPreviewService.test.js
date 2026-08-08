import { describe, expect, it } from "vitest";
import { createPhaseReviewPreview, projectPhaseReviewSelection } from "./PhaseReviewPreviewService";

const extend = () => createPhaseReviewPreview({
  recommendation: "continue_current_phase",
  recommendationLabel: "Continue Establish Maintenance",
  explanation: "Evidence is encouraging, but it is not yet a trusted trend. Two more weeks will make the next decision clearer.",
  currentPhase: { id: "phase-1", name: "Phase 1" },
  nextPhase: { id: "phase-2", name: "Phase 2" },
  originalReviewDate: "2026-08-15",
  recommendedDurationDays: 14,
  reasoningLineage: ["interpretation", "forecast", "narrative"],
});

describe("Phase Review preview contract", () => {
  it("supports a one-action begin recommendation", () => {
    const review = createPhaseReviewPreview({
      recommendation: "begin_next_phase",
      recommendationLabel: "Begin Phase 2 — Lean Mass Build",
      explanation: "The evidence supports beginning the next phase.",
      currentPhase: { id: "phase-1", name: "Phase 1" },
      nextPhase: { id: "phase-2", name: "Phase 2 — Lean Mass Build" },
      originalReviewDate: "2026-08-15",
    });
    expect(review.durationOptions).toEqual([7, 14, 21, "custom"]);
    expect(projectPhaseReviewSelection(review)).toMatchObject({
      selectedOutcome: "begin_next_phase",
      projectedNextPhaseStart: "2026-08-15",
      projectedNextPhaseReview: "2026-09-12",
    });
  });

  it("defaults to PI's recommended two-week extension", () => {
    expect(projectPhaseReviewSelection(extend())).toEqual({ selectedOutcome: "continue_current_phase", selectedDurationDays: 14, customReviewDate: null, recommendedReviewDate: "2026-08-29", selectedReviewDate: "2026-08-29", projectedNextPhaseStart: "2026-08-29", projectedNextPhaseReview: "2026-09-26" });
  });

  it("allows an override while preserving PI's recommendation", () => {
    const review = extend();
    const projection = projectPhaseReviewSelection(review, { durationDays: 7 });
    expect(review.recommendedDurationDays).toBe(14);
    expect(projection).toMatchObject({ selectedDurationDays: 7, recommendedReviewDate: "2026-08-29", selectedReviewDate: "2026-08-22" });
  });

  it("supports a preview-only custom date", () => {
    expect(projectPhaseReviewSelection(extend(), { durationDays: "custom", customReviewDate: "2026-09-05" })).toMatchObject({ selectedDurationDays: null, customReviewDate: "2026-09-05", selectedReviewDate: "2026-09-05", projectedNextPhaseStart: "2026-09-05" });
  });

  it("keeps PI's recommendation stable when the user chooses the alternate decision", () => {
    const review = createPhaseReviewPreview({
      recommendation: "begin_next_phase",
      recommendationLabel: "Begin Phase 2 — Lean Mass Build",
      explanation: "Phase 1 appears to have accomplished its purpose.",
      currentPhase: { id: "phase-1", name: "Establish Maintenance", shortName: "Phase 1" },
      nextPhase: { id: "phase-2", name: "Lean Mass Build", shortName: "Phase 2" },
      originalReviewDate: "2026-08-15",
    });
    const alternate = projectPhaseReviewSelection(review, {
      selectedOutcome: "continue_current_phase",
      durationDays: 14,
    });
    expect(review.recommendation).toBe("begin_next_phase");
    expect(review.recommendationLabel).toBe("Begin Phase 2 — Lean Mass Build");
    expect(alternate.selectedOutcome).toBe("continue_current_phase");
  });

  it("does not mutate its frozen review contract", () => {
    const review = extend();
    const before = JSON.stringify(review);
    projectPhaseReviewSelection(review, { durationDays: 21 });
    expect(JSON.stringify(review)).toBe(before);
    expect(Object.isFrozen(review)).toBe(true);
  });
});
