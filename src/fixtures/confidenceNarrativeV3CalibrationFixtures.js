import { createEvidenceObservationV3 } from "../domain/intelligence/v3/EvidenceObservationV3.js";
import { createGoalContractV3 } from "../domain/intelligence/v3/GoalContractV3.js";

const GOAL_ID = "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";
const CALIBRATION_STRATEGY = "strategy_revision|establish_maintenance|2026-07-19";
const BUILD_STRATEGY = "phase_strategy|ba790d5efced3109354c8f54|v1";
const OBJECTIVE_ID = "objective_lean_mass_gain";

export const REAL_DEXA_ARTIFACT_ID = "dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12";
export const REAL_WEEKLY_ARTIFACT_ID = "weekly_briefing_2026-09-06_2026-09-12";
export const AUGUST_DEXA_REGRESSION_ARTIFACT_ID = "dexa_event_dexa_submission_20260815181333895_review_pdf_1_2026_08_15";
export const AUGUST_WEEKLY_REGRESSION_ARTIFACT_ID = "weekly_briefing_2026-08-16_2026-08-22";

export function createPairedCalibrationFixtures() {
  const goalContract = (contractVersion) => createGoalContractV3(baseContract({
    contractVersion,
    phase: {
      phaseId: "goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78",
      label: "Lean Mass Build",
      startedAt: "2026-08-15",
      nextPhaseLabel: null,
      transitionCriteria: [],
    },
    strategy: {
      strategyRevisionId: BUILD_STRATEGY,
      label: "the accepted lean-mass build strategy",
      adequateExposure: { minimumDays: 21 },
      feasibilityCriteria: [{
        source: "objective",
        subjectId: OBJECTIVE_ID,
        acceptedStates: ["progressed"],
        minimumAuthority: "decisive",
        minimumSignificance: "meaningful",
      }],
    },
    strategicQuestions: [buildFeasibilityQuestion()],
    phaseVocabulary: { displayName: "Lean Mass Build", contextName: "this build" },
    evidenceRequests: [{
      questionId: "question_build_strategy_persistence",
      strategyRevisionId: BUILD_STRATEGY,
      evidencePurpose: "confirm_persistence",
      timing: { cadenceDays: 28 },
      alternatives: [{ capabilityIds: ["body_composition.lean_mass", "body_composition.body_fat_percentage"], vocabularyKey: "composition_comparison" }],
    }],
    evidencePolicies: weeklyEvidencePolicies(),
    strategyVocabulary: buildStrategyVocabulary(),
  }));

  return {
    dexa: {
      fixtureId: "real_founder_dexa_2026_09_12_v3_calibration_v1",
      sourceArtifactId: REAL_DEXA_ARTIFACT_ID,
      goalContract: goalContract("founder_calibration_2026_09_12_v1"),
      observations: septemberDexaObservations(),
      priorCoachingState: {
        id: "coaching_state_seed|before_2026_09_12_dexa",
        schemaVersion: "coaching_state_v3",
        questions: [openQuestion(buildFeasibilityQuestion(), "2026-08-16T07:10:44.450Z")],
      },
      priorConfidence: {
        id: "canonical_confidence_before_2026_09_12_dexa",
        currentPercentage: 62,
        source: "canonical_v2_calibration_seed",
      },
      evaluationContext: {
        type: "event_evidence_boundary",
        evidenceWindow: { startDate: "2026-08-15", endDate: "2026-09-12" },
        evidenceCutoff: "2026-09-13T06:28:58.012Z",
        evaluatedAt: "2026-09-13T06:28:58.012Z",
      },
      surface: "event_briefing",
    },
    weekly: {
      fixtureId: "real_founder_weekly_2026_09_06_2026_09_12_v3_calibration_v1",
      sourceArtifactId: REAL_WEEKLY_ARTIFACT_ID,
      goalContract: goalContract("founder_calibration_2026_09_13_weekly_v1"),
      observations: septemberWeeklyObservations(),
      evaluationContext: {
        type: "closed_cadence_boundary",
        evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
        evidenceCutoff: "2026-09-13T07:02:58.048Z",
        evaluatedAt: "2026-09-13T07:02:58.048Z",
      },
      surface: "weekly_briefing",
    },
  };
}

