import {
  NUTRITION_DAILY_TOTAL_FIELDS,
  NUTRITION_RECONCILIATION_TOLERANCE,
  NutritionDailyTotalsScope,
  reconcileNutritionDayEvidence,
} from "./nutritionDayEvidence.js";

// Source-neutral Nutrition day authority.
//
// Energy and macronutrient reasoning depends on authoritative DAILY TOTALS
// (calories, protein, carbohydrates, fat). Meal detail is optional richer
// context for meal-pattern coaching and never gates Energy eligibility when a
// trustworthy daily total exists. Any source that can assert a full-day total
// (a source summary, a device aggregate, a manual entry) plugs into the same
// contract without requiring meal objects.
//
// Precedence (strongest first):
//   1. full_day_asserted         source / device / manual full-day assertion
//   2. meal_derived_unverified   totals summed from captured meals
//   3. partial_subtotal          a source total that covers only part of the day
//   4. missing
//
// The resolver is a pure read-time interpretation. It never rewrites stored
// Nutrition records, so historical Founder data is interpreted, not migrated.

export const NUTRITION_DAY_AUTHORITY_VERSION = "nutrition_day_authority_v1";

export const NutritionAssertionTier = Object.freeze({
  FULL_DAY_ASSERTED: "full_day_asserted",
  MEAL_DERIVED_UNVERIFIED: "meal_derived_unverified",
  PARTIAL_SUBTOTAL: "partial_subtotal",
  MISSING: "missing",
});

export const NutritionAssertionOrigin = Object.freeze({
  DEVICE_AGGREGATE: "device_aggregate",
  SOURCE_SUMMARY: "source_summary",
  MANUAL_ENTRY: "manual_entry",
  MEAL_SUM: "meal_sum",
  SOURCE_SUBTOTAL: "source_subtotal",
  NONE: "none",
});

export const NutritionSourceReliability = Object.freeze({
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
  NONE: "none",
});

export const NutritionReconciliationState = Object.freeze({
  NOT_COMPARABLE: "not_comparable",
  CONSISTENT: "consistent",
  MEAL_DETAIL_PARTIAL: "meal_detail_partial",
  CONFLICT: "conflict",
});

export const NUTRITION_AUTHORITY_ENERGY_TOTAL_FIELDS = Object.freeze([
  "calories", "protein_g", "carbs_g", "fat_g",
]);

const TIER_RANK = Object.freeze({
  [NutritionAssertionTier.FULL_DAY_ASSERTED]: 3,
  [NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED]: 2,
  [NutritionAssertionTier.PARTIAL_SUBTOTAL]: 1,
  [NutritionAssertionTier.MISSING]: 0,
});

export function compareNutritionAssertionTiers(left, right) {
  return (TIER_RANK[left] ?? 0) - (TIER_RANK[right] ?? 0);
}

