export const RECOVERY_BRIEFING_SCHEMA_VERSION = "recovery_briefing_v1";
export const RECOVERY_STATUS_POLICY_VERSION = "recovery_status_policy_v1";
export const RECOVERY_BRIEFING_SHADOW_RESULT_VERSION =
  "recovery_briefing_shadow_result_v1";
export const RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION =
  "recovery_shadow_input_authority_v1";
export const RECOVERY_SLEEP_INPUT_PROJECTION_VERSION =
  "recovery_sleep_input_projection_v1";
export const RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION =
  "recovery_briefing_publication_authority_v1";
export const BRIEFING_RECOVERY_ASSESSMENT_SCHEMA_VERSION =
  "briefing_recovery_assessment_v1";

// Founder product lock (2026-10-07, backlog a06ed153): the Recovery card
// exists ONLY on the Weekly and Monthly recurring briefings. Midweek, DEXA,
// Photo and every other briefing type never carry a Recovery field, card,
// placeholder or graph. The older Midweek design is superseded, so Midweek is
// not a Recovery cadence at all: the assessment refuses it.
export const RecoveryBriefingCadence = Object.freeze({
  WEEKLY: "weekly",
  MONTHLY: "monthly",
});
export const RECOVERY_BRIEFING_CADENCES = Object.freeze(
  Object.values(RecoveryBriefingCadence)
);

export const RecoveryAssessmentMode = Object.freeze({
  // Non-user-facing validation output. Never persisted or published.
  SHADOW: "shadow",
  // An authorized, future-only Weekly/Monthly artifact field.
  PUBLICATION: "publication",
});

export const RecoveryBriefingStatus = Object.freeze({
  GREEN: "green",
  YELLOW: "yellow",
  RED: "red",
  UNAVAILABLE: "unavailable",
});

export const RecoveryShadowInputMode = Object.freeze({
  SYNTHETIC: "synthetic_shadow_fixture",
  PROSPECTIVE_VALIDATION_ONLY: "prospective_validation_only",
});

export const RECOVERY_STATUS_POLICY_V1 = deepFreeze({
  schemaVersion: RECOVERY_STATUS_POLICY_VERSION,
  medicalThresholds: false,
  baseline: {
    lookbackNights: 28,
    minimumUsableNights: 14,
    center: "median_total_sleep_minutes",
    robustSpread: {
      method: "max_absolute_floor_or_scaled_mad",
      absoluteFloorMinutes: 15,
      madScale: 1.4826,
    },
    excludesCurrentPeriod: true,
    usesFutureData: false,
  },
  nightFlags: {
    materialLow: {
      absoluteFloorMinutes: 30,
      spreadMultiplier: 1,
    },
    severeLow: {
      absoluteFloorMinutes: 75,
      spreadMultiplier: 2,
    },
  },
  cadences: {
    weekly: {
      expectedNights: 7,
      minimumPeriodNights: 5,
      yellow: {
        minimumMaterialLowNights: 3,
        minimumMaterialRun: 2,
      },
      red: {
        minimumSevereLowNights: 5,
        minimumSevereRun: 4,
        corroboratedMinimumSevereLowNights: 2,
      },
      redAllowed: true,
    },
    monthly: {
      minimumExpectedNights: 28,
      maximumExpectedNights: 31,
      minimumPeriodNights: 20,
      yellow: {
        minimumYellowSubperiods: 2,
        minimumMaterialLowNights: 12,
      },
      red: {
        severeNightRatio: 0.6,
        corroboratedMinimumSevereLowNights: 6,
      },
      redAllowed: true,
    },
  },
  training: {
    baselineComparablePeriods: 4,
    minimumComparablePeriods: 3,
    minimumTypicalSessions: 2,
    minimumReductionRatio: 0.25,
    minimumReductionSessions: {
      weekly: 1,
      monthly: 3,
    },
    causality: "not_inferred",
    canManufactureNonGreenStatus: false,
    // Founder decision 6 (2026-10-08): a published card never escalates to a
    // training-corroborated Red until travel/illness/injury/planned-rest/
    // deload exclusions have authoritative handling. Shadow mode still models it.
    publicationCorroboration: "disabled_pending_exclusion_authority",
  },
  foamRolling: {
    displayRole: "execution_context_only",
    canSetStatus: false,
    canEscalateStatus: false,
    canRescueStatus: false,
  },
  confidenceCoupling: "none",
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
