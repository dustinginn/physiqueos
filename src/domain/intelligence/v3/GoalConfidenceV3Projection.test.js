import { describe, expect, it } from "vitest";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { findNarrativeV3VoiceViolations } from "./NarrativeV3CompositionService.js";
import { createHomeConfidenceV3Sample } from "./HomeConfidenceV3SampleService.js";

describe("Goal Confidence V3 focused declarative coverage", () => {
  const cases = [
    { name: "lean-mass Goal with deadline", capability: "composition.lean", baseline: 147.5, comparison: 148.3, current: 153.3, target: 157.5, direction: "increase" },
    { name: "fat-loss Goal with deadline", capability: "composition.fat", baseline: 25, comparison: 24, current: 19, target: 15, direction: "decrease" },
    { name: "maintenance duration Goal", capability: "custom.readiness", baseline: 85, comparison: 85, current: 85, duration: true },
    { name: "strength target with deadline", capability: "performance.force", baseline: 100, comparison: 104, current: 112, target: 120, direction: "increase" },
    { name: "cardio target with deadline", capability: "performance.elapsed_time", baseline: 1200, comparison: 1180, current: 1080, target: 1000, direction: "decrease" },
    { name: "Goal without deadline", capability: "custom.velocity", baseline: 100, comparison: 104, current: 112, target: 120, direction: "increase", noDeadline: true },
    { name: "Goal without guardrails", capability: "custom.velocity", baseline: 100, comparison: 104, current: 112, target: 120, direction: "increase" },
    { name: "Goal with guardrail breach", capability: "custom.velocity", baseline: 100, comparison: 104, current: 112, target: 120, direction: "increase", limit: 14 },
    { name: "custom scalar metric", capability: "future.launch_index", baseline: 0, comparison: 1, current: 6, target: 10, direction: "increase" },
    { name: "custom non-directional metric", capability: "future.stability_index", baseline: 85, comparison: 85, current: 85, state: true, noDeadline: true },
  ];

  it.each(cases)("projects $name from its contract", (config) => {
    const result = initial(config);
    const trajectory = result.confidence.goalAchievementOutlook.objectives[0].trajectory;
    expect(result.confidence.primaryDimension).toBe("goal_completion");
    expect(result.confidence.strategyConfidence.percentage).toBeGreaterThan(result.confidence.currentPercentage === 98 ? 0 : 70);
    expect(trajectory.supported).toBe(true);
    if (config.state) {
      expect(trajectory.kind).toBe("state");
      expect(trajectory.deadlineContributionApplicable).toBe(false);
      expect(result.confidence.currentPercentage).toBe(98);
    } else if (config.noDeadline) {
      expect(trajectory.timeRemainingDays).toBeNull();
      expect(trajectory.deadlineContributionApplicable).toBe(false);
      expect(result.confidence.goalAchievementOutlook.objectives[0].dimensions.trajectory).toBeNull();
    } else {
      expect(trajectory.deadlineContributionApplicable).toBe(true);
      expect(trajectory.timeRemainingDays).toBe(49);
      expect(trajectory.observedRate).toBeGreaterThan(0);
    }
    if (config.duration) {
      expect(result.strategicInterpretation.objectiveFindings[0].state).toBe("stable_success");
      expect(trajectory.fractionAchieved).toBe(0.5);
      expect(trajectory.remainingRequirement).toBe(30);
      expect(result.strategicInterpretation.goalAchievement).toBe("in_progress");
    }
    if (config.limit > 10) expect(result.confidence.currentPercentage).toBeLessThanOrEqual(45);
    const copy = `${result.narrativePlan.composition.finalNarrative}\n${result.narrativePlan.composition.coachTake}\n${JSON.stringify(result.narrativePlan.confidenceDeepExplanation)}`;
    expect(findNarrativeV3VoiceViolations(copy)).toEqual([]);
    expect(copy).not.toMatch(/feasibility|persistence|evidence authority|raw score|publisher cap/i);
    const home = createHomeConfidenceV3Sample(result);
    for (const presentation of [result.narrativePlan.confidenceBriefing, home.collapsed, home.expanded]) {
      expect(presentation).toMatchObject(result.narrativePlan.primaryConfidenceSnapshot);
    }
    expect(home.expanded.explanation).toBe(result.narrativePlan.confidenceDeepExplanation);
    expect(home.confidenceAssessmentId).toBe(result.confidence.id);
    expect(home.strategicInterpretationId).toBe(result.strategicInterpretation.id);
    expect(home).not.toHaveProperty("strategyConfidence");
    expect(findNarrativeV3VoiceViolations(JSON.stringify(home.expanded.explanation))).toEqual([]);
    if (config.noDeadline) expect(home.expanded.explanation.whatCouldLowerIt.join(" ")).not.toMatch(/time left/iu);
    if (config.limit == null) expect(home.expanded.explanation.whatCouldLowerIt.join(" ")).not.toMatch(/limits/iu);
    if (config.duration || config.state) {
      expect(home.expanded.explanation.whatCouldLowerIt.join(" ")).not.toMatch(/progress stalling/iu);
      expect(home.expanded.explanation.whatCouldRaiseIt.join(" ")).toContain("target is still being held");
    }
  });

  it("uses Goal baseline for achievement and strategy baseline only for response rate", () => {
    const config = cases[0];
    const result = initial(config);
    const trajectory = result.confidence.goalAchievementOutlook.objectives[0].trajectory;
    expect(trajectory).toMatchObject({ completedRequirement: 5.8, totalRequirement: 10, remainingRequirement: 4.2, fractionAchieved: 0.58, intervalDays: 28, timeRemainingDays: 49, retentionFactor: 0.55 });
    expect(trajectory.observedRate).toBeCloseTo(5 / 28, 4);
    expect(trajectory.requiredRate).toBeCloseTo(4.2 / 49, 4);
    expect(trajectory.discountedRate).toBeCloseTo((5 / 28) * 0.55, 4);
    expect(result.confidence.currentPercentage).toBe(79);
    expect(result.confidence.strategyConfidence.percentage).toBe(90);
  });

  it("does not inherit a low prior anchor after a decisive outcome", () => {
    const normal = initial(cases[0], 62);
    const low = initial(cases[0], 30);
    expect(normal.confidence.currentPercentage).toBe(low.confidence.currentPercentage);
    expect(low.confidence.projectionPolicy).toMatchObject({ mode: "decisive_state_anchor", continuityGain: 1, priorAnchorConstrainedResult: false });
    expect(low.confidence.priorPercentage).toBe(30);
  });

  it("does not award a bonus for configuring a clear guardrail or penalize its absence", () => {
    expect(initial(cases[0]).confidence.currentPercentage).toBe(initial({ ...cases[0], limit: 5 }).confidence.currentPercentage);
    expect(initial(cases[0]).confidence.goalAchievementOutlook.objectives[0].guardrailPenalty).toBe(0);
  });

  it("reduces the outlook when the demonstrated rate is insufficient for remaining time", () => {
    const normal = initial(cases[0]);
    const short = initial({ ...cases[0], deadline: "2026-09-20" });
    expect(short.confidence.currentPercentage).toBeLessThan(normal.confidence.currentPercentage);
    expect(short.confidence.goalAchievementOutlook.objectives[0].trajectory.scheduleState).toBe("at_risk");
  });

  it("preserves an unchanged assessment without counting already-published evidence again", () => {
    const config = cases[0];
    const prior = initial(config);
    const followup = run(config, observations(config), prior, "2026-09-13T07:02:00.000Z");
    expect(followup.confidence.currentPercentage).toBe(prior.confidence.currentPercentage);
    expect(followup.confidence.newEvidenceIds).toEqual([]);
    expect(followup.confidence.projectionPolicy.mode).toBe("continuity_hold");
  });

  it("lets material execution deterioration lower Goal Confidence without erasing demonstrated feasibility", () => {
    const config = cases[0];
    const prior = initial(config);
    const worse = run(config, [executionObservation(-1, "execution_missed", "2026-09-14T00:00:00.000Z")], prior, "2026-09-14T06:00:00.000Z");
    expect(worse.confidence.currentPercentage).toBeLessThanOrEqual(prior.confidence.currentPercentage - 5);
    expect(worse.confidence.currentPercentage).toBe(71);
    expect(worse.confidence.execution.state).toBe("deteriorating");
    expect(worse.confidence.goalAchievementOutlook.objectives[0].trajectory.executionRateMultiplier).toBeLessThan(1);
    expect(worse.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
    expect(worse.confidence.projectionPolicy.upperBound).toBe(3);
  });

  it("does not let a weak proxy overwhelm a recent decisive result", () => {
    const config = { ...cases[0], executionRole: "supporting", executionQuality: "limited", executionSignificance: "minor" };
    const prior = initial(config);
    const weak = run(config, [executionObservation(-1, "execution_weak", "2026-09-14T00:00:00.000Z", "limited")], prior, "2026-09-14T06:00:00.000Z");
    expect(prior.confidence.currentPercentage - weak.confidence.currentPercentage).toBeLessThanOrEqual(3);
    expect(weak.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
  });

  it("has room to rise when another qualifying result confirms continued progress", () => {
    const config = { ...cases[3], target: 130 };
    const prior = initial(config);
    const nextConfig = { ...config, current: 124, comparison: 112, comparisonAt: "2026-09-12", observedAt: "2026-10-10T23:59:59.999Z", startedAt: "2026-08-15" };
    const repeated = run(nextConfig, observations(nextConfig), prior, "2026-10-11T06:00:00.000Z");
    expect(repeated.strategicInterpretation.strategyEffectiveness.persistence).toBe("repeated");
    expect(repeated.confidence.currentPercentage).toBeGreaterThan(prior.confidence.currentPercentage + 5);
    expect(repeated.confidence.currentPercentage).toBeLessThan(98);
  });

  it("reaches completion semantics naturally when canonical success criteria are met", () => {
    const config = cases[0];
    const prior = initial(config);
    const achievedConfig = { ...config, current: 158.3, comparison: 153.3, comparisonAt: "2026-09-12", observedAt: "2026-10-10T23:59:59.999Z" };
    const achieved = run(achievedConfig, observations(achievedConfig), prior, "2026-10-11T06:00:00.000Z");
    expect(achieved.strategicInterpretation.goalAchievement).toBe("achieved");
    expect(achieved.confidence.currentPercentage).toBe(98);
  });

  it("does not reuse an old strategy response as the new revision's forecast", () => {
    const config = cases[0];
    const prior = initial(config);
    const changed = run({ ...config, revision: "strategy_v2" }, [], prior, "2026-09-14T06:00:00.000Z");
    const trajectory = changed.confidence.goalAchievementOutlook.objectives[0].trajectory;
    expect(trajectory.fractionAchieved).toBe(0.58);
    expect(trajectory.observedRate).toBeNull();
    expect(trajectory.deadlineContributionApplicable).toBe(false);
    expect(trajectory.uncertainty).toContain("response_belongs_to_prior_strategy_scope");
  });

  it("allows maintenance duration evidence to complete a stable Goal without directional movement", () => {
    const config = cases[2];
    const prior = initial(config);
    const duration = createEvidenceObservationV3({ observationId: "duration_complete", sourceType: "duration_adapter", observedAt: "2026-10-12T23:59:59.999Z", directness: "direct", quality: { status: "robust" }, capabilities: [{ capabilityId: "stability.effective_days", value: 60, unit: "days" }] });
    const completed = run(config, [duration], prior, "2026-10-13T06:00:00.000Z");
    expect(completed.strategicInterpretation.goalAchievement).toBe("achieved");
    expect(completed.strategicInterpretation.objectiveFindings[0]).toMatchObject({ currentValue: 85, change: 0, durationDays: 60 });
    expect(completed.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
    expect(completed.confidence.currentPercentage).toBe(98);
  });

  it("suppresses recent Event repetition generically, but not after meaningful new evidence", () => {
    const config = { ...cases[3], eventName: "Performance Check" };
    const prior = initial(config);
    const recurring = run(config, [], prior, "2026-09-13T07:02:00.000Z", "closed_cadence_boundary");
    expect(recurring.narrativePlan.continuityPolicy.mode).toBe("recent_event_followup");
    expect(recurring.narrativePlan.composition.sections.meaning).toBeNull();
    expect(recurring.narrativePlan.composition.finalNarrative).not.toContain("112.0");
    expect(recurring.narrativePlan.composition.finalNarrative).toContain("Performance Check");
    const changed = run(config, [executionObservation(-1, "execution_new", "2026-09-13T06:45:00.000Z")], prior, "2026-09-13T07:02:00.000Z", "closed_cadence_boundary");
    expect(changed.narrativePlan.continuityPolicy.mode).toBe("full_briefing");
  });

  it("never recommends preserving an unassessed domain", () => {
    const config = { ...cases[0], unsafeAction: true };
    const result = initial(config);
    expect(result.narrativePlan.composition.sections.action).not.toMatch(/recovery/i);
    expect(result.narrativePlan.composition.sections.action).toContain("Keep executing consistently");
  });

  it.each([cases[0], cases[1], cases[3], cases[4], cases[8]])("earns bounded longitudinal execution support for $name", (config) => {
    const direct = initial(config);
    const one = executionWeek(config, direct, 1, 1);
    const two = executionWeek(config, one, 2, 1);
    const three = executionWeek(config, two, 3, 1);
    expect(direct.confidence.currentPercentage).toBeGreaterThan(62);
    expect(one.confidence.currentPercentage).toBeGreaterThanOrEqual(direct.confidence.currentPercentage);
    expect(two.confidence.currentPercentage).toBeGreaterThanOrEqual(one.confidence.currentPercentage);
    expect(three.confidence.currentPercentage).toBeGreaterThanOrEqual(two.confidence.currentPercentage);
    expect(three.confidence.currentPercentage).toBeGreaterThan(direct.confidence.currentPercentage);
    for (const [prior, next] of [[direct, one], [one, two], [two, three]]) {
      expect(next.confidence.delta).toBeLessThanOrEqual(3);
      expect(next.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
      expect(next.strategicInterpretation.strategyEffectiveness.persistence).toBe("emerging");
      expect(next.strategicInterpretation.objectiveFindings[0].currentValue).toBe(prior.strategicInterpretation.objectiveFindings[0].currentValue);
    }
    expect(three.confidence.execution.reliableSupportDays).toBeCloseTo(14.7);
    expect(three.confidence.goalAchievementOutlook.objectives[0].trajectory.conditionalUnmeasuredProgress).toBeGreaterThan(0);
    expect(one.narrativePlan.confidenceBriefing.body).not.toContain("standout result");
  });

  it("weak execution cannot manufacture a decisive-sized rise or retire qualified exposure", () => {
    const config = { ...cases[0], executionRole: "supporting", executionQuality: "limited", executionSignificance: "minor" };
    const prior = initial(config);
    const weak = executionWeek(config, prior, 1, 1, "limited");
    expect(weak.confidence.delta).toBeLessThanOrEqual(3);
    expect(weak.confidence.execution.reliableSupportDays).toBe(0);
    expect(weak.confidence.goalAchievementOutlook.objectives[0].trajectory.conditionalUnmeasuredProgress).toBe(0);
  });

  it.each([cases[2], cases[5], cases[9]])("preserves declared non-directional and untimed semantics for $name during execution", (config) => {
    const direct = initial(config);
    const one = executionWeek(config, direct, 1, 1);
    const two = executionWeek(config, one, 2, 1);
    const trajectory = two.confidence.goalAchievementOutlook.objectives[0].trajectory;
    expect(two.strategicInterpretation.objectiveFindings[0].currentValue).toBe(config.current);
    expect(two.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
    if (config.duration) {
      expect(trajectory.completedRequirement).toBe(30);
      expect(trajectory.fractionAchieved).toBe(0.5);
      expect(two.strategicInterpretation.goalAchievement).toBe("in_progress");
    } else {
      expect(trajectory.deadlineContributionApplicable).toBe(false);
      expect(two.confidence.currentPercentage).toBeGreaterThanOrEqual(direct.confidence.currentPercentage);
    }
  });

  it("multiple poor weeks lower forward outlook without erasing historical success or answered questions", () => {
    const config = cases[0];
    const direct = initial(config);
    const good = executionWeek(config, direct, 1, 1);
    const poor = executionWeek(config, good, 2, -1);
    const worse = executionWeek(config, poor, 3, -1);
    expect(poor.confidence.currentPercentage).toBeLessThan(good.confidence.currentPercentage);
    expect(worse.confidence.currentPercentage).toBeLessThan(poor.confidence.currentPercentage);
    expect(worse.confidence.execution.health).toBeLessThan(poor.confidence.execution.health);
    expect(worse.confidence.strategyConfidence.percentage).toBe(direct.confidence.strategyConfidence.percentage);
    expect(worse.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
    expect(worse.strategicInterpretation.strategyEffectiveness.persistence).toBe("emerging");
    expect(worse.strategicInterpretation.objectiveFindings[0]).toMatchObject({ currentValue: 153.3, change: 5, successSatisfied: false });
    expect(worse.coachingState.questions.filter((item) => item.status === "answered")).toEqual(expect.arrayContaining(direct.coachingState.questions.filter((item) => item.status === "answered")));
  });

  it("supportive execution then confirmed persistence reprices the outlook coherently", () => {
    const config = { ...cases[3], target: 130 };
    const direct = initial(config);
    const one = executionWeek(config, direct, 1, 1);
    const two = executionWeek(config, one, 2, 1);
    const nextConfig = { ...config, current: 124, comparison: 112, comparisonAt: "2026-09-12", observedAt: "2026-10-10T23:59:59.999Z", startedAt: "2026-08-15" };
    const confirmed = run(nextConfig, observations(nextConfig), two, "2026-10-11T06:00:00.000Z");
    expect(confirmed.confidence.currentPercentage).toBeGreaterThan(two.confidence.currentPercentage);
    expect(confirmed.confidence.delta).toBeGreaterThan(3);
    expect(confirmed.confidence.projectionPolicy.mode).toBe("decisive_state_anchor");
    expect(confirmed.strategicInterpretation.strategyEffectiveness.persistence).toBe("repeated");
    expect(confirmed.confidence.execution.reliableSupportDays).toBe(0);
  });

  it("a later decisive outcome can substantially reprice after poor execution", () => {
    const config = cases[0];
    const direct = initial(config);
    const poor = executionWeek(config, direct, 1, -1);
    const nextConfig = { ...config, current: 158.3, comparison: 153.3, comparisonAt: "2026-09-12", observedAt: "2026-10-10T23:59:59.999Z" };
    const achieved = run(nextConfig, observations(nextConfig), poor, "2026-10-11T06:00:00.000Z");
    expect(achieved.confidence.currentPercentage).toBe(98);
    expect(achieved.confidence.delta).toBeGreaterThan(3);
  });

  it("does not increase from time passing, even after supportive execution", () => {
    const config = cases[0];
    const direct = initial(config);
    const good = executionWeek(config, direct, 1, 1);
    const elapsed = run(config, [], good, "2026-09-28T06:00:00.000Z");
    expect(elapsed.confidence.currentPercentage).toBeLessThanOrEqual(good.confidence.currentPercentage);
    expect(elapsed.confidence.execution.reliableSupportDays).toBe(good.confidence.execution.reliableSupportDays);
    const noDeadline = { ...config, noDeadline: true };
    const untimed = initial(noDeadline);
    expect(run(noDeadline, [], untimed, "2026-10-20T06:00:00.000Z").confidence.currentPercentage).toBe(untimed.confidence.currentPercentage);
  });

  it("deduplicates overlapping windows and replayed observations across assessments", () => {
    const config = cases[0];
    const direct = initial(config);
    const one = executionWeek(config, direct, 1, 1);
    const duplicate = executionObservation(1, "republished_window", "2026-09-20T07:00:00.000Z", "robust", { startDate: "2026-09-13", endDate: "2026-09-19" });
    const replay = run(config, [duplicate, duplicate], one, "2026-09-20T08:00:00.000Z");
    expect(replay.confidence.execution.reliableSupportDays).toBe(one.confidence.execution.reliableSupportDays);
    expect(replay.confidence.execution.health).toBe(one.confidence.execution.health);
    expect(replay.confidence.currentPercentage).toBe(one.confidence.currentPercentage);
    const repeated = run(config, [duplicate], replay, "2026-09-20T09:00:00.000Z");
    expect(repeated.confidence.newEvidenceIds).toEqual([]);
  });
});

function executionWeek(config, prior, index, value, quality = "robust") {
  const start = new Date(Date.UTC(2026, 8, 13 + (index - 1) * 7)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(2026, 8, 19 + (index - 1) * 7)).toISOString().slice(0, 10);
  const published = new Date(Date.UTC(2026, 8, 20 + (index - 1) * 7, 6)).toISOString();
  return run(config, [executionObservation(value, `execution_week_${index}_${value}`, `${end}T23:59:59.999Z`, quality, { startDate: start, endDate: end })], prior, published);
}

function initial(config, priorPercentage = 62) { return run(config, observations(config), null, "2026-09-13T06:28:00.000Z", "event_evidence_boundary", priorPercentage); }
function run(config, evidence, prior, evaluatedAt, type = "test_boundary", priorPercentage = 62) {
  return runConfidenceNarrativeV3({
    goalContract: contract(config), observations: evidence,
    priorInterpretation: prior?.strategicInterpretation, priorCoachingState: prior?.coachingState,
    priorConfidence: prior?.confidence ?? { id: "seed", currentPercentage: priorPercentage },
    priorNarrativePlan: prior?.narrativePlan,
    evaluationContext: { type, evaluatedAt, evidenceCutoff: evaluatedAt }, surface: "server_calibration",
  });
}

function contract(config) {
  const revision = config.revision ?? "strategy_v1";
  const forecast = config.state ? { version: "goal_outlook_v1", kind: "state" } : config.duration ?
    { version: "goal_outlook_v1", kind: "range_duration", requiredDurationDays: 60, durationCapabilityId: "stability.effective_days", startedAt: "2026-08-13", deadlineAt: config.deadline ?? "2026-10-31" } :
    { version: "goal_outlook_v1", kind: "scalar_target", baselineValue: config.baseline, targetValue: config.target, direction: config.direction, startedAt: config.startedAt ?? "2026-07-18", deadlineAt: config.noDeadline ? null : config.deadline ?? "2026-10-31" };
  const stable = config.state || config.duration;
  const evaluation = stable ? {
    mode: config.state ? "custom_declarative" : "maintain_range", targetRange: { min: 80, max: 90 }, baselineValue: 85,
    ...(config.state ? { predicate: predicate("current", "between", { min: 80, max: 90 }) } : {}),
    meaningfulChangeThreshold: 2,
    successCriteria: [predicate("current", "between", { min: 80, max: 90 }), ...(config.duration ? [predicate("durationDays", "gte", { value: 60 })] : [])],
  } : { mode: config.direction, baselineValue: config.baseline, meaningfulChangeThreshold: 0.1, significanceBands: [{ significance: "major", minimumAbsoluteChange: 1 }], successCriteria: [predicate("current", config.direction === "decrease" ? "lte" : "gte", { value: config.target })] };
  const guardrails = config.limit != null || config.unsafeAction ? [{
    guardrailId: "limit", metricCapability: metric("safety.load", "load"),
    evaluation: { mode: "maximum", threshold: 10 }, severityBands: [{ status: "breached", minimumDeviation: 3 }, { status: "watch", minimumDeviation: 0 }],
    consequencePolicy: { celebrationCeiling: "restrained", confidenceImpact: -4 },
  }] : [];
  return createGoalContractV3({
    goalId: "generic_goal", goalLabel: "the configured goal", contractVersion: "focused_projection_v1",
    phase: { phaseId: "phase", label: "current phase" },
    strategy: { strategyRevisionId: revision, adequateExposure: { minimumDays: 21 },
      feasibilityCriteria: [{ source: "objective", subjectId: "primary", acceptedStates: ["progressed", "stable_success", "satisfied"], minimumAuthority: "decisive", minimumSignificance: "none" }],
      coachingActions: [{ actionId: "execute", text: "Keep executing consistently" }, ...(config.unsafeAction ? [{ actionId: "recovery", text: "Keep recovery where it is", requires: [{ subjectType: "guardrail", subjectId: "limit", acceptedStates: ["clear"] }] }] : [])],
    },
    objectives: [{ objectiveId: "primary", metricCapability: metric(config.capability, "outcome"), evaluation, forecast }],
    guardrails,
    evidencePolicies: [
      { policyId: "outcome", subjectType: "objective", subjectId: "primary", capabilityPattern: config.capability, role: "decisive", minimumQuality: "robust", usableFor: ["objective", "feasibility"] },
      { policyId: "execution", subjectType: "execution", subjectId: revision, capabilityPattern: "execution.support", role: config.executionRole ?? "material", minimumQuality: config.executionQuality ?? "adequate", usableFor: ["execution"], signalRules: { supportsWhen: predicate("measurement.value", "gte", { value: 1 }), contradictsWhen: predicate("measurement.value", "lte", { value: -1 }), significance: config.executionSignificance ?? "major" } },
      ...(config.duration ? [{ policyId: "duration", subjectType: "achievement", subjectId: "primary", capabilityPattern: "stability.effective_days", role: "decisive", minimumQuality: "robust", usableFor: ["trajectory"] }] : []),
      ...(guardrails.length ? [{ policyId: "limit", subjectType: "guardrail", subjectId: "limit", capabilityPattern: "safety.load", role: "decisive", minimumQuality: "robust", usableFor: ["guardrail"] }] : []),
    ],
    achievementPolicy: { onAchieved: stable ? "continue" : "transition_goal" },
    vocabulary: { objective: { displayName: "outcome", decimals: 1, ongoingPhrase: stable ? "this stability" : "this progress" }, strategy: { displayName: "the current plan" }, evidence: { eventName: config.eventName ?? "Outcome Check" } },
  });
}

function observations(config) {
  return [createEvidenceObservationV3({
    observationId: `outcome_${config.current}_${config.observedAt ?? "first"}`,
    sourceType: "custom_adapter", observedAt: config.observedAt ?? "2026-09-12T23:59:59.999Z", directness: "direct", quality: { status: "robust" }, exposureDays: 28,
    capabilities: [{ capabilityId: config.capability, value: config.current, comparisonValue: config.comparison, comparisonAt: config.comparisonAt ?? "2026-08-15", unit: "unit" },
      ...(config.duration ? [{ capabilityId: "stability.effective_days", value: 30, unit: "days" }] : []),
      ...(config.limit != null ? [{ capabilityId: "safety.load", value: config.limit, unit: "unit" }] : [])],
  }), executionObservation(1, "execution_first", "2026-09-12T22:00:00.000Z", config.executionQuality ?? "adequate")];
}
function executionObservation(value, observationId, observedAt, quality = "robust", evidenceWindow = null) {
  return createEvidenceObservationV3({ observationId, observedAt, evidenceWindow, sourceType: "execution_adapter", directness: "behavioral", quality: { status: quality }, capabilities: [{ capabilityId: "execution.support", value, unit: "index" }] });
}
function predicate(path, operator, values) { return { version: "declarative_predicate_v1", path, operator, ...values }; }
function metric(id, displayName) { const [namespace, ...key] = id.split("."); return { namespace, key: key.join("."), displayName, canonicalUnit: "unit" }; }
