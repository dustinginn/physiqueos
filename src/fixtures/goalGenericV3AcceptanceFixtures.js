import { createGoalContractV3 } from "../domain/intelligence/v3/GoalContractV3.js";
import { createEvidenceObservationV3 } from "../domain/intelligence/v3/EvidenceObservationV3.js";
import { runConfidenceNarrativeV3 } from "../domain/intelligence/v3/ConfidenceNarrativeV3Pipeline.js";

const p = (path, operator, values) => ({ version: "declarative_predicate_v1", path, operator, ...values });
const scalar = (capability, label, baseline, comparison, current, target, direction = "increase", unit = "lb") => ({ capability, label, baseline, comparison, current, target, direction, unit });
const lean = scalar("composition.lean", "lean tissue", 147.5, 148.3, 153.3, 157.5);
const fat = { ...scalar("composition.fat", "fat mass", 25, 24, 19, 15, "decrease"), words: { subject: "You", progressVerb: "lost" } };
const strength = scalar("performance.load", "top lift", 100, 104, 112, 120, "increase", "kg");
const cardio = scalar("performance.time", "time-trial time", 300, 290, 270, 250, "decrease", "seconds");
const maintenance = { capability: "body_mass.value", label: "body weight", baseline: 170, comparison: 170, current: 170, range: { min: 168, max: 172 }, unit: "lb" };
const range = (id, label, value, min, max, unit = "%") => ({ id, label, value, mode: "allowed_range", allowedRange: { min, max }, unit });
const minimum = (id, label, value, threshold, unit = "lb") => ({ id, label, value, mode: "minimum", threshold, unit });

export const GOAL_GENERIC_V3_CASES = [
  { id: 1, name: "Lean-mass gain; strong direct progress", objectives: [lean], guards: [range("fat", "body fat", 8.1, 8, 9)], evidenceName: "DEXA" },
  { id: 2, name: "Lean-mass gain; body-fat breach", objectives: [lean], guards: [range("fat", "body fat", 11, 8, 9)], evidenceName: "DEXA", expectedAction: "pause_and_investigate" },
  { id: 3, name: "Fat loss; lean tissue preserved", objectives: [fat], guards: [minimum("lean", "lean tissue", 151, 149)], evidenceName: "composition assessment", representative: true },
  { id: 4, name: "Fat loss; unacceptable lean-tissue loss", objectives: [fat], guards: [minimum("lean", "lean tissue", 146, 149)], evidenceName: "composition assessment", expectedAction: "pause_and_investigate", representative: true },
  { id: 5, name: "Maintenance; stable in range", objectives: [maintenance], evidenceName: "weight check-in", representative: true },
  { id: 6, name: "Maintenance; drift outside range", objectives: [{ ...maintenance, current: 175, comparison: 170 }], priorId: 5, observedAt: "2026-09-19T23:59:59.999Z", expectedAction: "review_strategy" },
  { id: 7, name: "Pure strength; direct performance success", objectives: [strength], evidenceName: "strength assessment", representative: true },
  { id: 8, name: "Strength; insufficient exposure", objectives: [strength], exposureDays: 7, evidenceName: "strength assessment", expectedFeasibility: "testing" },
  { id: 9, name: "Cardio; direct performance improvement", objectives: [cardio], evidenceName: "time trial", representative: true },
  { id: 10, name: "Cardio; authoritative contradiction", objectives: [{ ...cardio, current: 285, comparison: 270 }], priorId: 9, observedAt: "2026-09-19T23:59:59.999Z", evidenceName: "time trial", expectedAction: "review_strategy", representative: true },
  { id: 11, name: "Goal with no guardrails", objectives: [lean], evidenceName: "composition assessment" },
  { id: 12, name: "Goal with multiple guardrails", objectives: [strength], guards: [range("load", "fatigue load", 11, 0, 10, "points"), minimum("sleep", "sleep duration", 4, 7, "hours")], evidenceName: "strength assessment", expectedAction: "pause_and_investigate" },
  { id: 13, name: "Multi-objective performance Goal", objectives: [strength, cardio], evidenceName: "performance assessment" },
  { id: 14, name: "Goal with no DEXA evidence", objectives: [scalar("measurement.waist", "waist measurement", 80, 79, 76, 72, "decrease", "cm")], evidenceName: "measurement check-in", sourceType: "tape_measure" },
  { id: 15, name: "Future/custom declarative metric", objectives: [{ ...scalar("future.launch_index", "launch index", 0, 1, 6, 10, "increase", "points"), custom: true }], evidenceName: "launch assessment", representative: true },
  { id: 16, name: "Strategy revision; new feasibility scope", objectives: [lean], priorId: 1, revision: "revision_2", noEvidence: true, observedAt: "2026-09-19T23:59:59.999Z", expectedFeasibility: "unknown" },
  { id: 17, name: "Demonstrated feasibility; persistence open", objectives: [lean], priorId: 1, noEvidence: true },
  { id: 18, name: "Demonstrated strategy later challenged", objectives: [{ ...lean, current: 151, comparison: 153.3 }], priorId: 1, observedAt: "2026-09-19T23:59:59.999Z", evidenceName: "composition assessment", expectedAction: "review_strategy" },
];

