import { describe, expect, it } from "vitest";

import {
  createMonthlyEvidenceIntelligenceV3,
  MonthlyCrossSourceRelationshipV3,
  MonthlyDeviationStateV3,
  MonthlyMeasurementTypeV3,
} from "./MonthlyEvidenceIntelligenceV3.js";

describe("Monthly Evidence Intelligence V3", () => {
  it("distinguishes normal, isolated, repeated and persistent deviations", () => {
    expect(row(run({ nutrition: records(7) }), "nutrition").deviation)
      .toBe(MonthlyDeviationStateV3.NORMAL_VARIATION);
    expect(row(run({ nutrition: records(7, [2]) }), "nutrition").deviation)
      .toBe(MonthlyDeviationStateV3.ISOLATED_DEVIATION);
    expect(row(run({ nutrition: records(7, [1, 5]) }), "nutrition").deviation)
      .toBe(MonthlyDeviationStateV3.REPEATED_DEVIATION);
    expect(row(run({ nutrition: records(7, [1, 2, 3, 4]) }), "nutrition")
      .deviation).toBe(MonthlyDeviationStateV3.PERSISTENT_TREND_CHANGE);
  });

  it("models configured Training split, extra exposure and persistent misses", () => {
    const result = run({
      training: {
        configuredSplit: { weeklyFrequencies: { quads: 1, core: 1 } },
        sessions: [
          session("2026-09-06", ["quads", "core"]),
          session("2026-09-07", ["core"]),
          session("2026-09-13", ["core"]),
          session("2026-09-20", ["core"]),
        ],
      },
    });
    expect(result.trainingPattern.baselineMode).toBe("configured_strategy");
    expect(result.trainingPattern.extraExposures).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "core", actual: 2 }),
    ]));
    expect(result.trainingPattern.persistentMisses.filter((item) =>
      item.category === "quads")).toHaveLength(2);
  });

  it("derives a personal split baseline when explicit configuration is absent", () => {
    const result = run({
      training: {
        baselineSessions: [
          session("2026-08-16", ["back"]),
          session("2026-08-17", ["quads"]),
          session("2026-08-23", ["back"]),
          session("2026-08-24", ["quads"]),
        ],
        sessions: [session("2026-09-01", ["back"]),
          session("2026-09-02", ["quads"])],
      },
    });
    expect(result.trainingPattern).toMatchObject({
      baselineMode: "personal_history",
      expectedWeeklyFrequencies: { back: 1, quads: 1 },
    });
  });

  it("detects a short Training break and return without inferring a reason", () => {
    const result = run({ training: { sessions: [
      session("2026-09-04", ["chest"]),
      session("2026-09-08", ["shoulders"]),
    ] } });
    expect(result.trainingPattern.shortBreaks).toEqual([{
      startDate: "2026-09-05", endDate: "2026-09-07", days: 3,
      returnedAt: "2026-09-08", inferredReason: null,
    }]);
    expect(result.trainingPattern.returnedToRhythm).toBe(true);
  });

  it("keeps Nutrition and wearable evidence useful while modeling uncertainty", () => {
    const result = run({
      nutrition: records(7).map((item) => ({ ...item,
        limitations: ["logged_intake_uncertain"] })),
      activity: records(7).map((item) => ({ ...item,
        limitations: ["wearable_expenditure_estimated"] })),
    });
    expect(row(result, "nutrition")).toMatchObject({
      measurementType: MonthlyMeasurementTypeV3.RECORDED_INPUT,
      quality: "adequate",
    });
    expect(row(result, "activity")).toMatchObject({
      measurementType: MonthlyMeasurementTypeV3.WEARABLE_ESTIMATE,
      quality: "adequate",
    });
  });

  it("calibrates literal Energy reliance from repeated realized outcomes", () => {
    const result = run({
      energy: energyRecords([-400, -300, -250, -500, -350]),
      historicalCalibration: [
        calibration("contradicts", "supports", "outcome-1"),
        calibration("contradicts", "supports", "outcome-2"),
      ],
    });
    expect(result.personalCalibration).toMatchObject({
      mode: "transparent_on_demand_history",
      currentRelationship: "poor_literal_alignment",
      learnedCorrectionFactor: null,
    });
    expect(row(result, "energy")).toMatchObject({
      strategicConsequence: "directional_input_with_reduced_literal_reliance",
      measurementType: MonthlyMeasurementTypeV3.DERIVED_ESTIMATE,
    });
  });

  it("distinguishes cross-source corroboration from estimate/outcome tension", () => {
    const result = run({
      outcomes: [outcome("outcome", "supports")],
      photos: [photo("photo", "supports")],
      training: { sessions: [session("2026-09-03", ["back"])],
        coachingCandidates: [milestone()] },
      energy: energyRecords([-400, -300, -250, -500]),
    });
    expect(result.relationships.some((item) =>
      item.type === MonthlyCrossSourceRelationshipV3.CORROBORATION &&
      item.sourceIds.includes("outcome"))).toBe(true);
    expect(result.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: MonthlyCrossSourceRelationshipV3.ESTIMATE_VS_OUTCOME,
        strongerSourceId: "outcome",
      }),
    ]));
    expect(result.relationships.some((item) => item.sourceIds.includes(
      "monthly|nutrition") && item.sourceIds.includes("monthly|activity")))
      .toBe(false);
  });

  it("downweights incomparable Photo observations and preserves Goal-relative authority", () => {
    const quantitative = run({
      outcomes: [outcome("outcome", "supports")],
      photos: [{ ...photo("photo", "supports"), comparability: "limited" }],
    });
    expect(row(quantitative, "photos")).toMatchObject({
      quality: "limited",
      direction: "indeterminate",
      strategicConsequence: "no_strategic_change",
    });
    const visual = run({
      goalPolicy: { domains: { photos: { goalRelevance: "direct" },
        outcome: { goalRelevance: "supporting" } } },
      outcomes: [outcome("outcome", "supports")],
      photos: [photo("photo", "supports")],
    });
    expect(row(visual, "photos").goalRelevance).toBe("direct");
    expect(row(visual, "outcome").goalRelevance).toBe("supporting");
  });

  it("does not move Confidence merely because a deviation is interesting", () => {
    const result = run({
      currentConfidence: 79,
      training: { sessions: [session("2026-09-01", ["back"])],
        coachingCandidates: [milestone()] },
    });
    expect(result.confidenceConsequence).toMatchObject({
      priorPercentage: 79,
      currentPercentage: 79,
      delta: 0,
      narrativeInterestChangesConfidence: false,
      measurementUncertaintyAutomaticallyLowersConfidence: false,
    });
  });

  it("changes the recommendation only after persistent corroborated adverse evidence", () => {
    const result = run({
      outcomes: [outcome("outcome", "contradicts")],
      nutrition: records(7).map((item) => ({ ...item,
        direction: "contradicts" })),
    });
    expect(result.recommendation).toMatchObject({
      action: "review_current_strategy",
      basis: "persistent_corroborated_adverse_evidence",
      derivedEstimateAloneCanChangeStrategy: false,
    });
  });

  it("uses communication memory and keeps Monthly to a bounded highlight reel", () => {
    const first = milestone();
    const result = run({
      communicationMemory: [{ topicKey: first.topicKey,
        materialStateKey: first.materialStateKey }],
      outcomes: [outcome("outcome", "supports")],
      training: { sessions: [session("2026-09-01", ["back"])],
        coachingCandidates: [first,
          ...Array.from({ length: 8 }, (_, index) => milestone(index + 1))] },
    });
    expect(result.selectedHighlights).toHaveLength(3);
    expect(result.selectedHighlights.filter((item) => item.domain ===
      "training")).toHaveLength(2);
    expect(result.selectedHighlights.some((item) =>
      item.candidateId === first.id)).toBe(false);
    expect(result.rejectedHighlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: first.id,
        reason: "already_communicated_without_material_change" }),
    ]));
  });

  it("requires no new persistence or publication writes", () => {
    const result = run();
    expect(result.persistence).toMatchObject({ required: false,
      mode: "derive_from_bounded_canonical_history" });
    expect(result.publication).toEqual({ mode: "shadow_only", writes: 0 });
  });
});