export function createAugustPhaseTransitionRegressionFixtures() {
  const dexaGoalContract = createGoalContractV3(baseContract({
    contractVersion: "founder_calibration_2026_08_15_v1",
    phase: {
      phaseId: "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08",
      label: "Establish Maintenance",
      startedAt: "2026-07-19",
      nextPhaseLabel: "Lean Mass Build",
      transitionCriteria: [
        predicate("strategy.feasibility", "in", { values: ["demonstrated"] }),
        predicate("guardrail.aggregateStatus", "not_in", { values: ["pressured", "breached"] }),
      ],
    },
    strategy: {
      strategyRevisionId: CALIBRATION_STRATEGY,
      label: "the maintenance-calibration strategy",
      adequateExposure: { minimumDays: 21 },
      feasibilityCriteria: [{
        source: "objective",
        subjectId: OBJECTIVE_ID,
        acceptedStates: ["progressed"],
        minimumAuthority: "decisive",
        minimumSignificance: "meaningful",
      }],
    },
    strategicQuestions: [calibrationQuestion()],
    evidencePolicies: dexaEvidencePolicies(),
    strategyVocabulary: maintenanceCalibrationVocabulary(),
  }));

  const weeklyGoalContract = createGoalContractV3(baseContract({
    contractVersion: "founder_calibration_2026_08_22_v1",
    phase: {
      phaseId: "goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78",
      label: "Lean Mass Build",
      startedAt: "2026-08-15",
      nextPhaseLabel: null,
      transitionCriteria: [],
    },
    strategy: {
      strategyRevisionId: BUILD_STRATEGY,
      label: "the newly authorized lean-mass build strategy",
      adequateExposure: { minimumDays: 21 },
      feasibilityCriteria: [{
        source: "objective",
        subjectId: OBJECTIVE_ID,
        acceptedStates: ["progressed"],
        minimumAuthority: "decisive",
        minimumSignificance: "meaningful",
      }],
    },
    strategicQuestions: [buildFeasibilityQuestion()],
    evidencePolicies: weeklyEvidencePolicies(),
    strategyVocabulary: buildStrategyVocabulary(),
  }));

  return {
    dexa: {
      fixtureId: "real_founder_dexa_2026_08_15_v3_calibration_v1",
      sourceArtifactId: AUGUST_DEXA_REGRESSION_ARTIFACT_ID,
      goalContract: dexaGoalContract,
      observations: dexaObservations(),
      priorCoachingState: {
        id: "coaching_state_seed|before_2026_08_15_dexa",
        schemaVersion: "coaching_state_v3",
        questions: [{
          questionId: "question_establish_maintenance_readiness",
          kind: "phase_readiness",
          text: "Has the calibration phase produced enough objective evidence to support the planned transition?",
          strategyRevisionId: CALIBRATION_STRATEGY,
          evidencePurpose: "establish_phase_readiness",
          status: "open",
          raisedAt: "2026-07-19T07:00:00.000Z",
          answeredAt: null,
          answerCode: null,
          answeredByEvidenceIds: [],
        }],
      },
      priorConfidence: {
        id: "confidence_assessment_v2|d066539fc38c0b73cbce95278bc95ecd2b23307094ee263b41251aea5b861242",
        currentPercentage: 59,
        source: "canonical_v2_calibration_seed",
      },
      evaluationContext: {
        type: "event_evidence_boundary",
        evidenceWindow: { startDate: "2026-07-19", endDate: "2026-08-15" },
        evidenceCutoff: "2026-08-15T23:59:59.999Z",
        evaluatedAt: "2026-08-15T19:02:58.026Z",
      },
      surface: "event_briefing",
    },
    weekly: {
      fixtureId: "real_founder_weekly_2026_08_16_2026_08_22_v3_calibration_v1",
      sourceArtifactId: AUGUST_WEEKLY_REGRESSION_ARTIFACT_ID,
      goalContract: weeklyGoalContract,
      observations: weeklyObservations(),
      evaluationContext: {
        type: "closed_cadence_boundary",
        evidenceWindow: { startDate: "2026-08-16", endDate: "2026-08-22" },
        evidenceCutoff: "2026-08-22T23:59:59.999Z",
        evaluatedAt: "2026-08-23T07:00:02.738Z",
      },
      surface: "weekly_briefing",
    },
  };
}

