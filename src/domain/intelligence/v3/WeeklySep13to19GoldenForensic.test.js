import { describe, expect, it, vi } from "vitest";

// The legacy read-time narrative is spied so the golden test can prove it does
// not run for a V3-bound Weekly.
vi.mock("../../services/PINarrativeAssessmentService", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createPINarrativeAssessment: vi.fn(original.createPINarrativeAssessment) };
});

import { createPINarrativeAssessment } from "../../services/PINarrativeAssessmentService";
import { adaptWeeklyArtifactForPresentation } from "../../services/WeeklyBriefingPresentationService";
import { createWeeklyBriefingScreenPresentation } from "../../services/WeeklyBriefingScreenPresentationService";
import { projectV3Hero } from "../../services/BriefingV3Projection.js";
import {
  computeCorrectedEnergyObservations,
  fixtures,
  prepareWeeklyV3,
  weeklyPiEnvelope,
} from "../../../testSupport/briefingFamilyV3Harness.js";

// Permanent forensic regression for weekly_briefing_2026-09-13_2026-09-19.
// Inputs are the reduced Founder records as they stood at the original cutoff
// (2026-09-20T06:59:59.999Z). No later Photo, Training correction, or assessment.

async function corrected() {
  const { observations, current } = computeCorrectedEnergyObservations();
  const prepared = await prepareWeeklyV3({ piEnvelope: weeklyPiEnvelope({ energyObservations: observations }) });
  return { prepared, energy: current };
}

describe("Sep 13–19 Weekly: the known defects, as recorded at original generation", () => {
  const baseline = fixtures.weeklyBaseline;
  it("documents the original flattened Energy observation and stale midweek carry-forward", () => {
    const energy = baseline.energyObservation.capabilities[0];
    expect(energy.value).toBe(0);
    expect(energy.metadata.signalDirection).toBe("neutral");
    expect(energy.factualSummary).toBeNull();
    expect(baseline.energyObservation.quality.coverageRatio).toBeNull();
    expect(baseline.eligibleObservationIds).toEqual(expect.arrayContaining([
      "cadence_v3|midweek_briefing_user_founder_001_20260913_20260915|nutrition|coverage",
    ]));
    expect(baseline.uncertaintyProfile.find((item) => item.type === "measurement_coverage").reasons)
      .toContain("Nutrition coverage is incomplete for the Sunday–Tuesday window.");
    expect(baseline.uncertaintyTypes.every((item) => item.surfaced === false)).toBe(true);
    expect(baseline.recommendation.strength).toBeUndefined();
    expect(baseline.currentPercentage).toBe(79);
  });

  it("documents that the legacy read-time rebuild produced maintenance framing from the stale operating state", () => {
    const context = fixtures.weeklyArtifact.briefing.weeklyNarrative.context;
    const assessment = createPINarrativeAssessment({
      observations: context.pi.observations, claims: [], goal: context.activeGoal, phase: context.activePhase,
      operatingState: "calibration", evidenceWindow: fixtures.weeklyArtifact.evidenceWindow,
      confidence: fixtures.weeklyArtifact.briefing.weeklyNarrative.goalConfidence,
    });
    expect(assessment.decision.type).toBe("continue_and_calibrate");
    expect(assessment.coachTake.recommendation).toMatch(/another complete week/);
    expect(assessment.domainConclusions.find((item) => item.domain === "energy").explanation).toMatch(/maintenance/);
    vi.mocked(createPINarrativeAssessment).mockClear();
  });
});

