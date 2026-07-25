import fs from "node:fs/promises";
import path from "node:path";
import { recoverEvidenceIntakeSubmissionFromArtifacts } from "./EvidenceIntakeService";
import {
  NUTRITION_RECONCILIATION_TOLERANCE,
  reconcileNutritionDayEvidence,
} from "../models/nutritionDayEvidence";

export const NUTRITION_ENRICHMENT_STATUSES = {
  ready: "ready_to_enrich",
  review: "needs_review",
  unavailable: "source_unavailable",
  structured: "already_structured",
  ineligible: "not_eligible",
};

const STATUS_ORDER = [
  NUTRITION_ENRICHMENT_STATUSES.ready,
  NUTRITION_ENRICHMENT_STATUSES.review,
  NUTRITION_ENRICHMENT_STATUSES.unavailable,
  NUTRITION_ENRICHMENT_STATUSES.structured,
  NUTRITION_ENRICHMENT_STATUSES.ineligible,
];

export function createNutritionEnrichmentReviewService({
  repositories,
  privateRoot = path.join(process.cwd(), "private"),
  inspectFile = inspectSourceFile,
  reinterpret = reinterpretNutritionSources,
} = {}) {
  return {
    async createReview(userId) {
      const [canonicalObjects, evidencePackages] = await Promise.all([
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
        repositories.evidencePackages.listEvidencePackages(userId),
      ]);
      const packagesById = new Map(
        evidencePackages.map((evidencePackage) => [
          evidencePackage.package_id,
          evidencePackage,
        ])
      );
      const nutritionDays = uniqueBy(
        canonicalObjects.filter((object) => object.evidence_type === "nutrition"),
        (object) => object.canonicalId
      )
        .sort((left, right) => getDate(right).localeCompare(getDate(left)));

      const days = await Promise.all(
        nutritionDays.map((canonicalObject) => inspectDay({
          canonicalObject,
          inspectFile,
          packagesById,
          privateRoot,
          reinterpret,
          userId,
        }))
      );

      const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
      days.forEach((day) => {
        counts[day.status] += 1;
      });

      return {
        total: days.length,
        counts,
        days,
        tolerance: { ...NUTRITION_RECONCILIATION_TOLERANCE },
      };
    },
  };
}

async function inspectDay({
  canonicalObject,
  inspectFile,
  packagesById,
  privateRoot,
  reinterpret,
  userId,
}) {
  const payload = canonicalObject.payload ?? {};
  const date = getDate(canonicalObject);
  const existing = {
    canonicalId: canonicalObject.canonicalId,
    date,
    status: canonicalObject.quality?.status ?? null,
    totals: normalizeTotals(payload.daily_totals),
    mealDetailStatus: hasStructuredMeals(payload.meals)
      ? "structured"
      : "flat",
  };
  const packageIds = unique(canonicalObject.provenance?.evidence_package_ids ?? []);
  const sourcePackages = packageIds.map((id) => packagesById.get(id)).filter(Boolean);
  const sourceResolution = await resolveSources({
    date,
    inspectFile,
    packageIds,
    privateRoot,
    sourcePackages,
  });

  if (hasStructuredMeals(payload.meals)) {
    return createDayResult({
      existing,
      source: sourceResolution.source,
      status: NUTRITION_ENRICHMENT_STATUSES.structured,
    });
  }
  if (!hasMeaningfulTotals(existing.totals)) {
    return createDayResult({
      existing,
      source: sourceResolution.source,
      status: NUTRITION_ENRICHMENT_STATUSES.ineligible,
      warnings: ["The logged day does not have daily totals to compare."],
    });
  }
  if (sourceResolution.ambiguous) {
    return createDayResult({
      existing,
      source: sourceResolution.source,
      status: NUTRITION_ENRICHMENT_STATUSES.ineligible,
      warnings: ["The retained source could not be associated with this day confidently."],
    });
  }
  if (!sourceResolution.source.allAccessible) {
    return createDayResult({
      existing,
      source: sourceResolution.source,
      status: NUTRITION_ENRICHMENT_STATUSES.unavailable,
      warnings: ["One or more original screenshots could not be retrieved."],
    });
  }

  let evidencePackage;
  try {
    evidencePackage = await reinterpret({
      artifactPaths: sourceResolution.artifactPaths,
      date,
      sourcePackage: sourcePackages[0],
      userId,
    });
  } catch {
    return createDayResult({
      existing,
      source: sourceResolution.source,
      status: NUTRITION_ENRICHMENT_STATUSES.review,
      warnings: ["The screenshots were available, but meal details could not be read safely."],
    });
  }

  const proposedObjects = (evidencePackage?.evidence_objects ?? []).filter(
    (object) => object.evidence_type === "nutrition"
  );
  const proposed = proposedObjects.length === 1
    ? createProposedState(proposedObjects[0])
    : null;
  const warnings = [];

  if (proposedObjects.length !== 1) {
    warnings.push("The screenshots did not produce one clear Nutrition day.");
  } else if (normalizeDate(proposedObjects[0].observed_at) !== date) {
    warnings.push("The detected date does not clearly match the logged day.");
  }
  if (!proposed || proposed.mealCount === 0 || proposed.foodCount === 0) {
    warnings.push("The retained screenshots do not contain recoverable meal and food detail.");
  }

  const comparison = proposed
    ? compareNutritionStates(existing.totals, proposed)
    : emptyComparison(existing.totals);
  warnings.push(...getProposalWarnings(proposed, comparison));
  const status = classifyProposal({ comparison, date, proposed, warnings });

  return createDayResult({
    comparison,
    existing,
    proposed,
    source: sourceResolution.source,
    status,
    warnings,
  });
}

