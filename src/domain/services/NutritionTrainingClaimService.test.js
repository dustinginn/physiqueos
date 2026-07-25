import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createNutritionSupportAssessment } from "./NutritionSupportAssessmentService";
import { createNutritionTrainingClaims } from "./NutritionTrainingClaimService";

describe("Nutrition Training claims", () => {
  it.each([
    ["improving", [180, 180], "training_progress_with_consistent_protein_support"],
    ["stable", [180, 180], "training_stability_with_consistent_protein_support"],
    ["regressing", [150, 180], "training_decline_with_inconsistent_protein_support"],
    ["regressing", [180, 180], "training_decline_despite_adequate_protein_support"],
  ])("maps %s with protein %j", (status, proteins, relationshipState) => {
    expect(claim({ status, proteins }).explanationData.relationshipState).toBe(relationshipState);
  });

  it("represents incomplete Nutrition without converting calories into Energy", () => {
    const result = claim({ status: "improving", proteins: [180, 180], partial: true });
    expect(result.explanationData).toMatchObject({
      relationshipState: "training_progress_despite_incomplete_nutrition_evidence",
      calorieBalanceInterpretation: null,
    });
    expect(result.confidence.level).toBe("low");
  });

  it("requires exact cadence windows and sufficient canonical Training", () => {
    expect(claim({ nutritionWindow: { startDate: "2026-07-20", endDate: "2026-07-25" } }).explanationData.relationshipState)
      .toBe("nutrition_training_relationship_insufficient");
    expect(claim({ status: "insufficient_data" }).explanationData.relationshipState)
      .toBe("nutrition_training_relationship_insufficient");
  });

  it("keeps stable identity across target, protein values, direction, dates, and confidence", () => {
    expect(claim({ proteins: [120, 130] }).id).toBe(claim({ proteins: [190, 200], status: "regressing" }).id);
  });

  it("preserves target and evidence provenance without meals or raw days", () => {
    const result = claim({});
    expect(result.explanationData.targetSource).toMatchObject({
      sourceId: "nutrition-protocol",
      version: "v2",
      historicalProvenanceAvailable: true,
    });
    expect(result.provenance.sourceEvidenceIds).toEqual(expect.arrayContaining(["nutrition-0", "nutrition-1", "training-session"]));
    expect(JSON.stringify(result)).not.toMatch(/meals|foods/);
  });

  it("is immutable, non-causal, non-prescriptive, and makes no muscle-gain or food-quality claim", () => {
    const training = trainingObservation();
    const nutrition = assessment({});
    const before = structuredClone({ training, nutrition });
    const result = createNutritionTrainingClaims({ trainingObservations: [training], nutritionAssessment: nutrition })[0];
    expect({ training, nutrition }).toEqual(before);
    expect(result.explanationData).toMatchObject({
      causalInference: false,
      muscleGainConclusion: null,
      foodQualityJudgment: null,
    });
    expect(result.explanationData).not.toHaveProperty("recommendation");
  });
});

function claim(options = {}) {
  return createNutritionTrainingClaims({
    trainingObservations: [trainingObservation(options)],
    nutritionAssessment: assessment(options),
  })[0];
}
function assessment({ proteins = [180, 180], partial = false, nutritionWindow = window() }) {
  const dates = [];
  for (let date = nutritionWindow.startDate; date <= nutritionWindow.endDate;) {
    dates.push(date);
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return createNutritionSupportAssessment({
    nutritionDays: dates.map((date, index) => ({
      id: `nutrition-${index}`,
      date,
      daily_totals: { calories: 2400, protein_g: proteins[index % proteins.length] },
      metadata: { completeness: partial && index === 0 ? "partial" : "complete" },
    })),
    target: { value: 167, unit: "g", sourceId: "nutrition-protocol", version: "v2", effectiveDate: "2026-07-19" },
    window: nutritionWindow,
    cadence: "weekly",
  });
}
function trainingObservation({ status = "improving" } = {}) {
  return createPIObservation({
    id: "performance|overall|resistance", domain: "training", kind: "training_performance",
    subject: { type: "training_scope", id: "resistance", label: "Resistance training" },
    status, direction: status === "improving" ? "positive" : status === "regressing" ? "negative" : status === "insufficient_data" ? "not_applicable" : "neutral",
    evidenceWindow: window(), supportingEvidenceIds: ["training-session"],
    confidence: { level: status === "insufficient_data" ? "low" : "moderate", method: "fixture" },
    explanationData: {},
    provenance: { producer: "fixture", producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: ["training-session"] },
  });
}
function window() { return { startDate: "2026-07-19", endDate: "2026-07-25" }; }
