import { createInterpretationV2Fixture } from "./interpretationV2Fixtures";

export const SYNTHETIC_DEXA_PREVIEW_ID = "synthetic-dexa-2026-08-15";

export function createSyntheticDexaV2PreviewFixture() {
  const input = createInterpretationV2Fixture();
  const goal = input.goalContract;
  goal.contractVersion = "goal_contract_v2_synthetic_dexa_v1";
  goal.contractId = "goal_contract|build_lean_mass|synthetic_2026_08_15";
  goal.goal = {
    goalId: "goal_build_lean_mass",
    goalVersion: "2026-07-18T23:00:00.000Z",
    category: "body_composition",
    semanticPurpose: "increase_lean_mass_while_controlling_body_fat",
  };
  goal.timeline = {
    startDate: "2026-07-18", targetCompletionDate: "2026-11-07",
    currentPhase: { phaseId: "phase_maintenance_calibration", semanticPurpose: "establish_maintenance_before_controlled_surplus" },
  };
  goal.objectives[0].completionThreshold = { operator: "gte", value: 8 };
  goal.objectives[0].contradictionThreshold = { operator: "lte", value: -0.5 };
  goal.objectives[0].trajectoryRef = "trajectory_first_dexa_response";
  goal.guardrails[0] = {
    ...goal.guardrails[0],
    warningThreshold: { operator: "gt", value: 9 },
    pressureThreshold: { operator: "gt", value: 10 },
    violationThreshold: { operator: "gt", value: 11 },
  };
  goal.guardrails.push({
    guardrailId: "guardrail_fat_gain_pace",
    monitoredMetricOrCapability: "fat_mass_change_lb",
    warningThreshold: { operator: "gt", value: 1.25 },
    pressureThreshold: { operator: "gt", value: 2 },
    violationThreshold: { operator: "gt", value: 3 },
    required: true,
  });
  goal.expectedTrajectory = { segments: [{
    segmentId: "trajectory_first_dexa_response",
    startBoundary: "2026-07-18",
    endBoundary: "2026-08-15",
    measurableChangeExpectation: "expected",
    expectedObjectiveRanges: [{
      expectationId: "expectation_first_lean_mass_response",
      objectiveRef: "objective_lean_mass_response",
      min: 0.5,
      max: 1.8,
      unit: "lb",
    }],
  }] };
  goal.strategyHypothesis = {
    hypothesisId: "hypothesis_controlled_lean_mass_build",
    strategyRef: {
      strategyId: "strategy_controlled_surplus_progressive_training",
      strategyVersion: "2026-07-18T23:00:00.000Z",
    },
    statement: "progressive_training_controlled_energy_and_recovery_support_lean_mass_within_guardrail",
    expectedResponses: [
      { responseId: "response_training_progression" },
      { responseId: "response_controlled_energy" },
      { responseId: "response_recovery_capacity" },
      { responseId: "response_lean_mass_adaptation" },
      { responseId: "response_sustained_adaptation" },
    ],
  };
  goal.milestones = [{
    milestoneId: "milestone_first_objective_comparison",
    timing: { expectedDateOrWindow: "2026-08-15" },
    purpose: "test_first_lean_mass_response_and_body_fat_guardrail",
    objectiveRefs: ["objective_lean_mass_response"],
    guardrailRefs: ["guardrail_body_fat", "guardrail_fat_gain_pace"],
    hypothesisRefs: ["hypothesis_controlled_lean_mass_build"],
    uncertaintyExpectedToReduce: ["comparison_missing", "attribution"],
    decisionBoundary: "first_objective_comparison",
    required: true,
  }, {
    milestoneId: "milestone_sustained_adaptation",
    timing: { expectedDateOrWindow: { start: "2026-09-12", end: "2026-09-19" } },
    purpose: "test_whether_the_early_response_is_sustained",
    objectiveRefs: ["objective_lean_mass_response"],
    guardrailRefs: ["guardrail_body_fat", "guardrail_fat_gain_pace"],
    hypothesisRefs: ["response_sustained_adaptation"],
    uncertaintyExpectedToReduce: ["attribution"],
    decisionBoundary: "sustained_adaptation_check",
    required: true,
  }];
  goal.relevantEvidence.entries = [
    mapping("map_dexa_objective", "dexa_body_composition", "primary", {
      objectiveRefs: ["objective_lean_mass_response"], guardrailRefs: [],
      hypothesisRefs: ["response_lean_mass_adaptation"],
      milestoneRefs: ["milestone_first_objective_comparison"],
    }, "dexa_scan", "2026-08-15T07:30:00-07:00"),
    mapping("map_dexa_guardrail", "dexa_body_composition", "primary", {
      objectiveRefs: [], guardrailRefs: ["guardrail_body_fat"], hypothesisRefs: [],
      milestoneRefs: ["milestone_first_objective_comparison"],
    }, "dexa_scan", "2026-08-15T07:30:00-07:00"),
    mapping("map_dexa_fat_gain_pace", "dexa_body_composition", "primary", {
      objectiveRefs: [], guardrailRefs: ["guardrail_fat_gain_pace"], hypothesisRefs: [],
      milestoneRefs: ["milestone_first_objective_comparison"],
    }, "dexa_scan", { start: "2026-09-12", end: "2026-09-19" }),
    mapping("map_photos_guardrail", "progress_photos", "primary", {
      objectiveRefs: [], guardrailRefs: ["guardrail_body_fat", "guardrail_fat_gain_pace"], hypothesisRefs: [], milestoneRefs: [],
    }, "photo_comparison", "2026-08-15"),
    mapping("map_training_progression", "training_progression", "supporting", {
      objectiveRefs: ["objective_lean_mass_response"], guardrailRefs: [],
      hypothesisRefs: ["response_training_progression"], milestoneRefs: [],
    }, "training_summary", "2026-07-19/2026-08-15"),
    mapping("map_energy_availability", "energy_availability", "supporting", {
      objectiveRefs: ["objective_lean_mass_response"], guardrailRefs: [],
      hypothesisRefs: ["response_controlled_energy"], milestoneRefs: [],
    }, "energy_summary", "2026-07-19/2026-08-15"),
    mapping("map_weight_trend", "body_weight_trend", "supporting", {
      objectiveRefs: ["objective_lean_mass_response"], guardrailRefs: ["guardrail_body_fat", "guardrail_fat_gain_pace"],
      hypothesisRefs: ["response_controlled_energy"], milestoneRefs: [],
    }, "weight_summary", "2026-07-19/2026-08-15"),
    mapping("map_recovery_capacity", "recovery_capacity", "supporting", {
      objectiveRefs: [], guardrailRefs: [], hypothesisRefs: ["response_recovery_capacity"], milestoneRefs: [],
    }, "recovery_summary", "2026-07-19/2026-08-15"),
    mapping("map_execution_context", "execution_context", "supporting", {
      objectiveRefs: [], guardrailRefs: [],
      hypothesisRefs: ["hypothesis_controlled_lean_mass_build"], milestoneRefs: [],
    }, "execution_summary", "2026-07-19/2026-08-15"),
    mapping("map_next_dexa", "sustained_dexa_comparison", "primary", {
      objectiveRefs: ["objective_lean_mass_response"], guardrailRefs: ["guardrail_body_fat", "guardrail_fat_gain_pace"],
      hypothesisRefs: ["hypothesis_controlled_lean_mass_build", "response_sustained_adaptation"], milestoneRefs: ["milestone_sustained_adaptation"],
    }, "dexa_scan", { start: "2026-09-12", end: "2026-09-19" }),
  ];
  goal.provenance = { inputFingerprint: "sha256_synthetic_dexa_goal_contract_2026_08_15" };

  input.strategyHypothesis = structuredClone(goal.strategyHypothesis);
  input.executionState = {
    adequacy: "adequate", elapsedTimeAdequacy: "adequate",
    refs: ["execution_summary|2026-07-19|2026-08-15"],
  };
  input.evidenceDescriptors = [
    evidence("evidence_dexa_aug_15", "dexa_body_composition", "authoritative", [{ metric: "lean_mass_change_lb", value: 2.5, unit: "lb" }, { metric: "fat_mass_change_lb", value: 1.5, unit: "lb" }, { metric: "body_fat_pct", value: syntheticBodyFat(), unit: "percent" }], "dexa_aug_15", ["single_follow_up_comparison", "dexa_repeatability_and_preparation", "lean_tissue_is_not_pure_contractile_muscle", "hydration_glycogen_food_mass_may_contribute", "sustainability_of_current_pace_unknown"]),
    evidence("evidence_photos_aug_15", "progress_photos", "high", [], "photos_aug_15", ["mild_softness_requires_continued_monitoring", "visual_comparison_not_precise_body_fat_measurement"]),
    evidence("evidence_training_aug_15", "training_progression", "high", [], "training_log_aug_15"),
    evidence("evidence_energy_aug_15", "energy_availability", "high", [], "energy_log_aug_15", ["controlled_surplus_estimate_is_imprecise"]),
    evidence("evidence_weight_aug_15", "body_weight_trend", "high", [], "weight_log_aug_15"),
    evidence("evidence_recovery_aug_15", "recovery_capacity", "high", [], "recovery_log_aug_15"),
    evidence("evidence_execution_aug_15", "execution_context", "high", [], "execution_log_aug_15"),
  ];
  input.evaluationContext = {
    type: "synthetic_dexa_preview_validation",
    windowStart: "2026-07-18T23:00:00.000Z",
    evidenceCutoff: "2026-08-15T14:30:00.000Z",
    interpretedAt: "2026-08-15T15:00:00.000Z",
    priorInterpretationId: null,
    trajectorySegmentId: "trajectory_first_dexa_response",
    elapsedTimeAdequacy: "adequate",
  };
  input.compatibility = { missingMetadata: [] };

  return Object.freeze({
    id: SYNTHETIC_DEXA_PREVIEW_ID,
    scenario: scenarioValues(),
    interpretationInput: input,
    previousForecastContext: {
      contextVersion: "previous_forecast_context_v2_synthetic_preview_v1",
      sourceType: "deterministic_synthetic_preview_context",
      priorForecastRef: "synthetic_starting_forecast|2026-07-18",
      goalId: goal.goal.goalId,
      strategyRevision: goal.strategyHypothesis.strategyRef.strategyVersion,
      assessedAt: "2026-07-18T23:00:00.000Z",
      goalForecastStatus: "forecast_uncertain",
      confidenceBand: "developing",
      forecastDirection: "indeterminate",
      movementDirection: "no_meaningful_change",
      interpretationSemanticFingerprint: "sha256_synthetic_starting_forecast_semantics",
      compatibility: {
        adapterVersion: "synthetic_preview_prior_context_v1",
        missingSemantics: ["published_canonical_starting_forecast", "observed_lean_mass_gain_rate_under_current_strategy"],
        inferredSemantics: ["historical_execution_strong", "prior_cut_lean_mass_retention_supported"],
        ignoredLegacyFields: ["numeric_confidence_score"],
        sourceFingerprint: "sha256_synthetic_starting_forecast_2026_07_18",
      },
    },
  });
}

