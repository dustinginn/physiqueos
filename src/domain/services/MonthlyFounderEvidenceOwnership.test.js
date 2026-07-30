import { describe, expect, it, vi } from "vitest";
import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";
import { createPIGoalConfidenceContractFixture } from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import { composeMonthlyBriefingPresentation } from "./MonthlyBriefingPresentationService";
import { createMonthlyBriefingPreviewService } from "./MonthlyBriefingPreviewService";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";

const goal = {
  id: "real-build-goal",
  title: "Build Lean Mass",
  type: "build_lean_mass",
  status: "active",
  primary: true,
  timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
  phases: [{
    id: "real-build-phase",
    name: "Establish Maintenance",
    status: "active",
    operatingState: "calibration",
    startDate: "2026-07-20",
  }],
};
const dexa = {
  id: "dexa-real",
  measuredAt: "2026-07-18",
  restingMetabolicRate: { value: 1794 },
  bodyFatPercentage: { value: 7.7 },
  leanMass: { value: 147.5 },
  fatMass: { value: 12.8 },
};

function canonical(payload) {
  return {
    canonicalId: `canonical-${payload.id}`,
    quality: { status: "active" },
    payload: { removed: false, ...payload },
  };
}

function training(date, id, bodyRegion = "Upper Body") {
  return canonical({
    id,
    evidence_type: "training",
    observed_at: date,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{ id: `${id}-exercise`, name: "Exercise", body_region: bodyRegion }],
  });
}

function nutrition(date, calories) {
  return canonical({
    id: `nutrition-${date}`,
    evidence_type: "nutrition",
    observed_at: date,
    metadata: { date },
    daily_totals: { calories },
  });
}

function activity(date, calories) {
  return canonical({
    id: `activity-${date}`,
    evidence_type: "activity_day",
    observed_at: date,
    metadata: { date },
    daily_activity: { move_calories: calories, total_calories_burned: 9999 },
  });
}

function confidenceAssessment({
  evidenceCutoff,
  generatedAt,
  score,
  prior,
}) {
  return createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture("increased", {
      goalId: goal.id,
      phaseId: goal.phases[0].id,
      evidenceCutoff,
      generatedAt,
      score: {
        current: score,
        prior,
        movement: { direction: "increased", magnitude: "material" },
        priorScoreProvenance: { source: "controlled_reconciliation_seed" },
      },
    })
  );
}

function repositories(objects) {
  const writes = {
    createDailyBriefing: vi.fn(),
    updateGoal: vi.fn(),
    upsertCanonicalEvidenceObjects: vi.fn(),
  };
  return {
    repositories: {
      weights: { listWeightEntries: vi.fn(async () => [
        { id: "w-1", measuredAt: "2026-07-19", weight: { value: 166.5 } },
        { id: "w-2", measuredAt: "2026-07-21", weight: { value: 166.7 } },
      ]) },
      dexaScans: { listDEXAScans: vi.fn(async () => [dexa]) },
      progressPhotos: { listPhotos: vi.fn(async () => []) },
      dailyBriefings: { listDailyBriefings: vi.fn(async () => []) },
      goals: {
        listGoals: vi.fn(async () => [goal]),
        updateGoal: writes.updateGoal,
      },
      canonicalEvidence: {
        listCanonicalEvidenceObjects: vi.fn(async () => objects),
        upsertCanonicalEvidenceObjects: writes.upsertCanonicalEvidenceObjects,
      },
      trainingPerformanceEvents: {
        listTrainingPerformanceEvents: vi.fn(async () => [{
          id: "pr-1",
          workoutDate: "2026-07-21",
          sourceSessionId: "training-21",
        }]),
      },
      goalConfidence: createGoalConfidenceRepository({
        history: [
          {
            id: "history-future",
            goalId: goal.id,
            phaseId: goal.phases[0].id,
            assessmentId: "future",
            assessment: confidenceAssessment({
              evidenceCutoff: "2026-07-22T06:59:59.999Z",
              generatedAt: "2026-07-22T17:22:00.000Z",
              score: 60,
              prior: 58,
            }),
          },
          {
            id: "history-eligible",
            goalId: goal.id,
            phaseId: goal.phases[0].id,
            assessmentId: "eligible",
            assessment: confidenceAssessment({
              evidenceCutoff: "2026-07-21T06:59:59.999Z",
              generatedAt: "2026-07-21T17:22:00.000Z",
              score: 58,
              prior: 44,
            }),
          },
        ],
      }),
      operations: { createDailyBriefing: writes.createDailyBriefing },
    },
    writes,
  };
}

