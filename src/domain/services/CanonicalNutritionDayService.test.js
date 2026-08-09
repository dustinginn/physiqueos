import { describe, expect, it } from "vitest";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
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

  it("replaces a matching meal without appending or fabricating daily totals", () => {
    const first = confirm([], fullDayPackage("package-a", "nutrition-a", 400, 2200), "review-a");
    const incoming = packageFor("package-b", nutrition("nutrition-b", {
      daily_totals: {},
      meals: [meal("Snacks", 650)],
      metadata: {
        date,
        daily_totals_scope: "partial_meal_subtotal",
      },
    }));
    const second = confirm(first, incoming, "review-b");
    const current = selectActiveCanonicalNutritionDays(second, { date }).records[0];

    expect(current.payload.daily_totals.calories).toBe(2200);
    expect(current.payload.meals.filter((item) => item.name === "Snacks")).toHaveLength(1);
    expect(current.payload.meals.find((item) => item.name === "Snacks")?.totals.calories).toBe(650);
    expect(current.nutritionRevision.replacementScope).toBe("meal:snacks");
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

function meal(name, calories) {
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    totals: totals(calories),
    foods: [],
  };
}

function totals(calories) {
  return { calories, protein_g: null, carbs_g: null, fat_g: null };
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
