import { describe, expect, it } from "vitest";

import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createSeptemberMonthlyV3StressTestFixture } from
  "../../fixtures/septemberMonthlyV3StressTestFixture.js";
import { runConfidenceNarrativeV3 } from
  "../intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
import { adaptLatestCanonicalCadenceObservationsV3 } from
  "../intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { composeOperatingPlanStrategyDetail } from
  "../services/OperatingPlanStrategyDetailService.js";
import { createMonthlyEvidenceIntelligenceV3 } from
  "../intelligence/v3/MonthlyEvidenceIntelligenceV3.js";
import {
  BRIEFING_V3_DENSITY_CONTRACTS,
  createNarrativeV3CrossSurfaceShadowPreviews,
  createNarrativeV3RemainingSurfaceShadowPreviews,
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

describe("Narrative V3 remaining surface shadow projections", () => {
  it("projects a selective FULL Monthly synthesis from canonical V3 state", () => {
    const { goalContract, result } = currentResult();
    const preview = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    });
    expect(preview.monthly).toMatchObject({
      density: NARRATIVE_V3_DENSITY.FULL,
      cadence: { calendarDay: 1, recurringPrecedence: true },
      hero: {
        goal: "Lean Mass Build",
        confidence: { score: 79, delta: 0, movementDirection: "held",
          primaryReason: expect.stringContaining("Confidence holds") },
      },
    });
    expect(preview.monthly.hero.title).toContain("58% of the Goal");
    expect(preview.monthly.hero.highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Goal progress", value: "5.8 of 10 lb" }),
      expect.objectContaining({ label: "Guardrail", value: "8.1% body fat",
        detail: "Inside the 8–9% range" }),
    ]));
    expect(preview.monthly.training.title)
      .toBe("Iso-lateral high rows reached 120 lb, up from the previous best of 100 lb.");
    expect(preview.monthly.training.summary)
      .toBe("Iso-Lateral High Rows moved from 100 to 120 lb across the latest comparable exposures.");
    expect(preview.monthly.energy).toBeNull();
    expect(preview.monthly.changes.themes).toHaveLength(2);
    expect(preview.monthly.monthAhead.guidance).toHaveLength(4);
    expect(preview.monthly.monthAhead.guidance[1].value)
      .toBe("Keep body fat inside the 8–9% guardrail.");
    expect(new Set([
      preview.monthly.training.title,
      preview.monthly.training.summary,
      preview.monthly.changes.themes[1].title,
      preview.monthly.monthAhead.coachTake,
    ]).size).toBe(4);
  });

  it("projects the bounded September cross-source stress test without changing Confidence", () => {
    const { goalContract, result } = currentResult();
    const intelligence = createMonthlyEvidenceIntelligenceV3(
      createSeptemberMonthlyV3StressTestFixture());
    const before = JSON.stringify(result);
    const monthly = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result, monthlyIntelligence: intelligence,
    }).monthly;
    expect(monthly).toMatchObject({
      density: NARRATIVE_V3_DENSITY.FULL,
      hero: { confidence: { score: 79, delta: 0,
        evidenceCutoff: "2026-09-18T17:20:06.000Z" } },
    });
    expect(monthly.hero.highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Goal progress", value: "5.8 of 10 lb" }),
      expect.objectContaining({ label: "Guardrail", value: "8.1% body fat",
        detail: "Inside the 8–9% range" }),
    ]));
    expect(monthly.training.title).toContain("Leg press set a new session-volume best");
    expect(monthly.training.summary).toContain("Pull-ups set a new session-volume best");
    expect(monthly.training.interpretation).toContain("strong month of training");
    expect(monthly.energy.title).toBe("Energy was a little hard to read this month.");
    expect(monthly.energy.summary).toContain("higher early in the month");
    expect(monthly.energy.summary).not.toMatch(/paired|derived estimate|calibration|wearable/iu);
    expect(monthly.changes.themes.map((item) => item.label))
      .toEqual(["Goal progress", "Training", "Nutrition and Energy"]);
    expect(monthly.changes.themes[1].body).toContain("Arms got extra work");
    expect(monthly.changes.themes[1].body).toContain("Back and Core did not appear");
    expect(monthly.changes.themes[1].body).toContain("3-day pause");
    const copy = JSON.stringify(monthly);
    expect(copy).not.toMatch(/paired evidence|operating evidence|estimate-vs-outcome|predictive calibration|measurement uncertainty|support index|evidence authority|persistence state|without proving|productive training environment|not a substitute|override the outcomes/iu);
    expect(intelligence.sourceMatrix.filter((item) =>
      item.narrativeConsequence !== "omit").length).toBeGreaterThan(4);
    expect(monthly.changes.themes).toHaveLength(3);
    expect(copy.match(/Leg press set a new session-volume best/gu)).toHaveLength(1);
    expect(copy.match(/5\.8 of 10 lb/gu)).toHaveLength(1);
    expect(copy.match(/58% complete/gu)).toHaveLength(1);
    expect(copy.match(/5\.0 lb of lean mass/gu)).toHaveLength(1);
    expect(copy.match(/79%/gu)).toHaveLength(1);
    expect(copy.match(/3-day pause/gu)).toHaveLength(1);
    expect(copy.match(/next DEXA/gu)).toHaveLength(1);
    expect(monthly.monthAhead.guidance.map((item) => item.label))
      .toEqual(["Continue", "Watch", "Next"]);
    expect(monthly.monthAhead.improvement).toBeNull();
    expect(monthly.monthAhead.coachTake).not.toContain("Leg press set");
    expect(monthly.monthAhead.coachTake).not.toContain("5.0 lb");
    expect(result.confidence.currentPercentage).toBe(79);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("keeps non-Monthly decision-support projections unchanged during Monthly polish", () => {
    const { goalContract, result } = currentResult();
    const baseline = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    });
    const polished = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
      monthlyIntelligence: createMonthlyEvidenceIntelligenceV3(
        createSeptemberMonthlyV3StressTestFixture()),
    });
    expect(polished.phaseReview).toEqual(baseline.phaseReview);
    expect(polished.goalTransitionReview).toEqual(
      baseline.goalTransitionReview);
    expect(polished.photo).toEqual(baseline.photo);
    expect(polished.publication).toEqual(baseline.publication);
  });

  it("keeps Monthly broader than recurring check-ins without a domain laundry list", () => {
    const { goalContract, result } = currentResult();
    const monthly = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    }).monthly;
    expect(BRIEFING_V3_DENSITY_CONTRACTS.weekly.maximumRoutineDensity)
      .toBe(NARRATIVE_V3_DENSITY.MEDIUM);
    expect(monthly.density).toBe(NARRATIVE_V3_DENSITY.FULL);
    expect(monthly.changes.themes.map((item) => item.label))
      .toEqual(["Goal trajectory", "Training"]);
    const copy = JSON.stringify(monthly);
    expect(copy).not.toMatch(/paired.?day|direct result|operating evidence|estimate-vs-outcome|support index|evidence authority|persistence state/iu);
  });

  it("projects Phase Review as recommendation-only Founder decision support", () => {
    const { goalContract, result } = currentResult();
    const review = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    }).phaseReview;
    expect(review).toMatchObject({
      density: NARRATIVE_V3_DENSITY.MEDIUM,
      eyebrow: "Phase Review",
      recommendationLabel: "Continue Lean Mass Build",
      decisionOptions: [{ label: "Continue Lean Mass Build", recommended: true }],
    });
    expect(review.explanation).toContain("current phase is still doing its job");
    expect(review.unresolved).toContain("The next DEXA");
    expect(review.founderAuthority).toContain("Nothing changes until you choose");
    expect(review).not.toHaveProperty("command");
    expect(review).not.toHaveProperty("actionRequest");
  });

  it("keeps an in-progress Goal active and preserves Founder transition authority", () => {
    const { goalContract, result } = currentResult();
    const review = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    }).goalTransitionReview;
    expect(review).toMatchObject({
      density: NARRATIVE_V3_DENSITY.MEDIUM,
      eyebrow: "Goal Review",
      status: "In progress · 58% complete",
      recommendationLabel: "Keep the 10 lb lean-mass goal active",
      decisionOptions: [{ label: "Continue current Goal", recommended: true }],
    });
    expect(review.explanation).toContain("No Goal transition is warranted");
    expect(review.nextStructuralAction).toContain("Revisit transition when the Goal is achieved");
    expect(review.founderAuthority).toContain("does not complete, replace, or transition");
    expect(review).not.toHaveProperty("command");
    expect(review).not.toHaveProperty("actionRequest");
  });

  it("does not wire, publish, write, or alter Confidence while previewing", () => {
    const { goalContract, result } = currentResult();
    const before = JSON.stringify(result);
    const preview = createNarrativeV3RemainingSurfaceShadowPreviews({
      goalContract, result,
    });
    expect(preview).toMatchObject({
      goalHubPreviewNeeded: false,
      photo: { v3Plumbing: "PRESERVED",
        founderQualityAcceptance: "DEFERRED" },
      publication: { mode: "shadow_only", persistenceWrites: 0,
        artifactWrites: 0, clientWiring: false, structuralCommands: 0 },
    });
    expect(result.confidence).toMatchObject({ currentPercentage: 79, delta: 0,
      strategyConfidence: { percentage: 90 } });
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
  const goalContract = fixtures.weekly.goalContract;
  const evidenceWindow = { startDate: "2026-09-13", endDate: "2026-09-15",
    cutoff: "2026-09-16T06:59:59.999Z" };
  const assessmentId = "confidence_assessment_v2|midweek";
  const observations = adaptLatestCanonicalCadenceObservationsV3({
    goalContract,
    phase: { id: goalContract.phase.phaseId },
    cutoff: evidenceWindow.cutoff,
    store: {
      canonicalEvidenceObjects: [
        trainingSession("training_sep13", "2026-09-13", 90),
        trainingSession("training_sep14", "2026-09-14", 100),
        trainingSession("training_sep15", "2026-09-15", 120),
      ],
      goalConfidenceHistory: [{ assessmentId, assessment: { id: assessmentId,
        goalId: goalContract.goalId, phaseId: goalContract.phase.phaseId } }],
      dailyBriefings: [{
        id: "midweek_briefing_user_20260913_20260915",
        evidenceWindow,
        confidencePublication: { assessmentId },
        briefing: {
          activeGoal: { id: goalContract.goalId },
          activePhase: { id: goalContract.phase.phaseId },
          evidenceWindow,
          training: { performanceTrend: "improving", sessionsCompleted: 4,
            performanceHeadline: "This window produced measurable training progress",
            interpretation: "Current performance supports the productive environment." },
          energyBalance: { comparableDays: 2,
            estimatedAverageDailyBalance: -454.5,
            balanceDirection: "probably_below", reliability: "limited",
            warnings: ["Nutrition coverage is incomplete."] },
          weightContext: { observations: 3, averageWeight: 171.6,
            changeFromPriorComparable: 0.4 },
          evidenceCompleteness: {
            nutrition: { completeDays: 1, expectedDays: 3 },
            activity: { completeDays: 3, expectedDays: 3 },
            recovery: { completeDays: 0, expectedDays: 3 },
          },
        },
      }],
    },
  });
  const result = runConfidenceNarrativeV3({
    goalContract, observations,
    priorInterpretation: weekly.strategicInterpretation,
    priorCoachingState: weekly.coachingState,
    priorConfidence: weekly.confidence,
    priorNarrativePlan: weekly.narrativePlan,
    evaluationContext: { type: "closed_cadence_boundary", evidenceWindow,
      evidenceCutoff: evidenceWindow.cutoff,
      evaluatedAt: "2026-09-16T07:04:38.549Z" },
    surface: "midweek_briefing",
  });
  return { goalContract, result };
}

function trainingSession(id, date, load) {
  return {
    id, evidence_type: "training", observed_at: `${date}T18:00:00.000Z`,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{ exercise_id: "iso_lateral_high_row",
      name: "Iso-Lateral High Rows", category: "Back",
      sets: [
        { set_number: 1, reps: 10, weight: load, weight_unit: "lb" },
        { set_number: 2, reps: 10, weight: load, weight_unit: "lb" },
      ] }],
  };
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
