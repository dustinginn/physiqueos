import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createEvidenceObservationV3 } from "./EvidenceObservationV3.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import {
  createAugustPhaseTransitionRegressionFixtures,
  createPairedCalibrationFixtures,
} from "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";

describe("Confidence + Narrative V3 paired calibration", () => {
  it("regenerates the paired Goal-completion outlook while preserving strategic continuity", () => {
    const fixtures = createPairedCalibrationFixtures();
    const event = runConfidenceNarrativeV3(fixtures.dexa);
    const weekly = runConfidenceNarrativeV3({
      ...fixtures.weekly,
      priorInterpretation: event.strategicInterpretation,
      priorCoachingState: event.coachingState,
      priorConfidence: event.confidence,
      priorNarrativePlan: event.narrativePlan,
    });

    expect(event.publication).toEqual({
      mode: "calibration_only",
      persistenceWrites: 0,
      artifactWrites: 0,
      clientWiring: false,
    });
    expect(event.strategicInterpretation.goalAchievement).toBe("in_progress");
    expect(event.strategicInterpretation.strategyEffectiveness).toMatchObject({
      feasibility: "demonstrated",
      persistence: "emerging",
    });
    expect(event.confidence).toMatchObject({ priorPercentage: 62, currentPercentage: 79, movement: "increase", primaryDimension: "goal_completion" });
    expect(event.strategicInterpretation.recommendation).toMatchObject({ action: "continue_current_strategy", reason: "strategy_supported" });

    expect(weekly.strategicInterpretation.predecessorInterpretationId).toBe(event.strategicInterpretation.id);
    expect(weekly.strategicInterpretation.objectiveFindings[0]).toMatchObject({
      state: "progressed",
      freshness: "carried_forward",
      changedThisEvaluation: false,
    });
    expect(weekly.strategicInterpretation.strategyEffectiveness).toMatchObject({
      feasibility: "demonstrated",
      persistence: "emerging",
      revisionChanged: false,
      continuity: {
        inherited: true,
        reason: "prior_strategy_state_retained",
        currentDemonstration: false,
      },
    });
    expect(weekly.strategicInterpretation.nextCoachingQuestion).toMatchObject({
      questionId: "question_build_strategy_persistence",
      evidencePurpose: "confirm_persistence",
      status: "open",
    });
    expect(weekly.coachingState.questions.find((item) => item.questionId === "question_build_strategy_feasibility")).toMatchObject({
      status: "answered",
      answerCode: "build_strategy_feasibility_demonstrated",
    });
    expect(weekly.strategicInterpretation.questionTransitions).toEqual([]);
    expect(weekly.confidence).toMatchObject({ priorPercentage: 79, currentPercentage: 79, movement: "no_meaningful_change" });
    expect(weekly.strategicInterpretation.uncertaintyProfile).not.toContainEqual(expect.objectContaining({ type: "strategy_feasibility" }));
    expect(weekly.strategicInterpretation.biggestTakeaway).toMatchObject({
      type: "strategy_continuity",
      reason: "prior_strategy_state_retained",
    });
    expect(weekly.narrativePlan.continuityPolicy.mode).toBe("recent_event_followup");
    expect(weekly.narrativePlan.composition.finalNarrative).toContain("Nothing here calls for a change");
    expect(weekly.narrativePlan.composition.sections.meaning).toBeNull();
    expect(weekly.narrativePlan.composition.finalNarrative).not.toContain("5.0 lb");
  });

  it("retains the August phase-transition pair as a regression fixture", () => {
    const fixtures = createAugustPhaseTransitionRegressionFixtures();
    const event = runConfidenceNarrativeV3(fixtures.dexa);
    const weekly = runConfidenceNarrativeV3({
      ...fixtures.weekly,
      priorInterpretation: event.strategicInterpretation,
      priorCoachingState: event.coachingState,
      priorConfidence: event.confidence,
    });

    expect(event.strategicInterpretation.recommendation).toMatchObject({ action: "transition_phase" });
    expect(weekly.strategicInterpretation.strategyEffectiveness).toMatchObject({
      feasibility: "testing",
      revisionChanged: true,
      priorStrategyState: { interpretationId: event.strategicInterpretation.id },
    });
  });

  it("does not use publisher identity to determine Confidence movement", () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const event = runConfidenceNarrativeV3({ ...fixture, surface: "event_briefing" });
    const cadence = runConfidenceNarrativeV3({ ...fixture, surface: "weekly_briefing" });
    expect(cadence.confidence.currentPercentage).toBe(event.confidence.currentPercentage);
    expect(cadence.confidence.contributions).toEqual(event.confidence.contributions);
  });
});

