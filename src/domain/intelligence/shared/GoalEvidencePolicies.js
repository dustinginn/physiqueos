// Goal-evidence policies: which evidence domains a goal must have considered
// before any briefing is written, how much each matters to the goal, and what
// the goal expects of body trajectory. Resolved from the Goal Contract's own
// objective and guardrail capabilities — never from a goal's display name.
//
// Every domain listed here is assessed on every briefing (an assessment may be
// "unavailable"); only synthesis decides what is worth saying. Recovery is a
// first-class slot so Sleep evidence can join later without redesigning
// synthesis.

import { deepFreeze } from "../v3/V3Runtime.js";

export const EVIDENCE_DOMAINS = Object.freeze({
  BODY_TRAJECTORY: "body_trajectory",
  BODY_COMPOSITION: "body_composition",
  GUARDRAIL: "guardrail",
  TRAINING: "training",
  NUTRITION: "nutrition",
  ACTIVITY: "activity",
  ROUTINE: "routine",
  RECOVERY: "recovery",
  // Visual change (progress photos): its own domain — a photo is not a
  // composition measurement.
  VISUAL: "visual_change",
});

const D = EVIDENCE_DOMAINS;

// Goal-neutral roles for consumers that must not name a measure (the V3 core):
// the goal's outcome measure, its guardrail, and its scale trajectory.
export const EVIDENCE_DOMAIN_ROLES = Object.freeze({
  outcome: D.BODY_COMPOSITION,
  guardrail: D.GUARDRAIL,
  trajectory: D.BODY_TRAJECTORY,
  visual: D.VISUAL,
});

// Who may judge the scale's pace. A goal type sets only the direction it
// expects. A pace judgment ("faster than planned") needs a canonical expected
// weekly range — the accepted Phase Expected Trajectory's `weightTrajectory`
// (phase_expected_trajectory_v1). Today's canonical records set
// `universalWeeklyRate: null` and ask weight logic to warn on acceleration,
// stagnation and volatility instead, so without a canonical range the engine
// judges the trend only against the person's own recent trend. It never
// derives a weight target from calories or wearable expenditure.
export const WEIGHT_PACE_AUTHORITY = deepFreeze({
  canonicalSource: "phase_expected_trajectory_v1.weightTrajectory",
  canonicalRangeFields: ["expectedWeeklyRange", "cautionWeeklyRate"],
  withoutCanonicalRange: "personal_trend_relative: acceleration, stagnation, direction, volatility",
  // Measurement boundaries, not targets: below this the scale "held steady".
  movementThresholdLbPerWeek: 0.25,
  // Acceleration: the last two weeks' pace against the two weeks before.
  accelerationMinimumIncreaseLbPerWeek: 0.5,
  accelerationMinimumRelativeIncrease: 0.5,
});

