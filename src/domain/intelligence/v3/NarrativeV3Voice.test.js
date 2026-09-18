import { describe, expect, it } from "vitest";

import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { findNarrativeV3VoiceViolations } from "./NarrativeV3CompositionService.js";

describe("Narrative V3 deterministic voice matrix", () => {
  const cases = [
    { name: "strong favorable result + no guardrail issue", config: { capability: "future.power", label: "power output", value: 120, baseline: 100 }, affect: ["positive", "strong"], includes: [/huge win/i, /stay the course/i] },
    { name: "strong favorable result + guardrail pressure", config: { capability: "future.power", label: "power output", value: 120, baseline: 100, guardrails: [guardrail("fatigue", "fatigue load", 11)] }, affect: ["positive", "measured"], includes: [/important caveat/i, /fatigue load/i] },
    { name: "strong favorable result + guardrail breach", config: { capability: "future.power", label: "power output", value: 120, baseline: 100, guardrails: [guardrail("fatigue", "fatigue load", 14)] }, affect: ["corrective", "strong"], includes: [/limit takes priority/i, /stop pushing/i] },
    { name: "ordinary favorable result", config: { capability: "future.power", label: "power output", value: 105, baseline: 100, majorAt: 20 }, affect: ["positive", "measured"], includes: [/good progress/i], excludes: [/huge win/i] },
    { name: "insufficient evidence", config: { capability: "future.power", label: "power output", value: 120, baseline: 100, quality: "limited" }, affect: ["neutral", "restrained"], includes: [/not enough reliable evidence/i] },
    { name: "maintenance stable success", config: { capability: "future.readiness", label: "readiness", value: 85, baseline: 85, maintenance: true }, affect: ["positive", "restrained"], includes: [/exactly what success looks like/i, /held where it needs to be/i] },
    { name: "strength performance success", config: { capability: "performance.max_force", label: "maximum force", value: 125, baseline: 100 }, affect: ["positive", "strong"], includes: [/maximum force/i, /huge win/i] },
    { name: "cardio performance success", config: { capability: "performance.aerobic_speed", label: "aerobic speed", value: 13, baseline: 10, majorAt: 2 }, affect: ["positive", "strong"], includes: [/aerobic speed/i, /huge win/i] },
    { name: "corrective recommendation", config: { capability: "future.power", label: "power output", value: 90, baseline: 100, priorDemonstrated: true }, affect: ["corrective", "measured"], includes: [/needs attention/i, /review the plan/i] },
    { name: "urgent guardrail case", config: { capability: "future.power", label: "power output", value: 120, baseline: 100, guardrails: [guardrail("safety", "safety load", 20)] }, affect: ["corrective", "strong"], includes: [/address safety load first/i] },
    { name: "no guardrails", config: { capability: "future.velocity", label: "movement speed", value: 14, baseline: 10 }, affect: ["positive", "measured"], excludes: [/guardrail/i, /limit takes priority/i] },
    { name: "multiple guardrails", config: { capability: "future.velocity", label: "movement speed", value: 14, baseline: 10, guardrails: [guardrail("fatigue", "fatigue load", 11), guardrail("pain", "pain score", 11)] }, affect: ["positive", "measured"], includes: [/fatigue load and pain score/i] },
    { name: "custom metric", config: { capability: "future.custom_metric", label: "launch index", value: 15, baseline: 2, custom: true }, affect: ["positive", "strong"], includes: [/launch index/i, /huge win/i] },
  ];

  it.each(cases)("renders $name as coaching instead of engine output", ({ config, affect, includes = [], excludes = [] }) => {
    const result = runCase(config);
    const copy = `${result.narrativePlan.composition.finalNarrative}\n${result.narrativePlan.composition.coachTake}`;
    expect(findNarrativeV3VoiceViolations(copy)).toEqual([]);
    expect(copy).not.toMatch(/\b(?:feasibility|persistence|attribution|evidence authority|question lifecycle|strategy revision|semantic fingerprint)\b/i);
    expect(copy).not.toMatch(/important remaining uncertainties/i);
    expect(copy).not.toMatch(/Recommendation:|Reason:|configured guardrail|no conclusion was manufactured/i);
    expect(result.strategicInterpretation.coachingAffect).toMatchObject({ valence: affect[0], intensity: affect[1] });
    for (const pattern of includes) expect(copy).toMatch(pattern);
    for (const pattern of excludes) expect(copy).not.toMatch(pattern);
  });

  it("blocks first-person singular tokens without rejecting unrelated substrings", () => {
    expect(findNarrativeV3VoiceViolations("Maintain momentum. Time the next check carefully.")).toEqual([]);
    expect(findNarrativeV3VoiceViolations("I would keep my plan because it works for me.")).toEqual([
      "first_person_singular:I",
      "first_person_singular:my",
      "first_person_singular:me",
    ]);
    expect(findNarrativeV3VoiceViolations("I'm confident this is mine.")).toEqual([
      "first_person_singular:I'm",
      "first_person_singular:mine",
    ]);
    expect(findNarrativeV3VoiceViolations("I’m confident.")).toEqual(["first_person_singular:I’m"]);
  });
});

