// Briefing-type policies for the shared Briefing Intelligence layer.
//
// The shared layer establishes baselines and detects/ranks patterns; each
// briefing type decides its horizon, which pattern kinds it may use, and how
// much it may conclude. Consumers read `policy.narrativeRole` to decide
// whether a characterization may speak as a completed-period recap, an
// emerging signal, a persistence finding, or context for an authoritative
// outcome.

import { BriefingPatternKind } from "./BriefingIntelligence.js";

const ALL = Object.values(BriefingPatternKind);

export const BRIEFING_INTELLIGENCE_POLICIES = Object.freeze({
  // The completed week, against the preceding four weeks of routine.
  weekly: Object.freeze({
    cadence: "weekly", baselineDays: 28, admissibleKinds: ALL,
    maxCharacterization: 3, narrativeRole: "completed_period_recap",
  }),
  // A partial window: runs and early shifts only, never a concluded pattern.
  midweek: Object.freeze({
    cadence: "midweek", baselineDays: 28, maxCharacterization: 2, minRunDays: 2,
    admissibleKinds: [BriefingPatternKind.VALUE_RUN, BriefingPatternKind.ROUTINE_GAP, BriefingPatternKind.ROUTINE_SHIFT],
    narrativeRole: "emerging_signal",
  }),
  // Persistence and change across weeks, not a concatenation of weeks.
  monthly: Object.freeze({
    cadence: "monthly", baselineDays: 56, maxCharacterization: 3,
    admissibleKinds: [BriefingPatternKind.LEVEL_SHIFT, BriefingPatternKind.FREQUENCY_CHANGE,
      BriefingPatternKind.DISPERSION_CHANGE, BriefingPatternKind.ROUTINE_SHIFT],
    narrativeRole: "persistence_and_change",
  }),
  // Execution context preceding an authoritative outcome; never a cause.
  dexa: Object.freeze({
    cadence: "dexa", baselineDays: 56, maxCharacterization: 2,
    admissibleKinds: [BriefingPatternKind.LEVEL_SHIFT, BriefingPatternKind.FREQUENCY_CHANGE, BriefingPatternKind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
  }),
  photo: Object.freeze({
    cadence: "photo", baselineDays: 56, maxCharacterization: 2,
    admissibleKinds: [BriefingPatternKind.LEVEL_SHIFT, BriefingPatternKind.FREQUENCY_CHANGE, BriefingPatternKind.ROUTINE_SHIFT],
    narrativeRole: "preceding_execution_context",
  }),
});

export function resolveBriefingIntelligencePolicy(cadenceOrEventType) {
  return BRIEFING_INTELLIGENCE_POLICIES[String(cadenceOrEventType ?? "")] ?? null;
}
