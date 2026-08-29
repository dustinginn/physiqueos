import { describe, expect, it } from "vitest";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
import { reconcileEnergyDays } from "./EnergyDailyReconciliationService";
import { composeLoggedTodaySummary } from "./LoggedTodayService";
import { getCanonicalPayloads } from "./ProgressReportingService";
import {
  createNutritionSemanticFingerprint,
  prepareNutritionEvidencePackageForReview,
  selectActiveCanonicalNutritionDays,
} from "./CanonicalNutritionDayService";

const userId = "founder";
const date = "2026-08-08";

describe("canonical NutritionDay revision semantics", () => {
  it("replaces a newer full-day package in one stable lineage", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const original = first[0];
    const second = confirm(first, fullDayPackage("package-b", "nutrition-b", 650, 2450), "review-b");
    const active = selectActiveCanonicalNutritionDays(second, { date });
    const current = active.records[0];

    expect(active.diagnostics).toEqual([]);
    expect(active.records).toHaveLength(1);
    expect(current.canonicalId).toBe("nutrition|2026-08-08|nutrition-day");
    expect(current.payload.daily_totals.calories).toBe(2450);
    expect(current.payload.meals.find((meal) => meal.name === "Snacks")?.totals.calories).toBe(650);
    expect(current.payload.meals.filter((meal) => meal.name === "Snacks")).toHaveLength(1);
    expect(current.nutritionRevision.revision).toBe(2);
    expect(current.nutritionRevision.semanticFingerprint).not.toBe(
      original.nutritionRevision.semanticFingerprint
    );
    expect(current.nutritionRevisionHistory).toHaveLength(1);
    expect(current.nutritionRevisionHistory[0].payload.daily_totals.calories).toBe(2200);
    expect(current.nutritionRevisionHistory[0].payload.meals.find((meal) =>
      meal.name === "Snacks")?.totals.calories).toBe(400);
    expect(current.provenance.evidence_package_ids).toEqual(["package-a", "package-b"]);
    expect(current.provenance.evidence_review_ids).toEqual(["review-a", "review-b"]);
  });

  it("projects a matching meal replacement across the complete canonical day", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: {},
      meals: [meal("Snacks", 650)],
      metadata: {
        date,
        daily_totals_scope: "partial_meal_subtotal",
      },
    }));
    const prepared = prepare(first, incoming, "review-b");
    const relationship = prepared.evidence_objects[0].reconciliation.nutrition;
    const second = apply(first, reconcileConfirmedEvidencePackage({
      evidencePackage: prepared,
      existingCanonicalObjects: first,
      userId,
    }).changedObjects);
    const current = selectActiveCanonicalNutritionDays(second, { date }).records[0];

    expect(relationship.newPreview.calories).toBeNull();
    expect(relationship.newPreview.meals[0].calories).toBe(650);
    expect(relationship.projectedPreview.calories).toBe(2450);
    expect(current.payload.daily_totals.calories).toBe(2450);
    expect(current.payload.meals.filter((item) => item.name === "Snacks")).toHaveLength(1);
    expect(current.payload.meals.find((item) => item.name === "Snacks")?.totals.calories).toBe(650);
    expect(current.payload.meals.find((item) => item.name === "Breakfast")?.totals.calories).toBe(450);
    expect(current.nutritionRevision.replacementScope).toBe("meal:snacks");
    expect(current.nutritionRevisionHistory).toHaveLength(1);
    expect(composeLoggedTodaySummary({ canonicalObjects: second, dateKey: date })
      .rows.find((row) => row.id === "nutrition")?.summary).toContain("2,450 calories");
    const reportingNutrition = getCanonicalPayloads({
      canonicalEvidenceObjects: second,
    }).filter((item) => item.evidence_type === "nutrition");
    expect(reportingNutrition).toEqual([
      expect.objectContaining({
        daily_totals: expect.objectContaining({ calories: 2450 }),
      }),
    ]);
    expect(reconcileEnergyDays({ nutritionDays: reportingNutrition })).toEqual([
      expect.objectContaining({ calorieIntake: 2450, date }),
    ]);
  });

  it("projects calories and macros from unchanged meals plus the replacement meal", () => {
    const existing = packageFor("package-a", nutrition("nutrition-a", {
      daily_totals: totals(2200, 150, 240, 70),
      meals: [
        meal("Breakfast", 450, 40, 45, 12),
        meal("Lunch", 600, 45, 60, 18),
        meal("Dinner", 750, 50, 80, 25),
        meal("Snacks", 400, 15, 55, 15),
      ],
    }));
    const first = confirm([], existing, "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: totals(650, 25, 75, 20),
      meals: [meal("Snacks", 650, 25, 75, 20)],
      metadata: { date, daily_totals_scope: "partial_meal_subtotal" },
    }));
    const prepared = prepare(first, incoming, "review-b");
    const relationship = prepared.evidence_objects[0].reconciliation.nutrition;
    const second = apply(first, reconcileConfirmedEvidencePackage({
      evidencePackage: prepared,
      existingCanonicalObjects: first,
      userId,
    }).changedObjects);
    const current = selectActiveCanonicalNutritionDays(second, { date }).records[0];

    expect(relationship.projectedPreview.dailyTotals).toEqual({
      calories: 2450,
      protein_g: 160,
      carbs_g: 260,
      fat_g: 75,
    });
    expect(current.payload.daily_totals).toEqual(expect.objectContaining({
      calories: 2450,
      protein_g: 160,
      carbs_g: 260,
      fat_g: 75,
    }));
  });

  it("preserves authoritative daily fields when existing meal coverage is incomplete", () => {
    const first = confirm([], packageFor("package-a", nutrition("nutrition-a", {
      daily_totals: totals(2300, 150, 240, 70),
      meals: [
        meal("Breakfast", 450, 40, 45, 12),
        meal("Lunch", 600, 45, 60, 18),
        meal("Dinner", 750, 50, 80, 25),
        meal("Snacks", 400, 15, 55, 15),
      ],
    })), "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: totals(650, 25, 75, 20),
      meals: [meal("Snacks", 650, 25, 75, 20)],
      metadata: { date, daily_totals_scope: "partial_meal_subtotal" },
    }));
    const second = confirm(first, incoming, "review-b");
    const current = selectActiveCanonicalNutritionDays(second, { date }).records[0];

    expect(current.payload.daily_totals).toEqual(expect.objectContaining({
      calories: 2300,
      protein_g: 160,
      carbs_g: 260,
      fat_g: 75,
    }));
    expect(current.payload.metadata.canonical_projection).toEqual(expect.objectContaining({
      recomputedFields: ["protein_g", "carbs_g", "fat_g"],
      preservedFields: ["calories"],
    }));
  });

  it("adds one demonstrably distinct meal only after explicit disposition", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: {},
      meals: [meal("Late Snack", 250)],
      metadata: { date, daily_totals_scope: "partial_meal_subtotal" },
    }));
    const prepared = prepare(first, incoming, "review-b");
    prepared.evidence_objects[0].reconciliation.nutrition.disposition = "additive";
    const second = apply(first, reconcileConfirmedEvidencePackage({
      evidencePackage: prepared,
      existingCanonicalObjects: first,
      userId,
    }).changedObjects);
    const current = selectActiveCanonicalNutritionDays(second, { date }).records[0];

    expect(current.payload.meals.map((item) => item.name)).toContain("Late Snack");
    expect(current.payload.daily_totals.calories).toBe(2200);
    expect(current.nutritionRevision.disposition).toBe("additive");
  });

  it("requires a bounded review choice before ambiguous canonical mutation", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: {},
      meals: [meal("Late Snack", 250)],
      metadata: { date, daily_totals_scope: "unknown" },
    }));
    const prepared = prepare(first, incoming, "review-b");
    const before = JSON.stringify(first);

    expect(prepared.evidence_objects[0].reconciliation.nutrition)
      .toEqual(expect.objectContaining({
        disposition: null,
        dispositionStatus: "requires_choice",
      }));
    expect(() => reconcileConfirmedEvidencePackage({
      evidencePackage: prepared,
      existingCanonicalObjects: first,
      userId,
    })).toThrowError(expect.objectContaining({
      code: "NUTRITION_DISPOSITION_REQUIRED",
    }));
    expect(JSON.stringify(first)).toBe(before);
  });

  it("rejects a stale review fingerprint without overwriting either revision", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const stale = prepare(first,
      fullDayPackage("package-b", "nutrition-b", 650, 2450), "review-b");
    const newer = confirm(first,
      fullDayPackage("package-c", "nutrition-c", 700, 2500), "review-c");
    const before = JSON.stringify(newer);

    expect(() => reconcileConfirmedEvidencePackage({
      evidencePackage: stale,
      existingCanonicalObjects: newer,
      userId,
    })).toThrowError(expect.objectContaining({ code: "NUTRITION_REVISION_STALE" }));
    expect(JSON.stringify(newer)).toBe(before);
  });

  it("blocks a write when legacy history already has two active days", () => {
    const duplicateA = legacy("nutrition-old-a", nutrition("old-a"));
    const duplicateB = legacy("nutrition-old-b", nutrition("old-b"));
    const existing = [duplicateA, duplicateB];
    const prepared = prepareNutritionEvidencePackageForReview({
      canonicalObjects: existing,
      evidencePackage: fullDayPackage("package-c", "nutrition-c", 650, 2450),
      reviewId: "review-c",
    });

    expect(prepared.evidence_objects[0].reconciliation.nutrition
      .dispositionStatus).toBe("blocked_duplicate_active_days");
    expect(() => reconcileConfirmedEvidencePackage({
      evidencePackage: prepared,
      existingCanonicalObjects: existing,
      userId,
    })).toThrow(/multiple active days/i);
    expect(selectActiveCanonicalNutritionDays(existing, { date })
      .diagnostics[0].code).toBe("NUTRITION_ACTIVE_DAY_DUPLICATE");
  });

  it("recognizes the exact committed review source on post-commit reentry", () => {
    const packageId = "evidence_submission_20260829050904908_images";
    const reviewId = "evidence_review_20260829051041150";
    const objectId = "nutrition_2026-08-28_0";
    const incidentDate = "2026-08-28";
    const incoming = fullDayPackage(packageId, objectId, 703, 2350);
    incoming.evidence_objects[0].observed_at = incidentDate;
    incoming.evidence_objects[0].metadata.date = incidentDate;
    incoming.evidence_objects[0].meals = [
      meal("Breakfast", 440),
      meal("Lunch", 620),
      meal("Dinner", 588),
      meal("Snacks", 703),
    ];
    incoming.evidence_objects.push({
      id: "activity_day_2026-08-28_applefitness_IMG_2059",
      evidence_type: "activity_day",
      observed_at: incidentDate,
      metrics: { active_calories: 500 },
    });
    const initiallyPrepared = prepare([], incoming, reviewId);
    expect(initiallyPrepared.evidence_objects[0].reconciliation.nutrition)
      .toEqual(expect.objectContaining({
        disposition: "additive",
        dispositionStatus: "automatic",
        replacementScope: "initial_day",
      }));

    const firstResult = reconcileConfirmedEvidencePackage({
      evidencePackage: initiallyPrepared,
      existingCanonicalObjects: [],
      userId,
    });
    const canonical = apply([], firstResult.changedObjects);
    const nutritionBefore = canonical.find((item) => item.evidence_type === "nutrition");
    const activityBefore = canonical.find((item) => item.evidence_type === "activity_day");
    const reentered = prepare(canonical, initiallyPrepared, reviewId);
    const relationship = reentered.evidence_objects[0].reconciliation.nutrition;

    expect(relationship).toEqual(expect.objectContaining({
      disposition: null,
      dispositionStatus: "already_committed",
      sourceReviewId: reviewId,
      targetCanonicalId: nutritionBefore.canonicalId,
    }));
    expect(relationship.existingPreview).toBeNull();
    expect(relationship.newPreview).toBeNull();
    expect(relationship.projectedPreview).toBeNull();

    const replay = reconcileConfirmedEvidencePackage({
      evidencePackage: {
        ...reentered,
        evidence_objects: [reentered.evidence_objects[0]],
      },
      existingCanonicalObjects: canonical,
      userId,
    });
    expect(replay.changedObjects).toEqual([]);
    expect(nutritionBefore.nutritionRevisionHistory).toEqual([]);
    expect(canonical.filter((item) => item.evidence_type === "nutrition")).toHaveLength(1);
    expect(canonical.filter((item) => item.evidence_type === "activity_day")).toHaveLength(1);
    expect(canonical.find((item) => item.evidence_type === "activity_day"))
      .toEqual(activityBefore);
    expect(reentered.evidence_objects[1]).toEqual(initiallyPrepared.evidence_objects[1]);
  });

  it("does not source-match a different review with identical Nutrition values", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const incoming = fullDayPackage("package-b", "nutrition-b", 400, 2200);
    const prepared = prepare(first, incoming, "review-b");
    const relationship = prepared.evidence_objects[0].reconciliation.nutrition;

    expect(relationship.dispositionStatus).toBe("automatic");
    expect(relationship.dispositionStatus).not.toBe("already_committed");
    expect(relationship.targetCanonicalId).toBe(first[0].canonicalId);
    expect(relationship.projectedPreview).not.toBeNull();
  });

  it("fingerprints canonical meaning rather than upload-derived IDs", () => {
    const first = nutrition("upload-a");
    const second = {
      ...nutrition("upload-b"),
      meals: [...nutrition("upload-b").meals].reverse().map((item) => ({
        ...item,
        id: `other-${item.id}`,
      })),
    };
    expect(createNutritionSemanticFingerprint(first, {
      replacementScope: "full_day",
    })).toBe(createNutritionSemanticFingerprint(second, {
      replacementScope: "full_day",
    }));
  });
});

