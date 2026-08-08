import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from
  "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from
  "./CanonicalConfidenceReadService";

describe("mixed V1 and V2 canonical Confidence history", () => {
  it("reads the V2 pointer while preserving an earlier V1 artifact as incomplete", async () => {
    const v1 = previousV1();
    const v2 = (await createBriefingForecastFinalizer({
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    }).finalize(request(v1))).confidenceAssessment;
    const store = {
      goalConfidenceSnapshots: [{ id: "snapshot", goalId: v2.goalId,
        phaseId: v2.phaseId, currentAssessmentId: v2.id,
        currentScore: v2.currentPercentage, scoreBand: v2.confidenceBand }],
      goalConfidenceHistory: [
        { id: "history-v1", assessmentId: v1.id, goalId: v1.goalId,
          phaseId: v1.phaseId, persistedAt: v1.provenance.generatedAt,
          assessment: v1 },
        { id: "history-v2", assessmentId: v2.id, goalId: v2.goalId,
          phaseId: v2.phaseId, persistedAt: v2.publicationTimestamp,
          assessment: v2 },
      ],
    };
    const before = structuredClone(store);
    const read = createCanonicalConfidenceReadService({ store });
    expect(read.getCurrent({ goalId: v2.goalId, phaseId: v2.phaseId }))
      .toMatchObject({ status: "canonical_v2",
        assessment: { id: v2.id, priorAssessmentId: v1.id } });
    const historical = read.getAssessmentAtOrBefore({ goalId: v2.goalId,
      phaseId: v2.phaseId, cutoff: "2026-06-30T23:59:59.999Z" });
    expect(historical.assessment).toMatchObject({ id: v1.id,
      schemaVersion: "confidence_v1_compatibility_v2",
      compatibility: { incomplete: true } });
    expect(store).toEqual(before);
  });
});

function request(previous) {
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = { startDate: "2026-07-01",
    targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "phase-one" } };
  return { publisherType: "weekly_briefing", userId: "user-one",
    occurrenceId: "weekly-one", artifactId: "weekly-one",
    cadenceOrEventType: "weekly", goalContract: input.goalContract,
    phaseId: "phase-one", strategyContext: input.strategyHypothesis,
    executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: previous,
    evidenceWindow: { id: "weekly-window",
      start: "2026-07-01T00:00:00.000Z",
      cutoff: "2026-07-31T23:59:59.999Z", closed: true },
    publicationCutoff: "2026-07-31T23:59:59.999Z",
    finalizedAt: "2026-08-01T12:00:00.000Z",
    idempotencyKey: "weekly-one", expectedPriorAssessmentId: previous.id,
    elapsedTimeAdequacy: "adequate",
    composeArtifact: () => ({ artifact: { id: "weekly-one",
      cadence: "weekly", briefing: {} } }),
  };
}

function previousV1() {
  return { schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-v1", goalId: "goal_build_muscle", phaseId: "phase-one",
    operatingState: "calibration",
    evidenceCutoff: "2026-06-30T23:59:59.999Z",
    score: { current: 55, prior: 52, band: "developing",
      movement: { direction: "increased", magnitude: "small" } },
    contributors: [], unresolvedUncertainty: [],
    primaryReason: "Legacy canonical context.",
    provenance: { generatedAt: "2026-06-30T23:59:59.999Z" } };
}