function baseContract(overrides) {
  return {
    goalId: GOAL_ID,
    goalLabel: "Build 10 lb of lean mass by October 31, 2026",
    contractVersion: overrides.contractVersion,
    phase: overrides.phase,
    strategy: {
      ...overrides.strategy,
      coachingActions: [{ actionId: "continue_consistent_execution", text: "Keep executing consistently", recommendationActions: ["continue_current_strategy"] }],
    },
    objectives: [{
      objectiveId: OBJECTIVE_ID,
      priority: "primary",
      importance: 1,
      metricCapability: capability("body_composition", "lean_mass", "Lean tissue", "lb"),
      evaluation: {
        mode: "increase",
        baselineValue: 147.5,
        desiredDirection: "increase",
        meaningfulChangeThreshold: 0.5,
        significanceBands: [
          { significance: "major", minimumAbsoluteChange: 3 },
          { significance: "meaningful", minimumAbsoluteChange: 0.5 },
          { significance: "minor", minimumAbsoluteChange: 0.1 },
        ],
        successCriteria: [predicate("goalChange", "gte", { value: 10 })],
      },
      vocabularyKey: "lean_tissue",
      forecast: {
        version: "goal_outlook_v1",
        kind: "scalar_target",
        baselineValue: 147.5,
        targetValue: 157.5,
        direction: "increase",
        startedAt: "2026-07-18",
        deadlineAt: "2026-10-31",
      },
    }],
    objectiveDecisionPolicy: { mode: "all_required" },
    guardrails: [
      {
        guardrailId: "guardrail_body_fat_range",
        metricCapability: capability("body_composition", "body_fat_percentage", "Body fat", "%", "percentage"),
        evaluation: { mode: "allowed_range", allowedRange: { min: 8, max: 9, approximate: true } },
        severityBands: [
          { status: "breached", minimumDeviation: 1.5 },
          { status: "pressured", minimumDeviation: 0.5 },
          { status: "watch", minimumDeviation: 0 },
        ],
        consequencePolicy: { confidenceImpact: -1, recommendationConstraint: "monitor", celebrationCeiling: "measured", escalationLevel: "attention" },
      },
      {
        guardrailId: "guardrail_gradual_weight_gain",
        metricCapability: capability("body_mass", "weekly_change_rate", "Weight-gain pace", "lb/week"),
        evaluation: { mode: "maximum", threshold: 0.5 },
        severityBands: [
          { status: "breached", minimumDeviation: 0.5 },
          { status: "pressured", minimumDeviation: 0.25 },
          { status: "watch", minimumDeviation: 0 },
        ],
        consequencePolicy: { confidenceImpact: -1, recommendationConstraint: "monitor", celebrationCeiling: "measured" },
      },
      {
        guardrailId: "guardrail_strength_regression",
        metricCapability: capability("performance", "training_support_index", "Training performance", "index"),
        evaluation: { mode: "minimum", threshold: 0 },
        severityBands: [
          { status: "breached", minimumDeviation: 1 },
          { status: "watch", minimumDeviation: 0 },
        ],
        consequencePolicy: { confidenceImpact: -2, recommendationConstraint: "review", celebrationCeiling: "restrained" },
      },
      {
        guardrailId: "guardrail_recovery_quality",
        metricCapability: capability("recovery", "capacity_index", "Recovery capacity", "index"),
        evaluation: { mode: "minimum", threshold: 0 },
        severityBands: [{ status: "watch", minimumDeviation: 0 }],
        consequencePolicy: { confidenceImpact: -1, recommendationConstraint: "monitor", celebrationCeiling: "measured" },
      },
    ],
    strategicQuestions: overrides.strategicQuestions,
    evidencePolicies: overrides.evidencePolicies,
    evidenceRequests: overrides.evidenceRequests ?? [],
    vocabulary: {
      objective: {
        displayName: "lean tissue",
        unit: "lb",
        decimals: 1,
        subject: "you",
        progressVerb: "added",
        ongoingPhrase: "this kind of progress",
      },
      goal: { displayName: "the 10 lb lean-mass goal" },
      phase: overrides.phaseVocabulary ?? { displayName: overrides.phase.label },
      evidence: { eventName: "DEXA", executionName: "Training", requests: { composition_comparison: { displayName: "DEXA", grammaticalNumber: "singular" } } },
      strategy: overrides.strategyVocabulary,
      guardrails: {
        guardrail_body_fat_range: { displayName: "body fat", decimals: 1, clearDescription: "controlled" },
        guardrail_gradual_weight_gain: { displayName: "weight-gain pace", decimals: 2 },
        guardrail_strength_regression: { displayName: "training performance", decimals: 0, riskPhrases: { minimum: "materially declining" } },
        guardrail_recovery_quality: { displayName: "recovery", decimals: 0 },
      },
    },
  };
}

