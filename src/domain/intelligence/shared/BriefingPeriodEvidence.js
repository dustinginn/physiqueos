// Canonical day series for Briefing Intelligence.
//
// Turns the canonical evidence a briefing publisher already read (after its
// HealthKit graduation overlay) into one plain record per local day. Nutrition
// and Activity values come from the same authority the Energy card uses
// (`createCadenceEnergyAssessment` over `resolveNutritionDayAuthority`), so the
// intelligence layer can never disagree with the displayed daily numbers.

import { createCadenceEnergyAssessment, CADENCE_RMR_STRATEGIES } from "../../services/CadenceEnergyAssessmentService.js";
import { getCanonicalLocalDate } from "../../services/EnergyDailyReconciliationService.js";
import { resolveNutritionDayAuthority } from "../../models/nutritionDayAuthority.js";
import { dateRange } from "./BriefingIntelligence.js";

const INACTIVE_STATUSES = new Set(["superseded", "duplicate", "removed", "deleted", "rejected"]);
const DELIBERATE_TRAINING = /strength|resistance|weight|core|functional|hiit|crossfit/iu;

export function buildBriefingPeriodDays({
  canonicalObjects = [],
  weightEntries = [],
  dexaScans = [],
  timeZone = "America/Los_Angeles",
  startDate,
  endDate,
} = {}) {
  const active = canonicalObjects.filter(isActive);
  const localDate = (item) => getCanonicalLocalDate(payloadOf(item), timeZone);
  const inRange = (date) => date && date >= startDate && date <= endDate;
  const nutritionObjects = active.filter((item) => item.evidence_type === "nutrition" || payloadOf(item).evidence_type === "nutrition");
  const activityObjects = active.filter((item) => item.evidence_type === "activity_day" || payloadOf(item).evidence_type === "activity_day");

  const energy = createCadenceEnergyAssessment({
    cadence: "briefing_intelligence",
    window: { startDate, endDate, timeZone },
    timeZone,
    nutritionDays: nutritionObjects,
    activityDays: activityObjects,
    dexaScans,
    rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  });
  const energyByDate = new Map(energy.dailyRecords.map((row) => [row.date, row]));

  const macrosByDate = new Map();
  for (const item of nutritionObjects) {
    const date = localDate(item);
    if (!inRange(date)) continue;
    const totals = resolveNutritionDayAuthority(item).dailyTotals ?? {};
    const calories = finite(totals.calories);
    const row = energyByDate.get(date);
    // Macros come from the record whose authoritative calories are the day's.
    if (calories != null && row?.calorieIntake != null && Math.abs(calories - row.calorieIntake) > 0.5) continue;
    macrosByDate.set(date, { protein: finite(totals.protein_g), carbs: finite(totals.carbs_g), fat: finite(totals.fat_g),
      evidence: nutritionEvidenceOf(item) });
  }

  const minutesByDate = new Map();
  for (const item of activityObjects) {
    const date = localDate(item);
    if (!inRange(date)) continue;
    const minutes = finite(payloadOf(item).daily_activity?.exercise_minutes);
    if (minutes != null) minutesByDate.set(date, Math.max(minutes, minutesByDate.get(date) ?? 0));
  }

  const sessionsByDate = new Map();
  for (const item of active) {
    const payload = payloadOf(item);
    if ((item.evidence_type ?? payload.evidence_type) !== "training" || !isDeliberateTraining(payload)) continue;
    const date = localDate(item);
    if (!inRange(date)) continue;
    const ids = sessionsByDate.get(date) ?? new Set();
    ids.add(item.canonicalId ?? item.id ?? payload.id);
    sessionsByDate.set(date, ids);
  }

  // Latest weigh-in per local day, in pounds.
  const weightByDate = new Map();
  for (const entry of weightEntries) {
    const value = entry?.measuredAt ?? entry?.date;
    const pounds = weightInPounds(entry);
    if (!value || pounds == null) continue;
    const date = getCanonicalLocalDate(value, timeZone);
    if (!inRange(date)) continue;
    const previous = weightByDate.get(date);
    if (!previous || String(value) > previous.at) weightByDate.set(date, { at: String(value), pounds });
  }

  return dateRange(startDate, endDate).map((date) => {
    const row = energyByDate.get(date);
    const calories = finite(row?.calorieIntake);
    const macros = macrosByDate.get(date) ?? {};
    const activeKcal = finite(row?.activeCalories);
    return {
      date,
      nutrition: calories == null ? null : {
        calories,
        protein: macros.protein ?? null,
        carbs: macros.carbs ?? null,
        fat: macros.fat ?? null,
        completeness: row?.nutritionCompleteness === "partial" ? "partial" : row?.nutritionCompleteness ?? "unknown",
        // What the day's record rests on: its source artifacts or device
        // observations, how many food entries it lists, and whether the
        // source asserts a full day. Completeness is judged from this.
        evidence: macros.evidence ?? null,
      },
      activity: activeKcal == null ? null : { activeKcal, exerciseMinutes: minutesByDate.get(date) ?? null },
      training: { sessions: sessionsByDate.get(date)?.size ?? 0 },
      body: { weighIn: weightByDate.has(date), weight: weightByDate.get(date)?.pounds ?? null },
      // Recovery/Sleep slot: filled when Sleep evidence is admitted.
      recovery: null,
    };
  });
}

function nutritionEvidenceOf(item) {
  const payload = payloadOf(item);
  const provenance = payload.provenance ?? item.provenance ?? {};
  const meals = Array.isArray(payload.meals) ? payload.meals : [];
  const entries = meals.reduce((sum, meal) => sum + (Array.isArray(meal?.foods) ? meal.foods.length : 0), 0);
  const tier = resolveNutritionDayAuthority(item).assertion?.tier ?? null;
  return {
    artifacts: [...new Set([...(payload.source?.source_artifact_refs ?? []), ...(provenance.source_artifact_refs ?? [])])].sort(),
    observations: [...new Set(provenance.source_observation_ids ?? [])].sort(),
    entries: meals.length ? entries : null,
    fullDayAsserted: tier === "full_day_asserted" || payload.metadata?.coverage === "complete_day",
  };
}

function weightInPounds(entry) {
  const raw = entry?.weight?.value ?? entry?.weight;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(entry?.weight?.unit ?? "lb").toLowerCase();
  return unit === "kg" ? value * 2.20462 : value;
}

function isDeliberateTraining(payload) {
  const type = String(payload?.metadata?.activity_type ?? payload?.metadata?.workout_type ?? payload?.activity_type ?? "");
  if (DELIBERATE_TRAINING.test(type)) return true;
  return (payload?.exercises ?? []).some((exercise) => (exercise?.sets ?? []).some((set) =>
    Number(set?.reps) > 0 || Number(set?.weight) > 0));
}

function isActive(item) {
  const status = String(item?.quality?.status ?? payloadOf(item)?.quality?.status ?? "").toLowerCase();
  return !INACTIVE_STATUSES.has(status) && payloadOf(item)?.removed !== true;
}

function payloadOf(item) {
  return item?.payload && typeof item.payload === "object" ? item.payload : item ?? {};
}

function finite(value) {
  return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
}
