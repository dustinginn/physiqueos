import { describe, expect, it, vi } from "vitest";
import { createInterpretationV2Fixture } from "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from "./BriefingForecastFinalizer";
import { createAuthorizedBriefingForecastAdapters } from
  "./AuthorizedBriefingForecastAdapters";
import { projectNumericConfidence } from "./NumericConfidenceProjectionService";

const AT = "2026-08-01T12:00:00.000Z";

describe("shared production briefing forecast finalizer", () => {
  it("runs Goal Contract through Interpretation, Forecast, projection, Narrative, and artifact composition", async () => {
    const result = await createBriefingForecastFinalizer({
      now: () => new Date(AT),
    }).finalize(request({ publisherType: "goal_initialization",
      cadenceOrEventType: "goal_initialization", previous: null }));
    expect(result.status).toBe("prepared");
    expect(result.structuredInterpretation.id).toMatch(/^structured_interpretation/);
    expect(result.forecastAssessment.forecastMetadata.shadowOnly).toBe(false);
    expect(result.narrativeAssessment.provenance.shadowOnly).toBe(false);
    expect(result.numericConfidenceProjection.currentPercentage).not.toBe(50);
    expect(result.confidenceAssessment).toMatchObject({
      schemaVersion: "canonical_confidence_assessment_v2",
      publisherType: "goal_initialization",
      currentPercentage: result.numericConfidenceProjection.currentPercentage,
    });
    expect(result.briefingArtifact.confidencePublication.assessmentId)
      .toBe(result.confidenceAssessment.id);
  });

  it("fails unauthorized publishers before artifact composition", async () => {
    const composeArtifact = vi.fn();
    await expect(createBriefingForecastFinalizer().finalize(request({
      publisherType: "energy_finalization",
      cadenceOrEventType: "energy",
      composeArtifact,
    }))).rejects.toMatchObject({ code: "unauthorized_publisher" });
    expect(composeArtifact).not.toHaveBeenCalled();
  });

  it("requires a canonical predecessor for every briefing publisher", async () => {
    await expect(createBriefingForecastFinalizer().finalize(request({
      publisherType: "weekly_briefing",
      cadenceOrEventType: "weekly",
      previous: null,
    }))).rejects.toMatchObject({ code: "canonical_predecessor_required" });
  });

  it("rejects a non-qualifying Photo Event before composition", async () => {
    const composeArtifact = vi.fn();
    await expect(createBriefingForecastFinalizer().finalize(request({
      publisherType: "photo_event_briefing",
      cadenceOrEventType: "photo",
      qualifyingPhotoEvent: false,
      composeArtifact,
    }))).rejects.toMatchObject({ code: "photo_event_not_qualifying" });
    expect(composeArtifact).not.toHaveBeenCalled();
  });

  it("publishes a first-class reaffirmation for identical semantics", async () => {
    const finalizer = createBriefingForecastFinalizer({ now: () => new Date(AT) });
    const first = await finalizer.finalize(request({
      publisherType: "weekly_briefing", cadenceOrEventType: "weekly",
    }));
    const second = await finalizer.finalize(request({
      artifactId: "weekly-two", occurrenceId: "weekly-two",
      idempotencyKey: "weekly-two", publisherType: "weekly_briefing",
      cadenceOrEventType: "weekly", previous: first.confidenceAssessment,
    }));
    expect(second.reaffirmation).toBe(true);
    expect(second.numericConfidenceProjection.currentPercentage)
      .toBe(first.numericConfidenceProjection.currentPercentage);
    expect(second.confidenceAssessment.id).not.toBe(first.confidenceAssessment.id);
    expect(second.confidenceAssessment.priorAssessmentId)
      .toBe(first.confidenceAssessment.id);
  });

  it("keeps Forecast and Narrative isolated from raw evidence projection", async () => {
    const result = await createBriefingForecastFinalizer().finalize(request({
      publisherType: "weekly_briefing", cadenceOrEventType: "weekly",
    }));
    expect(() => projectNumericConfidence({
      forecastAssessment: result.forecastAssessment,
      publisherType: "weekly_briefing",
      rawEvidence: [],
    })).toThrow(/cannot consume rawEvidence/i);
  });

  it("removes stale Phase Review payloads when the milestone rejects the artifact", async () => {
    const result = await createBriefingForecastFinalizer().finalize(request({
      publisherType: "weekly_briefing", cadenceOrEventType: "weekly",
      phaseReviewContext: ineligiblePhaseReviewContext(),
      composeArtifact: () => ({ artifact: { id: "artifact-one", cadence: "weekly",
        briefing: { phaseReview: { eligible: true, unresolved: true } },
        phaseReviewAuthorization: { eligible: true } } }),
    }));
    expect(result.briefingArtifact.briefing.phaseReview).toBeUndefined();
    expect(result.briefingArtifact.phaseReviewAuthorization).toBeUndefined();
  });

  it.each([
    ["finalizeGoalInitialization", null],
    ["finalizeMidweek", "prior"],
    ["finalizeWeekly", "prior"],
    ["finalizeMonthly", "prior"],
    ["finalizeDEXAEvent", "prior"],
    ["finalizePhotoEvent", "prior"],
  ])("routes %s through the same finalizer", async (method, prior) => {
    const finalize = vi.fn(async (value) => value);
    const adapters = createAuthorizedBriefingForecastAdapters({
      finalizer: { finalize },
    });
    const value = request({ previous: prior ? previous() : null,
      meaningfulVisualInterpretation: true,
      canonicalPhotoEventBriefing: true });
    await adapters[method](value);
    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize.mock.calls[0][0].composeArtifact).toBeTypeOf("function");
  });
});

