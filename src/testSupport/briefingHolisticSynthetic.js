// Seeded holistic situations for synthesis validation: a generated period
// (routine, weight trend, disruptions) plus goal-level facts (composition,
// guardrail, energy against plan, training milestones, outlook) varied per
// seed and per goal type. None of these situations is written for a particular
// week; the tests assert properties that must hold across all of them.

import { createBriefingIntelligence } from "../domain/intelligence/shared/BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "../domain/intelligence/shared/BriefingIntelligencePolicies.js";
import { goalEvidencePolicyFor } from "../domain/intelligence/shared/GoalEvidencePolicies.js";
import { generateSyntheticPeriod, mulberry32 } from "./briefingIntelligenceSynthetic.js";

export const HOLISTIC_KINDS = Object.freeze([
  "stable_all", "strong_training", "disruption_training_stable_weight", "weight_rising_no_dexa",
  "weight_rapid_guardrail", "weight_dexa_conflict", "unreliable_nutrition", "single_unreliable_day",
  "activity_variation", "crowded", "spectacular_pr", "sparse", "missed_week", "composition_regressed",
  "risk_routine_progress", "guardrail_breached", "intake_conflicts_with_scale", "canonical_pace_fast",
]);

export const HOLISTIC_GOAL_TYPES = Object.freeze(["build_lean_mass", "gain_weight", "lose_fat", "maintain", "general"]);

// Goal-type vocabulary a Goal Contract would carry.
const GOAL_WORDS = {
  build_lean_mass: { outcome: "lean mass", guardrail: "body fat", guardrailUnit: "%" },
  gain_weight: { outcome: "lean mass", guardrail: "body fat", guardrailUnit: "%" },
  lose_fat: { outcome: "body fat", guardrail: "lean mass", guardrailUnit: "lb" },
  maintain: { outcome: "lean mass", guardrail: "body fat", guardrailUnit: "%" },
  general: { outcome: "lean mass", guardrail: "body fat", guardrailUnit: "%" },
};

const HORIZON = {
  weekly: { windowDays: 7, baselineDays: 28 },
  midweek: { windowDays: 3, baselineDays: 28 },
  monthly: { windowDays: 28, baselineDays: 56 },
  dexa: { windowDays: 28, baselineDays: 56 },
  photo: { windowDays: 28, baselineDays: 56 },
};

const DISRUPTED = new Set(["disruption_training_stable_weight", "crowded", "risk_routine_progress"]);

// Weekly scale trend by situation, in the goal's own direction: positive
// means "the way this goal wants" (up for mass goals, down for fat loss).
const TREND_WITH_GOAL = {
  weight_rising_no_dexa: 0.6, weight_dexa_conflict: -0.8, crowded: 1.2,
  stable_all: 0.45, spectacular_pr: 0.4, disruption_training_stable_weight: 0.4, missed_week: 0.4,
  risk_routine_progress: 0.5, intake_conflicts_with_scale: -0.8, weight_rapid_guardrail: 0.5, canonical_pace_fast: 1.8,
};

// Situations whose scale trend speeds up over the last two weeks (the way
// the goal wants), by this many lb/week on top of the base trend.
const ACCELERATION = { weight_rapid_guardrail: 2.2, risk_routine_progress: 2.2 };

// Situations with a canonical expected weekly range on the accepted phase
// trajectory (the only authority for judging pace in absolute terms).
const CANONICAL_PACE = { canonical_pace_fast: { expectedWeeklyRange: { min: 0.25, max: 0.75 }, cautionWeeklyRate: 1.25 } };