// A canonical expected weekly range for the scale (signed lb/week: negative
// for loss), when the accepted Phase
// Expected Trajectory declares one; otherwise null (the engine then never
// judges pace in absolute terms). The consumer is ready, but the Weekly
// prepare path does not yet pass the accepted trajectory's
// `weightTrajectory` through goal facts (follow-on wiring); every accepted
// record today declares `universalWeeklyRate: null`, so production behavior
// is the same either way.
export function canonicalWeightPace(weightTrajectory) {
  const range = weightTrajectory?.expectedWeeklyRange;
  const low = Number(range?.min ?? range?.[0]);
  const high = Number(range?.max ?? range?.[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return null;
  const caution = Number(weightTrajectory.cautionWeeklyRate);
  return { expectedWeeklyRange: [low, high], cautionWeeklyRate: Number.isFinite(caution) ? caution : null,
    authority: "phase_expected_trajectory" };
}

const POLICIES = deepFreeze({
  build_lean_mass: {
    goalType: "build_lean_mass",
    // Weights reflect how much each domain can tell about this goal.
    domains: { [D.BODY_COMPOSITION]: 1.0, [D.TRAINING]: 1.0, [D.BODY_TRAJECTORY]: 0.9, [D.GUARDRAIL]: 0.9,
      [D.NUTRITION]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6, [D.VISUAL]: 0.7 },
    // A mass-building phase expects scale weight to move up. Direction only:
    // the goal type owns no weekly rate (see WEIGHT_PACE_AUTHORITY). Scale
    // weight never identifies lean versus fat mass.
    weightExpectation: { direction: "up" },
  },
  gain_weight: {
    goalType: "gain_weight",
    domains: { [D.BODY_TRAJECTORY]: 1.0, [D.NUTRITION]: 1.0, [D.TRAINING]: 0.9, [D.BODY_COMPOSITION]: 0.8,
      [D.GUARDRAIL]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6, [D.VISUAL]: 0.6 },
    weightExpectation: { direction: "up" },
  },
  lose_fat: {
    goalType: "lose_fat",
    domains: { [D.BODY_COMPOSITION]: 1.0, [D.BODY_TRAJECTORY]: 1.0, [D.NUTRITION]: 1.0, [D.GUARDRAIL]: 0.9,
      [D.TRAINING]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.6, [D.RECOVERY]: 0.6, [D.VISUAL]: 0.8 },
    weightExpectation: { direction: "down" },
  },
  maintain: {
    goalType: "maintain",
    domains: { [D.BODY_TRAJECTORY]: 1.0, [D.BODY_COMPOSITION]: 0.9, [D.GUARDRAIL]: 0.9, [D.NUTRITION]: 0.8,
      [D.TRAINING]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6, [D.VISUAL]: 0.6 },
    weightExpectation: { direction: "stable" },
  },
  general: {
    goalType: "general",
    domains: { [D.TRAINING]: 1.0, [D.ROUTINE]: 0.9, [D.NUTRITION]: 0.8, [D.BODY_TRAJECTORY]: 0.7,
      [D.BODY_COMPOSITION]: 0.7, [D.GUARDRAIL]: 0.7, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6, [D.VISUAL]: 0.6 },
    weightExpectation: null,
  },
});

// Resolved from the primary objective's measure and its canonical evaluation
// (mode, desiredDirection, targets) — the same fields the Goal Contract
// normalizes — never from a display name.
export function resolveGoalEvidencePolicy(goalContract) {
  const objectives = goalContract?.objectives ?? [];
  const primary = objectives.find((item) => item?.priority === "primary") ?? objectives[0] ?? null;
  if (!primary) return POLICIES.general;
  const id = String(primary.metricCapability?.id ?? primary.metricCapability?.key ?? "");
  const direction = objectiveDirection(primary.evaluation ?? {});
  if (/lean_mass|muscle|skeletal/u.test(id)) return direction === "stable" ? POLICIES.maintain : direction === "up" ? POLICIES.build_lean_mass : POLICIES.general;
  if (/body_fat|fat_mass/u.test(id)) return direction === "stable" ? POLICIES.maintain : direction === "down" ? POLICIES.lose_fat : POLICIES.general;
  if (/weight|body_mass/u.test(id)) {
    return { up: POLICIES.gain_weight, down: POLICIES.lose_fat, stable: POLICIES.maintain }[direction] ?? POLICIES.general;
  }
  return direction === "stable" ? POLICIES.maintain : POLICIES.general;
}

// The direction an objective asks its measure to move: up, down or stable.
function objectiveDirection(evaluation) {
  const declared = String(evaluation.desiredDirection ?? "").toLowerCase();
  if (/^(?:increase|up|higher)$/u.test(declared)) return "up";
  if (/^(?:decrease|down|lower)$/u.test(declared)) return "down";
  if (/^(?:stable|maintain|hold)$/u.test(declared)) return "stable";
  const mode = evaluation.mode;
  if (["increase", "minimum"].includes(mode)) return "up";
  if (["decrease", "maximum"].includes(mode)) return "down";
  if (["maintain_range", "stability"].includes(mode)) return "stable";
  // A target is a direction relative to where the goal started.
  const baseline = Number(evaluation.baselineValue);
  const target = mode === "target_range"
    ? midpoint(evaluation.targetRange) : Number(evaluation.targetValue);
  if (Number.isFinite(baseline) && Number.isFinite(target)) {
    if (mode === "target_range" && inRange(baseline, evaluation.targetRange)) return "stable";
    return target > baseline ? "up" : target < baseline ? "down" : "stable";
  }
  return null;
}

function midpoint(range) {
  const low = Number(range?.min ?? range?.low);
  const high = Number(range?.max ?? range?.high);
  return Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : NaN;
}

function inRange(value, range) {
  const low = Number(range?.min ?? range?.low);
  const high = Number(range?.max ?? range?.high);
  return Number.isFinite(low) && Number.isFinite(high) && value >= low && value <= high;
}

export function goalEvidencePolicyFor(goalType) {
  return POLICIES[goalType] ?? POLICIES.general;
}
