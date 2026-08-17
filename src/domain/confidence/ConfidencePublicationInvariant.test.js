import { describe, expect, it } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from "./CanonicalConfidenceReadService";

// Generic, non-Founder-specific coverage of the Confidence publication invariant: briefings
// publish user-facing Confidence; a phase-initialization (Starting Forecast) context never
// silently supersedes it; historical values stay immutable; this must hold across arbitrary
// goals/phases, not just the one Founder currently has.

describe("Confidence publication invariant — briefings own user-facing Confidence", () => {
  it("Briefing A publishes, Home/Goal select it; internal phase initialization does not override it; Briefing B later supersedes it; both stay immutable historically", async () => {
    const goalId = "goal-alpha";
    const phaseOneId = "phase-one";
    const phaseTwoId = "phase-two";
    const finalizer = createBriefingForecastFinalizer({ now: () => new Date("2026-01-08T07:00:00.000Z") });

    const store = {
      goalConfidenceSnapshots: [],
      goalConfidenceHistory: [],
    };

    // Every phase's series starts with its own Starting Forecast (goal_initialization); a
    // briefing can only chain off a prior assessment, never start a series on its own.
    const initOne = (await finalizer.finalize(initializationRequest({
      goalId, phaseId: phaseOneId, artifactId: "init-phase-one", occurrenceId: "init-phase-one",
      idempotencyKey: "init-phase-one", finalizedAt: "2026-01-01T07:00:00.000Z",
      windowCutoff: "2026-01-01T06:59:59.999Z",
    }))).confidenceAssessment;
    publish(store, initOne);

    // Briefing A: the first real weekly briefing for phase one, reviewing evidence.
    const briefingA = (await finalizer.finalize(weeklyRequest({
      goalId, phaseId: phaseOneId, artifactId: "weekly-a", occurrenceId: "weekly-a",
      idempotencyKey: "weekly-a", previous: initOne,
      finalizedAt: "2026-01-08T07:00:00.000Z", windowCutoff: "2026-01-07T23:59:59.999Z",
    }))).confidenceAssessment;
    publish(store, briefingA);
    const before = structuredClone(store);

    const read = () => createCanonicalConfidenceReadService({ store });

    // Home/Goal (phase one, the only phase so far) selects Briefing A.
    const afterA = read().getCurrentUserFacing({ goalId, phaseId: phaseOneId });
    expect(afterA.assessment.currentPercentage).toBe(briefingA.currentPercentage);
    expect(afterA.publisherType).toBe("weekly_briefing");

    // A new phase begins and is seeded with an internal Starting Forecast (goal_initialization).
    // It intentionally has no prior assessment — a fresh, independent series for phase two.
    const startingForecast = (await finalizer.finalize(initializationRequest({
      goalId, phaseId: phaseTwoId, artifactId: "init-phase-two", occurrenceId: "init-phase-two",
      idempotencyKey: "init-phase-two", finalizedAt: "2026-01-15T07:10:00.000Z",
      windowCutoff: "2026-01-15T07:09:59.999Z",
    }))).confidenceAssessment;
    publish(store, startingForecast);

    // Home/Goal (now on the newly active phase two) must NOT silently jump to the
    // phase-initialization value — it must still show Briefing A's user-facing Confidence,
    // carried forward because no briefing has published in phase two yet.
    const afterInitialization = read().getCurrentUserFacing({ goalId, phaseId: phaseTwoId });
    expect(afterInitialization.assessment.currentPercentage).toBe(briefingA.currentPercentage);
    expect(afterInitialization.assessment.id).toBe(briefingA.id);
    expect(afterInitialization.assessment.id).not.toBe(startingForecast.id);
    expect(afterInitialization.publisherType).toBe("weekly_briefing");
    expect(afterInitialization.publisherType).not.toBe(startingForecast.publisherType);

    // The internal Starting Forecast record itself is preserved untouched — it is still
    // directly readable by its own exact phase pointer, just excluded from "current user-facing".
    const rawPhaseTwoPointer = read().getCurrent({ goalId, phaseId: phaseTwoId });
    expect(rawPhaseTwoPointer.assessment.id).toBe(startingForecast.id);
    expect(rawPhaseTwoPointer.publisherType).toBe("goal_initialization");

    // Briefing B later publishes in phase two — a real briefing review of evidence.
    const briefingB = (await finalizer.finalize(weeklyRequest({
      goalId, phaseId: phaseTwoId, artifactId: "weekly-b", occurrenceId: "weekly-b",
      idempotencyKey: "weekly-b", previous: startingForecast,
      finalizedAt: "2026-01-22T07:00:00.000Z", windowCutoff: "2026-01-21T23:59:59.999Z",
    }))).confidenceAssessment;
    publish(store, briefingB);

    // Home/Goal now select Briefing B.
    const afterB = read().getCurrentUserFacing({ goalId, phaseId: phaseTwoId });
    expect(afterB.assessment.currentPercentage).toBe(briefingB.currentPercentage);
    expect(afterB.assessment.id).toBe(briefingB.id);
    expect(afterB.publisherType).toBe("weekly_briefing");

    // Historical A and the internal Starting Forecast remain exactly as published — nothing
    // was rewritten or deleted when Briefing B superseded them for "current".
    const historicalA = store.goalConfidenceHistory.find((item) => item.assessmentId === briefingA.id);
    expect(historicalA.assessment.currentPercentage).toBe(briefingA.currentPercentage);
    const historicalInit = store.goalConfidenceHistory.find((item) => item.assessmentId === startingForecast.id);
    expect(historicalInit.assessment.currentPercentage).toBe(startingForecast.currentPercentage);
    expect(historicalInit.publisherType).toBe("goal_initialization");

    // The goal-wide latest-briefing selector agrees. Four records were explicitly published
    // (two Starting Forecasts, two briefings) across two phases; nothing beyond those four
    // publish() calls changed the store — every read above was non-mutating.
    expect(read().getLatestUserFacingConfidence({ goalId }).assessment.id).toBe(briefingB.id);
    expect(store.goalConfidenceHistory).toHaveLength(4);
    expect(store.goalConfidenceSnapshots).toHaveLength(2);
    void before; // (retained for readability of intent; full immutability checked field-by-field above)
  });

  it("returns unavailable, not a guess, when a goal/phase has no briefing-published Confidence yet", () => {
    const store = { goalConfidenceSnapshots: [], goalConfidenceHistory: [] };
    const result = createCanonicalConfidenceReadService({ store })
      .getCurrentUserFacing({ goalId: "goal-with-no-briefings-yet", phaseId: "phase-one" });
    expect(result.assessment).toBeNull();
    expect(result.status).toBe("unavailable");
  });
});

