import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { runConfidenceNarrativeV3 } from
  "../intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
import { composeOperatingPlanStrategyDetail } from
  "../services/OperatingPlanStrategyDetailService.js";
import {
  BRIEFING_V3_DENSITY_CONTRACTS,
  createNarrativeV3CrossSurfaceShadowPreviews,
  NARRATIVE_V3_DENSITY,
} from "./NarrativeV3SurfaceProjectionService.js";

describe("Narrative V3 briefing density contracts", () => {
  it("keeps recurring density evidence-driven and preserves Event depth", () => {
    expect(BRIEFING_V3_DENSITY_CONTRACTS).toMatchObject({
      midweek: { defaultDensity: "SHORT", evidenceDriven: true,
        retellGoalStory: false, fillEmptySections: false },
      weekly: { defaultDensity: "SHORT", maximumRoutineDensity: "MEDIUM",
        replayRecentEvent: false, fillEmptySections: false },
      monthly: { defaultDensity: "MEDIUM", maximumDensity: "FULL",
        calendarDay: 1, recurringPrecedence: true },
      dexa_event: { defaultDensity: "FULL", eventMayDominate: true },
    });
  });

  it("preserves Photo V3 plumbing while explicitly deferring quality acceptance", () => {
    for (const contract of [BRIEFING_V3_DENSITY_CONTRACTS.photo_event,
      BRIEFING_V3_DENSITY_CONTRACTS.photo_briefing]) {
      expect(contract).toMatchObject({
        v3Plumbing: "PRESERVED",
        founderQualityAcceptance: "DEFERRED",
      });
    }
  });
});

describe("Narrative V3 cross-surface shadow projections", () => {
  it("projects distinct Server-authored densities without wiring or writing", () => {
    const { goalContract, result } = currentResult();
    const preview = createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract,
      operatingPlanDetails: operatingPlanDetails(),
      result,
      priority: proteinPriority(),
    });
    expect(preview).toMatchObject({
      activeGoal: { density: NARRATIVE_V3_DENSITY.MEDIUM,
        status: "In progress · 58% complete" },
      priority: { density: NARRATIVE_V3_DENSITY.ONE_LINE,
        name: "Protein Goal", ownership: "STATIC_GOAL_PHASE_PURPOSE",
        dynamicEvidenceReactive: false },
      operatingPlanTraining: { density: NARRATIVE_V3_DENSITY.SHORT,
        ownership: "STATIC_GOAL_PHASE_PURPOSE",
        dynamicEvidenceReactive: false },
      operatingPlanEnergy: { density: NARRATIVE_V3_DENSITY.SHORT,
        ownership: "STATIC_GOAL_PHASE_PURPOSE",
        dynamicEvidenceReactive: false },
      publication: { mode: "shadow_only", persistenceWrites: 0,
        artifactWrites: 0, clientWiring: false },
    });
    expect(preview.activeGoal.progress).toContain("5.8 of the 10 lb of lean mass");
    expect(preview.activeGoal.guardrail).toContain("8–9%");
    expect(preview.activeGoal.next).toContain("The next DEXA");
  });

  it("keeps Priority coaching to one Goal-relative line", () => {
    const { goalContract, result } = currentResult();
    const priority = createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract, operatingPlanDetails: operatingPlanDetails(), result,
      priority: proteinPriority(),
    }).priority;
    expect(priority.factualInstruction).toBe("Hit today's protein target.");
    expect(priority.goalRelativeCoaching)
      .toBe("Consistent protein supports the training and recovery behind the current lean mass goal.");
    expect(priority.goalRelativeCoaching.match(/[.!?]/gu)).toHaveLength(1);
    expect(priority.goalRelativeCoaching.split(/\s+/u).length).toBeLessThan(20);
  });

  it("uses canonical static Operating Plan purpose instead of live evidence coaching", () => {
    const { goalContract, result } = currentResult();
    const details = operatingPlanDetails();
    const preview = createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract, operatingPlanDetails: details, result,
      priority: proteinPriority(),
    });
    expect(preview.operatingPlanTraining.purpose).toBe(details.training.purpose);
    expect(preview.operatingPlanTraining.sections).toEqual(details.training.sections);
    expect(preview.operatingPlanEnergy.purpose).toBe(details.energy.purpose);
    expect(preview.operatingPlanEnergy.sections).toEqual(details.energy.sections);
    const copy = JSON.stringify(preview);
    expect(copy).not.toMatch(/ISO-Lateral|120 lb|numbers look lower than expected|paired.?day|estimate-vs-outcome|support index|evidence authority|persistence state|Apple Watch|nutrition logging/iu);
  });

  it("keeps Priority and Operating Plan purpose invariant when only evidence changes", () => {
    const { goalContract, result } = currentResult();
    const details = operatingPlanDetails();
    const input = { goalContract, operatingPlanDetails: details,
      priority: proteinPriority() };
    const first = createNarrativeV3CrossSurfaceShadowPreviews({
      ...input, result,
    });
    const changedEvidence = structuredClone(result);
    changedEvidence.strategicInterpretation.coachingObservationSelection.selected = [];
    changedEvidence.strategicInterpretation.crossDomainSynthesis.tensions = [];
    const second = createNarrativeV3CrossSurfaceShadowPreviews({
      ...input, result: changedEvidence,
    });
    expect(second.priority).toEqual(first.priority);
    expect(second.operatingPlanTraining).toEqual(first.operatingPlanTraining);
    expect(second.operatingPlanEnergy).toEqual(first.operatingPlanEnergy);
  });

  it("does not change Confidence or canonical interpretation", () => {
    const { goalContract, result } = currentResult();
    const before = JSON.stringify(result);
    createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract, operatingPlanDetails: operatingPlanDetails(), result,
      priority: proteinPriority(),
    });
    expect(result.confidence).toMatchObject({ currentPercentage: 79, delta: 0 });
    expect(JSON.stringify(result)).toBe(before);
  });
});

