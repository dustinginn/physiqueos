// Deterministic runner for the Founder scenario acceptance gate.
//
// Runs every scenario through the actual Phase A shadow engine and the typed
// choice validator, records the existing V3 behaviour for the same inputs
// (stored schedule fields and V3's own symmetric guardrail evaluator), and
// compares engine output to the versioned expectations.

import { evaluateGuardrailMeasurementV3 } from "../../intelligence/v3/DeclarativeGoalEvaluator.js";
import { GOAL_ADAPTATION_POLICY_V1 } from "../GoalAdaptationPolicyV1.js";
import { evaluateGoalAdaptationShadow } from "../GoalAdaptationShadowEvaluator.js";
import { validateKeepBuildingChoice } from "../AdaptationDecisionV1.js";
import { FOUNDER_V3_ASSESSMENTS } from "../fixtures/founderLeanMassGolden.js";
import { GOAL_ADAPTATION_SCENARIOS_V1, SCENARIO_SET_VERSION } from "./GoalAdaptationScenariosV1.js";
import { evaluateGoalAdaptationPhaseB } from "../GoalAdaptationPhaseBEvaluator.js";
import { PHASE_B_EXTRA_SCENARIOS, PHASE_B_SCENARIO_INPUTS } from "./GoalAdaptationPhaseBScenarioInputsV1.js";

const FOUNDER_STORED_GUARDRAIL = Object.freeze({ "2026-10-09": "pressured" });

export function runGoalAdaptationScenarios({ scenarios = GOAL_ADAPTATION_SCENARIOS_V1, policy = GOAL_ADAPTATION_POLICY_V1, includePhaseB = true } = {}) {
  const results = [
    ...scenarios.map((scenario) => runScenario(scenario, scenarios, policy, includePhaseB)),
    ...(includePhaseB ? PHASE_B_EXTRA_SCENARIOS.map((scenario) => runPhaseBExtra(scenario, scenarios, policy)) : []),
  ];
  return Object.freeze({
    scenarioSetVersion: SCENARIO_SET_VERSION,
    policyVersion: policy.version,
    engine: "goal_adaptation_shadow_v1 (Phase A, dormant)",
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
    acceptedPhaseAScenarios: scenarios.length,
    phaseBScenarios: results.filter((item) => item.phaseB).length,
    proposalsOriginated: results.filter((item) => item.actual.originatesProposal).length,
    noAdaptationOutcomes: results.filter((item) => item.actual.originatesProposal === false).length,
    results,
  });
}