function runCase(config) {
  const contract = contractFor(config);
  const current = evaluate(contract, config, null);
  if (!config.priorDemonstrated) return current;
  const priorConfig = { ...config, value: Number(config.baseline) + Math.max(20, Number(config.majorAt ?? 10)), priorDemonstrated: false };
  const prior = evaluate(contract, priorConfig, null, "prior");
  return evaluate(contract, config, prior, "current");
}

function evaluate(contract, config, prior, suffix = "current") {
  const capabilities = [{
    capabilityId: config.capability,
    value: config.value,
    comparisonValue: config.baseline,
    unit: config.unit ?? "points",
  }, ...(config.guardrails ?? []).map((item) => ({
    capabilityId: `safety.${item.key}`,
    value: item.value,
    unit: "points",
  }))];
  const observations = [createEvidenceObservationV3({
    observationId: `observation_${suffix}`,
    sourceType: "generic_adapter",
    observedAt: suffix === "prior" ? "2026-01-02T00:00:00.000Z" : "2026-02-02T00:00:00.000Z",
    directness: "direct",
    quality: { status: config.quality ?? "robust" },
    exposureDays: 30,
    capabilities,
  })];
  return runConfidenceNarrativeV3({
    goalContract: contract,
    observations,
    priorInterpretation: prior?.strategicInterpretation ?? null,
    priorCoachingState: prior?.coachingState ?? null,
    priorConfidence: prior?.confidence ?? { id: "confidence_seed", currentPercentage: 60 },
    evaluationContext: {
      type: "test_boundary",
      evidenceWindow: { startDate: "2026-01-01", endDate: "2026-02-02" },
      evidenceCutoff: "2026-02-03T00:00:00.000Z",
      evaluatedAt: suffix === "prior" ? "2026-01-03T00:00:00.000Z" : "2026-02-03T00:00:00.000Z",
    },
    surface: "calibration",
  });
}