function currentResult() {
  const fixtures = createPairedCalibrationFixtures();
  const event = runConfidenceNarrativeV3(fixtures.dexa);
  const weekly = runConfidenceNarrativeV3({
    ...fixtures.weekly,
    priorInterpretation: event.strategicInterpretation,
    priorCoachingState: event.coachingState,
    priorConfidence: event.confidence,
    priorNarrativePlan: event.narrativePlan,
  });
  const result = structuredClone(weekly);
  const energySignal = result.strategicInterpretation.crossDomainSynthesis.signals
    .find((item) => item.semanticClass === "DERIVED_ESTIMATE");
  result.strategicInterpretation.crossDomainSynthesis.tensions = [{
    type: "ESTIMATE_VS_OUTCOME_TENSION",
    lowerAuthorityObservationIds: [energySignal.observationId],
  }];
  result.strategicInterpretation.coachingObservationSelection.selected = [{
    candidateId: "training|iso_lateral_high_row|load_milestone|120",
    subjectId: "iso_lateral_high_row",
    subjectLabel: "ISO-Lateral High Rows",
    domain: "training",
    type: "load_milestone",
    narrativeText: "ISO-Lateral High Rows reached a new load best at 120 lb.",
    topicKey: "training|iso_lateral_high_row",
    materialStateKey: "load|120",
    evidenceBasis: { currentValue: 120, previousValue: 100, unit: "lb" },
    recommendationCapability: { capable: false, mode: "observation_only",
      text: null },
  }];
  return { goalContract: fixtures.weekly.goalContract, result };
}

function operatingPlanDetails() {
  const goal = { id: "goal-build", title: "Build Lean Mass",
    currentPhaseId: "phase-build", phases: [
      { id: "phase-build", name: "Lean Mass Build", status: "active" },
    ] };
  const base = { id: "strategy", status: "active",
    currentGoalIds: [goal.id], activatedAt: "2026-08-15" };
  return {
    training: composeOperatingPlanStrategyDetail({ goals: [goal],
      strategyType: "training", protocol: { ...base,
        name: "Build Lean Mass Training" }, version: {
        effectiveAt: "2026-08-15", goalLinks: [{ goalId: goal.id }],
        trainingStrategy: { weeklyFrequencies: { back: 2, legs: 1 },
          physiquePriorities: ["back", "legs"],
          progression: { pace: "moderate" } },
      } }),
    energy: composeOperatingPlanStrategyDetail({ goals: [goal],
      strategyType: "energy", protocol: { ...base,
        effectiveStrategy: { mode: "Phase Execution",
          caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
          activityExpenditureTarget: { value: 800, unit: "kcal/day" },
          monitoringCadence: "weekly", strategicReviewCadence: "monthly",
          strategicReviewAnchor: "dexa_body_composition" } },
      version: { effectiveAt: "2026-08-15" } }),
  };
}

function proteinPriority() {
  return {
    id: "protein-goal",
    name: "Protein Goal",
    factualInstruction: "Hit today's protein target",
    strategicCapability: "nutrition.protein_execution",
  };
}