async function resolveSources({
  date,
  inspectFile,
  packageIds,
  privateRoot,
  sourcePackages,
}) {
  const ambiguous =
    packageIds.length > 1 ||
    sourcePackages.length > 1 ||
    (
      sourcePackages.length === 1 &&
      normalizeDate(sourcePackages[0]?.observed_date ?? sourcePackages[0]?.captured_at) !== date
    );
  const artifacts = uniqueBy(
    sourcePackages.flatMap((item) => item.provenance?.source_artifacts ?? [])
      .filter((artifact) => artifact.storage_path && isImage(artifact)),
    (artifact) => artifact.storage_path
  );
  const inspected = await Promise.all(
    artifacts.map(async (artifact, index) => {
      const resolution = await inspectFile({
        privateRoot,
        storagePath: artifact.storage_path,
      });
      return {
        accessible: resolution.accessible,
        label: safeSourceLabel(artifact.file_name, index),
        sourceDate: normalizeDate(
          artifact.evidence_date ??
          artifact.observed_date ??
          sourcePackages[0]?.observed_date
        ),
        resolvedPath: resolution.resolvedPath,
      };
    })
  );

  return {
    ambiguous,
    artifactPaths: inspected.filter((item) => item.accessible).map((item) => item.resolvedPath),
    source: {
      allAccessible: inspected.length > 0 && inspected.every((item) => item.accessible),
      count: inspected.length,
      labels: inspected.map((item) => item.label),
      sourceDates: unique(inspected.map((item) => item.sourceDate).filter(Boolean)),
    },
  };
}

async function inspectSourceFile({ privateRoot, storagePath }) {
  const root = path.resolve(privateRoot);
  const resolvedPath = path.resolve(process.cwd(), storagePath);
  if (!resolvedPath.startsWith(`${root}${path.sep}`)) {
    return { accessible: false, resolvedPath: null };
  }
  try {
    const stats = await fs.stat(resolvedPath);
    return { accessible: stats.isFile() && stats.size > 0, resolvedPath };
  } catch {
    return { accessible: false, resolvedPath: null };
  }
}

async function reinterpretNutritionSources({
  artifactPaths,
  date,
  sourcePackage,
  userId,
}) {
  const submissionId = String(sourcePackage.package_id).replace(
    /_(?:images|typed|progress_photos)$/,
    ""
  );
  const result = await recoverEvidenceIntakeSubmissionFromArtifacts({
    artifactPaths,
    evidenceDate: date,
    expectedEvidenceType: "nutrition",
    submissionId,
    userId,
  });
  return result.evidencePackage;
}

