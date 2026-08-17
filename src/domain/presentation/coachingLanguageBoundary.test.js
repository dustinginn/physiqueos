import { describe, expect, it } from "vitest";
import {
  expectNoGovernanceLanguageLeak,
  findGovernanceLanguageLeaks,
} from "./coachingLanguageBoundary";
import { createPINarrativeAssessment } from "../services/PINarrativeAssessmentService";
import { composePhaseAwareActiveGoalPreview } from "../services/PhaseAwareActiveGoalPreviewService";
import { evaluateGoalAwarePhaseReview } from "../services/GoalAwarePhaseReviewRecommendationService";
import { composeOperatingPlanStrategyDetail } from "../services/OperatingPlanStrategyDetailService";

// Generic, non-Founder-specific coverage of the coaching-language boundary: PI may reason
// internally about evidence sufficiency, uncertainty, information value, delay cost, Phase
// Review, authorization, and cadence — but none of that architecture narration may reach
// user-facing coaching copy, for ANY goal/phase/user, not just the Founder's current
// Build Lean Mass -> Lean Mass Build transition. Every fixture below deliberately uses
// different names/numbers than production to prove the guard is reusable.

describe("coachingLanguageBoundary helper", () => {
  it("flags known governance phrasing and passes natural coaching copy", () => {
    expect(findGovernanceLanguageLeaks("The remaining uncertainty was sufficiently bounded to proceed."))
      .not.toEqual([]);
    expect(findGovernanceLanguageLeaks("PI recommended review, and the user authorized the change."))
      .not.toEqual([]);
    expect(findGovernanceLanguageLeaks("Training kept moving forward, and there was enough to work with."))
      .toEqual([]);
    expect(() => expectNoGovernanceLanguageLeak(["cost of delay is high"])).toThrow();
  });
});