function run(overrides = {}) {
  return createMonthlyEvidenceIntelligenceV3({
    window: { startDate: "2026-09-01", endDate: "2026-09-30",
      cutoff: "2026-09-30T23:59:59.999Z" },
    goalPolicy: { domains: { outcome: { goalRelevance: "direct" },
      photos: { goalRelevance: "supporting" },
      training: { goalRelevance: "high" },
      nutrition: { goalRelevance: "supporting" },
      activity: { goalRelevance: "contextual" },
      energy: { goalRelevance: "supporting" },
      weight: { goalRelevance: "supporting" } } },
    currentConfidence: 79,
    ...overrides,
  });
}

function row(result, domain) {
  return result.sourceMatrix.find((item) => item.domain === domain);
}

function records(count, deviated = []) {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    value: 100 + index,
    expectedDays: count,
    usable: true,
    deviation: deviated.includes(index),
    direction: "supports",
  }));
}

function energyRecords(values) {
  return values.map((balance, index) => ({
    id: `energy-${index}`,
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    balance,
    direction: balance < 0 ? "contradicts" : "supports",
  }));
}

function session(date, categories) {
  return { id: `session-${date}-${categories.join("-")}`, date, categories };
}

function outcome(id, direction) {
  return { id, observedAt: "2026-09-12", direction, quality: "robust",
    statement: direction === "supports" ? "The outcome improved." :
      "The outcome moved away from the Goal." };
}

function photo(id, direction) {
  return { id, observedAt: "2026-09-08", direction, quality: "adequate",
    comparability: "comparable", statement: "The matched view supports the direction.",
    observationCount: 5 };
}

function calibration(derivedDirection, realizedOutcomeDirection, id) {
  return { comparable: true, derivedDirection, realizedOutcomeDirection,
    authoritativeOutcome: true, durationDays: 20, evidenceIds: [id] };
}

function milestone(index = 0) {
  return { id: `milestone-${index}`, topicKey: `training|movement-${index}`,
    materialStateKey: `state-${index}`, kind: "milestone",
    headline: `Movement ${index} set a personal best.`,
    detail: "The record is based on comparable work.", milestoneValue: 0.8,
    decisionImpact: 0.3 };
}
