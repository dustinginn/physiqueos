import { describe, expect, it, vi } from "vitest";
import {
  createNutritionEnrichmentReviewService,
  NUTRITION_ENRICHMENT_STATUSES,
} from "./NutritionEnrichmentReviewService";

const totals = (calories = 1900) => ({
  calories,
  protein_g: 170,
  carbs_g: 160,
  fat_g: 70,
});

const canonical = ({
  date,
  id = `nutrition|${date}|day`,
  meals = [],
  packageIds = [`package-${date}`],
  type = "nutrition",
} = {}) => ({
  canonicalId: id,
  evidence_type: type,
  lastObservedAt: date,
  payload: {
    evidence_type: type,
    observed_at: date,
    daily_totals: totals(),
    meals,
  },
  provenance: { evidence_package_ids: packageIds },
  quality: { status: "active" },
});

const sourcePackage = (date, {
  id = `package-${date}`,
  storagePath = `private/founder/evidence/uploads/${date}.png`,
} = {}) => ({
  package_id: id,
  observed_date: date,
  userId: "founder",
  provenance: {
    source_artifacts: [{
      kind: "screenshot",
      file_name: `${date}.png`,
      mime_type: "image/png",
      storage_path: storagePath,
    }],
  },
});

const proposed = (date, {
  completeness = "complete",
  mealTotals = totals(),
  topTotals = totals(),
} = {}) => ({
  evidence_objects: [{
    id: `proposal-${date}`,
    evidence_type: "nutrition",
    observed_at: date,
    daily_totals: topTotals,
    meals: [{
      id: `breakfast-${date}`,
      name: "Breakfast",
      completeness,
      totals: mealTotals,
      foods: [{
        id: `food-${date}`,
        name: "Breakfast bowl",
        brand: "Example",
        serving_size: "1 bowl",
        nutrients: { calories: mealTotals.calories },
        provenance_ref: `C:\\private\\${date}.png`,
      }],
    }],
  }],
});

function fixture({ objects, packages, reinterpret } = {}) {
  const repositories = {
    canonicalEvidence: {
      listCanonicalEvidenceObjects: vi.fn(async () => objects ?? []),
      upsertCanonicalEvidenceObjects: vi.fn(),
    },
    evidencePackages: {
      listEvidencePackages: vi.fn(async () => packages ?? []),
      saveEvidencePackage: vi.fn(),
    },
    evidenceReviews: {
      stage: vi.fn(),
      updateReview: vi.fn(),
    },
  };
  const inspectFile = vi.fn(async ({ storagePath }) => ({
    accessible: !storagePath.includes("missing"),
    resolvedPath: storagePath.includes("missing") ? null : `C:\\repo\\${storagePath}`,
  }));
  const service = createNutritionEnrichmentReviewService({
    repositories,
    inspectFile,
    privateRoot: "C:\\repo\\private",
    reinterpret: reinterpret ?? vi.fn(async ({ date }) => proposed(date)),
  });
  return { inspectFile, repositories, service };
}