export function resolveNutritionDayAuthority(record, {
  tolerance = NUTRITION_RECONCILIATION_TOLERANCE,
} = {}) {
  const payload = record?.payload ?? record ?? {};
  const metadata = payload.metadata ?? {};
  const reconciliation = metadata.daily_totals_reconciliation ?? {};
  const scope = normalizeScope(metadata.daily_totals_scope ?? reconciliation.daily_totals_scope);
  const date = String(payload.observed_at ?? metadata.date ?? record?.lastObservedAt ?? "")
    .slice(0, 10) || null;

  // The recorded source total is the assertion under interpretation. A stored
  // canonical total may already have been replaced by a meal sum, so prefer the
  // retained source total when the record kept one.
  const sourceTotals = pickTotals(reconciliation.source_daily_totals ?? payload.daily_totals);
  const meals = Array.isArray(payload.meals) ? payload.meals : [];
  const mealReconciliation = meals.length
    ? reconcileNutritionDayEvidence({ dailyTotals: {}, meals, tolerance })
    : null;
  const mealSums = pickTotals(mealReconciliation?.meal_sums);
  const hasSource = finite(sourceTotals.calories);
  const hasMealSums = finite(mealSums.calories);

  const capture = describeCapture(payload.source, metadata);
  const mealDetail = describeMealDetail(meals, hasMealSums);

  let tier = NutritionAssertionTier.MISSING;
  let origin = NutritionAssertionOrigin.NONE;
  let dailyTotals = emptyTotals();
  let state = NutritionReconciliationState.NOT_COMPARABLE;
  let conflictingFields = [];
  const ambiguity = [];
  const competing = [];
  if (hasSource) competing.push({ basis: `source_total:${scope}`, totals: sourceTotals });
  if (hasMealSums) competing.push({ basis: "meal_sum", totals: mealSums });

  const fullDayClaim = scope === NutritionDailyTotalsScope.FULL_DAY_SUMMARY ||
    (scope === NutritionDailyTotalsScope.UNKNOWN && !meals.length && hasSource &&
      isLegacyCompleteMarker(metadata.completeness, payload.quality?.status));

  if (hasSource && fullDayClaim) {
    const exceeding = hasMealSums
      ? comparableFields(sourceTotals, mealSums).filter((field) =>
        mealSums[field] - sourceTotals[field] > (tolerance[field] ?? 0))
      : [];
    if (exceeding.length) {
      // A full-day claim that is smaller than its own meals is self-contradicted:
      // keep the larger, better-evidenced meal-derived total and preserve the
      // conflict rather than override it silently.
      tier = NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED;
      origin = NutritionAssertionOrigin.MEAL_SUM;
      dailyTotals = mergeTotals(mealSums, sourceTotals);
      state = NutritionReconciliationState.CONFLICT;
      conflictingFields = exceeding;
      ambiguity.push("intake_source_conflict");
    } else {
      tier = NutritionAssertionTier.FULL_DAY_ASSERTED;
      origin = capture.origin;
      dailyTotals = mergeTotals(sourceTotals, {});
      if (hasMealSums) {
        const shortfall = comparableFields(sourceTotals, mealSums).some((field) =>
          sourceTotals[field] - mealSums[field] > (tolerance[field] ?? 0));
        state = shortfall
          ? NutritionReconciliationState.MEAL_DETAIL_PARTIAL
          : NutritionReconciliationState.CONSISTENT;
      }
    }
  } else if (hasMealSums) {
    tier = NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED;
    origin = NutritionAssertionOrigin.MEAL_SUM;
    dailyTotals = mergeTotals(mealSums, sourceTotals);
    // A retained partial subtotal that disagrees with the meals is expected
    // (it covers only part of the day) and is not a conflict.
    state = NutritionReconciliationState.CONSISTENT;
  } else if (hasSource) {
    tier = NutritionAssertionTier.PARTIAL_SUBTOTAL;
    origin = NutritionAssertionOrigin.SOURCE_SUBTOTAL;
    dailyTotals = mergeTotals(sourceTotals, {});
  }

  if (tier === NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED) {
    ambiguity.push("intake_meal_derived_unverified");
    if (mealDetail.completeness === "partial") ambiguity.push("intake_meal_capture_flagged_partial");
  }
  if (tier === NutritionAssertionTier.PARTIAL_SUBTOTAL) ambiguity.push("intake_partial_subtotal");
  if (tier === NutritionAssertionTier.MISSING) ambiguity.push("intake_totals_missing");

  const reliability = reliabilityFor(tier, origin, capture);
  const energyUsable = tier !== NutritionAssertionTier.MISSING && finite(dailyTotals.calories);
  return Object.freeze({
    schemaVersion: NUTRITION_DAY_AUTHORITY_VERSION,
    date,
    dailyTotals: Object.freeze(dailyTotals),
    assertion: Object.freeze({
      tier,
      origin,
      scope,
      basis: tier === NutritionAssertionTier.FULL_DAY_ASSERTED
        ? `${origin}_full_day` : tier,
      sourceArtifactRefs: [...(metadata.daily_totals_source_artifact_refs ?? [])],
    }),
    mealDetail: Object.freeze(mealDetail),
    reliability,
    sourceCoverage: Object.freeze(capture),
    temporalCoverage: Object.freeze({
      capturedAt: payload.captured_at ?? null,
      dayClosedAtCapture: null,
    }),
    reconciliation: Object.freeze({
      state,
      competing: competing.map((item) => Object.freeze(item)),
      conflictingFields: Object.freeze(conflictingFields),
      tolerance: { ...tolerance },
    }),
    energyUsable,
    // Daily-total completeness for Energy pairing. Meal completeness is
    // deliberately absent: it never lowers a trustworthy daily total.
    energyCompleteness: !energyUsable
      ? "missing"
      : tier === NutritionAssertionTier.PARTIAL_SUBTOTAL ? "partial" : "complete",
    ambiguity: Object.freeze([...new Set(ambiguity)]),
  });
}

export function summarizeNutritionAuthorityCoverage(authorities = []) {
  const list = authorities.filter(Boolean);
  const byTier = {};
  const byReliability = {};
  const ambiguity = new Set();
  for (const item of list) {
    byTier[item.assertion.tier] = (byTier[item.assertion.tier] ?? 0) + 1;
    byReliability[item.reliability] = (byReliability[item.reliability] ?? 0) + 1;
    item.ambiguity.forEach((code) => ambiguity.add(code));
  }
  const weakest = list.reduce((low, item) =>
    reliabilityRank(item.reliability) < reliabilityRank(low) ? item.reliability : low,
  NutritionSourceReliability.HIGH);
  return Object.freeze({
    dayCount: list.length,
    usableDayCount: list.filter((item) => item.energyUsable).length,
    byTier,
    byReliability,
    weakestReliability: list.length ? weakest : NutritionSourceReliability.NONE,
    ambiguity: [...ambiguity].sort(),
    mealDetailPartialDayCount: list.filter((item) => item.mealDetail.completeness === "partial").length,
  });
}