function runScenario(scenario, all, policy, includePhaseB) {
  let priorRecommendation = null;
  if (scenario.deferral) {
    const source = scenario.deferral.evidenceFrom === "founder_2026-10-09" ? all.find((item) => item.id === "F1") : null;
    const atDeferral = evaluateGoalAdaptationShadow({ ...source.inputs, policy });
    priorRecommendation = { lifecycle: scenario.deferral.lifecycle, evidenceFingerprint: atDeferral.evidenceFingerprint, rung: atDeferral.decision.rung };
  }
  const output = evaluateGoalAdaptationShadow({ ...scenario.inputs, priorRecommendation, policy });
  const choice = scenario.choice ? validateKeepBuildingChoice({ guardrail: output.guardrail, schedule: output.schedule, ...scenario.choice }) : null;
  const alternative = scenario.alternativeChoice ? validateKeepBuildingChoice({ guardrail: output.guardrail, schedule: output.schedule, ...scenario.alternativeChoice }) : null;
  const actual = {
    eligibility: output.eligibility.status,
    eligibilityReasons: output.eligibility.reasons ?? [],
    rung: output.decision.rung,
    originatesProposal: output.decision.originatesProposal,
    linkOnly: output.decision.linkOnly,
    trigger: output.decision.trigger,
    deferralReason: output.decision.deferral?.reason ?? null,
    scheduleState: output.schedule.scheduleState,
    measuredBasisState: output.schedule.measuredBasisState,
    timeRemainingDays: output.schedule.timeRemainingDays ?? null,
    coverage: output.coverage.status,
    precision: output.coverage.precision,
    adherence: output.adherence.status,
    guardrail: output.guardrail,
    coaching: output.decision.coaching,
    coachingCount: output.decision.coaching.length,
    coachingDomains: output.decision.coaching.map((item) => item.domain).filter(Boolean),
    choiceValid: choice?.valid ?? null,
    choiceErrors: choice?.errors ?? null,
    alternativeValid: alternative?.valid ?? null,
    alternativeWarnings: alternative?.warnings ?? null,
  };
  const checks = Object.entries(scenario.expected).map(([key, expected]) => ({
    key, expected, actual: actual[key], pass: JSON.stringify(actual[key]) === JSON.stringify(expected),
  }));
  const phaseBSpec = includePhaseB ? PHASE_B_SCENARIO_INPUTS[scenario.id] : null;
  const phaseB = phaseBSpec ? evaluateGoalAdaptationPhaseB({ ...scenario.inputs, ...phaseBSpec.inputs, priorRecommendation, policy }) : null;
  const phaseBChecks = phaseBSpec ? phaseBCheck(phaseB, phaseBSpec.expected) : [];
  checks.push(...phaseBChecks);
  return Object.freeze({
    phaseB: phaseB ? summarizePhaseB(phaseB) : null,
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    source: scenario.source,
    situation: scenario.situation,
    asOf: scenario.inputs.asOf,
    triggerFamily: scenario.inputs.triggerFamily,
    evidence: summarizeEvidence(scenario.inputs, output),
    engine: {
      schedule: output.schedule,
      guardrail: output.guardrail,
      coverage: output.coverage,
      adherence: output.adherence,
      eligibility: output.eligibility,
      decision: output.decision,
      choice,
      alternativeChoice: alternative,
    },
    before: existingV3Behaviour(scenario),
    actual,
    expected: scenario.expected,
    checks,
    pass: checks.every((item) => item.pass),
    illustrativeCopy: scenario.illustrativeCopy ?? null,
  });
}

function runPhaseBExtra(scenario, all, policy) {
  const base = all.find((item) => item.id === scenario.baseScenario);
  const asOf = scenario.phaseB.asOf ?? base.inputs.asOf;
  let shownRecommendation = null;
  if (scenario.phaseB.shownFrom) {
    const source = scenario.phaseB.shownFrom.scenario ? all.find((item) => item.id === scenario.phaseB.shownFrom.scenario) : base;
    const sourceSpec = PHASE_B_SCENARIO_INPUTS[source.id];
    shownRecommendation = evaluateGoalAdaptationPhaseB({ ...source.inputs, ...sourceSpec.inputs, asOf: scenario.phaseB.shownFrom.asOf, policy }).recommendationSnapshot;
  }
  const phaseB = evaluateGoalAdaptationPhaseB({ ...base.inputs, ...scenario.phaseB.inputs, asOf, shownRecommendation, policy });
  const output = phaseB.phaseA;
  const checks = phaseBCheck(phaseB, scenario.expected);
  return Object.freeze({
    phaseB: summarizePhaseB(phaseB),
    id: scenario.id, title: scenario.title, category: scenario.category, source: scenario.source, situation: scenario.situation,
    asOf, triggerFamily: base.inputs.triggerFamily,
    evidence: summarizeEvidence({ ...base.inputs, asOf }, output),
    engine: { schedule: output.schedule, guardrail: output.guardrail, coverage: output.coverage, adherence: output.adherence, eligibility: output.eligibility, decision: output.decision, choice: null, alternativeChoice: null },
    before: existingV3Behaviour({ ...base, inputs: { ...base.inputs, asOf } }),
    actual: { eligibility: output.eligibility.status, rung: output.decision.rung, originatesProposal: output.decision.originatesProposal, linkOnly: output.decision.linkOnly, coverage: output.coverage.status, precision: output.coverage.precision, adherence: output.adherence.status, coaching: output.decision.coaching },
    expected: scenario.expected, checks, pass: checks.every((item) => item.pass), illustrativeCopy: null, phaseBOnly: true,
  });
}