function createProposedState(object) {
  const meals = (object.meals ?? []).map((meal) => ({
    id: meal.id,
    name: meal.name ?? "Meal",
    totals: normalizeTotals(meal.totals),
    sourceReferences: safeReferences([
      meal.provenance_ref,
      ...(meal.provenance?.source_artifact_refs ?? []),
    ]),
    foods: (meal.foods ?? []).map((food) => ({
      id: food.id,
      name: food.name ?? food.canonical_name ?? "Food",
      brand: food.brand ?? null,
      serving: food.serving_size ?? null,
      totals: normalizeTotals(food.nutrients),
      sourceReferences: safeReferences([
        food.provenance_ref,
        ...(food.provenance?.source_artifact_refs ?? []),
      ]),
      duplicateRecovery:
        food.provenance?.reconciliation === "recovered_collapsed_duplicate",
    })),
    completeness: meal.completeness ?? null,
  }));

  return {
    id: object.id,
    date: normalizeDate(object.observed_at),
    totals: normalizeTotals(object.daily_totals),
    mealCount: meals.length,
    foodCount: meals.reduce((count, meal) => count + meal.foods.length, 0),
    mealLabels: meals.map((meal) => meal.name),
    meals,
  };
}

function compareNutritionStates(existingTotals, proposed) {
  const reconciliation = reconcileNutritionDayEvidence({
    dailyTotals: existingTotals,
    meals: proposed.meals,
  });
  const topLevelDeltas = deltas(existingTotals, proposed.totals);
  const mealDeltas = deltas(existingTotals, reconciliation.meal_sums);
  const topLevelMatch = classifyDeltas(topLevelDeltas);
  const mealMatch = classifyDeltas(mealDeltas);

  return {
    existingTotals,
    proposedTotals: proposed.totals,
    mealSums: reconciliation.meal_sums,
    topLevelDeltas,
    mealDeltas,
    topLevelMatch,
    mealMatch,
    summary:
      topLevelMatch === "exact" && mealMatch === "exact"
        ? "The detected totals and meal sums match the logged totals."
        : topLevelMatch !== "material" && mealMatch !== "material"
          ? "The detected details differ only by normal rounding."
          : "The logged daily totals remain authoritative; the detected details do not fully match.",
  };
}

function classifyProposal({ comparison, date, proposed, warnings }) {
  if (!proposed || proposed.mealCount === 0 || proposed.foodCount === 0) {
    return NUTRITION_ENRICHMENT_STATUSES.ineligible;
  }
  if (proposed.date !== date) return NUTRITION_ENRICHMENT_STATUSES.review;
  const partial = proposed.meals.some(
    (meal) =>
      meal.completeness === "partial" ||
      meal.foods.length === 0 ||
      ["calories", "protein_g", "carbs_g", "fat_g"].some(
        (key) => finite(meal.totals[key]) === null
      )
  );
  const duplicateRecovery = proposed.meals.some((meal) =>
    meal.foods.some((food) => food.duplicateRecovery)
  );
  if (
    partial ||
    duplicateRecovery ||
    comparison.topLevelMatch === "material" ||
    comparison.mealMatch === "material" ||
    warnings.some((warning) => /overlap|cropped|could not|does not/i.test(warning))
  ) {
    return NUTRITION_ENRICHMENT_STATUSES.review;
  }
  return NUTRITION_ENRICHMENT_STATUSES.ready;
}

function getProposalWarnings(proposed, comparison) {
  if (!proposed) return [];
  const warnings = [];
  if (proposed.meals.some((meal) => meal.completeness === "partial")) {
    warnings.push("Some meal details appear incomplete or cropped.");
  }
  if (proposed.meals.some((meal) => meal.foods.length === 0)) {
    warnings.push("At least one detected meal does not include food details.");
  }
  if (proposed.meals.some((meal) =>
    meal.foods.some((food) => food.duplicateRecovery)
  )) {
    warnings.push("A possible repeated food needs closer inspection.");
  }
  if (comparison.topLevelMatch === "material") {
    warnings.push("Detected daily totals differ materially from the logged totals.");
  }
  if (comparison.mealMatch === "material") {
    warnings.push("Detected meal totals do not add up to the logged daily totals.");
  }
  return warnings;
}