function contractFor(config) {
  const [namespace, ...key] = config.capability.split(".");
  const evaluation = config.custom ? {
    mode: "custom_declarative",
    predicate: predicate("current", "gte", { value: 5 }),
    baselineValue: config.baseline,
    meaningfulChangeThreshold: 1,
    significanceBands: significanceBands(config.majorAt),
    successCriteria: [predicate("current", "gte", { value: 50 })],
  } : config.maintenance ? {
    mode: "maintain_range",
    targetRange: { min: 80, max: 90 },
    baselineValue: config.baseline,
    meaningfulChangeThreshold: 2,
    significanceBands: significanceBands(config.majorAt),
    successCriteria: [predicate("current", "between", { min: 80, max: 90 })],
  } : {
    mode: "increase",
    baselineValue: config.baseline,
    meaningfulChangeThreshold: 1,
    significanceBands: significanceBands(config.majorAt),
    successCriteria: [predicate("change", "gte", { value: 50 })],
  };
  const guardrails = (config.guardrails ?? []).map((item) => ({
    guardrailId: `guardrail_${item.key}`,
    vocabularyKey: item.key,
    metricCapability: capability("safety", item.key, item.label),
    evaluation: { mode: "maximum", threshold: 10 },
    severityBands: [
      { status: "breached", minimumDeviation: 3 },
      { status: "pressured", minimumDeviation: 1 },
      { status: "watch", minimumDeviation: 0 },
    ],
    consequencePolicy: { confidenceImpact: -2, celebrationCeiling: "measured", escalationLevel: "attention" },
  }));
  return createGoalContractV3({
    goalId: `goal_${namespace}_${key.join("_")}`,
    contractVersion: "voice_matrix_v1",
    goalLabel: `${config.label} goal`,
    phase: { phaseId: "phase_generic", label: "current phase", transitionCriteria: [] },
    strategy: {
      strategyRevisionId: "strategy_generic_v1",
      label: "the current strategy",
      adequateExposure: { minimumDays: 7 },
      feasibilityCriteria: [{
        source: "objective",
        subjectId: "objective_primary",
        acceptedStates: config.maintenance ? ["stable_success"] : ["progressed", "satisfied"],
        minimumAuthority: "decisive",
        minimumSignificance: "none",
      }],
    },
    objectives: [{
      objectiveId: "objective_primary",
      priority: "primary",
      vocabularyKey: "primary",
      metricCapability: capability(namespace, key.join("."), config.label),
      evaluation,
    }],
    guardrails,
    strategicQuestions: [feasibilityQuestion()],
    evidencePolicies: [
      {
        policyId: "objective_policy",
        subjectType: "objective",
        subjectId: "objective_primary",
        capabilityPattern: config.capability,
        role: "decisive",
        minimumQuality: "robust",
        usableFor: ["objective", "feasibility"],
      },
      ...guardrails.map((item) => ({
        policyId: `policy_${item.guardrailId}`,
        subjectType: "guardrail",
        subjectId: item.guardrailId,
        capabilityPattern: `safety.${item.vocabularyKey}`,
        role: "decisive",
        minimumQuality: "robust",
        usableFor: ["guardrail"],
      })),
    ],
    objectiveDecisionPolicy: { mode: "all_required" },
    achievementPolicy: { onAchieved: config.maintenance ? "continue" : "transition_goal" },
    vocabulary: {
      goal: { displayName: `the ${config.label} goal` },
      objectives: { primary: { displayName: config.label, decimals: 1, ongoingPhrase: `${config.label} progress` } },
      strategy: { displayName: "the current plan", continueAction: "Keep the current inputs steady", executeAction: "Keep executing" },
      guardrails: Object.fromEntries((config.guardrails ?? []).map((item) => [item.key, { displayName: item.label, decimals: 1 }])),
    },
  });
}

function feasibilityQuestion() {
  return {
    questionId: "question_feasibility",
    kind: "feasibility",
    text: "Is the current plan producing the intended result?",
    strategyRevisionId: "strategy_generic_v1",
    evidencePurpose: "establish_feasibility",
    answerWhen: predicate("strategy.feasibility", "eq", { value: "demonstrated" }),
    answerCode: "result_demonstrated",
    nextQuestionOnAnswer: {
      questionId: "question_repeat",
      kind: "persistence",
      text: "Does the result continue?",
      strategyRevisionId: "strategy_generic_v1",
      evidencePurpose: "confirm_persistence",
      answerWhen: predicate("strategy.persistence", "in", { values: ["repeated", "sustained"] }),
      answerCode: "result_repeated",
    },
  };
}

function guardrail(key, label, value) {
  return { key, label, value };
}

function capability(namespace, key, displayName) {
  return { namespace, key, displayName, valueKind: "scalar", canonicalUnit: "points" };
}

function significanceBands(majorAt = 10) {
  return [
    { significance: "major", minimumAbsoluteChange: majorAt },
    { significance: "meaningful", minimumAbsoluteChange: 1 },
  ];
}

function predicate(path, operator, values) {
  return { version: "declarative_predicate_v1", path, operator, ...values };
}
