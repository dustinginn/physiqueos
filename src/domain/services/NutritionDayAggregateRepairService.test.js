import { describe, expect, it } from "vitest";
import {
  createNutritionDayAggregateRepairService,
  inspectNutritionDayAggregateRepair,
} from "./NutritionDayAggregateRepairService";
import { createNutritionSemanticFingerprint } from "./CanonicalNutritionDayService";

describe("NutritionDay aggregate repair", () => {
  it("recomputes one existing day in place without changing meals, provenance, or other state", async () => {
    const existing = sep5Record();
    const runtime = {
      canonicalEvidenceObjects: [existing, { canonicalId: "unrelated" }],
      evidenceReviews: [{ id: "review-sep5", status: "confirmed" }],
      evidenceContinuationOutbox: [{ id: "outbox-existing", status: "succeeded" }],
      priorities: [{ id: "priority-existing", completed: false }],
    };
    const beforeMeals = structuredClone(existing.payload.meals);
    const beforeUnrelated = JSON.stringify({
      evidenceReviews: runtime.evidenceReviews,
      evidenceContinuationOutbox: runtime.evidenceContinuationOutbox,
      priorities: runtime.priorities,
    });
    const service = createNutritionDayAggregateRepairService({
      mutateCanonicalRuntime: fakeMutation(runtime),
      now: () => new Date("2026-09-09T02:00:00.000Z"),
    });
    const inspection = inspectNutritionDayAggregateRepair({
      canonicalObjects: runtime.canonicalEvidenceObjects,
      date: "2026-09-05",
      userId: "founder",
    });
    expect(inspection).toEqual(expect.objectContaining({
      eligible: true,
      mealCount: 4,
      beforeTotals: expect.objectContaining({ calories: 1205 }),
      afterTotals: expect.objectContaining({ calories: 3920 }),
    }));

    const result = await service.repair({
      commandId: "repair-sep5",
      date: "2026-09-05",
      expectedCanonicalId: existing.canonicalId,
      expectedPriorSemanticFingerprint:
        existing.nutritionRevision.semanticFingerprint,
      userId: "founder",
    });

    const repaired = runtime.canonicalEvidenceObjects[0];
    expect(result).toEqual(expect.objectContaining({
      committed: true,
      canonicalId: existing.canonicalId,
      mealCount: 4,
      afterTotals: expect.objectContaining({
        calories: 3920,
        protein_g: 184,
        carbs_g: 384,
        fat_g: 192,
      }),
    }));
    expect(runtime.canonicalEvidenceObjects).toHaveLength(2);
    expect(repaired.payload.meals).toEqual(beforeMeals);
    expect(repaired.provenance).toEqual(existing.provenance);
    expect(repaired.nutritionRevisionHistory).toHaveLength(1);
    expect(repaired.nutritionRevision.replacementReason)
      .toBe("canonical_meal_aggregate_recomputation");
    expect(JSON.stringify({
      evidenceReviews: runtime.evidenceReviews,
      evidenceContinuationOutbox: runtime.evidenceContinuationOutbox,
      priorities: runtime.priorities,
    })).toBe(beforeUnrelated);
  });

  it("rejects a stale target and ambiguous duplicate active days", async () => {
    const existing = sep5Record();
    const staleService = createNutritionDayAggregateRepairService({
      mutateCanonicalRuntime: fakeMutation({ canonicalEvidenceObjects: [existing] }),
    });
    await expect(staleService.repair({
      date: "2026-09-05",
      expectedCanonicalId: existing.canonicalId,
      expectedPriorSemanticFingerprint: "sha256_stale",
      userId: "founder",
    })).rejects.toMatchObject({ code: "NUTRITION_AGGREGATE_REPAIR_STALE" });

    const duplicate = structuredClone(existing);
    duplicate.canonicalId = "nutrition-duplicate";
    const duplicateService = createNutritionDayAggregateRepairService({
      mutateCanonicalRuntime: fakeMutation({
        canonicalEvidenceObjects: [existing, duplicate],
      }),
    });
    await expect(duplicateService.repair({
      date: "2026-09-05",
      expectedCanonicalId: existing.canonicalId,
      expectedPriorSemanticFingerprint: existing.nutritionRevision.semanticFingerprint,
      userId: "founder",
    })).rejects.toMatchObject({
      code: "NUTRITION_AGGREGATE_REPAIR_DAY_AMBIGUOUS",
    });
  });
});

function fakeMutation(runtime) {
  return async ({ allowedCollections, mutate }) => {
    expect(allowedCollections).toEqual(["canonicalEvidenceObjects"]);
    const result = mutate(runtime);
    return { committed: true, commitId: "commit-repair", result };
  };
}

function sep5Record() {
  const payload = {
    id: "nutrition-sep5",
    evidence_type: "nutrition",
    observed_at: "2026-09-05",
    metadata: {
      date: "2026-09-05",
      daily_totals_scope: "partial_meal_subtotal",
      daily_totals_source_artifact_refs: ["IMG_A"],
    },
    daily_totals: totals(1205, 86, 114, 55),
    meals: [
      meal("Breakfast", 585, 33, 64, 23),
      meal("Lunch", 620, 53, 50, 32),
      meal("Dinner", 1584, 78, 139, 77),
      meal("Snacks", 1131, 20, 131, 60),
    ],
    provenance: { source_artifact_refs: ["IMG_A", "IMG_B"] },
    source: { source_artifact_refs: ["IMG_A", "IMG_B"] },
  };
  return {
    canonicalId: "nutrition|2026-09-05|nutrition-day",
    evidence_type: "nutrition",
    payload,
    provenance: {
      contributing_evidence_object_ids: [payload.id],
      evidence_package_ids: ["package-sep5"],
      evidence_review_ids: ["review-sep5"],
    },
    quality: { status: "active" },
    nutritionRevision: {
      revision: 1,
      semanticFingerprint: createNutritionSemanticFingerprint(payload, {
        replacementScope: "initial_day",
      }),
      replacementScope: "initial_day",
      sourceEvidenceObjectId: payload.id,
      sourceEvidencePackageId: "package-sep5",
      sourceReviewId: "review-sep5",
    },
    nutritionRevisionHistory: [],
    userId: "founder",
  };
}

function meal(name, calories, protein_g, carbs_g, fat_g) {
  return {
    id: name.toLowerCase(),
    name,
    totals: totals(calories, protein_g, carbs_g, fat_g),
    foods: [],
  };
}

function totals(calories, protein_g, carbs_g, fat_g) {
  return { calories, protein_g, carbs_g, fat_g };
}
