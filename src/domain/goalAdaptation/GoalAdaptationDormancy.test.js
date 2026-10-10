import { describe, expect, it } from "vitest";

import { runConfidenceNarrativeV3 } from "../intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { evaluateGoalAwarePhaseReview, deriveGoalAwarePhaseReviewInputs } from "../services/GoalAwarePhaseReviewRecommendationService.js";
import { derivePhaseReviewInputsFromV3 } from "./PhaseReviewTypedInputsV3.js";
import { evaluateStructuredGuardrail, structureV3Guardrail } from "./StructuredGuardrailV1.js";
import { FOUNDER_BODY_FAT_V3_GUARDRAIL, FOUNDER_GOAL, LEAN_MASS_BUILD_PHASE_START } from "./fixtures/founderLeanMassGolden.js";

describe("Goal Adaptation stays dormant in the V3 pipeline", () => {
  it("produces byte-identical V3 output when no shadow context is passed", () => {
    const fixtures = createPairedCalibrationFixtures();
    const baseline = runConfidenceNarrativeV3(fixtures.dexa);
    const again = runConfidenceNarrativeV3({ ...fixtures.dexa, goalAdaptationShadow: null });
    expect(JSON.stringify(again)).toBe(JSON.stringify(baseline));
    expect(baseline.goalAdaptationShadow).toBeUndefined();
  });

  it("returns the shadow beside the result without changing recommendation, confidence or id", () => {
    const fixtures = createPairedCalibrationFixtures();
    const baseline = runConfidenceNarrativeV3(fixtures.dexa);
    const shadowed = runConfidenceNarrativeV3({
      ...fixtures.dexa,
      goalAdaptationShadow: { goal: FOUNDER_GOAL, phaseStartDate: "2026-06-01", asOf: "2026-08-30", triggerFamily: "dexa_event_briefing", coverageSignals: {} },
    });
    expect(shadowed.id).toBe(baseline.id);
    expect(shadowed.strategicInterpretation).toEqual(baseline.strategicInterpretation);
    expect(shadowed.confidence).toEqual(baseline.confidence);
    expect(shadowed.narrativePlan).toEqual(baseline.narrativePlan);
    expect(shadowed.goalAdaptationShadow).toMatchObject({ mode: "shadow", persisted: false, policyVersion: "goal_adaptation_policy_v1" });
    expect(shadowed.goalAdaptationShadow.schedule.basis).toBe("elapsed_runway_measured_pace_unchanged");
  });
});

describe("Typed Phase Review inputs (no narrative regex)", () => {
  const guardrail = structureV3Guardrail(FOUNDER_BODY_FAT_V3_GUARDRAIL, { archetype: "lean_mass_gain" });
  const aug15Interpretation = {
    objectiveFindings: [{ state: "progressed" }],
    strategyEffectiveness: { feasibility: "testing", persistence: "not_assessed" },
    uncertaintyProfile: [{ type: "objective_measurement", materiality: "moderate" }],
    phaseTransitionReady: false,
  };
  const goal = { ...FOUNDER_GOAL, guardrails: [{ text: "Maintain approximately 8–9% body fat." }] };
  const phase = { id: "phase_1", startDate: "2026-07-19" };
  const nextPhase = { id: "phase_2" };

  it("reproduces the recorded Aug 15 decision (begin next phase) from typed fields", () => {
    const inputs = derivePhaseReviewInputsFromV3({ goal, phase, nextPhase, interpretation: aug15Interpretation, guardrail: evaluateStructuredGuardrail(guardrail, { value: 7.6 }), asOf: "2026-08-15" });
    expect(inputs).toMatchObject({ guardrailStatus: "below", guardrailDeviationMagnitude: "slight", evidenceTrend: "favorable", uncertainty: "bounded", remainingGoalDays: 77, inputSource: "typed_v3_fields" });
    expect(evaluateGoalAwarePhaseReview(inputs).recommendation).toBe("begin_next_phase");
  });

  it("is independent of briefing wording, unlike the legacy regex path", () => {
    const typed = derivePhaseReviewInputsFromV3({ goal, phase, nextPhase, interpretation: aug15Interpretation, guardrail: evaluateStructuredGuardrail(guardrail, { value: 7.6 }), asOf: "2026-08-15" });
    const reworded = (opening) => deriveGoalAwarePhaseReviewInputs({ goal, phase, nextPhase, asOf: "2026-08-15", canonicalScan: { bodyFatPercentage: 7.6 },
      artifact: { briefing: { dexaEventNarrative: { interpretation: { opening } } } } });
    expect(reworded("Lean tissue increased.").evidenceTrend).not.toBe(reworded("Your lean mass went up.").evidenceTrend);
    expect(derivePhaseReviewInputsFromV3({ goal, phase, nextPhase, interpretation: aug15Interpretation, guardrail: evaluateStructuredGuardrail(guardrail, { value: 7.6 }), asOf: "2026-08-15" })).toEqual(typed);
  });

  it("keeps phase dates on the goal-local calendar", () => {
    const inputs = derivePhaseReviewInputsFromV3({ goal, phase: { startDate: LEAN_MASS_BUILD_PHASE_START }, nextPhase: null, interpretation: aug15Interpretation, guardrail: null, asOf: "2026-10-09" });
    expect(inputs).toMatchObject({ phaseElapsedDays: 55, remainingGoalDays: 22, nextPhaseId: null, guardrailStatus: "unknown" });
  });
});
