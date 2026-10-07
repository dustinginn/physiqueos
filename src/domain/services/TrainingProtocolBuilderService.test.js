import { describe, expect, it } from "vitest";
import { createFounderTrainingProtocolActivation } from "./TrainingProtocolBuilderService.js";

describe("TrainingProtocolBuilderService progression authority", () => {
  it("persists the executable Founder-locked count and exposure rule", () => {
    const { version } = createFounderTrainingProtocolActivation({
      confirmedAt: "2026-10-06T18:30:00.000Z",
      effectiveAt: "2026-10-06",
      userId: "founder",
    });
    expect(version.trainingStrategy.progression.defaultRule).toEqual({
      type: "double_progression_confirmed_sessions",
      condition: "reach_top_of_rep_range",
      action: "increase_load",
      successfulSessionsRequired: 2,
      minimumExposureDays: 14,
    });
    expect(version.trainingStrategy.progression.prescriptionSchemaVersion)
      .toBe("training_double_progression_prescription_v1");
    expect(version.evidenceBasis.limitations).toEqual([
      "Exercise-specific rep ranges, working-set counts, rep increments, reset targets, and equipment increments are not configured yet.",
    ]);
  });
});