function buildStrategyVocabulary() {
  return {
    displayName: "the build plan",
    continueAction: "Keep executing consistently",
    executeAction: "Keep executing",
    reconsiderationTrigger: "if something meaningful changes",
  };
}

function maintenanceCalibrationVocabulary() {
  return {
    displayName: "the maintenance-calibration plan",
    continueAction: "Keep the current inputs steady",
    executeAction: "Keep executing",
    reconsiderationTrigger: "if something meaningful changes",
  };
}

function calibrationQuestion() {
  return {
    questionId: "question_establish_maintenance_readiness",
    kind: "phase_readiness",
    text: "Has the calibration phase produced enough objective evidence to support the planned transition?",
    strategyRevisionId: CALIBRATION_STRATEGY,
    evidencePurpose: "establish_phase_readiness",
    answerWhen: predicate("strategy.feasibility", "in", { values: ["demonstrated"] }),
    answerCode: "calibration_response_demonstrated",
    nextQuestionOnAnswer: buildFeasibilityQuestion(),
  };
}

function buildFeasibilityQuestion() {
  return {
    questionId: "question_build_strategy_feasibility",
    kind: "feasibility",
    text: "Does the newly authorized build strategy produce meaningful progress after adequate exposure?",
    strategyRevisionId: BUILD_STRATEGY,
    evidencePurpose: "establish_feasibility",
    answerWhen: predicate("strategy.feasibility", "in", { values: ["demonstrated"] }),
    answerCode: "build_strategy_feasibility_demonstrated",
    nextQuestionOnAnswer: {
      questionId: "question_build_strategy_persistence",
      kind: "persistence",
      text: "Does the demonstrated response persist across another qualifying evidence period?",
      strategyRevisionId: BUILD_STRATEGY,
      evidencePurpose: "confirm_persistence",
      answerWhen: predicate("strategy.persistence", "in", { values: ["repeated", "sustained"] }),
      answerCode: "build_strategy_persistence_confirmed",
    },
  };
}

function dexaEvidencePolicies() {
  return [
    policy("dexa_lean_objective", "objective", OBJECTIVE_ID, "body_composition.lean_mass", "decisive", "robust", ["objective", "feasibility"]),
    policy("dexa_body_fat_guardrail", "guardrail", "guardrail_body_fat_range", "body_composition.body_fat_percentage", "decisive", "robust", ["guardrail"]),
    policy("dexa_weight_rate_guardrail", "guardrail", "guardrail_gradual_weight_gain", "body_mass.weekly_change_rate", "material", "robust", ["guardrail"]),
    policy("training_strength_guardrail", "guardrail", "guardrail_strength_regression", "performance.training_support_index", "material", "adequate", ["guardrail"]),
    policy("training_strategy_support", "strategy", CALIBRATION_STRATEGY, "performance.training_support_index", "material", "adequate", ["feasibility", "attribution"], supportiveSignal()),
  ];
}

function weeklyEvidencePolicies() {
  return [
    policy("objective_direct", "objective", OBJECTIVE_ID, "body_composition.lean_mass", "decisive", "robust", ["objective", "feasibility"]),
    policy("body_fat_guardrail", "guardrail", "guardrail_body_fat_range", "body_composition.body_fat_percentage", "decisive", "robust", ["guardrail"]),
    policy("weight_rate_guardrail", "guardrail", "guardrail_gradual_weight_gain", "body_mass.weekly_change_rate", "material", "adequate", ["guardrail"]),
    policy("training_strength_guardrail", "guardrail", "guardrail_strength_regression", "performance.training_support_index", "material", "adequate", ["guardrail"]),
    policy("training_strategy_support", "strategy", BUILD_STRATEGY, "performance.training_support_index", "supporting", "adequate", ["feasibility", "attribution", "execution"], supportiveSignal()),
    policy("energy_attribution_context", "attribution", BUILD_STRATEGY, "data.energy_coverage_ratio", "contextual", "limited", ["attribution"]),
  ];
}