function reliabilityRank(value) {
  return ({ high: 3, moderate: 2, low: 1, none: 0 })[value] ?? 0;
}

function reliabilityFor(tier, origin, capture) {
  if (tier === NutritionAssertionTier.MISSING) return NutritionSourceReliability.NONE;
  if (tier === NutritionAssertionTier.PARTIAL_SUBTOTAL) return NutritionSourceReliability.LOW;
  if (tier === NutritionAssertionTier.MEAL_DERIVED_UNVERIFIED) return NutritionSourceReliability.MODERATE;
  if (origin === NutritionAssertionOrigin.DEVICE_AGGREGATE) return NutritionSourceReliability.HIGH;
  if (origin === NutritionAssertionOrigin.SOURCE_SUMMARY) {
    return capture.extractionConfidence === "high"
      ? NutritionSourceReliability.HIGH : NutritionSourceReliability.MODERATE;
  }
  return NutritionSourceReliability.MODERATE;
}

// Source-neutral capture description. No integration name is trusted by name:
// reliability follows how the total was captured, not who supplied it.
function describeCapture(source = {}, metadata = {}) {
  const modality = String(source?.modality ?? "").toLowerCase();
  const integration = source?.integration ?? null;
  const device = ["device", "integration", "api", "wearable"].includes(modality) ||
    (Boolean(integration) && !["screenshot", "photo", "manual"].includes(modality));
  const method = device ? "device_aggregate"
    : ["screenshot", "photo", "image"].includes(modality) ? "ocr_screenshot"
      : modality === "manual" || modality === "typed" ? "manual_entry"
        : "unknown";
  const origin = method === "device_aggregate" ? NutritionAssertionOrigin.DEVICE_AGGREGATE
    : method === "manual_entry" ? NutritionAssertionOrigin.MANUAL_ENTRY
      : NutritionAssertionOrigin.SOURCE_SUMMARY;
  return {
    sourceApplication: source?.application ?? metadata.source ?? null,
    sourceModality: modality || null,
    integration,
    captureMethod: method,
    origin,
    extractionConfidence: metadata.confidence ?? null,
  };
}

function describeMealDetail(meals, hasMealSums) {
  if (!meals.length) {
    return { present: false, mealCount: 0, completeness: "none", partialMealCount: 0, additionalFoodsDetected: 0 };
  }
  const partial = meals.filter((meal) => String(meal?.completeness ?? "").toLowerCase() === "partial");
  const extra = meals.reduce((sum, meal) => sum + (Number(meal?.additional_foods_detected) || 0), 0);
  const completeness = partial.length === 0 && extra === 0
    ? (hasMealSums ? "complete" : "unknown")
    : "partial";
  return {
    present: true,
    mealCount: meals.length,
    completeness,
    partialMealCount: partial.length,
    additionalFoodsDetected: extra,
  };
}

function isLegacyCompleteMarker(completeness, qualityStatus) {
  const value = String(completeness ?? "").toLowerCase();
  if (["complete", "completed", "full", "daily_totals_available"].includes(value)) return true;
  if (value) return false;
  return String(qualityStatus ?? "").toLowerCase() === "complete";
}

function normalizeScope(value) {
  return Object.values(NutritionDailyTotalsScope).includes(value)
    ? value : NutritionDailyTotalsScope.UNKNOWN;
}

function comparableFields(left, right) {
  return NUTRITION_AUTHORITY_ENERGY_TOTAL_FIELDS.filter((field) =>
    finite(left[field]) && finite(right[field]));
}

function pickTotals(source = {}) {
  return Object.fromEntries(NUTRITION_AUTHORITY_ENERGY_TOTAL_FIELDS.map((field) => [
    field, finite(source?.[field]) ? Number(source[field]) : null,
  ]));
}

function emptyTotals() {
  return Object.fromEntries(NUTRITION_AUTHORITY_ENERGY_TOTAL_FIELDS.map((field) => [field, null]));
}

function mergeTotals(primary, fallback) {
  return Object.fromEntries(NUTRITION_AUTHORITY_ENERGY_TOTAL_FIELDS.map((field) => [
    field, finite(primary?.[field]) ? Number(primary[field])
      : finite(fallback?.[field]) ? Number(fallback[field]) : null,
  ]));
}

function finite(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export { NUTRITION_DAILY_TOTAL_FIELDS };