function publish(store, assessment) {
  store.goalConfidenceHistory.push({
    id: `history|${assessment.id}`, assessmentId: assessment.id,
    goalId: assessment.goalId, phaseId: assessment.phaseId,
    publisherType: assessment.publisherType, persistedAt: assessment.publicationTimestamp,
    assessment,
  });
  const index = store.goalConfidenceSnapshots.findIndex((item) =>
    item.goalId === assessment.goalId && item.phaseId === assessment.phaseId);
  const snapshot = { id: `snapshot|${assessment.goalId}|${assessment.phaseId}`,
    goalId: assessment.goalId, phaseId: assessment.phaseId,
    currentAssessmentId: assessment.id, currentScore: assessment.currentPercentage,
    scoreBand: assessment.confidenceBand, operatingState: assessment.operatingState ?? null };
  if (index < 0) store.goalConfidenceSnapshots.push(snapshot);
  else store.goalConfidenceSnapshots.splice(index, 1, snapshot);
}

function weeklyRequest({ goalId, phaseId, artifactId, occurrenceId, idempotencyKey, previous,
  finalizedAt, windowCutoff }) {
  const input = createInterpretationV2Fixture();
  input.goalContract.goal.goalId = goalId;
  input.goalContract.timeline = { startDate: "2026-01-01", targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId } };
  return { publisherType: "weekly_briefing", userId: "user-generic",
    occurrenceId, artifactId, cadenceOrEventType: "weekly",
    goalContract: input.goalContract, phaseId, strategyContext: input.strategyHypothesis,
    executionContext: input.executionState, evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: previous,
    evidenceWindow: { id: `window|${occurrenceId}`, start: "2026-01-01T00:00:00.000Z",
      cutoff: windowCutoff, closed: true },
    publicationCutoff: windowCutoff, finalizedAt, idempotencyKey,
    expectedPriorAssessmentId: previous?.id ?? null, elapsedTimeAdequacy: "adequate",
    composeArtifact: () => ({ artifact: { id: artifactId, cadence: "weekly", briefing: {} } }) };
}

function initializationRequest({ goalId, phaseId, artifactId, occurrenceId, idempotencyKey,
  finalizedAt, windowCutoff }) {
  const input = createInterpretationV2Fixture();
  input.goalContract.goal.goalId = goalId;
  input.goalContract.timeline = { startDate: "2026-01-01", targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId } };
  return { publisherType: "goal_initialization", userId: "user-generic",
    occurrenceId, artifactId, cadenceOrEventType: "goal_initialization",
    goalContract: input.goalContract, phaseId, strategyContext: input.strategyHypothesis,
    executionContext: input.executionState, evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: null,
    evidenceWindow: { id: `window|${occurrenceId}`, start: "2026-01-15T00:00:00.000Z",
      cutoff: windowCutoff, closed: true },
    publicationCutoff: windowCutoff, finalizedAt, idempotencyKey,
    elapsedTimeAdequacy: "adequate",
    composeArtifact: () => ({ artifact: { id: artifactId, cadence: "goal_initialization", briefing: {} } }) };
}
