import { describe, expect, it } from "vitest";

import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { EvidenceReconciliationV3 } from "./CrossDomainEvidenceSynthesisV3.js";
import { createPairedCalibrationFixtures } from "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";

describe("V3 dynamic cross-domain intelligence", () => {
  it("keeps evidence roles Goal-relative instead of assigning universal domain prestige", () => {
    const contract = contractV3();
    expect(contract.evidencePolicies.map((item) => [item.capabilityPattern, item.semanticClass])).toEqual(expect.arrayContaining([
      ["custom.primary_result", "OUTCOME_EVIDENCE"],
      ["performance.leading_signal", "LEADING_INDICATOR"],
      ["strategy.derived_estimate", "DERIVED_ESTIMATE"],
      ["execution.plan_adherence", "EXECUTION_SUPPORT"],
    ]));
  });

  it("communicates a major outcome fully at its Event boundary", () => {
    const event = runEvent();
    expect(event.narrativePlan.authoritativeFindingCommunicated).toBe(true);
    expect(event.narrativePlan.narrativeSalience.outcomeAnchor).toBe("new_finding");
    expect(event.narrativePlan.composition.finalNarrative).toContain("huge win");
  });

  it("retains the major outcome as the strategic anchor afterward", () => {
    const { weekly } = runSequence();
    expect(weekly.strategicInterpretation.crossDomainSynthesis.activeOutcomeAnchor).toMatchObject({
      active: true,
      direction: "supports",
      freshness: "carried_forward",
    });
  });

  it("reduces outcome Narrative salience after it has been communicated", () => {
    const { event, weekly, midweek } = runSequence();
    expect(event.narrativePlan.narrativeSalience.outcomeAnchor).toBe("new_finding");
    expect(weekly.narrativePlan.narrativeSalience.outcomeAnchor).toBe("recently_communicated_finding");
    expect(midweek.narrativePlan.narrativeSalience.outcomeAnchor).toBe("background_anchor");
  });

  it("does not decay Confidence when only Narrative salience changes", () => {
    const { event, hold } = runSequence();
    expect(hold.confidence.currentPercentage).toBe(event.confidence.currentPercentage);
    expect(hold.confidence.delta).toBe(0);
  });

  it("uses a leading indicator to support the outlook without impersonating outcome evidence", () => {
    const { weekly } = runSequence();
    const signal = weekly.strategicInterpretation.crossDomainSynthesis.signals.find((item) => item.vocabularyKey === "leading_performance");
    expect(signal).toMatchObject({ semanticClass: "LEADING_INDICATOR", direction: "supports" });
    expect(weekly.strategicInterpretation.strategyEffectiveness.persistence).toBe("emerging");
    expect(weekly.strategicInterpretation.objectiveFindings[0].changedThisEvaluation).toBe(false);
  });

  it("lets strong current leading evidence support recommendation stability", () => {
    const { weekly } = runSequence();
    expect(weekly.strategicInterpretation.crossDomainSynthesis.operatingSupport).toBe("supportive");
    expect(weekly.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
  });

  it("distinguishes weakening leading evidence from an overturned lagging anchor", () => {
    const event = runEvent();
    const current = runRecurring(event, [signalObservation("leading_down", "performance.leading_signal", -1, "Current performance declined across the reviewed work.")], "2026-09-14T12:00:00.000Z");
    expect(current.strategicInterpretation.crossDomainSynthesis.tensions).toContainEqual(expect.objectContaining({
      type: EvidenceReconciliationV3.LEADING_VS_LAGGING_TENSION,
    }));
    expect(current.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
  });

  it("does not change the plan solely to satisfy a noisy derived estimate", () => {
    const event = runEvent();
    const current = runRecurring(event, [signalObservation("estimate_down", "strategy.derived_estimate", -1, "The reported inputs and estimated output show a negative balance on paper.", "limited")], "2026-09-14T12:00:00.000Z");
    expect(current.strategicInterpretation.crossDomainSynthesis.tensions).toContainEqual(expect.objectContaining({
      type: EvidenceReconciliationV3.ESTIMATE_VS_OUTCOME_TENSION,
    }));
    expect(current.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
  });

  it("allows deteriorating realized outcomes to turn the same estimate into relevant concern", () => {
    const event = runEvent();
    const current = runRecurring(event, [
      outcomeObservation("outcome_reversal", -10, 0, "The direct result moved materially away from the target."),
      signalObservation("estimate_down", "strategy.derived_estimate", -1, "The reported inputs and estimated output show a negative balance on paper.", "adequate"),
    ], "2026-09-28T12:00:00.000Z");
    expect(current.strategicInterpretation.strategyEffectiveness.feasibility).toBe("challenged");
    expect(current.strategicInterpretation.recommendation.action).toBe("review_strategy");
  });

  it("calibrates a lower-authority estimate as context rather than a decision driver", () => {
    const event = runEvent();
    const current = runRecurring(event, [signalObservation("estimate_down", "strategy.derived_estimate", -1, "The estimate looks lower than expected.", "limited")], "2026-09-14T12:00:00.000Z");
    expect(current.strategicInterpretation.crossDomainSynthesis.signals.find((item) => item.observationId === "estimate_down")).toMatchObject({
      calibratedRole: "context_not_decision_driver",
      recommendationEligible: false,
    });
  });

  it("lets a later authoritative contradiction overturn the prior anchor", () => {
    const event = runEvent();
    const current = runRecurring(event, [outcomeObservation("outcome_reversal", -10, 0, "The direct result moved materially away from the target.")], "2026-09-28T12:00:00.000Z");
    expect(current.strategicInterpretation.strategyEffectiveness).toMatchObject({ feasibility: "challenged", persistence: "disrupted" });
  });

  it("selects decision-relevant cross-domain evidence for Narrative", () => {
    const event = runEvent();
    const current = runRecurring(event, [
      signalObservation("leading_up", "performance.leading_signal", 1, "Performance improved across most of the reviewed work."),
      signalObservation("execution_up", "execution.plan_adherence", 1, "The planned work was completed consistently."),
      signalObservation("context", "context.background", 0, "A neutral contextual measurement was also recorded."),
    ], "2026-09-17T12:00:00.000Z");
    expect(current.strategicInterpretation.crossDomainSynthesis.selectedNarrativeSignals.map((item) => item.observationId)).toEqual(["leading_up", "execution_up"]);
  });

  it("avoids laundry-list Narrative by selecting at most two domain contributions", () => {
    const event = runEvent();
    const current = runRecurring(event, [
      signalObservation("leading_up", "performance.leading_signal", 1, "Performance improved."),
      signalObservation("execution_up", "execution.plan_adherence", 1, "Execution stayed consistent."),
      signalObservation("estimate_down", "strategy.derived_estimate", -1, "The estimate pointed lower."),
      signalObservation("context", "context.background", 0, "Neutral context was available."),
    ], "2026-09-14T12:00:00.000Z");
    expect(current.narrativePlan.narrativeSalience.selectedDomainContributions).toHaveLength(2);
  });

  it("evolves from Event to Weekly to Midweek without repeating the full Event result", () => {
    const { event, weekly, midweek } = runSequence();
    expect(event.narrativePlan.composition.finalNarrative).toContain("40.0 points");
    expect(weekly.narrativePlan.composition.finalNarrative).not.toContain("40.0 points");
    expect(midweek.narrativePlan.composition.finalNarrative).not.toContain("40.0 points");
    expect(weekly.narrativePlan.composition.finalNarrative).toContain("Performance improved");
    expect(midweek.narrativePlan.composition.finalNarrative).toContain("planned work was completed");
  });

  it("keeps the recommendation stable when realized outcome and operating evidence support it", () => {
    const { midweek } = runSequence();
    expect(midweek.strategicInterpretation.crossDomainSynthesis.recommendationStability.stable).toBe(true);
    expect(midweek.strategicInterpretation.recommendation.action).toBe("continue_current_strategy");
  });

  it("changes the recommendation when independent current leading signals confirm a reversal", () => {
    const event = runEvent();
    const current = runRecurring(event, [
      signalObservation("leading_down", "performance.leading_signal", -1, "Performance declined across the reviewed work."),
      signalObservation("execution_down", "execution.plan_adherence", -1, "Planned execution materially deteriorated."),
    ], "2026-09-21T12:00:00.000Z");
    expect(current.strategicInterpretation.crossDomainSynthesis.tensions).toContainEqual(expect.objectContaining({ type: EvidenceReconciliationV3.CONFIRMED_REVERSAL }));
    expect(current.strategicInterpretation.recommendation.action).toBe("review_strategy");
  });
});

describe("reviewed temporal calibration with dynamic Narrative", () => {
  it("keeps the accepted Event and Weekly Confidence while making training prominent", () => {
    const fixtures = createPairedCalibrationFixtures();
    const event = runConfidenceNarrativeV3(fixtures.dexa);
    const weekly = runConfidenceNarrativeV3({
      ...fixtures.weekly,
      priorInterpretation: event.strategicInterpretation,
      priorCoachingState: event.coachingState,
      priorConfidence: event.confidence,
      priorNarrativePlan: event.narrativePlan,
    });
    expect([event.confidence.currentPercentage, weekly.confidence.currentPercentage]).toEqual([79, 79]);
    expect(weekly.narrativePlan.composition.finalNarrative).toContain("Seven of nine reviewed training areas improved");
    expect(weekly.narrativePlan.composition.finalNarrative).not.toContain("5.0 lb");
  });
});

function runSequence() {
  const event = runEvent();
  const weekly = runRecurring(event, [signalObservation("leading_up", "performance.leading_signal", 1, "Performance improved across most of the reviewed work.", "adequate", "2026-09-12T11:30:00.000Z")], "2026-09-12T12:30:00.000Z", "weekly_briefing");
  const midweek = runRecurring(weekly, [signalObservation("execution_up", "execution.plan_adherence", 1, "The planned work was completed consistently.", "adequate", "2026-09-16T11:00:00.000Z")], "2026-09-16T12:00:00.000Z", "midweek_briefing");
  const hold = runRecurring(event, [], "2026-09-16T12:00:00.000Z", "midweek_briefing");
  return { event, weekly, midweek, hold };
}

function runEvent() {
  return runConfidenceNarrativeV3({
    goalContract: contractV3(),
    observations: [outcomeObservation("major_outcome", 40, 0, "The direct assessment improved by 40 points." )],
    priorConfidence: { id: "prior", currentPercentage: 60 },
    evaluationContext: context("2026-09-12T12:00:00.000Z", "event_evidence_boundary"),
    surface: "event_briefing",
  });
}

function runRecurring(prior, observations, at, surface = "weekly_briefing") {
  return runConfidenceNarrativeV3({
    goalContract: contractV3(), observations,
    priorInterpretation: prior.strategicInterpretation,
    priorCoachingState: prior.coachingState,
    priorConfidence: prior.confidence,
    priorNarrativePlan: prior.narrativePlan,
    evaluationContext: context(at, "closed_cadence_boundary"), surface,
  });
}

function contractV3() {
  return createGoalContractV3({
    goalId: "goal_generic_dynamic",
    contractVersion: "dynamic_v1",
    goalLabel: "Configured outcome goal",
    phase: { phaseId: "phase_dynamic", label: "Current phase", startedAt: "2026-08-01", transitionCriteria: [] },
    strategy: {
      strategyRevisionId: "strategy_dynamic_v1", label: "the current plan",
      adequateExposure: { minimumDays: 14 },
      coachingActions: [{ actionId: "continue", text: "Keep executing consistently", recommendationActions: ["continue_current_strategy"] }],
      feasibilityCriteria: [{ source: "objective", subjectId: "objective", acceptedStates: ["progressed"], minimumAuthority: "decisive", minimumSignificance: "major" }],
    },
    objectives: [{
      objectiveId: "objective", priority: "primary",
      metricCapability: { namespace: "custom", key: "primary_result", displayName: "primary result", valueKind: "scalar", canonicalUnit: "points" },
      evaluation: { mode: "increase", baselineValue: 0, targetValue: 100, desiredDirection: "increase", meaningfulChangeThreshold: 5, significanceBands: [{ significance: "major", minimumAbsoluteChange: 30 }, { significance: "meaningful", minimumAbsoluteChange: 5 }], successCriteria: [predicate("goalChange", "gte", 100)] },
      vocabularyKey: "primary",
    }],
    guardrails: [], strategicQuestions: [],
    evidencePolicies: [
      policy("outcome", "objective", "objective", "custom.primary_result", "decisive", "OUTCOME_EVIDENCE", "primary_outcome", ["objective", "feasibility"]),
      policy("strategy_outcome", "strategy", "strategy_dynamic_v1", "custom.primary_result", "decisive", "OUTCOME_EVIDENCE", "primary_outcome", ["feasibility", "persistence"]),
      policy("leading", "strategy", "strategy_dynamic_v1", "performance.leading_signal", "supporting", "LEADING_INDICATOR", "leading_performance", ["narrative", "execution", "attribution"], signalRules()),
      policy("execution", "execution", "strategy_dynamic_v1", "execution.plan_adherence", "supporting", "EXECUTION_SUPPORT", "plan_execution", ["narrative", "execution", "attribution"], signalRules()),
      policy("estimate", "attribution", "strategy_dynamic_v1", "strategy.derived_estimate", "contextual", "DERIVED_ESTIMATE", "derived_estimate", ["narrative", "attribution"], signalRules()),
      policy("context", "attribution", "strategy_dynamic_v1", "context.background", "contextual", "CONTEXTUAL_EVIDENCE", "background_context", ["narrative"]),
    ],
    objectiveDecisionPolicy: { mode: "all_required" },
    vocabulary: {
      goal: { displayName: "the configured outcome goal" },
      objective: { displayName: "primary result", unit: "points", decimals: 1, subject: "you", progressVerb: "added", ongoingPhrase: "this progress" },
      strategy: { displayName: "the current plan", executeAction: "Keep executing", reconsiderationTrigger: "if the current evidence genuinely turns" },
      phase: { contextName: "this phase" },
      evidence: { eventName: "direct assessment" },
    },
  });
}

function policy(policyId, subjectType, subjectId, capabilityPattern, role, semanticClass, vocabularyKey, usableFor, signalRules = null) {
  return { policyId, subjectType, subjectId, capabilityPattern, role, semanticClass, vocabularyKey,
    reconciliationGroup: vocabularyKey, minimumQuality: "limited", participation: subjectType === "objective" ? "DIRECT_CONFIDENCE_INPUT" : "NARRATIVE_CONTEXT_ONLY", usableFor, signalRules };
}

function signalRules() {
  return { supportsWhen: predicate("measurement.value", "gte", 1), contradictsWhen: predicate("measurement.value", "lte", -1), significance: "meaningful" };
}

function outcomeObservation(id, value, comparisonValue, factualSummary) {
  return createEvidenceObservationV3({ observationId: id, sourceType: "canonical_direct_assessment", displayLabel: "Direct assessment", observedAt: id === "major_outcome" ? "2026-09-12T11:00:00.000Z" : "2026-09-28T11:00:00.000Z", highSalienceEvent: true, directness: "direct", quality: { status: "robust" }, exposureDays: 28, capabilities: [{ capabilityId: "custom.primary_result", value, comparisonValue, unit: "points", factualSummary }] });
}

function signalObservation(id, capabilityId, value, factualSummary, quality = "adequate", observedAt = null) {
  const date = id.includes("execution") ? "2026-09-16" : id.includes("estimate") || id.includes("down") ? "2026-09-14" : "2026-09-13";
  const timestamp = observedAt ?? `${date}T11:00:00.000Z`;
  return createEvidenceObservationV3({ observationId: id, sourceType: `canonical_${capabilityId.split(".")[0]}_observation`, displayLabel: capabilityId === "strategy.derived_estimate" ? "Energy estimate" : capabilityId === "performance.leading_signal" ? "Current performance" : "Current execution", observedAt: timestamp, evidenceWindow: { startDate: timestamp.slice(0, 10), endDate: timestamp.slice(0, 10) }, directness: "behavioral", quality: { status: quality, coverageRatio: 1 }, exposureDays: 1, capabilities: [{ capabilityId, value, factualSummary }] });
}

function predicate(path, operator, value) {
  return { version: "declarative_predicate_v1", path, operator, value };
}

function context(at, type) {
  return { type, evidenceWindow: { startDate: at.slice(0, 10), endDate: at.slice(0, 10) }, evidenceCutoff: at, evaluatedAt: at };
}
