// Seeded synthetic periods for Briefing Intelligence validation.
//
// Each seed draws a different personal routine (intake level and noise,
// macro profile, wearable activity level and noise, training days per week
// and which weekdays, weigh-in habit). A scenario then perturbs the briefed
// window with randomized placement, length and magnitude. Nothing here is
// written for a particular week: assertions are behavioral properties that
// must hold across every generated period.

import { dateRange, shiftDate } from "../domain/intelligence/shared/BriefingIntelligence.js";

export const SYNTHETIC_SCENARIOS = Object.freeze([
  "stable",
  "intake_run",
  "single_spike",
  "training_gap",
  "data_outage",
  "late_disruption",
  "underlogged_day",
  "duplicate_day",
  "wearable_noise",
]);

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSyntheticPeriod({ seed, scenario, windowEnd = "2026-09-19", baselineDays = 28, windowDays = 7,
  weightTrend = null }) {
  const random = mulberry32(seed * 7919 + SYNTHETIC_SCENARIOS.indexOf(scenario) * 104729 + 1);
  const between = (min, max) => min + (max - min) * random();
  const gauss = () => {
    const u = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  const routine = {
    intake: Math.round(between(1900, 3200)),
    intakeNoise: between(0.04, 0.08),
    proteinShare: between(0.24, 0.32),
    activity: Math.round(between(350, 1000)),
    activityNoise: between(0.08, 0.15),
    minutes: Math.round(between(45, 120)),
    trainingDays: pickWeekdays(random, Math.round(between(4, 6))),
    weighInRate: between(0.85, 1),
  };
  // Weight draws come from their own stream so adding weight never changes
  // any other generated value for a seed.
  const weightRandom = mulberry32(seed * 104729 + 11);
  const weightBetween = (min, max) => min + (max - min) * weightRandom();
  const weightGauss = () => {
    const u = Math.max(weightRandom(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * weightRandom());
  };
  routine.startWeight = weightBetween(150, 200);
  routine.weeklyWeightTrend = weightTrend ?? weightBetween(-0.1, 0.9);
  routine.weightNoise = weightBetween(0.4, 1.1);
  const windowStart = shiftDate(windowEnd, -(windowDays - 1));
  const start = shiftDate(windowStart, -baselineDays);
  const dates = dateRange(start, windowEnd);
  const days = dates.map((date) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const calories = Math.round(routine.intake * (1 + routine.intakeNoise * gauss()));
    const protein = Math.round((calories * routine.proteinShare * (1 + 0.05 * gauss())) / 4);
    const carbs = Math.round((calories * 0.45) / 4);
    const fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
    return {
      date,
      nutrition: { calories, protein, carbs, fat, completeness: "complete" },
      activity: { activeKcal: Math.round(routine.activity * (1 + routine.activityNoise * gauss())),
        exerciseMinutes: Math.max(0, Math.round(routine.minutes * (1 + 0.12 * gauss()))) },
      training: { sessions: routine.trainingDays.includes(weekday) && random() > 0.08 ? 1 : 0 },
      body: { weighIn: random() < routine.weighInRate },
    };
  });
  for (const [index, day] of days.entries()) {
    day.body.weight = day.body.weighIn
      ? Math.round((routine.startWeight + routine.weeklyWeightTrend * index / 7 + routine.weightNoise * weightGauss()) * 10) / 10
      : null;
  }
  const windowDates = dateRange(windowStart, windowEnd);
  const at = (date) => days.find((day) => day.date === date);
  const truth = { scenario, seed, routine, window: { startDate: windowStart, endDate: windowEnd }, perturbed: [] };
  const span = (length) => {
    const first = Math.floor(random() * (windowDates.length - length + 1));
    return windowDates.slice(first, first + length);
  };

  if (scenario === "intake_run") {
    // Consecutive high days offset by lighter days elsewhere, so the weekly
    // average stays close to routine — the case a weekly average hides.
    const run = span(2 + Math.floor(random() * 2));
    const lift = between(1.4, 1.65);
    for (const date of run) scaleNutrition(at(date), lift);
    const rest = windowDates.filter((date) => !run.includes(date));
    const runTotal = run.reduce((sum, date) => sum + at(date).nutrition.calories, 0);
    const restTotal = rest.reduce((sum, date) => sum + at(date).nutrition.calories, 0);
    const target = routine.intake * windowDates.length * between(0.97, 1.06);
    const offset = Math.max(0.72, Math.min(1, (target - runTotal) / restTotal));
    for (const date of rest) scaleNutrition(at(date), offset);
    truth.perturbed = run; truth.lift = lift;
  } else if (scenario === "single_spike") {
    const [date] = span(1);
    scaleNutrition(at(date), between(1.6, 1.9));
    truth.perturbed = [date];
  } else if (scenario === "training_gap") {
    const run = span(2 + Math.floor(random() * 2));
    for (const date of run) at(date).training.sessions = 0;
    truth.perturbed = run;
  } else if (scenario === "data_outage") {
    const run = span(2 + Math.floor(random() * 2));
    for (const date of run) Object.assign(at(date), { nutrition: null, activity: null,
      training: { sessions: 0 }, body: { weighIn: false, weight: null } });
    truth.perturbed = run;
  } else if (scenario === "late_disruption") {
    const length = 2 + Math.floor(random() * 2);
    const run = windowDates.slice(-length);
    for (const date of run) {
      const day = at(date);
      day.training.sessions = 0;
      day.body.weighIn = false;
      day.body.weight = null;
      day.activity.activeKcal = Math.round(day.activity.activeKcal * between(0.35, 0.55));
      day.activity.exerciseMinutes = Math.round(day.activity.exerciseMinutes * between(0.1, 0.35));
    }
    truth.perturbed = run;
  } else if (scenario === "underlogged_day") {
    const [date] = span(1);
    const day = at(date);
    day.nutrition.protein = Math.round(day.nutrition.protein * between(0.3, 0.45));
    truth.perturbed = [date];
  } else if (scenario === "duplicate_day") {
    const index = 1 + Math.floor(random() * (windowDates.length - 1));
    const previous = at(windowDates[index - 1]);
    at(windowDates[index]).nutrition = { ...previous.nutrition,
      calories: previous.nutrition.calories + 0.4, protein: previous.nutrition.protein + 0.2 };
    truth.perturbed = [windowDates[index]];
  } else if (scenario === "wearable_noise") {
    for (const date of windowDates) {
      const day = at(date);
      day.activity.activeKcal = Math.round(routine.activity * (1 + 0.18 * gauss()));
    }
  }
  return { days, truth };
}

// The same period as canonical records in the production (HealthKit
// graduation-projected) shape, for end-to-end pipeline runs.
export function syntheticCanonicalRecords({ days, userId = "user_founder_001" }) {
  const canonicalObjects = [];
  const weightEntries = [];
  for (const day of days) {
    if (day.nutrition) {
      canonicalObjects.push({ canonicalId: `nutrition|${day.date}|synthetic`, evidence_type: "nutrition",
        firstObservedAt: day.date, lastObservedAt: day.date, quality: { status: "active" }, userId,
        payload: { id: `synthetic_nutrition_${day.date}`, evidence_type: "nutrition", observed_at: day.date,
          source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
          daily_totals: { calories: day.nutrition.calories, protein_g: day.nutrition.protein,
            carbs_g: day.nutrition.carbs, fat_g: day.nutrition.fat },
          metadata: { date: day.date, daily_totals_scope: "full_day_summary", completeness: "complete",
            meal_count: 0, coverage: "complete_day" },
          quality: { status: "complete" } } });
    }
    if (day.activity) {
      canonicalObjects.push({ canonicalId: `activity_day|${day.date}`, evidence_type: "activity_day",
        firstObservedAt: day.date, lastObservedAt: day.date, quality: { status: "active" }, userId,
        payload: { id: `synthetic_activity_${day.date}`, evidence_type: "activity_day", observed_at: day.date,
          source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
          daily_activity: { move_calories: day.activity.activeKcal, exercise_minutes: day.activity.exerciseMinutes },
          metadata: { coverage: "complete_day" }, quality: { status: "complete" } } });
    }
    for (let index = 0; index < day.training.sessions; index += 1) {
      canonicalObjects.push({ canonicalId: `training|synthetic|${day.date}|${index}`, evidence_type: "training",
        firstObservedAt: day.date, lastObservedAt: day.date, quality: { status: "active" }, userId,
        payload: { id: `synthetic_training_${day.date}_${index}`, evidence_type: "training", observed_at: day.date,
          metadata: { activity_type: "Traditional Strength Training" },
          exercises: [{ name: "Synthetic Movement", sets: [{ reps: 10, weight: 100 }] }] } });
    }
    if (day.body.weighIn) {
      weightEntries.push({ id: `weight_${day.date}`, measuredAt: `${day.date}T14:00:00.000Z`,
        weight: { value: day.body.weight ?? 175, unit: "lb" } });
    }
  }
  return { canonicalObjects, weightEntries };
}

function scaleNutrition(day, factor) {
  for (const key of ["calories", "protein", "carbs", "fat"]) day.nutrition[key] = Math.round(day.nutrition[key] * factor);
}

function pickWeekdays(random, count) {
  const days = [0, 1, 2, 3, 4, 5, 6];
  for (let index = days.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [days[index], days[swap]] = [days[swap], days[index]];
  }
  return days.slice(0, count).sort();
}