function request(overrides = {}) {
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = {
    startDate: "2026-07-01", targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "phase-one" },
  };
  const artifactId = overrides.artifactId ?? "artifact-one";
  const prior = Object.prototype.hasOwnProperty.call(overrides, "previous")
    ? overrides.previous : previous();
  return {
    publisherType: "weekly_briefing",
    userId: "user-one",
    occurrenceId: overrides.occurrenceId ?? artifactId,
    artifactId,
    cadenceOrEventType: "weekly",
    goalContract: input.goalContract,
    phaseId: "phase-one",
    evidenceWindow: {
      id: "window-one", start: "2026-07-01T00:00:00.000Z",
      cutoff: "2026-07-31T23:59:59.999Z", closed: true,
    },
    strategyContext: input.strategyHypothesis,
    executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: prior,
    publicationCutoff: "2026-07-31T23:59:59.999Z",
    finalizedAt: AT,
    idempotencyKey: overrides.idempotencyKey ?? artifactId,
    expectedPriorAssessmentId: prior?.id ?? null,
    composeArtifact: overrides.composeArtifact ?? (() => ({ artifact: {
      id: artifactId, cadence: "weekly", briefing: {},
    } })),
    startingForecastContext: {
      experience: "new_user", goalAmbition: "high",
      timelineFeasibility: "reasonable", baselineQuality: "known",
      priorGoalHistory: "unavailable", historicalExecution: "adequate",
      strategyQuality: "strong", missingInformation: ["response_history"],
    },
    qualifyingPhotoEvent: true,
    trajectorySegmentId: "trajectory_july",
    elapsedTimeAdequacy: "adequate",
    ...overrides,
    previousCanonicalAssessment: prior,
  };
}

function previous() {
  return {
    id: "prior-assessment", goalId: "goal_build_muscle", phaseId: "phase-one",
    currentPercentage: 55, forecastStatus: "forecast_uncertain",
    confidenceBand: "developing", forecastDirection: "indeterminate",
    movement: "no_meaningful_change", semanticContinuityFingerprint: "prior-semantic",
    publicationTimestamp: "2026-06-30T23:59:59.999Z",
  };
}

function ineligiblePhaseReviewContext() {
  const phase = { id: "phase-one", goalId: "goal_build_muscle", order: 0,
    name: "Phase One", status: "active", revision: 0 };
  return { activeGoal: { id: "goal_build_muscle", phases: [phase] },
    activePhase: phase,
    reviewMilestone: { milestoneId: "milestone", goalId: "goal_build_muscle",
      phaseId: "phase-one", milestoneType: "planned_phase_review",
      reviewType: "phase_completion_review", requiredEvidence: [],
      eligibleArtifactTypes: ["dexa_event"], designatedArtifactIdentity: null,
      designatedEvidenceIdentity: null, earliestEligibleDate: "2026-07-31",
      latestEligibleDate: null, earlyReviewPolicy: "prohibited", reviewRequired: true,
      unresolvedReviewId: "review", resolvedReviewId: null, decisionRequired: true,
      recommendationRequired: true, consumed: false, lineage: [], revision: 0 },
    currentArtifact: { id: "artifact-one", evidenceTypes: ["weekly"] },
    artifactType: "weekly", artifactTimestamp: "2026-07-31T23:59:59.999Z",
    publicationTimestamp: AT, currentDate: "2026-08-01", decisionHistory: [],
    expectedStoreRevision: 1 };
}