describe("Goal-generic V3 foundation", () => {
  it("treats stable range maintenance as achieved without manufacturing a guardrail", () => {
    const contract = genericContract({
      capability: "custom.readiness_index",
      displayName: "Readiness index",
      evaluation: {
        mode: "maintain_range",
        targetRange: { min: 80, max: 90 },
        meaningfulChangeThreshold: 2,
        successCriteria: [predicate("current", "between", { min: 80, max: 90 })],
      },
    });
    const result = runConfidenceNarrativeV3({
      goalContract: contract,
      observations: [observation("custom.readiness_index", 85, 85)],
      priorConfidence: { id: "prior", currentPercentage: 60 },
      evaluationContext: context(),
      surface: "calibration",
    });
    expect(result.strategicInterpretation.objectiveFindings[0].state).toBe("stable_success");
    expect(result.strategicInterpretation.goalAchievement).toBe("achieved");
    expect(result.strategicInterpretation.guardrailFindings).toEqual([]);
    expect(result.narrativePlan.composition.finalNarrative).not.toMatch(/guardrail/i);
  });

  it("accepts direct performance evidence as decisive without composition evidence", () => {
    const contract = genericContract({
      capability: "performance.max_force",
      displayName: "Maximum force",
      evaluation: {
        mode: "increase",
        baselineValue: 100,
        meaningfulChangeThreshold: 5,
        significanceBands: [{ significance: "meaningful", minimumAbsoluteChange: 5 }],
        successCriteria: [predicate("change", "gte", { value: 20 })],
      },
    });
    const result = runConfidenceNarrativeV3({
      goalContract: contract,
      observations: [observation("performance.max_force", 110, 100)],
      priorConfidence: { id: "prior", currentPercentage: 55 },
      evaluationContext: context(),
      surface: "calibration",
    });
    expect(result.strategicInterpretation.objectiveFindings[0]).toMatchObject({ state: "progressed", authority: "decisive" });
    expect(result.strategicInterpretation.strategyEffectiveness.feasibility).toBe("demonstrated");
  });

  it("challenges an inherited demonstrated state only when authoritative contradictory evidence arrives", () => {
    const contract = genericContract({
      capability: "performance.max_force",
      displayName: "Maximum force",
      evaluation: {
        mode: "increase",
        baselineValue: 100,
        meaningfulChangeThreshold: 5,
        significanceBands: [{ significance: "meaningful", minimumAbsoluteChange: 5 }],
        successCriteria: [predicate("change", "gte", { value: 20 })],
      },
    });
    const first = runConfidenceNarrativeV3({
      goalContract: contract,
      observations: [observation("performance.max_force", 110, 100, "observation_progress")],
      priorConfidence: { id: "prior", currentPercentage: 55 },
      evaluationContext: context(),
      surface: "calibration",
    });
    const contradiction = runConfidenceNarrativeV3({
      goalContract: contract,
      observations: [observation("performance.max_force", 90, 100, "observation_regression")],
      priorInterpretation: first.strategicInterpretation,
      priorCoachingState: first.coachingState,
      priorConfidence: first.confidence,
      evaluationContext: { ...context(), evaluatedAt: "2026-02-03T00:00:00.000Z" },
      surface: "calibration",
    });
    expect(contradiction.strategicInterpretation.strategyEffectiveness).toMatchObject({
      feasibility: "challenged",
      persistence: "disrupted",
      continuity: { challengedByAuthoritativeEvidence: true, inherited: false },
    });
    expect(contradiction.strategicInterpretation.recommendation.action).toBe("review_strategy");
  });

  it("allows only versioned declarative predicates for custom evaluation", () => {
    expect(() => genericContract({
      capability: "future.metric",
      displayName: "Future metric",
      evaluation: { mode: "custom_declarative", predicate: { version: "arbitrary_code_v1", path: "current", operator: "gte", value: 1 } },
    })).toThrow(/only supports declarative_predicate_v1/);
  });

  it("keeps current Goal and evidence names out of the generic core", () => {
    const directory = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
    const source = fs.readdirSync(directory)
      .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
      .map((name) => fs.readFileSync(path.join(directory, name), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/build_lean_mass|visible_abs|founder|dexa|body_composition/i);
  });

  it("keeps strategic support semantics out of Evidence Observation adapters", () => {
    const fixtureSource = fs.readFileSync(new URL("../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js", import.meta.url), "utf8");
    expect(fixtureSource).not.toMatch(/metadata:\s*\{\s*signal:/);
    expect(fixtureSource).toContain("supportsWhen: predicate");
  });
});

function genericContract({ capability, displayName, evaluation }) {
  const [namespace, ...key] = capability.split(".");
  return createGoalContractV3({
    goalId: "goal_generic",
    contractVersion: "generic_test_v1",
    goalLabel: "Configured Goal",
    phase: { phaseId: "phase_generic", label: "Configured phase", transitionCriteria: [] },
    strategy: {
      strategyRevisionId: "strategy_generic_v1",
      label: "the configured strategy",
      adequateExposure: { minimumDays: 1 },
      feasibilityCriteria: [{ source: "objective", subjectId: "objective_generic", acceptedStates: ["progressed", "stable_success", "satisfied"], minimumAuthority: "decisive", minimumSignificance: "none" }],
    },
    objectives: [{
      objectiveId: "objective_generic",
      priority: "primary",
      metricCapability: { namespace, key: key.join("."), displayName, valueKind: "scalar", canonicalUnit: "unit" },
      evaluation,
    }],
    guardrails: [],
    strategicQuestions: [],
    evidencePolicies: [{
      policyId: "policy_generic",
      subjectType: "objective",
      subjectId: "objective_generic",
      capabilityPattern: capability,
      role: "decisive",
      minimumQuality: "robust",
      usableFor: ["objective", "feasibility"],
    }],
    objectiveDecisionPolicy: { mode: "all_required" },
  });
}

function observation(capability, value, comparisonValue, observationId = "observation_generic") {
  return createEvidenceObservationV3({
    observationId,
    sourceType: "future_adapter",
    observedAt: "2026-01-02T00:00:00.000Z",
    directness: "direct",
    quality: { status: "robust" },
    exposureDays: 7,
    capabilities: [{ capabilityId: capability, value, comparisonValue, unit: "unit" }],
  });
}

function context() {
  return {
    type: "test",
    evidenceWindow: { startDate: "2026-01-01", endDate: "2026-01-02" },
    evidenceCutoff: "2026-01-02T23:59:59.999Z",
    evaluatedAt: "2026-01-03T00:00:00.000Z",
  };
}

function predicate(path, operator, values) {
  return { version: "declarative_predicate_v1", path, operator, ...values };
}