function septemberDexaObservations() {
  return [
    createEvidenceObservationV3({
      observationId: "evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
      sourceType: "composition_scan",
      displayLabel: "September 12 BodySpec comparison",
      observedAt: "2026-09-12T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-08-15", endDate: "2026-09-12" },
      directness: "direct",
      quality: { status: "robust", provenance: "verified_provider_report", precision: "reported", completeness: "complete", comparability: "same_provider_comparison", coverageRatio: 1 },
      exposureDays: 28,
      capabilities: [
        {
          capabilityId: "body_composition.lean_mass",
          value: 153.3,
          comparisonValue: 148.3,
          comparisonAt: "2026-08-15",
          unit: "lb",
          factualSummary: "The September 12 comparison measured 153.3 lb of lean tissue, up 5.0 lb from August 15",
        },
        {
          capabilityId: "body_composition.body_fat_percentage",
          value: 8.1,
          comparisonValue: 7.6,
          unit: "%",
          factualSummary: "Body fat measured 8.1%, compared with 7.6% on August 15.",
        },
        {
          capabilityId: "body_composition.fat_mass",
          value: 14.2,
          comparisonValue: 12.8,
          unit: "lb",
          factualSummary: "Fat mass measured 14.2 lb, up 1.4 lb from August 15.",
        },
        {
          capabilityId: "body_mass.level",
          value: 174.7,
          comparisonValue: 168.3,
          unit: "lb",
          factualSummary: "DEXA total mass measured 174.7 lb, up 6.4 lb from August 15.",
        },
        {
          capabilityId: "metabolism.resting_metabolic_rate",
          value: 1847,
          comparisonValue: 1803,
          unit: "kcal/day",
          factualSummary: "Estimated resting metabolic rate measured 1,847 kcal/day, up 44 kcal/day from August 15.",
        },
      ],
      limitations: ["lean_tissue_is_not_identical_to_contractile_muscle", "hydration_glycogen_and_preparation_can_affect_lean_tissue"],
      sourceReferences: [
        "evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
        "dexa_submission_20260815181333895_review_pdf_1_2026_08_15",
        "media:01a09886-24a6-752f-8ce1-85be9a92953a",
      ],
    }),
    createEvidenceObservationV3({
      observationId: "build_interval_training_support_2026_08_15_2026_09_12",
      sourceType: "training_summary",
      displayLabel: "Lean Mass Build training response",
      observedAt: "2026-09-12T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-08-15", endDate: "2026-09-12" },
      directness: "proxy",
      quality: { status: "adequate", provenance: "canonical_dexa_event_supporting_context", completeness: "build_interval", comparability: "multi_session" },
      exposureDays: 28,
      capabilities: [{
        capabilityId: "performance.training_support_index",
        value: 1,
        comparisonValue: 0,
        unit: "index",
        factualSummary: "Training remained productive during the August 15 to September 12 build interval.",
      }],
      sourceReferences: [REAL_DEXA_ARTIFACT_ID],
    }),
  ];
}

function septemberWeeklyObservations() {
  return [
    createEvidenceObservationV3({
      observationId: "weekly_training_summary_2026_09_06_2026_09_12",
      sourceType: "training_summary",
      displayLabel: "Weekly training progression",
      observedAt: "2026-09-12T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
      directness: "proxy",
      quality: { status: "adequate", provenance: "canonical_weekly_training_assessment", completeness: "nine_reviewed_training_areas", comparability: "multi_session" },
      exposureDays: 7,
      capabilities: [{
        capabilityId: "performance.training_support_index",
        value: 1,
        comparisonValue: 0,
        unit: "index",
        factualSummary: "Seven of nine reviewed training areas improved; triceps was the only plateauing area.",
      }],
      sourceReferences: [REAL_WEEKLY_ARTIFACT_ID],
    }),
    createEvidenceObservationV3({
      observationId: "weekly_energy_coverage_2026_09_06_2026_09_12",
      sourceType: "energy_coverage_summary",
      displayLabel: "Weekly energy coverage",
      observedAt: "2026-09-12T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
      directness: "behavioral",
      quality: { status: "limited", provenance: "canonical_weekly_energy_assessment", completeness: "six_paired_days_one_missing_day", comparability: "partial", coverageRatio: 6 / 7 },
      exposureDays: 6,
      capabilities: [{
        capabilityId: "data.energy_coverage_ratio",
        value: 6 / 7,
        unit: "ratio",
        factualSummary: "Six displayed days had paired energy evidence, averaging 2,686 kcal intake and 2,561 kcal estimated expenditure with a reported +171 kcal/day balance.",
      }],
      limitations: ["one_day_missing_paired_energy_evidence", "expenditure_is_estimated"],
      sourceReferences: [REAL_WEEKLY_ARTIFACT_ID],
    }),
    createEvidenceObservationV3({
      observationId: "weekly_weight_summary_2026_09_06_2026_09_12",
      sourceType: "weight_summary",
      displayLabel: "Weekly weight context",
      observedAt: "2026-09-12T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-09-06", endDate: "2026-09-12" },
      directness: "proxy",
      quality: { status: "adequate", provenance: "canonical_weekly_weight_assessment", completeness: "completed_week_average", comparability: "weekly_context" },
      exposureDays: 7,
      capabilities: [{
        capabilityId: "body_mass.level",
        value: 171.8,
        unit: "lb",
        factualSummary: "Completed-week average scale weight was 171.8 lb, down 0.9 lb from the first to last observation.",
      }],
      sourceReferences: [REAL_WEEKLY_ARTIFACT_ID],
    }),
  ];
}