function orchestration() {
  return {
    ...monthlyPreviewFixtures.julyContinuation,
    observedCutoff: "2026-07-21",
    syntheticContinuation: {
      ...monthlyPreviewFixtures.julyContinuation.syntheticContinuation,
      syntheticDateRange: { startDate: "2026-07-21", endDate: "2026-07-22" },
      energyContinuations: [
        { id: "synthetic-overlap", date: "2026-07-21", estimatedIntake: 1, estimatedExpenditure: 2, balance: -1 },
        { id: "synthetic-future", date: "2026-07-22", estimatedIntake: 2400, estimatedExpenditure: 2500, balance: -100 },
      ],
      trainingObservations: [
        { id: "synthetic-training-overlap", date: "2026-07-21", movement: "fixture", direction: "improving" },
        { id: "synthetic-training-future", date: "2026-07-22", movement: "fixture", direction: "improving" },
      ],
      weights: [],
      dexaScans: [],
      progressPhotos: [],
      dailyBriefings: [],
    },
  };
}

describe("Monthly Founder evidence ownership", () => {
  it("uses the complete real goal window, keeps missing dates missing, and lets real evidence beat fixture overlap", async () => {
    const objects = [
      training("2026-07-19", "training-19", "Lower Body"),
      training("2026-07-21", "training-21", "Upper Body"),
      canonical({
        id: "nutrition-2026-07-19-partial",
        evidence_type: "nutrition",
        observed_at: "2026-07-19",
        metadata: { date: "2026-07-19" },
        daily_totals: { calories: 440 },
        quality: { limitations: ["Breakfast only"] },
      }),
      nutrition("2026-07-19", 2200),
      activity("2026-07-19", 800),
      nutrition("2026-07-21", 2300),
      activity("2026-07-21", 900),
    ];
    const context = repositories(objects);
    const result = await createMonthlyBriefingPreviewService(context).preview({
      userId: "founder",
      orchestration: orchestration(),
    });
    const evidence = result.evidenceFixture;
    const presentation = composeMonthlyBriefingPresentation({
      narrative: result,
      decision: result.editorialDecision,
      fixture: evidence,
    });

    expect(evidence.evidenceResolution).toMatchObject({
      goalId: "real-build-goal",
      authoredGoalStartDate: "2026-07-20",
      startDate: "2026-07-19",
      observedCutoff: "2026-07-21",
      trainingRecordCount: 2,
      trainingDates: ["2026-07-19", "2026-07-21"],
      nutritionRecordCount: 3,
      nutritionDates: ["2026-07-19", "2026-07-21"],
      activityRecordCount: 2,
      activityDates: ["2026-07-19", "2026-07-21"],
      completeEnergyDates: ["2026-07-19", "2026-07-21"],
    });
    expect(evidence.energyContinuations.map((record) => record.date)).toEqual([
      "2026-07-19",
      "2026-07-21",
    ]);
    expect(evidence.energyContinuations[0].estimatedIntake).toBe(2200);
    expect(evidence.syntheticContinuation.energyContinuations.map((record) => record.date)).toEqual([
      "2026-07-22",
    ]);
    expect(evidence.syntheticContinuation.trainingObservations.map((record) => record.date)).toEqual([
      "2026-07-22",
    ]);
    expect(presentation.training.stats.map((stat) => stat.label)).toEqual(["Pattern", "Context", "Next test"]);
    expect(result.goalConfidence).toMatchObject({
      score: 58,
      priorScore: 44,
      delta: 14,
      movementDirection: "increased",
      assessmentContext: {
        goalId: "real-build-goal",
        phaseId: "real-build-phase",
      },
      historyRecordId: "history-eligible",
      selectionSource: "canonical_pi_history_at_or_before",
      temporalCutoff: "2026-07-21T23:59:59.999Z",
    });
    expect(result.monthlyNarrative.confidence).toEqual(result.goalConfidence);
    expect(presentation.hero.confidence).toMatchObject({
      score: 58,
      band: "moderate",
      priorScore: 44,
      delta: 14,
      movementDirection: "increased",
      goalId: "real-build-goal",
      phaseId: "real-build-phase",
      source: "canonical_pi_snapshot",
    });
    expect(presentation.energy.summaryMetrics.map((metric) => metric.label)).not.toContain("Coverage");
    expect(presentation.energy.summary).toMatch(/^Your intake is moving closer/i);
    expect(presentation.energy.dailyWeeks.flatMap((week) => week.days)
      .find((day) => day.date === "2026-07-20")).toMatchObject({ missing: true, synthetic: false });
    expect(result.editorialDecision.candidates
      .find((candidate) => candidate.storyType === "training_evolution")
      .evidenceRefs.length).toBeGreaterThanOrEqual(2);
    expect(result.editorialDecision.synthetic.realEvidenceCutoff).toBe("2026-07-21");
    expect(context.writes.createDailyBriefing).not.toHaveBeenCalled();
    expect(context.writes.updateGoal).not.toHaveBeenCalled();
    expect(context.writes.upsertCanonicalEvidenceObjects).not.toHaveBeenCalled();
  });
});