function phaseBActual(phaseB) {
  const options = phaseB.options?.options ?? null;
  const top = options?.[0] ?? null;
  return {
    options: options ? options.map((item) => item.kind) : null,
    topOption: top?.kind ?? null,
    recommendedKind: phaseB.options?.recommendedKind ?? null,
    calibration: phaseB.calibration.status,
    calibrationConfidence: phaseB.calibration.confidence,
    calibrationMethod: phaseB.calibration.methods?.[0] ?? null,
    topIntake: top?.energy?.intakeKcal ?? null,
    topClamped: top?.energy?.clamped ?? null,
    topEnergy: top?.energy?.status ?? null,
    revisedUpperAtLeast: options?.find((item) => item.kind === "keep_building_revised_limits")?.requires?.upperLimitAtLeast ?? null,
    currentPlanFits: options?.find((item) => item.kind === "keep_current_plan")?.fitsLimits ?? null,
    revalidation: phaseB.revalidation?.status ?? null,
    approvalAllowed: phaseB.revalidation?.approvalAllowed ?? null,
  };
}

function phaseBCheck(phaseB, expected) {
  const actual = phaseBActual(phaseB);
  return Object.entries(expected).map(([key, value]) => {
    const got = key === "options" && value === null ? actual.options : actual[key];
    return { key: `phaseB.${key}`, expected: value, actual: got, pass: JSON.stringify(got) === JSON.stringify(value) };
  });
}

function summarizePhaseB(phaseB) {
  return {
    calibration: phaseB.calibration,
    progress: phaseB.progress,
    options: phaseB.options,
    revalidation: phaseB.revalidation,
    recommendationSnapshot: phaseB.recommendationSnapshot,
  };
}

function summarizeEvidence(inputs, output) {
  return {
    goalType: output.archetype,
    phaseStart: inputs.phaseStartDate,
    daysInPhase: output.eligibility.daysInPhase ?? null,
    bodyCompositionScans: (inputs.bodyCompositionScanDates ?? []).length,
    coverage: output.coverage.domains.map((item) => `${item.satisfiedBy ?? item.domain}: ${item.observedDaysPerWeek}/wk (needs ${item.requiredDaysPerWeek})${item.source ? ` · ${item.source}` : ""}`),
    adherence: output.adherence.status,
    outcomeTrend: inputs.outcomeTrend ?? null,
    outcomeTrendDays: inputs.outcomeTrendDays ?? null,
    belowRangeHistory: inputs.belowRangeHistory ?? [],
    phaseState: inputs.phaseState ?? null,
  };
}

function existingV3Behaviour(scenario) {
  const { inputs } = scenario;
  const founder = FOUNDER_V3_ASSESSMENTS.find((item) => item.asOf === inputs.asOf && scenario.source === "founder_production_sanitized");
  const v3Guardrail = inputs.v3Guardrail && inputs.guardrailMeasurement?.value != null
    ? evaluateGuardrailMeasurementV3(inputs.v3Guardrail, inputs.guardrailMeasurement.value).status
    : founder ? (FOUNDER_STORED_GUARDRAIL[founder.asOf] ?? "clear") : null;
  return {
    recommendation: founder ? founder.baseAction : null,
    recommendationSource: founder ? "stored production V3 assessment" : "no V3 evaluation in this synthetic scenario",
    storedScheduleState: inputs.trajectory?.scheduleState ?? null,
    storedTimeRemainingDays: inputs.trajectory?.timeRemainingDays ?? null,
    v3GuardrailStatus: v3Guardrail,
    adaptationPath: "none: V3 has no adaptation rungs, no evidence/adherence eligibility and no deferral lifecycle",
  };
}
