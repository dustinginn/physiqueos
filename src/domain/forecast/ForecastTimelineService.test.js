import { describe, expect, it } from "vitest";
import { evaluateForecastTimeline } from "./ForecastTimelineService";

describe("Forecast timeline runway", () => {
  it("materializes elapsed and remaining runway for firm completion timing", () => {
    expect(evaluateForecastTimeline({ timeline: { startDate: "2026-07-01",
      targetCompletionDate: "2026-10-31", constraintType: "firm" } }, {
      evaluationContext: { evidenceCutoff: "2026-08-01T23:59:59.999Z" },
    })).toMatchObject({ phase: "active", constraintType: "firm", totalDays: 122,
      elapsedDays: 31, remainingDays: 91, elapsedFraction: 0.254098,
      remainingFraction: 0.745902 });
  });

  it.each(["adaptive", "aspirational", "review_only"])(
    "preserves %s timing without treating it as firm", (constraintType) => {
      expect(evaluateForecastTimeline({ timeline: { startDate: "2026-07-01",
        targetCompletionDate: "2026-10-31", constraintType } }, {
        evaluationContext: { evidenceCutoff: "2026-08-01" },
      }).constraintType).toBe(constraintType);
    });
});
