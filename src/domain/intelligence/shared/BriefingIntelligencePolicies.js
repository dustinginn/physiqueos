// Briefing-type policies for the shared Briefing Intelligence layer.
//
// The shared layer establishes baselines and detects/ranks patterns; each
// briefing type decides its horizon, which pattern kinds it may detect (its
// building blocks) and which may characterize the period, and how much it may
// conclude. Consumers read `narrativeRole` to decide whether a
// characterization speaks as a completed-period recap, an emerging signal, a
// persistence finding, or context preceding an authoritative outcome.

import { BriefingPatternKind as Kind } from "./BriefingIntelligence.js";

const ALL = Object.values(Kind);
const SHIFT_BUILDING_BLOCKS = [Kind.VALUE_RUN, Kind.ROUTINE_GAP, Kind.ROUTINE_SHIFT];

export const BRIEFING_INTELLIGENCE_POLICIES = Object.freeze({
  // The completed week, against the preceding four weeks of routine.
  weekly: Object.freeze({
    cadence: "weekly", baselineDays: 28, detectKinds: ALL, admissibleKinds: ALL,
    maxCharacterization: 3, narrativeRole: "completed_period_recap",
    // Moderate density: a few complementary ideas across domains.
    narrative: Object.freeze({ maxInsights: 3, maxLimitations: 1, floor: 0.9, heroInsights: 2,
      purpose: "holistic_recap_of_completed_week", watchDiscriminators: 2 }),
  }),
  // A partial window: runs and early shifts only, never a concluded pattern.
  midweek: Object.freeze({
    cadence: "midweek", baselineDays: 28, maxCharacterization: 2,
    detectKinds: SHIFT_BUILDING_BLOCKS, admissibleKinds: SHIFT_BUILDING_BLOCKS,
    narrativeRole: "emerging_signal",
    // Lightest density: one or two things emerging so far, with humility.
    narrative: Object.freeze({ maxInsights: 2, maxLimitations: 1, floor: 1.1, heroInsights: 1,
      purpose: "what_is_emerging_so_far", partialWindow: true, watchDiscriminators: 1 }),
  }),
  // Persistence and change across weeks, not a concatenation of weeks: runs
  // and gaps are detected only to build routine shifts; the month is
  // characterized by level, frequency, dispersion and shift findings.
  monthly: Object.freeze({
    cadence: "monthly", baselineDays: 56, maxCharacterization: 3, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.DISPERSION_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "persistence_and_change",
    // Highest density: trajectory, persistence vs one-offs, strategy fit.
    narrative: Object.freeze({ maxInsights: 5, maxLimitations: 2, floor: 0.7, heroInsights: 2,
      purpose: "multi_week_synthesis_and_strategy_fit", persistence: true, watchDiscriminators: 2 }),
  }),
  // Execution context in the 28 days preceding an authoritative outcome;
  // never a cause of it.
  dexa: Object.freeze({
    cadence: "dexa", baselineDays: 56, contextWindowDays: 28, maxCharacterization: 2, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
    // Strategic-review density around an authoritative outcome.
    narrative: Object.freeze({ maxInsights: 4, maxLimitations: 1, floor: 0.7, heroInsights: 2,
      purpose: "outcome_checkpoint_with_preceding_execution", leadDomain: "body_composition", watchDiscriminators: 2 }),
  }),
  photo: Object.freeze({
    cadence: "photo", baselineDays: 56, contextWindowDays: 28, maxCharacterization: 2, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
    // Depth scales with how much the visual evidence actually changed.
    narrative: Object.freeze({ maxInsights: 2, maxLimitations: 1, floor: 0.9, heroInsights: 1,
      purpose: "visual_change_with_corroboration", scaleWithOutcome: { domain: "visual_change", extraInsights: 2 },
      watchDiscriminators: 1 }),
  }),
});

export function resolveBriefingIntelligencePolicy(cadenceOrEventType) {
  return BRIEFING_INTELLIGENCE_POLICIES[String(cadenceOrEventType ?? "")] ?? null;
}

// The narrative budget a briefing actually gets for this picture: a policy may
// scale depth with how strong its own outcome evidence is (Photo), never with
// a word count.
export function resolveNarrativeBudget(policy, picture) {
  const base = policy?.narrative;
  if (!base) return null;
  const scale = base.scaleWithOutcome;
  if (!scale) return { ...base };
  const outcome = picture?.domains?.find((item) => item.domain === scale.domain);
  const strong = outcome?.insights?.some((item) => item.role === "outcome" && item.strength >= 2.5);
  return { ...base, maxInsights: base.maxInsights + (strong ? scale.extraInsights : 0) };
}
