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

const FOUNDER_STORED_GUARDRAIL = Object.freeze({ "2026-10-09": "pressured" });

export function runGoalAdaptationScenarios({ scenarios = GOAL_ADAPTATION_SCENARIOS_V1, policy = GOAL_ADAPTATION_POLICY_V1 } = {}) {
  const results = scenarios.map((scenario) => runScenario(scenario, scenarios, policy));
  return Object.freeze({
    scenarioSetVersion: SCENARIO_SET_VERSION,
    policyVersion: policy.version,
    engine: "goal_adaptation_shadow_v1 (Phase A, dormant)",
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
    proposalsOriginated: results.filter((item) => item.actual.originatesProposal).length,
    noAdaptationOutcomes: results.filter((item) => !item.actual.originatesProposal).length,
    results,
  });
}

function runScenario(scenario, all, policy) {
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
  return Object.freeze({
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