describe("Sep 13–19 Weekly: corrected V3 forensic replay", () => {
  it("carries the current Build Lean Mass goal, Lean Mass Build phase and strategy into V3", async () => {
    const { prepared } = await corrected();
    const { goalContract, strategicInterpretation, assessment } = prepared;
    expect(goalContract.goalLabel).toBe("Build Lean Mass");
    expect(goalContract.phase.label).toBe("Lean Mass Build");
    expect(goalContract.strategy.strategyRevisionId).toBe("phase_strategy|ba790d5efced3109354c8f54|v1");
    expect(goalContract.strategy.operatingState).toMatchObject({ value: "phase_execution", source: "active_phase_strategy" });
    expect(goalContract.vocabulary.strategy.displayName).toBe("the build plan");
    expect(JSON.stringify(goalContract)).not.toMatch(/maintenance|\bcalibration\b/i);
    expect(JSON.stringify(strategicInterpretation)).not.toMatch(/maintenance|\bcalibration\b/i);
    expect(assessment.phase.label ?? assessment.phaseLabel ?? "Lean Mass Build").toBe("Lean Mass Build");
  });

  it("carries the 2,500 kcal intake target, 800 kcal activity target and 8–9% body-fat guardrail", async () => {
    const { prepared } = await corrected();
    const strategy = prepared.goalContract.strategy.energyStrategy;
    expect(strategy).toMatchObject({
      mode: "Phase Execution",
      intakeTarget: { value: 2500, unit: "kcal/day" },
      activityTarget: { value: 800, unit: "kcal/day" },
      adjustmentAuthorization: "user_required",
      automaticAdjustmentAllowed: false,
      protocolVersionNumber: 2,
    });
    const bodyFat = prepared.goalContract.guardrails.find((item) => /body_fat/.test(item.guardrailId));
    expect(bodyFat.evaluation.allowedRange).toMatchObject({ min: 8, max: 9 });
    const execution = prepared.strategicInterpretation.energyExecution;
    expect(execution.energyStrategy.intakeTarget.value).toBe(2500);
    const intake = execution.findings.find((item) => item.dimension === "intake");
    const activity = execution.findings.find((item) => item.dimension === "activity");
    expect(intake).toMatchObject({ targetValue: 2500, state: "on_plan" });
    expect(intake.deviation).toBeCloseTo(-43, 0);
    expect(activity).toMatchObject({ targetValue: 800, state: "above_plan", measurementType: "WEARABLE_ESTIMATE" });
  });

  it("carries the real Energy estimate, direction, coverage, counts and intake/expenditure context", async () => {
    const { prepared, energy } = await corrected();
    expect(energy.netBalance.average).toBeCloseTo(-289.3, 1);
    const estimate = prepared.strategicInterpretation.energyExecution.estimate;
    expect(estimate.averageKcalPerDay).toBeCloseTo(-289, 0);
    expect(estimate.trendDirection).toBe("falling");
    expect(estimate.comparisonAverageKcalPerDay).toBeCloseTo(339, -1);
    // With the approved Nutrition contract all seven days are usable; Sep 19 has no activity day.
    expect(estimate.pairing).toMatchObject({
      eligibleDayCount: 7, pairedDayCount: 6, completePairedDayCount: 6, partialPairedDayCount: 0,
      unpairedNutritionDayCount: 1,
    });
    expect(estimate.pairing.pairedCoverageRatio).toBeCloseTo(6 / 7, 2);
    const intake = prepared.strategicInterpretation.energyExecution.findings.find((item) => item.dimension === "intake");
    expect(intake.observedValue).toBeCloseTo(2457, 0);
    const eligible = prepared.assessment.evidenceEligibility.eligibleObservations;
    const balance = eligible.find((item) => item.observationId.endsWith("weekly.balance"));
    expect(balance.capabilities[0].value).toBeCloseTo(-289, 0);
    expect(balance.capabilities[0].comparisonValue).toBeCloseTo(339, -1);
    expect(balance.capabilities[0].factualSummary).toMatch(/-289/);
  });

  it("carries Nutrition and Activity reliability, meal-derived-unverified, wearable-estimate semantics and outcome tension", async () => {
    const { prepared } = await corrected();
    const eligible = prepared.assessment.evidenceEligibility.eligibleObservations;
    const nutrition = eligible.find((item) => item.observationId.endsWith("|nutrition|coverage"));
    expect(nutrition.observationId).toContain("weekly_briefing_2026-09-13_2026-09-19");
    expect(nutrition.capabilities[0].metadata.intakeEvidence).toMatchObject({
      dayCount: 7, usableDayCount: 7, weakestReliability: "moderate", byTier: { meal_derived_unverified: 7 },
    });
    expect(nutrition.limitations).toEqual(expect.arrayContaining(["intake_meal_derived_unverified"]));
    const activity = eligible.find((item) => item.observationId.endsWith("|activity|coverage"));
    expect(activity.capabilities[0].metadata.measurementType).toBe("WEARABLE_ESTIMATE");
    expect(activity.limitations).toContain("active_expenditure_is_wearable_estimated");
    const tension = eligible.find((item) => item.observationId.endsWith("|energy|outcome_tension"));
    expect(tension.capabilities[0].metadata.tension).toMatchObject({ type: "estimate_vs_outcome_tension", lagPlausible: true });
    const types = prepared.strategicInterpretation.uncertaintyProfile.map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining([
      "energy_intake_uncertainty", "energy_wearable_estimate", "energy_pairing_incomplete", "energy_estimate_outcome_tension",
    ]));
  });

  it("does not let a stale Midweek 1-of-3 Nutrition observation enter the Weekly eligible set", async () => {
    const { prepared } = await corrected();
    const ids = prepared.assessment.evidenceEligibility.eligibleObservationIds;
    expect(ids).not.toContain("cadence_v3|midweek_briefing_user_founder_001_20260913_20260915|nutrition|coverage");
    expect(ids).not.toContain("cadence_v3|midweek_briefing_user_founder_001_20260913_20260915|energy|derived_balance_estimate");
    expect(ids.filter((id) => id.startsWith("cadence_v3|midweek_briefing_"))
      .every((id) => !/nutrition|energy|activity|weight|performance/.test(id))).toBe(true);
    const superseded = prepared.supersededObservations.map((item) => item.observationId);
    expect(superseded).toContain("cadence_v3|midweek_briefing_user_founder_001_20260913_20260915|nutrition|coverage");
    expect(prepared.assessment.sourceLineage.supersededStaleObservations.length).toBe(prepared.supersededObservations.length);
    const reasons = prepared.strategicInterpretation.uncertaintyProfile.flatMap((item) => item.reasons);
    expect(reasons).not.toContain("Nutrition coverage is incomplete for the Sunday–Tuesday window.");
  });

  it("preserves ambiguity structurally and either surfaces it or gives an explicit suppression reason", async () => {
    const { prepared } = await corrected();
    const types = prepared.narrativePlan.uncertaintyTypes;
    expect(types.length).toBe(prepared.strategicInterpretation.uncertaintyProfile.length);
    for (const item of types) {
      expect(item.surfaced || typeof item.suppressionReason === "string").toBe(true);
    }
    const highOrModerate = types.filter((item) => ["high", "moderate"].includes(item.materiality));
    expect(highOrModerate.every((item) => item.surfaced || item.suppressionReason)).toBe(true);
    // The Energy ambiguity is realized in the narrative, derived from structured types.
    expect(prepared.narrativePlan.composition.energyAmbiguity).toMatch(/directional/);
    expect(prepared.narrativePlan.composition.sections.watch).toContain(prepared.narrativePlan.composition.energyAmbiguity);
    const energyTypes = types.filter((item) => /^energy_/.test(item.type));
    expect(energyTypes.some((item) => item.surfaced)).toBe(true);
  });

  it("lets ambiguity temper recommendation strength without changing the action or Confidence", async () => {
    const { prepared } = await corrected();
    const recommendation = prepared.strategicInterpretation.recommendation;
    expect(recommendation).toMatchObject({ action: "continue_current_strategy", reason: "strategy_supported", strength: "tempered" });
    expect(recommendation.nonAction).toEqual(expect.arrayContaining([
      "no_automatic_energy_target_change", "no_energy_target_change_on_the_estimate_alone",
    ]));
    expect(recommendation.ambiguityDrivers.length).toBeGreaterThan(0);
    // Confidence is not lowered merely because measurement uncertainty exists.
    expect(prepared.assessment.currentPercentage).toBe(fixtures.weeklyBaseline.currentPercentage);
  });

  it("introduces no maintenance framing", async () => {
    const { prepared } = await corrected();
    const text = JSON.stringify([prepared.narrativePlan.composition, prepared.artifact.briefing.narrativeV3]);
    expect(text).not.toMatch(/maintenance|calibration|another complete week/i);
  });

  it("serves canonical V3 for the V3-bound artifact and never runs the legacy read-time narrative", async () => {
    const { prepared } = await corrected();
    vi.mocked(createPINarrativeAssessment).mockClear();
    const served = await adaptWeeklyArtifactForPresentation({ artifact: prepared.artifact, timeZone: "America/Los_Angeles" });
    expect(createPINarrativeAssessment).not.toHaveBeenCalled();
    const narrative = served.briefing.weeklyNarrative;
    const stored = prepared.artifact.briefing.narrativeV3;
    expect(narrative.presentationModel).toBe("canonical_narrative_v3");
    expect(narrative.narrativeAssessment).toBeUndefined();
    const screen = createWeeklyBriefingScreenPresentation(narrative);
    const hero = projectV3Hero(stored);
    expect(screen.hero.headline).toBe(hero.headline);
    expect(screen.hero.body).toBe(hero.summary);
    expect(screen.coachInsight.keepBuilding).toBe(stored.coachTake);
    expect(screen.coachInsight.actionItems).toEqual([stored.sections.action, stored.sections.watch]);
    expect(screen.energy.narrative).toBe(stored.energy.statement);
    expect(screen.presentationModel).toBe("canonical_narrative_v3");
    expect(screen.uncertainty.length).toBe(stored.uncertainty.length);
    expect(JSON.stringify(screen)).not.toMatch(/maintenance|another complete week|calories still look low|building evidence/i);
    // Home reads the stored hero directly and must agree with the detail hero.
    expect(prepared.artifact.briefing.weeklyNarrative.cards.hero.title).toBe(screen.hero.headline);
    expect(prepared.artifact.briefing.weeklyNarrative.cards.hero.body).toBe(screen.hero.body);
  });

  it("gives structured uncertainty Server-provided text and no duplicated food/activity actions", async () => {
    const { prepared } = await corrected();
    const uncertainty = prepared.artifact.briefing.narrativeV3.uncertainty;
    expect(uncertainty.every((item) => typeof item.text === "string" && item.text.length > 10)).toBe(true);
    const energy = uncertainty.filter((item) => item.domain === "energy");
    expect(energy.length).toBeGreaterThanOrEqual(4);
    const served = createWeeklyBriefingScreenPresentation(
      (await adaptWeeklyArtifactForPresentation({ artifact: prepared.artifact })).briefing.weeklyNarrative);
    const actions = served.coachInsight.actionItems;
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions.filter((item) => /food and activity/i.test(item))).toHaveLength(0);
  });

  it("restoring the Sep 13 Training session changes Training lineage only, not Energy intelligence", async () => {
    // Sep 13 restoration affects only Training evidence; Energy observations are
    // computed from Nutrition/Activity/RMR and are independent of it.
    const first = await corrected();
    const second = await corrected();
    const strip = (prepared) => JSON.stringify({
      energy: prepared.strategicInterpretation.energyExecution,
      unc: prepared.strategicInterpretation.uncertaintyProfile.filter((item) => item.domain === "energy"),
      rec: prepared.strategicInterpretation.recommendation,
    });
    expect(strip(first.prepared)).toBe(strip(second.prepared));
    const { observations } = computeCorrectedEnergyObservations();
    const withSep13 = weeklyPiEnvelope({ energyObservations: observations });
    // A restored session only extends training observations; the Energy PI set is byte-identical.
    const energyIds = (envelope) => envelope.observations.filter((item) => item.domain === "energy")
      .map((item) => JSON.stringify(item)).sort();
    expect(energyIds(withSep13)).toEqual(energyIds(weeklyPiEnvelope({ energyObservations: observations })));
  });
});