export function evaluateGoalGenericV3Acceptance() {
  const results = new Map();
  return GOAL_GENERIC_V3_CASES.map((fixture) => {
    const prior = results.get(fixture.priorId);
    const result = evaluateFixture(fixture, prior);
    results.set(fixture.id, result);
    return { fixture, result, prior, checks: acceptanceChecks(fixture, result, prior) };
  });
}

function evaluateFixture(fixture, prior) {
  const revision = fixture.revision ?? "revision_1";
  const goalId = prior?.strategicInterpretation.goalId ?? `acceptance_goal_${fixture.id}`;
  const root = `question_${goalId}_${revision}`;
  const goals = fixture.objectives;
  const guards = fixture.guards ?? [];
  const observedAt = fixture.observedAt ?? "2026-09-12T23:59:59.999Z";
  const evaluatedAt = new Date(Date.parse(observedAt) + 7 * 3600000).toISOString();
  const contract = createGoalContractV3({
    goalId, goalLabel: fixture.name, contractVersion: "genericity_acceptance_v1",
    phase: { phaseId: "phase", label: "current phase" },
    strategy: { strategyRevisionId: revision, adequateExposure: { minimumDays: 21 },
      feasibilityCriteria: goals.map((item, index) => ({ source: "objective", subjectId: `objective_${index}`, acceptedStates: ["progressed", "stable_success", "satisfied"], minimumAuthority: "decisive", minimumSignificance: "none" })),
      coachingActions: [{ actionId: "execute", text: "Keep executing consistently" }],
    },
    objectives: goals.map((item, index) => ({
      objectiveId: `objective_${index}`, metricCapability: metric(item.capability, item.label, item.unit), vocabularyKey: `objective_${index}`,
      evaluation: item.range ? { mode: "maintain_range", targetRange: item.range, baselineValue: item.baseline, meaningfulChangeThreshold: 1, successCriteria: [p("current", "between", item.range)] } : {
        mode: item.custom ? "custom_declarative" : item.direction, baselineValue: item.baseline, meaningfulChangeThreshold: 0.5,
        significanceBands: [{ significance: "major", minimumAbsoluteChange: item.unit === "seconds" ? 10 : 3 }],
        ...(item.custom ? { predicate: p("current", "gte", { value: 2 }) } : {}),
        successCriteria: [p("current", item.direction === "decrease" ? "lte" : "gte", { value: item.target })],
      },
      forecast: item.range ? { version: "goal_outlook_v1", kind: "state" } : { version: "goal_outlook_v1", kind: "scalar_target", baselineValue: item.baseline, targetValue: item.target, direction: item.direction, startedAt: "2026-07-18", deadlineAt: "2026-10-31" },
    })),
    guardrails: guards.map((item) => ({ guardrailId: item.id, metricCapability: metric(`safety.${item.id}`, item.label, item.unit), evaluation: { mode: item.mode, threshold: item.threshold, allowedRange: item.allowedRange }, severityBands: [{ status: "breached", minimumDeviation: 2 }, { status: "watch", minimumDeviation: 0 }], consequencePolicy: { confidenceImpact: -4, celebrationCeiling: "restrained", recommendationConstraint: "review" } })),
    evidencePolicies: [
      ...goals.map((item, index) => ({ policyId: `outcome_${index}`, subjectType: "objective", subjectId: `objective_${index}`, capabilityPattern: item.capability, role: "decisive", minimumQuality: "robust", usableFor: ["objective", "feasibility"] })),
      ...guards.map((item) => ({ policyId: item.id, subjectType: "guardrail", subjectId: item.id, capabilityPattern: `safety.${item.id}`, role: "decisive", minimumQuality: "robust", usableFor: ["guardrail"] })),
    ],
    achievementPolicy: { onAchieved: goals.every((item) => item.range) ? "continue" : "transition_goal" },
    strategicQuestions: [
      { questionId: `${root}_safety`, priority: 100, kind: "guardrail", text: "Has the unacceptable limit returned to an acceptable state?", strategyRevisionId: revision, evidencePurpose: "assess_guardrail", raiseWhen: p("guardrail.aggregateStatus", "eq", { value: "breached" }), answerWhen: p("guardrail.aggregateStatus", "eq", { value: "clear" }) },
      { questionId: root, kind: "feasibility", text: "Is the current plan producing the intended result?", strategyRevisionId: revision, evidencePurpose: "establish_feasibility", answerWhen: p("strategy.feasibility", "eq", { value: "demonstrated" }), answerCode: "strategy_demonstrated", nextQuestionOnAnswer: { questionId: `${root}_repeat`, kind: "persistence", text: "Does the result continue?", strategyRevisionId: revision, evidencePurpose: "confirm_persistence", supersedeWhen: p("strategy.feasibility", "eq", { value: "challenged" }), answerWhen: p("strategy.persistence", "in", { values: ["repeated", "sustained"] }) } },
      { questionId: `${root}_contradiction`, kind: "contradiction", text: "Is the setback a lasting change or a one-off result?", strategyRevisionId: revision, evidencePurpose: "resolve_contradiction", raiseWhen: p("strategy.feasibility", "eq", { value: "challenged" }) },
    ],
    evidenceRequests: ["confirm_persistence", "establish_feasibility", "resolve_contradiction", "assess_guardrail"].map((purpose) => ({ evidencePurpose: purpose, strategyRevisionId: revision, alternatives: [{ capabilityIds: purpose === "assess_guardrail" ? guards.map((item) => `safety.${item.id}`) : goals.map((item) => item.capability), vocabularyKey: "assessment" }], timing: { cadenceDays: 28 } })),
    vocabulary: { goal: { displayName: "the goal" }, strategy: { displayName: "the current plan", reconsiderationTrigger: "if something meaningful changes" }, evidence: { eventName: fixture.evidenceName ?? "assessment", requests: { assessment: { displayName: fixture.evidenceName ?? "assessment" } } }, objectives: Object.fromEntries(goals.map((item, index) => [`objective_${index}`, { displayName: item.label, decimals: 1, ongoingPhrase: item.range ? "this stability" : "this progress", ...item.words }])) },
  });
  return runConfidenceNarrativeV3({
    goalContract: contract,
    observations: fixture.noEvidence ? [] : [createEvidenceObservationV3({ observationId: `acceptance_outcome_${fixture.id}`, observedAt, sourceType: fixture.sourceType ?? "configured_assessment", directness: "direct", quality: { status: "robust" }, exposureDays: fixture.exposureDays ?? 28, capabilities: [
      ...goals.map((item) => ({ capabilityId: item.capability, value: item.current, comparisonValue: item.comparison, comparisonAt: fixture.priorId ? "2026-09-12" : "2026-08-15", unit: item.unit })),
      ...guards.map((item) => ({ capabilityId: `safety.${item.id}`, value: item.value, unit: item.unit })),
    ] })],
    priorInterpretation: prior?.strategicInterpretation, priorCoachingState: prior?.coachingState,
    priorConfidence: prior?.confidence ?? { currentPercentage: 55 }, priorNarrativePlan: prior?.narrativePlan,
    evaluationContext: { type: fixture.noEvidence ? "closed_cadence_boundary" : "event_evidence_boundary", evaluatedAt, evidenceCutoff: evaluatedAt }, surface: "server_acceptance",
  });
}