describe("historical Nutrition meal-enrichment review", () => {
  it("discovers canonical Nutrition days only and keeps date-descending order", async () => {
    const dates = ["2026-07-09", "2026-07-15"];
    const { service } = fixture({
      objects: [
        canonical({ date: dates[0] }),
        canonical({ date: dates[0] }),
        canonical({ date: "2026-07-12", type: "training" }),
        canonical({ date: dates[1] }),
      ],
      packages: dates.map((date) => sourcePackage(date)),
    });
    const review = await service.createReview("founder");

    expect(review.total).toBe(2);
    expect(review.days.map((day) => day.date)).toEqual(["2026-07-15", "2026-07-09"]);
  });

  it("classifies structured, ready, missing, ambiguous, and partial days deterministically", async () => {
    const structuredMeal = [{
      id: "breakfast",
      name: "Breakfast",
      foods: [{ id: "food", name: "Eggs" }],
    }];
    const objects = [
      canonical({ date: "2026-07-17", meals: structuredMeal }),
      canonical({ date: "2026-07-15" }),
      canonical({ date: "2026-07-14", packageIds: [] }),
      canonical({ date: "2026-07-13", packageIds: ["wrong-date"] }),
      canonical({ date: "2026-07-12" }),
    ];
    const packages = [
      sourcePackage("2026-07-17"),
      sourcePackage("2026-07-15"),
      sourcePackage("2026-07-11", { id: "wrong-date" }),
      sourcePackage("2026-07-12"),
    ];
    const reinterpret = vi.fn(async ({ date }) =>
      proposed(date, date === "2026-07-12" ? { completeness: "partial" } : {})
    );
    const { service } = fixture({ objects, packages, reinterpret });

    const first = await service.createReview("founder");
    const second = await service.createReview("founder");
    const statuses = Object.fromEntries(first.days.map((day) => [day.date, day.status]));

    expect(statuses).toEqual({
      "2026-07-17": NUTRITION_ENRICHMENT_STATUSES.structured,
      "2026-07-15": NUTRITION_ENRICHMENT_STATUSES.ready,
      "2026-07-14": NUTRITION_ENRICHMENT_STATUSES.unavailable,
      "2026-07-13": NUTRITION_ENRICHMENT_STATUSES.ineligible,
      "2026-07-12": NUTRITION_ENRICHMENT_STATUSES.review,
    });
    expect(first).toEqual(second);
  });

  it("classifies material top-level or meal-total differences as Needs review", async () => {
    const date = "2026-07-15";
    const { service } = fixture({
      objects: [canonical({ date })],
      packages: [sourcePackage(date)],
      reinterpret: vi.fn(async () => proposed(date, {
        mealTotals: totals(1500),
        topTotals: totals(1600),
      })),
    });
    const day = (await service.createReview("founder")).days[0];

    expect(day.status).toBe(NUTRITION_ENRICHMENT_STATUSES.review);
    expect(day.comparison.topLevelDeltas.calories).toBe(-300);
    expect(day.comparison.mealDeltas.calories).toBe(-400);
  });

  it("keeps source-summary screenshots without meal detail out of Ready to enrich", async () => {
    const date = "2026-07-15";
    const { service } = fixture({
      objects: [canonical({ date })],
      packages: [sourcePackage(date)],
      reinterpret: vi.fn(async () => ({
        evidence_objects: [{
          id: "flat-proposal",
          evidence_type: "nutrition",
          observed_at: date,
          daily_totals: totals(),
          meals: [],
        }],
      })),
    });
    const day = (await service.createReview("founder")).days[0];

    expect(day.status).toBe(NUTRITION_ENRICHMENT_STATUSES.ineligible);
    expect(day.proposed.mealCount).toBe(0);
    expect(day.warnings).toContain(
      "The retained screenshots do not contain recoverable meal and food detail."
    );
  });

  it("performs no canonical, package, or review writes and exposes no private paths", async () => {
    const date = "2026-07-15";
    const { repositories, service } = fixture({
      objects: [canonical({ date })],
      packages: [sourcePackage(date)],
    });
    const review = await service.createReview("founder");
    const serialized = JSON.stringify(review);

    expect(repositories.canonicalEvidence.upsertCanonicalEvidenceObjects).not.toHaveBeenCalled();
    expect(repositories.evidencePackages.saveEvidencePackage).not.toHaveBeenCalled();
    expect(repositories.evidenceReviews.stage).not.toHaveBeenCalled();
    expect(repositories.evidenceReviews.updateReview).not.toHaveBeenCalled();
    expect(serialized).not.toMatch(/C:\\repo|private[\\/]founder|evidence[\\/]uploads/i);
    expect(review.days[0].source.labels).toEqual(["2026-07-15.png"]);
  });
});
