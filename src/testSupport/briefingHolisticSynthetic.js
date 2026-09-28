// Seeded holistic situations for synthesis validation: a generated period
// (routine, weight trend, disruptions) plus goal-level facts (composition,
// guardrail, energy against plan, training milestones, outlook) varied per
// seed. None of these situations is written for a particular week; the tests
// assert properties that must hold across all of them.

import { createBriefingIntelligence } from "../domain/intelligence/shared/BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "../domain/intelligence/shared/BriefingIntelligencePolicies.js";
import { goalEvidencePolicyFor } from "../domain/intelligence/shared/GoalEvidencePolicies.js";
import { generateSyntheticPeriod, mulberry32 } from "./briefingIntelligenceSynthetic.js";

export const HOLISTIC_KINDS = Object.freeze([
  "stable_all", "strong_training", "disruption_training_stable_weight", "weight_rising_no_dexa",
  "weight_rapid_guardrail", "weight_dexa_conflict", "unreliable_nutrition", "activity_variation",
  "crowded", "spectacular_pr", "sparse",
]);

const HORIZON = {
  weekly: { windowDays: 7, baselineDays: 28 },
  midweek: { windowDays: 3, baselineDays: 28 },
  monthly: { windowDays: 28, baselineDays: 56 },
  dexa: { windowDays: 28, baselineDays: 56 },
  photo: { windowDays: 28, baselineDays: 56 },
};

export function holisticScenario({ seed, kind, cadence = "weekly" }) {
  const random = mulberry32(seed * 31 + HOLISTIC_KINDS.indexOf(kind) * 977 + 7);
  const horizon = HORIZON[cadence];
  const base = {
    disruption_training_stable_weight: "late_disruption", crowded: "late_disruption", activity_variation: "wearable_noise",
  }[kind] ?? "stable";
  const weightTrend = { weight_rising_no_dexa: 0.6, weight_rapid_guardrail: 1.9, weight_dexa_conflict: -0.7,
    crowded: 1.2, stable_all: 0.45, spectacular_pr: 0.4, disruption_training_stable_weight: 0.4 }[kind] ?? 0.4 + random() * 0.3;
  const period = generateSyntheticPeriod({ seed, scenario: base, windowDays: horizon.windowDays,
    baselineDays: horizon.baselineDays, weightTrend });
  const window = period.truth.window;
  const windowDays = period.days.filter((day) => day.date >= window.startDate);

  if (["unreliable_nutrition", "crowded"].includes(kind)) {
    for (const day of windowDays.slice(-3)) if (day.nutrition) day.nutrition.protein = Math.round(day.nutrition.protein * 0.3);
  }
  if (kind === "sparse") {
    for (const day of period.days) {
      if (random() < 0.8) Object.assign(day, { nutrition: null, activity: null, body: { weighIn: false, weight: null } });
    }
  }

  const policy = BRIEFING_INTELLIGENCE_POLICIES[cadence];
  const intelligence = createBriefingIntelligence({ window, days: period.days, policy });
  const milestoneCount = { strong_training: 4, disruption_training_stable_weight: 3, crowded: 5,
    unreliable_nutrition: 2, spectacular_pr: 1 }[kind] ?? 0;
  const milestones = Array.from({ length: milestoneCount }, (_, index) => ({
    subjectId: `lift_${index}`, subjectLabel: `Lift ${String.fromCharCode(65 + index)}`, type: "load_milestone",
    observedAt: windowDays[Math.min(windowDays.length - 1, index)].date, metric: "heaviest_load",
    currentValue: kind === "spectacular_pr" ? 150 : 105 + index * 5, previousValue: 100 + index * 5, unit: "lb",
    relativeGain: kind === "spectacular_pr" ? 0.5 : Math.round(((5 - index * 0) / (100 + index * 5)) * 1000) / 1000,
    score: 130 - index,
  }));
  const eventDate = window.endDate;
  const composition = kind === "weight_rising_no_dexa" || kind === "sparse" ? null : {
    available: true,
    measuredAt: ["dexa", "photo"].includes(cadence) ? eventDate : shiftBack(window.startDate, 5 + Math.floor(random() * 20)),
    state: "progressed", metric: "body_composition.lean_mass", change: Math.round((1 + random() * 4) * 10) / 10,
    unit: "lb", currentValue: 150, label: "lean mass", eventName: "DEXA",
  };
  const guardrailStatus = kind === "weight_rapid_guardrail" ? "watch" : "clear";
  const intakeState = kind === "crowded" ? "above_plan" : "on_plan";
  return {
    kind, seed, cadence, window, period, intelligence,
    goalPolicy: goalEvidencePolicyFor("build_lean_mass"),
    policy,
    goalFacts: {
      composition,
      guardrail: kind === "sparse" ? null : { available: true, status: guardrailStatus, value: 9.5, unit: "%",
        metric: "body_composition.body_fat_percentage", label: "body fat" },
      energy: kind === "sparse" ? null : { intake: { state: intakeState, observed: 2600, target: 2500 },
        activity: { state: "on_plan", observed: 800, target: 800 } },
      trainingMilestones: milestones,
      outlook: { percentage: 79, delta: 0 },
      strategy: { action: "continue_current_strategy" },
    },
  };
}

function shiftBack(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