function mapping(evidenceMapId, evidenceCapability, role, appliesTo, expectedEventType, window) {
  return { evidenceMapId, evidenceCapability, role, appliesTo, expectedEventType,
    expectedCadenceOrWindow: { eventType: expectedEventType, window } };
}

function evidence(id, capability, strength, measurements, independenceGroup, limitations = []) {
  return { id, capability, observedAt: "2026-08-15T14:30:00.000Z", strength,
    agreement: "supports", temporalApplicability: "applicable", independenceGroup,
    quality: { status: "complete", provenanceIntegrity: "high", temporalAdequacy: "adequate", comparisonAdequacy: "adequate", limitations },
    measurements: measurements.map((item) => ({ ...item, observedAt: "2026-08-15T14:30:00.000Z" })),
    sourceObservationIds: [`observation|${id}`], sourceClaimIds: [`claim|${id}`] };
}

function scenarioValues() {
  return {
    baseline: { scanDate: "2026-07-18", measuredAt: "2026-07-18T07:30:00-07:00", weight: 167.4, bodyFat: 7.7, leanMass: 147.5, fatMass: 12.8, boneMass: 7.1, rmr: 1794 },
    current: { scanDate: "2026-08-15", measuredAt: "2026-08-15T07:30:00-07:00", weight: 171.4, bodyFat: syntheticBodyFat(), leanMass: 150.0, fatMass: 14.3, boneMass: 7.1, rmr: 1818 },
    supportingContext: { training: "Five of seven comparable priority movements progressed, supporting an improving training stimulus without implying that every exercise advanced.", energy: "Estimated intake moved into a small controlled surplus of about 180 kcal/day; that estimate is useful but not perfectly precise.", weight: "The 28-day trend rose about 3.8 lb and reached a 4.0 lb endpoint increase deliberately rather than accidentally.", photos: "Matched photos look fuller with mild additional softness, but do not show clear pressure on the accepted body-fat range.", recovery: "Recovery remained adequate for the planned training progression.", execution: "Execution remained strong; it establishes that the strategy was followed but is not physiological proof." },
  };
}

export function syntheticBodyFat() {
  return 14.3 / 171.4 * 100;
}
