import { describe, expect, it } from "vitest";
import {
  resolveActivityEvidenceCompleteness,
  resolveNutritionEvidenceCompleteness,
  resolvePairedEnergyDayCompleteness,
} from "./EnergyEvidenceCompletenessService";

describe("EnergyEvidenceCompletenessService", () => {
  it.each([
    [{ payload: { metadata: { completeness: "complete" } } }, "complete"],
    [{ payload: { metadata: { completeness: "partial" } } }, "partial"],
    [{ payload: { metadata: { completeness: "unknown" } } }, "unknown"],
    [null, "missing"],
    [{ payload: { daily_totals: { calories: 2200 } } }, "unknown"],
  ])("resolves Nutrition source metadata %#", (record, expected) => {
    expect(resolveNutritionEvidenceCompleteness(record)).toBe(expected);
  });

  it("uses explicit canonical metadata before lower-authority quality status", () => {
    expect(resolveNutritionEvidenceCompleteness({
      quality: { status: "complete" },
      payload: { metadata: { completeness: "partial" } },
    })).toBe("partial");
  });

  it.each([
    [{ payload: { metadata: { completeness: "complete" } } }, "complete"],
    [{ payload: { metadata: { completeness: "incomplete" } } }, "partial"],
    [{ payload: { metadata: { completeness: "unknown" } } }, "unknown"],
    [null, "missing"],
    [{ payload: { daily_activity: { move_calories: 500 } } }, "unknown"],
  ])("resolves Activity source metadata %#", (record, expected) => {
    expect(resolveActivityEvidenceCompleteness(record)).toBe(expected);
  });

  it.each([
    ["complete", "complete", "complete"],
    ["complete", "partial", "partial"],
    ["partial", "complete", "partial"],
    ["partial", "partial", "partial"],
    ["complete", "missing", "unpaired_nutrition"],
    ["missing", "complete", "unpaired_activity"],
    ["unknown", "complete", "unknown"],
    ["missing", "missing", "missing"],
  ])("pairs %s plus %s as %s", (nutrition, activity, expected) => {
    expect(resolvePairedEnergyDayCompleteness(nutrition, activity)).toBe(expected);
  });
});