function dexaObservations() {
  return [
    createEvidenceObservationV3({
      observationId: "dexa_submission_20260815181333895_review_pdf_1_2026_08_15",
      sourceType: "composition_scan",
      displayLabel: "August 15 BodySpec comparison",
      observedAt: "2026-08-15T18:13:33.895Z",
      evidenceWindow: { startDate: "2026-07-18", endDate: "2026-08-15" },
      directness: "direct",
      quality: { status: "robust", provenance: "verified_provider_report", precision: "reported", completeness: "complete", comparability: "same_provider_comparison", coverageRatio: 1 },
      exposureDays: 28,
      capabilities: [
        {
          capabilityId: "body_composition.lean_mass",
          value: 148.3,
          comparisonValue: 147.5,
          comparisonAt: "2026-07-18",
          unit: "lb",
          factualSummary: "The August 15 comparison measured 148.3 lb of lean tissue, up 0.8 lb from July 18",
        },
        {
          capabilityId: "body_composition.body_fat_percentage",
          value: 7.6,
          comparisonValue: 7.7,
          unit: "%",
          factualSummary: "Body fat measured 7.6%, compared with 7.7% on July 18.",
        },
        {
          capabilityId: "body_mass.weekly_change_rate",
          value: 0.225,
          unit: "lb/week",
          factualSummary: "DEXA weight rose 0.9 lb across 28 days, about 0.23 lb per week.",
        },
        {
          capabilityId: "body_composition.fat_mass",
          value: 12.8,
          comparisonValue: 12.8,
          unit: "lb",
          factualSummary: "Fat mass remained 12.8 lb across the comparison.",
        },
      ],
      limitations: ["lean_tissue_is_not_identical_to_contractile_muscle", "hydration_glycogen_and_preparation_can_affect_lean_tissue"],
      sourceReferences: [
        "dexa_submission_20260815181333895_review_pdf_1_2026_08_15",
        "evidence_submission_20260718144114116_pdf_1_2026_07_18",
      ],
    }),
    createEvidenceObservationV3({
      observationId: "calibration_training_summary_2026_07_19_2026_08_15",
      sourceType: "training_summary",
      displayLabel: "Calibration-phase training trend",
      observedAt: "2026-08-15T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-07-19", endDate: "2026-08-15" },
      directness: "proxy",
      quality: { status: "adequate", provenance: "canonical_training_records", completeness: "27_observed_training_days", comparability: "multi_session" },
      exposureDays: 28,
      capabilities: [{
        capabilityId: "performance.training_support_index",
        value: 1,
        comparisonValue: 0,
        unit: "index",
        factualSummary: "Training remained productive across 27 observed training days during the calibration phase.",
      }],
      sourceReferences: ["dexa_event_supporting_evidence|training_days:27"],
    }),
  ];
}

