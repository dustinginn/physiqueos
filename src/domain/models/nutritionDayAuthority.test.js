import { describe, expect, it } from "vitest";
import nutritionFixture from "../../fixtures/briefingFamilyV3/nutritionActivityDays.json";
import {
  NutritionAssertionOrigin,
  NutritionAssertionTier,
  NutritionReconciliationState,
  NutritionSourceReliability,
  compareNutritionAssertionTiers,
  resolveNutritionDayAuthority,
  summarizeNutritionAuthorityCoverage,
} from "./nutritionDayAuthority.js";
import { applyNutritionDayMealAggregation } from "./nutritionDayEvidence.js";
import {
  resolveNutritionEvidenceCompleteness,
} from "../services/EnergyEvidenceCompletenessService.js";

const meal = (name, calories, protein_g, carbs_g, fat_g, completeness = "partial") => ({
  name, completeness, totals: { calories, protein_g, carbs_g, fat_g },
});

const day = (overrides = {}) => ({
  evidence_type: "nutrition",
  observed_at: "2026-09-16",
  source: { modality: "screenshot", application: "MyFitnessPal" },
  quality: { status: "complete" },
  metadata: { daily_totals_scope: "unknown", confidence: "high" },
  daily_totals: {},
  meals: [],
  ...overrides,
});

