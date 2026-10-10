// Goal Adaptation policy v1 (Phase 0).
//
// DRAFT defaults that require Founder review before any activation. Nothing in
// production reads this policy: it is consumed only by the dormant shadow
// evaluator and its tests. Thresholds are frozen per version; a change means a
// new policy version, never an edit on the day a decision is made.
//
// Founder decisions encoded here (2026-10-10):
// - DEXA is never required for evidence sufficiency. Evidence rules are
//   goal-specific and source-flexible; DEXA only adds precision.
// - Evidence coverage, plan adherence and strategy sustainability are separate.
//   Consistent nonadherence does not by itself make a goal ineligible; when the
//   reliable evidence shows the strategy itself is unsustainable it can justify
//   a review.
// - Four weeks is the first calibration review checkpoint, not a guarantee of
//   an adaptation, and not a rigid delay for serious health/safety conflicts.
// - Missing data is not nonadherence; HealthKit-canonical domains are never
//   prompted for manually.
// - Below the preferred body-fat range while building is coached and
//   monitored first; a persistent downward trend makes adaptation eligible.

export const GOAL_ADAPTATION_POLICY_V1 = deepFreeze({
  version: "goal_adaptation_policy_v1",
  status: "draft_requires_founder_review",
  activation: "off",

  calibration: {
    // First review checkpoint for a new goal or phase.
    checkpointDays: 28,
    checkpointIsGuarantee: false,
    // Serious health/safety conflicts are evaluated without waiting.
    safetyExceptionsBypassCheckpoint: true,
  },

  // Rolling window used for evidence coverage and adherence.
  evidenceWindowDays: 28,

  // Goal archetypes. Each lists the evidence domains that make an evaluation
  // sufficient. `anyOf` groups are satisfied by any one listed domain.
  archetypes: {
    lean_mass_gain: {
      matches: ["build_lean_mass", "lean_mass_gain", "muscle_gain", "mass_building"],
      required: [
        { domain: "body_weight", minDaysPerWeek: 4 },
        { domain: "training_performance", minDaysPerWeek: 2 },
        { anyOf: [{ domain: "nutrition_intake", minDaysPerWeek: 5 }, { domain: "daily_evidence", minDaysPerWeek: 5 }] },
      ],
      precisionSources: ["body_composition_scan"],
      supportingSources: ["validated_progress_photos"],
      uncertaintyWithoutPrecision: "lean_tissue_estimated_from_weight_performance_and_intake",
      guardrailDirections: { body_fat_percentage: { upper: "unsafe", lower: "coaching" } },
    },
    fat_loss: {
      matches: ["fat_loss", "leaning", "cut", "visible_abs", "body_fat_reduction"],
      required: [
        { domain: "body_weight", minDaysPerWeek: 4 },
        { anyOf: [{ domain: "nutrition_intake", minDaysPerWeek: 5 }, { domain: "activity_energy", minDaysPerWeek: 5 }, { domain: "daily_evidence", minDaysPerWeek: 5 }] },
      ],
      precisionSources: ["body_composition_scan"],
      supportingSources: ["validated_progress_photos"],
      uncertaintyWithoutPrecision: "fat_loss_estimated_from_weight_trend_and_energy_balance",
      guardrailDirections: { body_fat_percentage: { upper: "coaching", lower: "unsafe" }, lean_mass: { lower: "unsafe" } },
    },
    maintenance: {
      matches: ["maintenance", "maintain", "recomposition_hold"],
      required: [
        { domain: "body_weight", minDaysPerWeek: 3 },
        { anyOf: [{ domain: "nutrition_intake", minDaysPerWeek: 4 }, { domain: "daily_evidence", minDaysPerWeek: 4 }] },
      ],
      precisionSources: ["body_composition_scan"],
      supportingSources: ["validated_progress_photos"],
      uncertaintyWithoutPrecision: "composition_estimated_from_weight_stability",
      guardrailDirections: { body_fat_percentage: { upper: "unsafe", lower: "unsafe" }, body_weight: { upper: "unsafe", lower: "unsafe" } },
    },
    strength: {
      matches: ["strength", "performance", "powerlifting"],
      required: [{ domain: "training_performance", minDaysPerWeek: 2, comparable: true }],
      precisionSources: [],
      supportingSources: ["body_weight"],
      uncertaintyWithoutPrecision: "strength_measured_by_comparable_sessions",
      guardrailDirections: {},
    },
  },

  // Photos never yield an exact body-fat value; they support direction only,
  // and only once their reliability has been proven for this user.
  photos: { inferExactBodyFat: false, countAsEvidenceOnlyWhenValidated: true },

  healthKit: {
    // Domains whose canonical HealthKit days arrive automatically. A missing day
    // here means "no data synced", never a reason to prompt manual entry.
    canonicalDomainsNeverPromptManually: ["nutrition_intake", "activity_energy", "steps", "workouts", "sleep"],
  },

  adherence: {
    // Plan adherence is measured only on days with data; missing days are
    // "data missing", never counted as nonadherence.
    nutritionTolerance: { fraction: 0.10, minimumKcal: 150 },
    activityTolerance: { fraction: 0.15, minimumKcal: 100 },
    adequateShareOfMeasuredDays: 0.70,
    minimumMeasuredDaysPerWeek: 4,
    // Adherence is not judged on less than this many measured days in the window.
    minimumMeasuredDaysForJudgement: 10,
    consistentNonadherenceWeeks: 2,
  },

  sustainability: {
    // Consistent nonadherence in the direction that drives an unsafe guardrail
    // (or a stalled/regressing outcome) is evidence the strategy itself may be
    // unsustainable, which justifies a review rather than blocking eligibility.
    reviewWhen: ["consistent_nonadherence_with_unsafe_guardrail_pressure", "consistent_nonadherence_with_stalled_or_regressing_outcome"],
  },

  belowRange: {
    // During a build, body fat below the preferred range is coached first.
    persistenceWeeklyEvaluations: 3,
    orConfirmedByNextBodyCompositionEvidence: true,
  },

  safetyExceptions: {
    guardrailBreachedUnsafeDirection: true,
    rapidWeightChangePercentPerWeek: 1.5,
    reportedHealthConcern: true,
  },

  schedule: {
    // Measured pace stays evidence-only; elapsed time only reduces the runway.
    atRiskRatio: 1,
    // A pace measured over a shorter span is treated as not yet established
    // (for example a short plateau that may be water or scale noise).
    minimumEvidenceSpanDays: 14,
    deadlinePassed: "deadline_passed",
  },

  triggers: {
    weekly_briefing: "originate",
    monthly_briefing: "originate",
    dexa_event_briefing: "originate_optional",
    photo_event_briefing: "originate_if_reliable_and_corroborated",
    midweek_briefing: "link_only",
  },

  outcome: {
    // A stalled or regressing outcome becomes a strategy review only once it
    // has persisted this long with adequate coverage and adherence.
    sustainedTrendDays: 21,
  },

  deferral: {
    // After "keep my current plan" or "remind me", a recommendation resurfaces
    // only when the evidence fingerprint changes materially.
    resurfaceOnlyOnMaterialChange: true,
  },

  materiality: {
    supersedeOnEvidenceFingerprintChange: true,
    calorieDisplayMinimumChangeKcal: 100,
  },

  // Phase B (PROVISIONAL numbers, Founder review required). Energy values are in
  // the user's own logged-calorie units: calibration compares what the user
  // logs with what their body did, so a consistent logging bias cancels out.
  phaseB: {
    status: "provisional_requires_founder_review",
    energyDensityKcalPerLb: { fat: 4250, lean: 830, mixedWeightGain: 2500, mixedWeightLoss: 3300 },
    measurementError: { scanFatLb: 1.0, scanLeanLb: 1.5, intakeLoggingFraction: 0.1 },
    calibration: {
      minimumPeriodDays: 21,
      minimumIntakeCoverage: 0.7,
      recencyHalfLifeDays: 56,
      maximumPeriods: 4,
      confidence: { moderateMaxSpreadKcal: 350, highMaxSpreadKcal: 175, minimumPeriodsForModerate: 2 },
    },
    rates: {
      leaningPercentBodyWeightPerWeek: [0.4, 0.7],
      leaningFatShareOfLoss: [0.8, 0.95],
      slowBuildLeanLbPerMonth: [0.5, 1.0],
      slowBuildSurplusKcal: [150, 250],
      maintenanceTighteningKcal: [200, 300],
      cutSlowdownKcal: [150, 250],
      stallSurplusIncreaseKcal: [100, 200],
      belowRangeIntakeIncreaseKcal: [100, 200],
    },
    guardrailTargetPositionInRange: 0.75,
    limits: { maximumDeficitFractionOfMaintenance: 0.25, maximumSurplusKcal: 500, roundingKcal: 25 },
    recommendation: { requireCalibrationConfidenceForEnergyNumbers: "moderate", recommendTopOnlyWhenEvidenceSufficient: true },
    revalidation: { maximumAgeDays: 14, calibrationShiftKcal: 100 },
  },

  coaching: {
    // Evidence/adherence coaching only ever lands in approved briefing fields.
    placement: {
      weekly_briefing: ["coachTake.whatToDo", "coachTake.intoNextWeek"],
      monthly_briefing: ["monthAhead"],
    },
  },
});

export function resolveGoalArchetype(goal, policy = GOAL_ADAPTATION_POLICY_V1) {
  const candidates = [goal?.type, goal?.archetype, goal?.primaryObjective?.type, goal?.target?.metric === "lean_mass" ? "lean_mass_gain" : null]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());
  for (const [archetype, definition] of Object.entries(policy.archetypes)) {
    if (candidates.some((value) => value === archetype || definition.matches.includes(value))) return archetype;
  }
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