export function acceptanceChecks(fixture, result, prior) {
  const state = result.strategicInterpretation;
  const expectedAction = fixture.expectedAction ?? "continue_current_strategy";
  const expectedFeasibility = fixture.expectedFeasibility ?? (expectedAction === "review_strategy" ? "challenged" : "demonstrated");
  const checks = {
    objective: state.objectiveFindings.length === fixture.objectives.length && state.objectiveFindings.every((item, index) => item.state === (fixture.objectives[index].range ? fixture.id === 6 ? "outside_target" : "stable_success" : fixture.objectives[index].custom ? "satisfied" : [10, 18].includes(fixture.id) ? "regressed" : "progressed")),
    achievement: state.goalAchievement === (fixture.id === 5 ? "achieved" : fixture.id === 6 ? "regressed" : "in_progress"),
    guardrails: state.guardrailFindings.length === (fixture.guards?.length ?? 0) && ([2, 4, 12].includes(fixture.id) ? state.aggregateGuardrailState === "breached" : (fixture.guards?.length ?? 0) === 0 || state.aggregateGuardrailState === "clear"),
    feasibility: state.strategyEffectiveness.feasibility === expectedFeasibility,
    persistence: state.strategyEffectiveness.persistence === (expectedFeasibility === "demonstrated" ? "emerging" : expectedFeasibility === "challenged" ? "disrupted" : "not_assessed"),
    recommendation: state.recommendation.action === expectedAction,
    confidence: Number.isFinite(result.confidence.currentPercentage) && (state.aggregateGuardrailState !== "breached" || result.confidence.currentPercentage <= 45) && (!prior || fixture.id === 17 ? !prior || result.confidence.currentPercentage === prior.confidence.currentPercentage : true),
    uncertainty: !state.uncertaintyProfile.some((item) => item.type === "strategy_feasibility" && expectedFeasibility === "demonstrated"),
    questions: state.nextCoachingQuestion?.evidencePurpose === (state.aggregateGuardrailState === "breached" ? "assess_guardrail" : expectedFeasibility === "demonstrated" ? "confirm_persistence" : expectedFeasibility === "challenged" ? "resolve_contradiction" : "establish_feasibility"),
    takeaway: state.biggestTakeaway.priority >= 60 && (state.aggregateGuardrailState !== "breached" || state.biggestTakeaway.type === "guardrail"),
    affect: state.aggregateGuardrailState === "breached" || expectedFeasibility === "challenged" ? state.coachingAffect.valence === "corrective" : state.coachingAffect.valence !== "corrective",
    narrativePlan: result.narrativePlan.confidenceAssessmentId === result.confidence.id && result.narrativePlan.strategicInterpretationId === state.id,
    history: !prior || prior.strategicInterpretation.strategyEffectiveness.feasibility === "demonstrated" && (fixture.id !== 16 || state.lineage.preservedPriorStrategyState?.feasibility === "demonstrated"),
  };
  return checks;
}

function metric(id, displayName, canonicalUnit) { const [namespace, ...key] = id.split("."); return { namespace, key: key.join("."), displayName, canonicalUnit }; }
