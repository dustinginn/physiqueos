import { describe, expect, it } from "vitest";
import { createNutritionSupportAssessment } from "./NutritionSupportAssessmentService";

describe("Nutrition support assessment", () => {
  it("calculates exact complete, partial, missing, met, and missed counts", () => {
    const result = assess([
      day("2026-07-19", 180),
      day("2026-07-20", 160),
      day("2026-07-21", 190, "partial"),
    ]);
    expect(result).toMatchObject({
      expectedDayCount: 7,
      observedDayCount: 3,
      eligibleDayCount: 3,
      completeDayCount: 2,
      partialDayCount: 1,
      missingDayCount: 4,
      proteinTargetMetDayCount: 2,
      proteinTargetMissedDayCount: 1,
      completeness: "partial",
      proteinConsistency: "inconsistently_met",
    });
  });

  it.each([
    [[180, 190, 200, 185], "consistently_met"],
    [[180, 190, 200, 160], "mostly_met"],
    [[180, 160, 150, 140], "inconsistently_met"],
    [[160, 150, 140, 130], "consistently_missed"],
  ])("maps deterministic consistency %j", (values, expected) => {
    expect(assess(values.map((value, index) => day(`2026-07-${19 + index}`, value))).proteinConsistency).toBe(expected);
  });

  it("requires two eligible days for cadence consistency but permits exact Daily status", () => {
    expect(assess([day("2026-07-19", 180)]).proteinConsistency).toBe("insufficient");
    expect(assess([day("2026-07-19", 180)], { cadence: "daily", window: { startDate: "2026-07-19", endDate: "2026-07-19" } }).proteinConsistency).toBe("consistently_met");
  });

  it("keeps missing days missing and unknown targets explicit", () => {
    expect(assess([], {}).completeness).toBe("missing");
    const result = assess([day("2026-07-19", 180)], { target: null });
    expect(result.proteinConsistency).toBe("unknown");
    expect(result.limitations).toContain("protein_target_unavailable");
  });

  it("records historical target limitations without inventing provenance", () => {
    const result = assess([day("2026-07-19", 180)], {
      target: { value: 167, unit: "g", sourceId: "protocol", version: "v1" },
    });
    expect(result.limitations).toContain("historical_protein_target_provenance_unavailable");
    expect(result.provenance.targetSourceId).toBe("protocol");
  });

  it("is deterministic, immutable, repository-free, clock-free, and excludes meals", () => {
    const input = [day("2026-07-19", 180)];
    const before = structuredClone(input);
    const result = assess(input);
    expect(input).toEqual(before);
    expect(assess(input)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/meals|foods/);
    expect(result.provenance).toMatchObject({ repositoryReads: 0, runtimeClockReads: 0 });
  });
});

function assess(nutritionDays, overrides = {}) {
  return createNutritionSupportAssessment({
    nutritionDays,
    target: overrides.target === undefined
      ? { value: 167, unit: "g", sourceId: "nutrition-protocol", version: "v2", effectiveDate: "2026-07-19" }
      : overrides.target,
    window: overrides.window ?? { startDate: "2026-07-19", endDate: "2026-07-25" },
    cadence: overrides.cadence ?? "weekly",
  });
}
function day(date, protein, completeness = "complete") {
  return { id: `nutrition-${date}`, evidence_type: "nutrition", date, daily_totals: { calories: 2400, protein_g: protein }, metadata: { completeness } };
}
