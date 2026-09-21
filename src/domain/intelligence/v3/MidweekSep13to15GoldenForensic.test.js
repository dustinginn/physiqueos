import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/PINarrativeAssessmentService", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createPINarrativeAssessment: vi.fn(original.createPINarrativeAssessment) };
});

import { createPINarrativeAssessment } from "../../services/PINarrativeAssessmentService";
import { prepareMidweekBriefingReviewPresentation } from "../../services/MidweekBriefingPresentationService";
import { prepareMidweekV3, computeMidweekEnergyObservations } from "../../../testSupport/briefingFamilyV3Harness.js";

describe("Midweek Sep 13–15: unified V3 golden", () => {
  it("replays through V3 with Build Lean Mass strategy and a factual Energy observation", async () => {
    const prepared = await prepareMidweekV3();
    expect(prepared.goalContract.goalLabel).toBe("Build Lean Mass");
    expect(prepared.goalContract.strategy.energyStrategy).toMatchObject({
      intakeTarget: { value: 2500 }, activityTarget: { value: 800 },
    });
    const execution = prepared.strategicInterpretation.energyExecution;
    expect(execution.estimate).not.toBeNull();
    expect(Number.isFinite(execution.estimate.averageKcalPerDay)).toBe(true);
    expect(execution.estimate.pairing.eligibleDayCount).toBe(3);
    expect(JSON.stringify(prepared.strategicInterpretation)).not.toMatch(/maintenance|\bcalibration\b/i);
  });

  it("lets the current window win over a prior Weekly's stale observations", async () => {
    const withPrior = await prepareMidweekV3({ withPriorWeekly: true });
    const eligible = withPrior.assessment.evidenceEligibility.eligibleObservations.map((item) => item.observationId);
    // Nothing from the prior Sep 6–12 Weekly leaks in for a capability the current window already covers.
    const stale = eligible.filter((id) => id.includes("weekly_briefing_2026-09-06_2026-09-12"));
    expect(stale.filter((id) => /\|(nutrition|activity|energy)\|/.test(id))).toEqual([]);
    const superseded = withPrior.supersededObservations ?? [];
    expect(superseded.length).toBeGreaterThan(0);
    expect(superseded.every((item) => item.reason)).toBe(true);
    // Energy and coverage observations for the current Midweek are present.
    expect(eligible.some((id) => /midweek_briefing_user_founder_001_20260913_20260915\|nutrition\|coverage/.test(id))).toBe(true);
  });

  it("preserves ambiguity: every uncertainty is surfaced or carries an explicit suppression reason", async () => {
    const prepared = await prepareMidweekV3();
    const profile = prepared.strategicInterpretation.uncertaintyProfile;
    expect(profile.some((item) => item.domain === "energy")).toBe(true);
    const states = prepared.narrativePlan.uncertaintyTypes;
    for (const item of profile) {
      const state = states.find((entry) => entry.uncertaintyId === item.uncertaintyId);
      expect(state, item.uncertaintyId).toBeDefined();
      expect(state.surfaced === true || Boolean(state.suppressionReason)).toBe(true);
    }
    expect(prepared.strategicInterpretation.recommendation.strength).toBeDefined();
  });

  it("serves the canonical V3 Midweek with no legacy V2 semantic authority", async () => {
    const prepared = await prepareMidweekV3();
    const artifact = prepared.artifact ?? prepared.composed?.artifact ?? prepared.candidateArtifact;
    expect(artifact).toBeDefined();
    vi.mocked(createPINarrativeAssessment).mockClear();
    const served = prepareMidweekBriefingReviewPresentation({ artifact });
    expect(served.presentationModel).toBe("canonical_narrative_v3");
    expect(served.coachTake.biggestTakeaway).toBe(artifact.briefing.narrativeV3.coachTake);
    expect(served.coachTake.recommendation).toBe(artifact.briefing.narrativeV3.sections.action);
    expect(served).not.toHaveProperty("coachingDecision");
    expect(served).not.toHaveProperty("openCoachingThreads");
    expect(served.training.interpretation).toBeNull();
    expect(served.weightContext.interpretation).toBeNull();
    expect(served.energyBalance.headline).toBeNull();
    expect(served.energyBalance.interpretation).toBe(artifact.briefing.narrativeV3.energy?.statement ?? null);
    expect(served.uncertainty.length).toBeGreaterThan(0);
    expect(createPINarrativeAssessment).not.toHaveBeenCalled();
    // Factual Energy stays available.
    expect(served.energyBalance.chartPoints.length).toBe(3);
    expect(served.energyBalance.averageIntake).toBeGreaterThan(0);
  });

  it("uses the same Energy figures as the independent Energy pipeline", () => {
    const { current } = computeMidweekEnergyObservations();
    expect(current.dailyRecords.length).toBe(3);
  });
});
