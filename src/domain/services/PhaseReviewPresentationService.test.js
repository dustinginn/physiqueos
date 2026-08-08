import { describe, expect, it } from "vitest";
import { projectPhaseReviewSelection } from "./PhaseReviewPresentationService";

const review = {
  previewOnly: false,
  recommendation: "begin_next_phase",
  originalReviewDate: "2026-08-15",
  recommendedDurationDays: 14,
  nextPhaseReviewIntervalDays: 28,
};

describe("canonical Phase Review presentation projection", () => {
  it("projects Begin without extension fields", () => {
    expect(projectPhaseReviewSelection(review)).toMatchObject({
      selectedOutcome: "begin_next_phase",
      selectedDurationDays: null,
      projectedNextPhaseStart: "2026-08-15",
      projectedNextPhaseReview: "2026-09-12",
    });
  });

  it("projects the alternate Continue decision and custom review dates", () => {
    expect(projectPhaseReviewSelection(review, {
      selectedOutcome: "continue_current_phase",
      durationDays: "custom",
      customReviewDate: "2026-09-05",
    })).toMatchObject({
      selectedOutcome: "continue_current_phase",
      selectedReviewDate: "2026-09-05",
      projectedNextPhaseStart: "2026-09-05",
    });
  });
});
