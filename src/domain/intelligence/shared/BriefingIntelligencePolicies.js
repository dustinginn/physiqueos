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
  }),
  // A partial window: runs and early shifts only, never a concluded pattern.
  midweek: Object.freeze({
    cadence: "midweek", baselineDays: 28, maxCharacterization: 2,
    detectKinds: SHIFT_BUILDING_BLOCKS, admissibleKinds: SHIFT_BUILDING_BLOCKS,
    narrativeRole: "emerging_signal",
  }),
  // Persistence and change across weeks, not a concatenation of weeks: runs
  // and gaps are detected only to build routine shifts; the month is
  // characterized by level, frequency, dispersion and shift findings.
  monthly: Object.freeze({
    cadence: "monthly", baselineDays: 56, maxCharacterization: 3, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.DISPERSION_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "persistence_and_change",
  }),
  // Execution context in the 28 days preceding an authoritative outcome;
  // never a cause of it.
  dexa: Object.freeze({
    cadence: "dexa", baselineDays: 56, contextWindowDays: 28, maxCharacterization: 2, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
  }),
  photo: Object.freeze({
    cadence: "photo", baselineDays: 56, contextWindowDays: 28, maxCharacterization: 2, detectKinds: ALL,
    admissibleKinds: [Kind.LEVEL_SHIFT, Kind.FREQUENCY_CHANGE, Kind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
  }),
});

export function resolveBriefingIntelligencePolicy(cadenceOrEventType) {
  return BRIEFING_INTELLIGENCE_POLICIES[String(cadenceOrEventType ?? "")] ?? null;
}
