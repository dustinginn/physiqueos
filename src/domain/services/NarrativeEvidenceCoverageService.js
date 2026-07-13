import { isActiveCanonicalEvidenceObject } from "./CanonicalReadModel";

const MAJOR_DOMAINS = ["weight", "training", "nutrition", "activity"];

export function createDailyNarrativeEvidenceCoverage({
  activityTarget = null,
  canonicalObjects = [],
  evidenceDate,
  latestWeight = null,
  nutritionRange = null,
} = {}) {
  const objects = canonicalObjects
    .filter(isActiveCanonicalEvidenceObject)
    .map((object) => object.payload ?? object)
    .filter((object) => object.observed_at === evidenceDate);
  const nutrition = objects.find((object) => object.evidence_type === "nutrition") ?? null;
  const activity = objects.find((object) => object.evidence_type === "activity_day") ?? null;
  const training = objects.filter((object) => object.evidence_type === "training");
  const weightPresent = latestWeight?.measuredAt?.slice(0, 10) === evidenceDate;
  const nutritionComplete = isNutritionComplete(nutrition);
  const activityComplete = isActivityComplete(activity);
  const nutritionAlignment = nutritionComplete
    ? getNutritionAlignment(nutrition, nutritionRange)
    : "unknown";
  const activityAlignment = activityComplete
    ? getActivityAlignment(activity, activityTarget)
    : "unknown";
  const combinedAlignment = nutritionAlignment === "aligned" && activityAlignment === "aligned"
    ? "aligned"
    : nutritionAlignment === "unknown" || activityAlignment === "unknown"
      ? "incomplete"
      : "attention";
  const domains = {
    weight: coverage({ present: weightPresent, quality: weightPresent ? "high" : "unavailable", selected: weightPresent, omission: weightPresent ? null : "No completed weigh-in in the evidence window." }),
    training: coverage({ present: training.length > 0, quality: bestQuality(training), selected: training.length > 0, omission: training.length ? null : "No canonical training session in the evidence window.", claims: training.map((item) => item.id).filter(Boolean) }),
    nutrition: coverage({ present: Boolean(nutrition), quality: nutrition?.quality?.status ?? "unavailable", alignment: nutritionAlignment, selected: nutritionComplete, omission: nutritionComplete ? null : nutrition ? "Nutrition evidence is partial and cannot support a full-day execution claim." : "No canonical NutritionDay in the evidence window.", claims: nutrition?.id ? [nutrition.id] : [] }),
    activity: coverage({ present: Boolean(activity), quality: activity?.quality?.status ?? "unavailable", alignment: activityAlignment, selected: activityComplete, omission: activityComplete ? null : activity ? "Activity evidence is partial; workout calories do not establish total-day activity." : "No canonical ActivityDay in the evidence window.", claims: activity?.id ? [activity.id] : [] }),
  };

  return {
    cadence: "daily",
    evidenceDate,
    domains,
    energyBalanceExecutionContext: {
      selectedForInterpretation: nutritionComplete || activityComplete,
      combinedAlignment,
      nutrition: nutritionComplete ? { calories: nutrition.daily_totals.calories, protein: nutrition.daily_totals.protein_g, alignment: nutritionAlignment } : null,
      activity: activityComplete ? { totalActiveCalories: activity.daily_activity.move_calories, workoutActiveCalories: activity.derived_metrics?.workout_active_calories ?? null, alignment: activityAlignment } : null,
    },
    completeDomainCount: MAJOR_DOMAINS.filter((domain) => domains[domain].selectedForInterpretation).length,
  };
}

function coverage({ present, quality, alignment = "not_applicable", selected, omission, claims = [] }) {
  return { evidencePresent: present, evidenceQuality: quality, materiality: selected ? "supporting" : "unavailable", alignmentStatus: alignment, selectedForInterpretation: selected, omissionReason: omission, supportingClaimReferences: claims };
}

function isNutritionComplete(item) {
  return Boolean(item && item.quality?.status === "complete" && ["complete", "daily_totals_available"].includes(item.metadata?.completeness) && item.daily_totals?.calories != null && Number.isFinite(Number(item.daily_totals.calories)));
}

function isActivityComplete(item) {
  return Boolean(item && item.quality?.status === "complete" && item.daily_activity?.move_calories != null && Number.isFinite(Number(item.daily_activity.move_calories)));
}

function getNutritionAlignment(item, range) {
  const calories = Number(item.daily_totals?.calories);
  const target = Number(item.targets?.calories);
  if (Number.isFinite(target) && target > 0) return Math.abs(calories - target) <= Math.max(100, target * 0.08) ? "aligned" : calories > target ? "above" : "below";
  if (range?.min != null && range?.max != null) return calories >= range.min && calories <= range.max ? "aligned" : calories > range.max ? "above" : "below";
  return "unknown";
}

function getActivityAlignment(item, target) {
  const total = Number(item.daily_activity?.move_calories);
  const canonicalTarget = Number(item.daily_activity?.move_goal);
  const resolvedTarget = Number.isFinite(canonicalTarget) && canonicalTarget > 0 ? canonicalTarget : Number(target);
  if (!Number.isFinite(resolvedTarget) || resolvedTarget <= 0) return "unknown";
  return total >= resolvedTarget * 0.9 ? "aligned" : "below";
}

function bestQuality(items) {
  if (items.some((item) => item.quality?.status === "complete")) return "complete";
  if (items.length) return "partial";
  return "unavailable";
}
