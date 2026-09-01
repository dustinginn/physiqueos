import { describe, expect, it } from "vitest";
import { createGoalConfidenceRepository } from
  "../../data/repositories/GoalConfidenceRepository";
import { createInterpretationV2Fixture } from
  "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from
  "../confidence/BriefingForecastFinalizer";
import { resolveMonthlyGoalConfidenceAssessment } from
  "./MonthlyBriefingPreviewService";

describe("Monthly canonical Confidence selection", () => {
  it("selects the latest eligible V2 assessment through the shared canonical reader", async () => {
    const { repository, v2, goal } = await mixedHistory();

    const selected = resolveMonthlyGoalConfidenceAssessment({
      activeGoal: goal,
      cutoff: "2026-09-01T06:59:59.999Z",
      generatedAt: "2026-09-01T07:04:00.000Z",
      repository,
    });

    expect(selected).toMatchObject({
      assessmentId: v2.id,
      score: v2.currentPercentage,
      priorScore: v2.priorPercentage,
      evidenceCutoff: v2.sourceCutoff,
      source: "canonical_confidence_v2_snapshot",
      historyRecordId: "history-v2",
      selectionSource: "canonical_confidence_v2_history_at_or_before",
      temporalCutoff: "2026-09-01T06:59:59.999Z",
    });
  });

  it("preserves eligible V1 compatibility and fails closed for malformed records", async () => {
    const { repository, v1, goal } = await mixedHistory();

    const selected = resolveMonthlyGoalConfidenceAssessment({
      activeGoal: goal,
      cutoff: "2026-08-16T23:59:59.999Z",
      generatedAt: "2026-08-17T07:04:00.000Z",
      repository,
    });

    expect(selected).toMatchObject({
      assessmentId: v1.id,
      score: 55,
      source: "canonical_pi_snapshot",
      historyRecordId: "history-v1",
      selectionSource: "canonical_pi_history_at_or_before",
    });
  });
});

async function mixedHistory() {
  const v1 = previousV1();
  const v2 = (await createBriefingForecastFinalizer({
    now: () => new Date("2026-08-30T17:29:43.278Z"),
  }).finalize(v2Request(v1))).confidenceAssessment;
  const goal = {
    id: v2.goalId,
    title: "Visible Abs",
    status: "active",
    primary: true,
    timeline: { startDate: "2026-08-15", targetDate: "2026-12-31" },
    phases: [{ id: v2.phaseId, name: "Active phase", status: "active",
      startDate: "2026-08-15" }],
  };
  const repository = createGoalConfidenceRepository({ history: [
    { id: "history-v1", assessmentId: v1.id, goalId: v1.goalId,
      phaseId: v1.phaseId, persistedAt: v1.provenance.generatedAt,
      assessment: v1 },
    { id: "history-v2", assessmentId: v2.id, goalId: v2.goalId,
      phaseId: v2.phaseId, persistedAt: v2.publicationTimestamp,
      assessment: v2 },
    { id: "history-malformed", assessmentId: "malformed", goalId: v2.goalId,
      phaseId: v2.phaseId, persistedAt: "2026-08-31T12:00:00.000Z",
      assessment: { schemaVersion: "unsupported", id: "malformed",
        goalId: v2.goalId, phaseId: v2.phaseId,
        sourceCutoff: "2026-08-31T00:00:00.000Z" } },
  ] });
  return { repository, v1, v2, goal };
}

function v2Request(previous) {
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = { startDate: "2026-08-15",
    targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "active-phase" } };
  return {
    publisherType: "weekly_briefing",
    userId: "user-founder-001",
    occurrenceId: "weekly_briefing_2026-08-23_2026-08-29",
    artifactId: "weekly_briefing_2026-08-23_2026-08-29",
    cadenceOrEventType: "weekly",
    goalContract: input.goalContract,
    phaseId: "active-phase",
    strategyContext: input.strategyHypothesis,
    executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: previous,
    evidenceWindow: { id: "weekly:2026-08-23:2026-08-29",
      start: "2026-08-23T00:00:00.000Z",
      cutoff: "2026-08-29T23:59:59.999Z", closed: true },
    publicationCutoff: "2026-08-29T23:59:59.999Z",
    finalizedAt: "2026-08-30T17:29:43.278Z",
    idempotencyKey: "weekly-aug29",
    expectedPriorAssessmentId: previous.id,
    elapsedTimeAdequacy: "adequate",
    composeArtifact: () => ({ artifact: {
      id: "weekly_briefing_2026-08-23_2026-08-29",
      cadence: "weekly", briefing: {},
    } }),
  };
}

function previousV1() {
  return {
    schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-v1",
    goalId: "goal_build_muscle",
    phaseId: "active-phase",
    operatingState: "calibration",
    evidenceCutoff: "2026-08-15T23:59:59.999Z",
    score: { current: 55, prior: 52, band: "developing",
      movement: { direction: "increased", magnitude: "small" } },
    contributors: [],
    unresolvedUncertainty: [],
    primaryReason: "Legacy canonical context.",
    provenance: { generatedAt: "2026-08-16T12:00:00.000Z" },
  };
}
