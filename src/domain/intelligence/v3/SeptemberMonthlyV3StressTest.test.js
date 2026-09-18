import { describe, expect, it } from "vitest";

import { createSeptemberMonthlyV3StressTestFixture } from
  "../../../fixtures/septemberMonthlyV3StressTestFixture.js";
import {
  createMonthlyEvidenceIntelligenceV3,
  MonthlyCrossSourceRelationshipV3,
} from "./MonthlyEvidenceIntelligenceV3.js";

describe("September Monthly V3 intelligence stress test", () => {
  it("builds a bounded cross-source matrix from the audited cutoff", () => {
    const result = september();
    expect(result.window).toEqual({ startDate: "2026-09-01",
      endDate: "2026-09-18", cutoff: "2026-09-18T17:20:06.000Z" });
    expect(result.sourceMatrix.map((item) => item.domain)).toEqual([
      "bodyCompositionOutcome", "photos", "photos", "training_performance", "training_split",
      "nutrition", "activity", "energy", "weight", "recovery", "execution",
    ]);
    expect(result.sourceMatrix.filter((item) => item.domain === "photos")
      .every((item) => item.facts.inWindow === false)).toBe(true);
    expect(row(result, "recovery").quality).toBe("insufficient");
    expect(row(result, "execution").quality).toBe("insufficient");
  });

  it("derives personal calibration transparently without a correction factor", () => {
    const result = september();
    expect(result.personalCalibration).toMatchObject({
      mode: "transparent_on_demand_history",
      comparableWindows: 1,
      tensionWindows: 1,
      currentRelationship: "poor_literal_alignment",
      learnedCorrectionFactor: null,
    });
    expect(result.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME,
        strongerSourceId:
          "dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
      }),
    ]));
    expect(row(result, "energy").facts).toMatchObject({
      pairedDays: 17,
      historicalCalibration: "poor_literal_alignment",
      segments: [
        { segment: "september_1_to_12", days: 12,
          averageBalance: 467.67 },
        { segment: "september_13_to_17", days: 5,
          averageBalance: -289.2 },
      ],
    });
  });

  it("finds bounded Training deviations without inventing a cause", () => {
    const result = september();
    expect(result.trainingPattern).toMatchObject({
      baselineMode: "personal_history",
      sessionCount: 15,
      returnedToRhythm: true,
      persistentMisses: [],
      shortBreaks: [{ startDate: "2026-09-05", endDate: "2026-09-07",
        days: 3, returnedAt: "2026-09-08", inferredReason: null }],
    });
    expect(result.trainingPattern.extraExposures).toEqual([
      expect.objectContaining({ category: "arms", actual: 2, expected: 1 }),
    ]);
    expect(result.trainingPattern.isolatedMisses.map((item) => item.category))
      .toEqual(["back", "core"]);
  });

  it("selects a highlight reel rather than every available domain", () => {
    const result = september();
    expect(result.selectedHighlights.map((item) => item.domain))
      .toEqual(["bodyCompositionOutcome", "training", "training", "training_split"]);
    expect(result.selectedHighlights.map((item) => item.headline).join(" "))
      .toMatch(/Leg press.*Pull-ups/iu);
    expect(result.selectedHighlights).toHaveLength(4);
    expect(result.sourceMatrix.length).toBeGreaterThan(
      result.selectedHighlights.length);
  });

  it("keeps measurement uncertainty local and Confidence unchanged", () => {
    const result = september();
    expect(result.confidenceConsequence).toEqual({
      priorPercentage: 79,
      currentPercentage: 79,
      delta: 0,
      movement: "no_meaningful_change",
      reason: "monthly_awareness_does_not_change_confidence_without_new_decision_relevant_semantics",
      narrativeInterestChangesConfidence: false,
      measurementUncertaintyAutomaticallyLowersConfidence: false,
    });
    expect(result.recommendation).toMatchObject({
      action: "continue_current_strategy",
      basis: "strong_outcome_with_no_confirmed_reversal",
      derivedEstimateAloneCanChangeStrategy: false,
    });
    expect(result.persistence).toMatchObject({ required: false,
      mode: "derive_from_bounded_canonical_history" });
  });
});

function september() {
  return createMonthlyEvidenceIntelligenceV3(
    createSeptemberMonthlyV3StressTestFixture());
}

function row(result, domain) {
  return result.sourceMatrix.find((item) => item.domain === domain);
}