describe("Nutrition daily-total authority", () => {
  it("uses a full-day source total with no meals for Energy", () => {
    const authority = resolveNutritionDayAuthority(day({
      metadata: { daily_totals_scope: "full_day_summary", confidence: "high" },
      daily_totals: { calories: 2480, protein_g: 190, carbs_g: 250, fat_g: 80 },
    }));
    expect(authority.assertion.tier).toBe(NutritionAssertionTier.FULL_DAY_ASSERTED);
    expect(authority.energyUsable).toBe(true);
    expect(authority.energyCompleteness).toBe("complete");
    expect(authority.mealDetail).toMatchObject({ present: false, completeness: "none" });
    expect(authority.dailyTotals.calories).toBe(2480);
    expect(authority.ambiguity).toEqual([]);
  });

  it("accepts a device daily aggregate with no meal objects through the same contract", () => {
    const authority = resolveNutritionDayAuthority(day({
      source: { modality: "device", application: "Health", integration: "device_health_store" },
      metadata: { daily_totals_scope: "full_day_summary" },
      daily_totals: { calories: 2510, protein_g: 185, carbs_g: 260, fat_g: 84 },
    }));
    expect(authority.assertion).toMatchObject({
      tier: NutritionAssertionTier.FULL_DAY_ASSERTED,
      origin: NutritionAssertionOrigin.DEVICE_AGGREGATE,
    });
    expect(authority.sourceCoverage.captureMethod).toBe("device_aggregate");
    expect(authority.reliability).toBe(NutritionSourceReliability.HIGH);
    expect(authority.energyUsable).toBe(true);
    expect(resolveNutritionEvidenceCompleteness(day({
      source: { modality: "device", integration: "device_health_store" },
      metadata: { daily_totals_scope: "full_day_summary" },
      daily_totals: { calories: 2510, protein_g: 185, carbs_g: 260, fat_g: 84 },
    }))).toBe("complete");
  });

  it("keeps a trustworthy full-day total authoritative over partial meals", () => {
    const record = day({
      metadata: { daily_totals_scope: "full_day_summary", confidence: "high" },
      daily_totals: { calories: 2400, protein_g: 180, carbs_g: 240, fat_g: 80 },
      meals: [meal("Breakfast", 500, 40, 50, 15), meal("Lunch", 700, 60, 70, 25)],
    });
    const authority = resolveNutritionDayAuthority(record);
    expect(authority.assertion.tier).toBe(NutritionAssertionTier.FULL_DAY_ASSERTED);
    expect(authority.dailyTotals.calories).toBe(2400);
    expect(authority.mealDetail.completeness).toBe("partial");
    expect(authority.reconciliation.state).toBe(NutritionReconciliationState.MEAL_DETAIL_PARTIAL);
    // Partial meal detail affects meal-pattern coaching only, not Energy eligibility.
    expect(authority.energyUsable).toBe(true);
    expect(authority.energyCompleteness).toBe("complete");
    expect(authority.ambiguity).not.toContain("intake_meal_capture_flagged_partial");

    // The canonical reconciliation agrees: meal sums do not override the assertion.
    const canonical = applyNutritionDayMealAggregation(record);
    expect(canonical.daily_totals.calories).toBe(2400);
    expect(canonical.metadata.daily_totals_reconciliation.authoritative_source)
      .toBe("source_full_day_summary");
  });

  it("uses meal-derived totals when no stronger assertion exists, with explicit uncertainty", () => {
    const authority = resolveNutritionDayAuthority(day({
      metadata: { daily_totals_scope: "partial_meal_subtotal" },
      daily_totals: { calories: 1200, protein_g: 70, carbs_g: 100, fat_g: 40 },
      meals: [
        meal("Breakfast", 600, 40, 50, 20), meal("Lunch", 800, 60, 90, 25),
        meal("Dinner", 1000, 70, 100, 35),
      ],
    }));
    expect(authority.assertion.tier).toBe(NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED);
    expect(authority.dailyTotals.calories).toBe(2400);
    expect(authority.reliability).toBe(NutritionSourceReliability.MODERATE);
    expect(authority.energyUsable).toBe(true);
    expect(authority.energyCompleteness).toBe("complete");
    expect(authority.ambiguity).toEqual(expect.arrayContaining([
      "intake_meal_derived_unverified", "intake_meal_capture_flagged_partial",
    ]));
  });

  it("does not silently treat a partial subtotal as full-day authority", () => {
    const authority = resolveNutritionDayAuthority(day({
      metadata: { daily_totals_scope: "partial_meal_subtotal" },
      daily_totals: { calories: 900, protein_g: 60, carbs_g: 80, fat_g: 30 },
    }));
    expect(authority.assertion.tier).toBe(NutritionAssertionTier.PARTIAL_SUBTOTAL);
    expect(authority.reliability).toBe(NutritionSourceReliability.LOW);
    expect(authority.energyCompleteness).toBe("partial");
    expect(authority.ambiguity).toContain("intake_partial_subtotal");
    expect(compareNutritionAssertionTiers(
      NutritionAssertionTier.PARTIAL_SUBTOTAL, NutritionAssertionTier.FULL_DAY_ASSERTED,
    )).toBeLessThan(0);
  });

  it("reports missing totals as missing", () => {
    const authority = resolveNutritionDayAuthority(day());
    expect(authority.assertion.tier).toBe(NutritionAssertionTier.MISSING);
    expect(authority.reliability).toBe(NutritionSourceReliability.NONE);
    expect(authority.energyUsable).toBe(false);
    expect(authority.energyCompleteness).toBe("missing");
  });

  it("preserves a conflict when a full-day claim is smaller than its own meals", () => {
    const authority = resolveNutritionDayAuthority(day({
      metadata: { daily_totals_scope: "full_day_summary" },
      daily_totals: { calories: 1496, protein_g: 59, carbs_g: 114, fat_g: 91 },
      meals: [
        meal("Breakfast", 400, 61, 24, 6), meal("Lunch", 588, 61, 24, 23),
        meal("Dinner", 809, 47, 27, 57), meal("Snacks", 687, 12, 87, 34),
      ],
    }));
    expect(authority.reconciliation.state).toBe(NutritionReconciliationState.CONFLICT);
    expect(authority.reconciliation.conflictingFields).toContain("calories");
    expect(authority.reconciliation.competing.map((item) => item.basis))
      .toEqual(expect.arrayContaining(["meal_sum", "source_total:full_day_summary"]));
    expect(authority.ambiguity).toContain("intake_source_conflict");
    expect(authority.dailyTotals.calories).toBe(2484);
  });

  it("orders source reliability by capture semantics rather than by integration name", () => {
    const base = { metadata: { daily_totals_scope: "full_day_summary", confidence: "high" }, daily_totals: { calories: 2400 } };
    const device = resolveNutritionDayAuthority(day({ ...base, source: { modality: "device" } }));
    const ocr = resolveNutritionDayAuthority(day({ ...base, source: { modality: "screenshot" } }));
    const ocrLowConfidence = resolveNutritionDayAuthority(day({
      ...base, metadata: { ...base.metadata, confidence: "low" }, source: { modality: "screenshot" },
    }));
    const manual = resolveNutritionDayAuthority(day({ ...base, source: { modality: "manual" } }));
    const meals = resolveNutritionDayAuthority(day({ meals: [meal("Dinner", 2400, 180, 240, 80)] }));
    const partial = resolveNutritionDayAuthority(day({
      metadata: { daily_totals_scope: "partial_meal_subtotal" }, daily_totals: { calories: 800 },
    }));
    const missing = resolveNutritionDayAuthority(day());
    const rank = ["none", "low", "moderate", "high"];
    expect([device, ocr, ocrLowConfidence, manual, meals, partial, missing].map((item) => item.reliability))
      .toEqual(["high", "high", "moderate", "moderate", "moderate", "low", "none"]);
    expect(rank.indexOf(device.reliability)).toBeGreaterThanOrEqual(rank.indexOf(ocr.reliability));
    // Two different device integrations are treated identically.
    const otherDevice = resolveNutritionDayAuthority(day({
      ...base, source: { modality: "integration", integration: "another_aggregator" },
    }));
    expect(otherDevice.reliability).toBe(device.reliability);
  });

  it("interprets the Sep 13–19 Founder days as meal-derived, moderate reliability, with explicit uncertainty", () => {
    const week = nutritionFixture.nutritionDays.filter((item) =>
      item.payload.observed_at >= "2026-09-13" && item.payload.observed_at <= "2026-09-19");
    expect(week).toHaveLength(7);
    const authorities = week.map((item) => resolveNutritionDayAuthority(item));
    for (const authority of authorities) {
      // The seven days must not be presented as source-asserted full-day totals.
      expect(authority.assertion.tier).toBe(NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED);
      expect(authority.reliability).toBe(NutritionSourceReliability.MODERATE);
      expect(authority.energyUsable).toBe(true);
      expect(authority.ambiguity).toContain("intake_meal_derived_unverified");
    }
    // The previous interpretation marked two of the seven days partial from a default string.
    expect(week.map((item) => resolveNutritionEvidenceCompleteness(item)))
      .toEqual(Array(7).fill("complete"));
    const coverage = summarizeNutritionAuthorityCoverage(authorities);
    expect(coverage).toMatchObject({
      dayCount: 7,
      usableDayCount: 7,
      weakestReliability: "moderate",
      byTier: { meal_derived_unverified: 7 },
    });
    expect(week[0].payload.daily_totals.calories).toBe(2285);
    expect(authorities[0].dailyTotals).toMatchObject({ calories: 2285, protein_g: 178, carbs_g: 190, fat_g: 103 });
  });
});
