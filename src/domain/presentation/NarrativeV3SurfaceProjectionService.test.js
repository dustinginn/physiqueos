import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { runConfidenceNarrativeV3 } from
  "../intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
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
      result,
      priority: proteinPriority(),
    });
    expect(preview).toMatchObject({
      activeGoal: { density: NARRATIVE_V3_DENSITY.MEDIUM,
        status: "In progress · 58% complete" },
      priority: { density: NARRATIVE_V3_DENSITY.ONE_LINE,
        name: "Protein Goal" },
      operatingPlanTraining: { density: NARRATIVE_V3_DENSITY.SHORT },
      operatingPlanEnergy: { density: NARRATIVE_V3_DENSITY.SHORT },
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
      goalContract, result, priority: proteinPriority(),
    }).priority;
    expect(priority.factualInstruction).toBe("Hit today's protein target.");
    expect(priority.goalRelativeCoaching)
      .toBe("Consistent protein supports the training and recovery behind the current lean mass progress.");
    expect(priority.goalRelativeCoaching.match(/[.!?]/gu)).toHaveLength(1);
    expect(priority.goalRelativeCoaching.split(/\s+/u).length).toBeLessThan(20);
  });

  it("keeps Operating Plan rationales concise, specific and free of engine jargon", () => {
    const { goalContract, result } = currentResult();
    const preview = createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract, result, priority: proteinPriority(),
    });
    expect(preview.operatingPlanTraining.rationale)
      .toMatch(/ISO-Lateral High Rows.*120 lb.*comparable performance/isu);
    expect(preview.operatingPlanEnergy.rationale)
      .toMatch(/numbers look lower than expected on paper.*lean mass progress.*do not support changing intake/isu);
    const copy = JSON.stringify(preview);
    expect(copy).not.toMatch(/paired.?day|estimate-vs-outcome|support index|evidence authority|persistence state|Apple Watch|nutrition logging/iu);
    for (const surface of [preview.operatingPlanTraining,
      preview.operatingPlanEnergy]) {
      expect(surface.rationale.split(/\s+/u).length).toBeLessThan(55);
    }
  });

  it("does not change Confidence or canonical interpretation", () => {
    const { goalContract, result } = currentResult();
    const before = JSON.stringify(result);
    createNarrativeV3CrossSurfaceShadowPreviews({
      goalContract, result, priority: proteinPriority(),
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

function proteinPriority() {
  return {
    id: "protein-goal",
    name: "Protein Goal",
    factualInstruction: "Hit today's protein target",
    strategicCapability: "nutrition.protein_execution",
  };
}
