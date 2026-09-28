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
});

const D = EVIDENCE_DOMAINS;

// Goal-neutral roles for consumers that must not name a measure (the V3 core):
// the goal's outcome measure, its guardrail, and its scale trajectory.
export const EVIDENCE_DOMAIN_ROLES = Object.freeze({
  outcome: D.BODY_COMPOSITION,
  guardrail: D.GUARDRAIL,
  trajectory: D.BODY_TRAJECTORY,
});

const POLICIES = deepFreeze({
  build_lean_mass: {
    goalType: "build_lean_mass",
    // Weights reflect how much each domain can tell about this goal.
    domains: { [D.BODY_COMPOSITION]: 1.0, [D.TRAINING]: 1.0, [D.BODY_TRAJECTORY]: 0.9, [D.GUARDRAIL]: 0.9,
      [D.NUTRITION]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6 },
    // A mass-building phase expects scale weight to drift up. These are a
    // typical pace for the goal type, not the Founder's plan: the engine may
    // describe a pace as quick against them, never as "off plan". Scale weight
    // never identifies lean versus fat mass.
    weightExpectation: { direction: "up", typicalWeeklyRate: [0.25, 1.0], cautionWeeklyRate: 1.5 },
  },
  lose_fat: {
    goalType: "lose_fat",
    domains: { [D.BODY_COMPOSITION]: 1.0, [D.BODY_TRAJECTORY]: 1.0, [D.NUTRITION]: 1.0, [D.GUARDRAIL]: 0.9,
      [D.TRAINING]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.6, [D.RECOVERY]: 0.6 },
    weightExpectation: { direction: "down", typicalWeeklyRate: [-1.5, -0.4], cautionWeeklyRate: -2.0 },
  },
  maintain: {
    goalType: "maintain",
    domains: { [D.BODY_TRAJECTORY]: 1.0, [D.BODY_COMPOSITION]: 0.9, [D.GUARDRAIL]: 0.9, [D.NUTRITION]: 0.8,
      [D.TRAINING]: 0.8, [D.ROUTINE]: 0.8, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6 },
    weightExpectation: { direction: "stable", typicalWeeklyRate: [-0.3, 0.3], cautionWeeklyRate: 0.75 },
  },
  general: {
    goalType: "general",
    domains: { [D.TRAINING]: 1.0, [D.ROUTINE]: 0.9, [D.NUTRITION]: 0.8, [D.BODY_TRAJECTORY]: 0.7,
      [D.BODY_COMPOSITION]: 0.7, [D.GUARDRAIL]: 0.7, [D.ACTIVITY]: 0.5, [D.RECOVERY]: 0.6 },
    weightExpectation: null,
  },
});

export function resolveGoalEvidencePolicy(goalContract) {
  const capabilities = [
    ...(goalContract?.objectives ?? []).map((item) => ({ id: item?.metricCapability?.id, mode: item?.evaluation?.mode,
      direction: item?.evaluation?.direction })),
  ];
  const ids = capabilities.map((item) => String(item.id ?? ""));
  if (ids.some((id) => /lean_mass|muscle|skeletal/u.test(id))) return POLICIES.build_lean_mass;
  if (ids.some((id) => /body_fat|fat_mass/u.test(id)) ||
      capabilities.some((item) => /weight/u.test(String(item.id)) && /decrease|down|minimi/u.test(`${item.direction} ${item.mode}`))) {
    return POLICIES.lose_fat;
  }
  if (capabilities.some((item) => ["maintain_range", "stability"].includes(item.mode))) return POLICIES.maintain;
  return POLICIES.general;
}

export function goalEvidencePolicyFor(goalType) {
  return POLICIES[goalType] ?? POLICIES.general;
}
