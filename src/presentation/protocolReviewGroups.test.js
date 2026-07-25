import { describe, expect, it } from "vitest";
import { buildProtocolReviewGroups, currentProtocolSummary, preparedPlanSummary, protocolIdentity } from "./protocolReviewGroups";

function review({ id, category, name, source = {}, recommendation = "keep", status = "accepted" }) {
  return {
    id,
    category,
    displayName: category === "peptide" ? "Peptide" : category === "supplement" ? "Supplement" : category,
    recommendation,
    recommendationReason: "Coach reason",
    reviewStatus: status,
    currentSummary: "Current plan",
    sourceSnapshot: { id: `source_${id}`, name, category, ...source },
  };
}

const retatrutide = review({
  id: "review_reta",
  category: "peptide",
  name: "Retatrutide",
  source: { dose: { value: 2, unit: "mg" }, doseHistory: [{ dose: 2, status: "active" }], schedule: { frequency: "weekly", dayOfWeek: "thursday" } },
});
const tesamorelin = review({
  id: "review_tesa",
  category: "peptide",
  name: "Tesamorelin",
  source: { dose: { value: 0.5, unit: "mg" }, schedule: { frequency: "weekly_days", daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"] } },
});
const creatine = review({ id: "review_creatine", category: "supplement", name: "Creatine", source: { schedule: { frequency: "daily" } } });
const magnesium = review({ id: "review_magnesium", category: "supplement", name: "Magnesium", source: { schedule: { frequency: "every_other_day" } } });

describe("Protocol Review groups", () => {
  it("keeps peptide identities and current schedules distinct", () => {
    expect(protocolIdentity(retatrutide)).toBe("Retatrutide");
    expect(protocolIdentity(tesamorelin)).toBe("Tesamorelin");
    expect(currentProtocolSummary(retatrutide)).toContain("2 mg once weekly on Thursday night");
    expect(currentProtocolSummary(retatrutide)).not.toContain("Sunday through Thursday");
    expect(currentProtocolSummary(tesamorelin)).toBe("0.5 mg Sunday through Thursday nights, after fasting for at least 3 hours before bed.");
    expect(currentProtocolSummary(tesamorelin)).not.toMatch(/once weekly|taper/i);
  });

  it("groups peptides and supplements while preserving every underlying review and source identity", () => {
    const draft = { protocolReviews: [retatrutide, tesamorelin, creatine, magnesium], protocolDrafts: [] };
    const groups = buildProtocolReviewGroups(draft);
    expect(groups.map((group) => group.title)).toEqual(["Peptides", "Supplements"]);
    expect(groups[0].reviews.map((item) => item.id)).toEqual(["review_reta", "review_tesa"]);
    expect(groups[0].reviews.map((item) => item.sourceSnapshot.id)).toEqual(["source_review_reta", "source_review_tesa"]);
    expect(groups[1].currentItems.map((item) => `${item.name}: ${item.summary}`)).toEqual(["Creatine: Daily", "Magnesium: Every other day"]);
  });

  it("does not create indistinguishable generic peptide or supplement items", () => {
    const groups = buildProtocolReviewGroups({ protocolReviews: [retatrutide, tesamorelin, creatine], protocolDrafts: [] });
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.currentItems).map((item) => item.name)).toEqual(["Retatrutide", "Tesamorelin", "Creatine"]);
  });

  it("does not present a kept plan as an updated plan", () => {
    expect(preparedPlanSummary({ ...retatrutide, intendedDisposition: "keep", reviewStatus: "reviewed" }, { status: "ready", payload: {} })).toEqual([]);
  });

  it("makes saved Energy Balance and Nutrition choices dominant", () => {
    const energy = preparedPlanSummary(
      { category: "energy", displayName: "Energy Balance", intendedDisposition: "update", reviewStatus: "reviewed" },
      { status: "ready", payload: { calorieStrategy: "increase_gradually", activityStrategy: "reduce_slightly" } }
    );
    expect(energy).toEqual([
      "Increase calories gradually from your recent cut intake.",
      "Reduce cardio slightly while observing weight, training, and recovery.",
      "Evaluate the overall trend each week rather than reacting to individual days.",
    ]);
    const nutrition = preparedPlanSummary(
      { category: "nutrition", displayName: "Nutrition", intendedDisposition: "update", reviewStatus: "reviewed" },
      { status: "ready", payload: { proteinBasis: "body_weight", proteinRatio: 1, proteinTarget: 167, calorieStrategy: "increase_gradually", carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum", trainingDayFlexibility: true, restDayFlexibility: true } }
    );
    expect(nutrition).toContain("1 g per pound of body weight");
    expect(nutrition).toContain("Increase gradually alongside maintenance calibration");
    expect(nutrition).toContain("Prioritize training performance");
  });
});