export function holisticScenario({ seed, kind, cadence = "weekly", goalType = "build_lean_mass" }) {
  const random = mulberry32(seed * 31 + HOLISTIC_KINDS.indexOf(kind) * 977 + HOLISTIC_GOAL_TYPES.indexOf(goalType) * 61 + 7);
  const horizon = HORIZON[cadence];
  const goalPolicy = goalEvidencePolicyFor(goalType);
  const direction = goalPolicy.weightExpectation?.direction ?? "up";
  const base = kind === "activity_variation" ? "wearable_noise" : "stable";
  const withGoal = TREND_WITH_GOAL[kind] ?? 0.4 + random() * 0.3;
  const weightTrend = direction === "down" ? -withGoal * 1.4 :
    direction === "stable" ? (kind === "weight_rapid_guardrail" || kind === "weight_dexa_conflict" ? withGoal * 0.6 : withGoal * 0.25) :
      withGoal;
  const period = generateSyntheticPeriod({ seed, scenario: base, windowDays: horizon.windowDays,
    baselineDays: horizon.baselineDays, weightTrend });
  const window = period.truth.window;
  const windowDays = period.days.filter((day) => day.date >= window.startDate);

  if (ACCELERATION[kind] && direction !== "stable") {
    const sign = direction === "down" ? -1 : 1;
    const start = shiftBack(window.endDate, 13);
    for (const day of period.days) {
      if (day.date < start || !Number.isFinite(day.body?.weight)) continue;
      const into = (Date.parse(`${day.date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000;
      day.body.weight = Math.round((day.body.weight + sign * ACCELERATION[kind] * into / 7) * 10) / 10;
    }
  }
  if (DISRUPTED.has(kind)) disruptLateStretch({ period, windowDays, length: 3 + Math.floor(random() * 2) });
  if (kind === "missed_week") {
    for (const day of windowDays) day.training = { sessions: 0 };
  }
  if (kind === "unreliable_nutrition") {
    for (const day of windowDays.slice(-3)) if (day.nutrition) day.nutrition.protein = Math.round(day.nutrition.protein * 0.3);
  }
  if (kind === "single_unreliable_day") {
    const day = windowDays[Math.floor(random() * windowDays.length)];
    if (day.nutrition) day.nutrition.protein = Math.round(day.nutrition.protein * 0.3);
  }
  if (kind === "sparse") {
    for (const day of period.days) {
      if (random() < 0.8) Object.assign(day, { nutrition: null, activity: null, body: { weighIn: false, weight: null } });
    }
  }

  const policy = BRIEFING_INTELLIGENCE_POLICIES[cadence];
  const intelligence = createBriefingIntelligence({ window, days: period.days, policy });
  const milestoneCount = { strong_training: 4, disruption_training_stable_weight: 3, crowded: 5,
    unreliable_nutrition: 2, single_unreliable_day: 2, spectacular_pr: 1, composition_regressed: 2,
    risk_routine_progress: 4 }[kind] ?? 0;
  const milestones = Array.from({ length: milestoneCount }, (_, index) => ({
    subjectId: `lift_${index}`, subjectLabel: `Lift ${String.fromCharCode(65 + index)}`, type: "load_milestone",
    observedAt: windowDays[Math.min(windowDays.length - 1, index)].date, metric: "heaviest_load",
    currentValue: kind === "spectacular_pr" ? 150 : 105 + index * 5, previousValue: 100 + index * 5, unit: "lb",
    relativeGain: kind === "spectacular_pr" ? 0.5 : Math.round((5 / (100 + index * 5)) * 1000) / 1000,
    score: 130 - index,
  }));
  const eventDate = window.endDate;
  const words = GOAL_WORDS[goalType];
  // Progress on the outcome measure is up for lean mass, down for body fat.
  const progressSign = words.outcome === "body fat" ? -1 : 1;
  const regressed = kind === "composition_regressed";
  const composition = kind === "weight_rising_no_dexa" || kind === "sparse" ? null : {
    available: true,
    measuredAt: ["dexa", "photo"].includes(cadence) ? eventDate : shiftBack(window.startDate, 5 + Math.floor(random() * 20)),
    state: regressed ? "regressed" : "progressed", metric: "body_composition.outcome",
    change: Math.round((regressed ? -1 : 1) * progressSign * (1 + random() * 4) * 10) / 10,
    unit: "lb", currentValue: 150, label: words.outcome, eventName: "DEXA",
  };
  const guardrailStatus = kind === "weight_rapid_guardrail" ? "watch" : kind === "guardrail_breached" ? "breached" : "clear";
  // Intake read against a scale already moving the other way (above plan
  // while the scale falls against a gain goal, say).
  const intakeState = kind === "crowded" ? "above_plan" : kind === "intake_conflicts_with_scale"
    ? (direction === "down" ? "below_plan" : "above_plan") : "on_plan";
  const visual = cadence === "photo" && composition ? { available: true, capturedAt: eventDate,
    change: kind === "strong_training" ? "visible" : kind === "stable_all" ? "none" : "subtle" } : null;
  return {
    kind, seed, cadence, goalType, window, period, intelligence, goalPolicy, policy,
    goalFacts: {
      composition,
      guardrail: kind === "sparse" ? null : { available: true, status: guardrailStatus,
        value: words.guardrailUnit === "%" ? 9.5 : 140, unit: words.guardrailUnit,
        metric: "body_composition.guardrail", label: words.guardrail },
      energy: kind === "sparse" ? null : { intake: { state: intakeState, observed: 2600, target: 2500 },
        activity: { state: "on_plan", observed: 800, target: 800 } },
      trainingMilestones: milestones,
      visual,
      weightTrajectory: CANONICAL_PACE[kind] ?? { direction: "goal_and_guardrail_aware", universalWeeklyRate: null },
      outlook: { percentage: 79, delta: 0 },
      strategy: { action: "continue_current_strategy" },
    },
  };
}

// A late stretch on which the routine clearly expected training and got none,
// with activity well down: the routine made those weekdays training days in
// every baseline week, so the gap is improbable under the person's routine.
function disruptLateStretch({ period, windowDays, length }) {
  const stretch = windowDays.slice(-length);
  const weekdays = new Set(stretch.map((day) => weekdayOf(day.date)));
  for (const day of period.days) {
    if (day.date < windowDays[0].date && weekdays.has(weekdayOf(day.date))) day.training = { sessions: 1 };
  }
  for (const day of stretch) {
    day.training = { sessions: 0 };
    day.body = { weighIn: false, weight: null };
    if (day.activity) {
      day.activity.activeKcal = Math.round(day.activity.activeKcal * 0.35);
      day.activity.exerciseMinutes = Math.round(Number(day.activity.exerciseMinutes ?? 0) * 0.2);
    }
  }
}

function weekdayOf(date) { return new Date(`${date}T12:00:00.000Z`).getUTCDay(); }

function shiftBack(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