function weeklyObservations() {
  return [
    createEvidenceObservationV3({
      observationId: "weekly_training_summary_2026_08_16_2026_08_22",
      sourceType: "training_summary",
      displayLabel: "Weekly training progression",
      observedAt: "2026-08-22T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-08-16", endDate: "2026-08-22" },
      directness: "proxy",
      quality: { status: "adequate", provenance: "canonical_training_and_performance_events", completeness: "one_observed_training_day", comparability: "nine_comparable_categories" },
      exposureDays: 1,
      capabilities: [{
        capabilityId: "performance.training_support_index",
        value: 1,
        comparisonValue: 0,
        unit: "index",
        factualSummary: "Training improved across nine comparable categories, with five recorded performance events, although only one training day was available in the weekly window.",
      }],
      limitations: ["weekly_window_contains_one_training_day"],
      sourceReferences: [
        "TrainingSession_2026-08-16_TraditionalStrengthTraining_1",
        "training_performance_event_6a06bdcb49bec7faab27825a02ec7def",
        "training_performance_event_6e92fd37668bd266adfdf0a486bd3335",
        "training_performance_event_e1538956290f732bb114983330da86ea",
        "training_performance_event_e2194918e21e1062978ecb6e48ada1dd",
        "training_performance_event_e5bcba8c7ba139d205e229eec66df3fb",
      ],
    }),
    createEvidenceObservationV3({
      observationId: "weekly_energy_coverage_2026_08_16_2026_08_22",
      sourceType: "energy_coverage_summary",
      displayLabel: "Weekly energy coverage",
      observedAt: "2026-08-22T23:59:59.999Z",
      evidenceWindow: { startDate: "2026-08-16", endDate: "2026-08-22" },
      directness: "behavioral",
      quality: { status: "limited", provenance: "canonical_nutrition_activity_pairing", completeness: "one_of_seven_days", comparability: "insufficient", coverageRatio: 1 / 7 },
      exposureDays: 1,
      capabilities: [{
        capabilityId: "data.energy_coverage_ratio",
        value: 1 / 7,
        unit: "ratio",
        factualSummary: "Only one of seven days had paired energy evidence: 2,645 kcal recorded intake versus 2,863 kcal estimated expenditure.",
      }],
      limitations: ["six_days_missing_paired_energy_evidence", "expenditure_is_estimated"],
      sourceReferences: ["activity_day|2026-08-16", "nutrition|2026-08-16|nutrition-day"],
    }),
    createEvidenceObservationV3({
      observationId: "weekly_weight_snapshot_2026_08_16_2026_08_22",
      sourceType: "weight_summary",
      displayLabel: "Weekly weight snapshot",
      observedAt: "2026-08-16T19:07:18.500Z",
      evidenceWindow: { startDate: "2026-08-16", endDate: "2026-08-22" },
      directness: "proxy",
      quality: { status: "limited", provenance: "canonical_weight", completeness: "one_of_seven_days", comparability: "insufficient", coverageRatio: 1 / 7 },
      exposureDays: 1,
      capabilities: [{
        capabilityId: "body_mass.level",
        value: 165.5,
        unit: "lb",
        factualSummary: "The weekly weight view contained one 165.5 lb observation, which is insufficient for a weekly trend.",
      }],
      limitations: ["weekly_window_contains_one_weight_observation"],
      sourceReferences: ["morning_weight|user_founder_001|2026-08-16"],
    }),
  ];
}

function capability(namespace, key, displayName, canonicalUnit, valueKind = "scalar") {
  return { namespace, key, displayName, canonicalUnit, valueKind, version: "v1" };
}

function predicate(path, operator, values) {
  return { version: "declarative_predicate_v1", path, operator, ...values };
}

function policy(policyId, subjectType, subjectId, capabilityPattern, role, minimumQuality, usableFor, signalRules = null) {
  return { policyId, subjectType, subjectId, capabilityPattern, role, minimumQuality, usableFor, signalRules };
}

function supportiveSignal() {
  return {
    supportsWhen: predicate("measurement.value", "gte", { value: 1 }),
    contradictsWhen: predicate("measurement.value", "lte", { value: -1 }),
    significance: "meaningful",
  };
}

function openQuestion(definition, raisedAt) {
  return {
    questionId: definition.questionId,
    kind: definition.kind,
    text: definition.text,
    strategyRevisionId: definition.strategyRevisionId,
    evidencePurpose: definition.evidencePurpose,
    status: "open",
    raisedAt,
    answeredAt: null,
    answerCode: null,
    answeredByEvidenceIds: [],
  };
}