function confirm(existing, evidencePackage, reviewId) {
  const prepared = prepare(existing, evidencePackage, reviewId);
  const result = reconcileConfirmedEvidencePackage({
    evidencePackage: prepared,
    existingCanonicalObjects: existing,
    userId,
  });
  return apply(existing, result.changedObjects);
}

function prepare(existing, evidencePackage, reviewId) {
  return prepareNutritionEvidencePackageForReview({
    canonicalObjects: existing,
    evidencePackage,
    reviewId,
  });
}

function apply(existing, changed) {
  const byId = new Map(existing.map((item) => [item.canonicalId, item]));
  changed.forEach((item) => byId.set(item.canonicalId, item));
  return [...byId.values()];
}

function fullDayPackage(packageId, id, snacksCalories, totalCalories) {
  return packageFor(packageId, nutrition(id, {
    daily_totals: totals(totalCalories),
    metadata: {
      date,
      daily_totals_scope: "full_day_summary",
      completeness: "complete",
    },
    meals: [
      meal("Breakfast", 450),
      meal("Lunch", 600),
      meal("Dinner", 750),
      meal("Snacks", snacksCalories),
    ],
  }));
}

function packageFor(packageId, object) {
  return {
    package_id: packageId,
    evidence_objects: [object],
  };
}

function nutrition(id, overrides = {}) {
  return {
    id,
    evidence_type: "nutrition",
    observed_at: date,
    daily_totals: totals(2200),
    metadata: { date, daily_totals_scope: "full_day_summary" },
    meals: [meal("Breakfast", 450), meal("Lunch", 600),
      meal("Dinner", 750), meal("Snacks", 400)],
    source: { source_artifact_refs: [`${id}.png`] },
    provenance: { source_artifact_refs: [`${id}.png`] },
    ...overrides,
  };
}

function meal(name, calories, protein = null, carbs = null, fat = null) {
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    totals: totals(calories, protein, carbs, fat),
    foods: [],
  };
}

function totals(calories, protein = null, carbs = null, fat = null) {
  return { calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

function legacy(canonicalId, payload) {
  return {
    canonicalId,
    evidence_type: "nutrition",
    payload,
    quality: { status: "active" },
    updatedAt: canonicalId,
    userId,
  };
}