function createDayResult({
  comparison = null,
  existing,
  proposed = null,
  source,
  status,
  warnings = [],
}) {
  return {
    id: existing.canonicalId,
    date: existing.date,
    status,
    statusLabel: statusLabel(status),
    message: statusMessage(status),
    existing,
    source,
    proposed,
    comparison,
    warnings: unique(warnings),
  };
}

function emptyComparison(existingTotals) {
  return {
    existingTotals,
    proposedTotals: normalizeTotals(),
    mealSums: normalizeTotals(),
    topLevelDeltas: normalizeTotals(),
    mealDeltas: normalizeTotals(),
    topLevelMatch: "not_comparable",
    mealMatch: "not_comparable",
    summary: "No structured meal proposal was produced.",
  };
}

function classifyDeltas(values) {
  const comparable = Object.entries(values).filter(([, value]) => value !== null);
  if (!comparable.length) return "not_comparable";
  if (comparable.every(([, value]) => value === 0)) return "exact";
  return comparable.every(([key, value]) =>
    Math.abs(value) <= (NUTRITION_RECONCILIATION_TOLERANCE[key] ?? 0)
  ) ? "rounding" : "material";
}

function deltas(existing, proposed) {
  return Object.fromEntries(
    ["calories", "protein_g", "carbs_g", "fat_g"].map((key) => {
      const left = finite(existing?.[key]);
      const right = finite(proposed?.[key]);
      return [key, left === null || right === null ? null : right - left];
    })
  );
}

function hasStructuredMeals(meals) {
  return Array.isArray(meals) && meals.some(
    (meal) => Array.isArray(meal.foods) && meal.foods.length > 0
  );
}

function hasMeaningfulTotals(totals) {
  return ["calories", "protein_g", "carbs_g", "fat_g"].every(
    (key) => finite(totals[key]) !== null
  );
}

function normalizeTotals(totals = {}) {
  return Object.fromEntries(
    ["calories", "protein_g", "carbs_g", "fat_g"].map((key) => [
      key,
      finite(totals?.[key]),
    ])
  );
}

function statusLabel(status) {
  return {
    [NUTRITION_ENRICHMENT_STATUSES.ready]: "Ready to enrich",
    [NUTRITION_ENRICHMENT_STATUSES.review]: "Needs review",
    [NUTRITION_ENRICHMENT_STATUSES.unavailable]: "Source unavailable",
    [NUTRITION_ENRICHMENT_STATUSES.structured]: "Already structured",
    [NUTRITION_ENRICHMENT_STATUSES.ineligible]: "Not eligible",
  }[status];
}

function statusMessage(status) {
  return {
    [NUTRITION_ENRICHMENT_STATUSES.ready]:
      "Meal details were recovered and match the logged daily totals.",
    [NUTRITION_ENRICHMENT_STATUSES.review]:
      "Meal details were detected, but the totals or source coverage need a closer look.",
    [NUTRITION_ENRICHMENT_STATUSES.unavailable]:
      "The original screenshots are no longer available, so meal details cannot be recovered.",
    [NUTRITION_ENRICHMENT_STATUSES.structured]:
      "This day already includes meal and food details.",
    [NUTRITION_ENRICHMENT_STATUSES.ineligible]:
      "The retained evidence does not support safe meal-detail recovery.",
  }[status];
}

function safeReferences(values) {
  return unique(values).map((value, index) => {
    const basename = path.basename(String(value).replaceAll("\\", "/"));
    return basename && basename !== "." ? basename : `Screenshot ${index + 1}`;
  });
}

function safeSourceLabel(fileName, index) {
  const basename = path.basename(String(fileName ?? "").replaceAll("\\", "/"));
  return basename && basename !== "." ? basename : `Screenshot ${index + 1}`;
}

function isImage(artifact) {
  return /image|screenshot/i.test(
    `${artifact.kind ?? ""} ${artifact.mime_type ?? ""} ${artifact.file_name ?? ""}`
  );
}

function getDate(object) {
  return normalizeDate(
    object.payload?.observed_at ??
    object.payload?.metadata?.date ??
    object.lastObservedAt ??
    object.firstObservedAt
  ) ?? "";
}

function normalizeDate(value) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