describe("Prospective Intelligence — coaching voice holds for an arbitrary future goal/phase transition", () => {
  const observations = [
    { id: "t1", domain: "training", status: "improving", subject: { type: "training_category", id: "legs" } },
    { id: "t2", domain: "training", status: "improving", subject: { type: "training_category", id: "arms" } },
    { id: "t3", domain: "training", status: "plateauing", subject: { type: "training_category", id: "shoulders" } },
    { id: "e1", domain: "energy", kind: "energy_balance", explanationData: { currentAverage: -260 } },
    { id: "w1", domain: "weight", direction: "declining", explanationData: { absoluteChange: -2.1 } },
  ];
  const phaseBoundary = { phaseName: "Recomposition Phase", strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" };
  const input = { observations, goal: { id: "goal-arbitrary", type: "fat_loss" },
    phase: { id: "phase-arbitrary", type: "establish_maintenance" }, operatingState: "calibration" };

  it("keeps the weekly narrative assessment free of governance language for a different goal/phase name", () => {
    const result = createPINarrativeAssessment({ ...input, phaseBoundary,
      bodyComposition: { measuredAt: "2027-03-04" } });
    expectNoGovernanceLanguageLeak([
      result.overallConclusion.summary,
      ...result.domainConclusions.flatMap((item) => [item.headline, item.explanation]),
      result.bodyCompositionConclusion?.explanation,
      result.coachTake.biggestTakeaway,
      result.coachTake.recommendation,
      ...result.coachTake.actions,
    ]);
    expect(result.coachTake.recommendation).toMatch(/Recomposition Phase/);
  });

  it("keeps the active-goal-preview phase transition and strategy summary free of governance language for an arbitrary goal", () => {
    const goal = {
      id: "goal-recomp", userId: "u2", title: "Recomposition Journey", type: "build_lean_mass",
      status: "active", primary: true,
      target: { type: "numeric_change", metric: "lean_mass", amount: 6, unit: "lb", description: "Add 6 lb of lean mass", targetDate: "2027-06-01" },
      timeline: { startDate: "2027-01-05", targetDate: "2027-06-01" },
      guardrails: [{ text: "Maintain approximately 10–12% body fat.", accepted: true }],
      currentPhaseId: "phase-b",
      phases: [
        { id: "phase-a", name: "Reset Baseline", status: "completed", order: 0, timingMode: "fixed_duration", startDate: "2027-01-05", duration: { value: 3, unit: "weeks" } },
        { id: "phase-b", name: "Recomposition Phase", status: "active", order: 1, timingMode: "target_date", targetDate: "2027-06-01", startDate: "2027-03-04", startedAt: "2027-03-04", strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" },
      ],
    };
    const dexaScans = [
      { measuredAt: "2027-01-03", bodyFatPercentage: 13.4, leanMass: { value: 130, unit: "lb" }, fatMass: { value: 20.2, unit: "lb" }, totalMass: { value: 150.2, unit: "lb" } },
      { measuredAt: "2027-03-04", bodyFatPercentage: 11.9, leanMass: { value: 131.5, unit: "lb" }, fatMass: { value: 17.8, unit: "lb" }, totalMass: { value: 149.3, unit: "lb" } },
    ];
    const protocols = [{ id: "energy-recomp", effectiveStrategy: { phaseId: "phase-b",
      caloricIntakeTarget: { value: 2200, unit: "kcal/day" }, activityExpenditureTarget: { value: 600, unit: "kcal/day" }, monitoringCadence: "weekly" } }];
    const result = composePhaseAwareActiveGoalPreview({ user: { timeZone: "America/Los_Angeles" },
      goal, dexaScans, protocols, currentDate: new Date("2027-03-10T12:00:00Z") });
    const transition = result.turningPoints.find((item) => item.date === "2027-03-04");
    expect(transition).toBeDefined();
    const energy = result.strategy.find((item) => item.label === "Energy");
    expectNoGovernanceLanguageLeak([transition.body, energy.summary, ...result.readiness,
      result.currentPhase.readiness]);
    expect(transition.body).toMatch(/Recomposition Phase began/);
    expect(energy.summary).toMatch(/adjusted as the evidence supports it/);
  });

  it("keeps the Phase Review recommendation explanation free of governance language across every branch", () => {
    const branches = [
      { begin: true, evidenceConclusion: "conclusively_satisfied", delayCost: "unknown", valueOfInformation: "low", deviation: "none", stable: true, extensionDays: 14 },
      { hasNextPhase: true, guardrailDeviationMagnitude: "slight", evidenceTrend: "stable", forecastSafetyRisk: "none",
        phaseEvidenceConclusion: "unresolved", uncertainty: "bounded", extensionDays: 10, remainingGoalDays: 40,
        nextPhaseMonitorable: true, nextPhaseAdjustable: true, nextPhaseId: "phase-next" },
      { hasNextPhase: false, guardrailDeviationMagnitude: "none", evidenceTrend: "unstable",
        phaseEvidenceConclusion: "unresolved", uncertainty: "low", extensionDays: 14, remainingGoalDays: 120 },
      { hasNextPhase: false, guardrailDeviationMagnitude: "none", evidenceTrend: "favorable",
        phaseEvidenceConclusion: "unresolved", uncertainty: "low", extensionDays: 5, remainingGoalDays: 200 },
    ];
    for (const input of branches) {
      const result = evaluateGoalAwarePhaseReview(input);
      expectNoGovernanceLanguageLeak([result.explanation]);
    }
  });

  it("keeps the Operating Plan Energy strategy detail free of governance language for an arbitrary strategy", () => {
    const detail = composeOperatingPlanStrategyDetail({
      goals: [{ id: "goal-recomp", title: "Recomposition Journey", phases: [], currentPhaseId: "phase-b" }],
      strategyType: "energy",
      protocol: { id: "p", currentGoalIds: ["goal-recomp"], effectiveStrategy: {
        mode: "Phase Execution", caloricIntakeTarget: { value: 2200, unit: "kcal/day" },
        activityExpenditureTarget: { value: 600, unit: "kcal/day" }, monitoringCadence: "weekly",
        strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" } },
      version: { id: "v1", effectiveAt: "2027-03-04" },
    });
    expectNoGovernanceLanguageLeak([detail.purpose, ...detail.sections.map((item) => item.value)]);
  });
});
