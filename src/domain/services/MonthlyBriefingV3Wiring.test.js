import { beforeEach, describe, expect, it, vi } from "vitest";

// The intended Monthly intelligence, wrapped in a call-through spy. The real
// production Monthly path must reach it; it must not be test-only or shadow-only.
vi.mock("../intelligence/v3/MonthlyEvidenceIntelligenceV3.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createMonthlyEvidenceIntelligenceV3: vi.fn((...args) => original.createMonthlyEvidenceIntelligenceV3(...args)) };
});

// Only the V2 editorial composition is stubbed; the Monthly production path
// (window, preparer, evidence intelligence, V3 publication, artifact) is real.
vi.mock("./MonthlyBriefingPreviewService", () => ({
  createMonthlyBriefingPreviewService: () => ({ preview: async () => globalThis.__monthlyPreviewNarrative }),
}));
vi.mock("./MonthlyBriefingPresentationService", () => ({
  composeMonthlyBriefingPresentation: () => ({
    hero: { title: "September established the pattern.", thesis: "V2 thesis.", confidence: null },
    energy: { title: "Are calories supporting the work?" },
  }),
}));

import { createMonthlyEvidenceIntelligenceV3 } from "../intelligence/v3/MonthlyEvidenceIntelligenceV3.js";
import { createMonthlyBriefingService } from "./MonthlyBriefingService.js";
import { CADENCE_RMR_STRATEGIES, createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService.js";
import {
  currentGoalAndPhase, fixtures, prepareWeeklyV3, computeCorrectedEnergyObservations, weeklyPiEnvelope,
} from "../../testSupport/briefingFamilyV3Harness.js";

async function buildMonthlyScenario() {
  const { goal, phase } = currentGoalAndPhase();
  const { observations } = computeCorrectedEnergyObservations();
  const predecessor = (await prepareWeeklyV3({ piEnvelope: weeklyPiEnvelope({ energyObservations: observations }) })).assessment;
  const history = { id: predecessor.id, assessmentId: predecessor.id, goalId: goal.id, phaseId: phase.id,
    publisherType: "weekly_briefing", assessment: predecessor, version: 1 };
  const snapshot = { id: `snapshot|${goal.id}|${phase.id}`, goalId: goal.id, phaseId: phase.id,
    currentAssessmentId: predecessor.id, currentScore: predecessor.currentPercentage,
    scoreBand: predecessor.confidenceBand, publisherType: "weekly_briefing" };
  const store = {
    goals: [goal], phaseStrategies: [fixtures.strategyAuthority.phaseStrategy],
    protocols: fixtures.strategyAuthority.protocols, protocolVersions: fixtures.strategyAuthority.protocolVersions,
    dexaScans: fixtures.dexaScans, weightEntries: fixtures.weightEntries, dailyBriefings: [],
    goalConfidenceHistory: [history], goalConfidenceSnapshots: [snapshot], canonicalEvidenceObjects: [], analyses: [],
  };
  const canonical = [...fixtures.nutritionActivity.nutritionDays, ...fixtures.nutritionActivity.activityDays];
  const energy = createCadenceEnergyAssessment({
    cadence: "monthly", timeZone: "America/Los_Angeles",
    window: { startDate: "2026-09-01", endDate: "2026-09-30", timeZone: "America/Los_Angeles" },
    nutritionDays: fixtures.nutritionActivity.nutritionDays, activityDays: fixtures.nutritionActivity.activityDays,
    dexaScans: fixtures.dexaScans, rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  });
  globalThis.__monthlyPreviewNarrative = {
    goalConfidence: { assessmentId: predecessor.id },
    monthlyNarrative: { confidence: null },
    editorialDecision: { candidates: [], selectedStoryIds: [], boundedMilestoneCandidateIds: [], semanticDiagnostics: null },
    evidenceFixture: {
      goal, weights: fixtures.weightEntries, dexaScans: fixtures.dexaScans, progressPhotos: [],
      canonicalDependencies: canonical, evidenceResolution: {},
      energyContinuations: energy.dailyRecords.filter((day) => Number.isFinite(day.energyBalance)).map((day) => ({
        id: `monthly-energy-${day.date}`, date: day.date, balance: day.energyBalance,
        estimatedIntake: day.calorieIntake, estimatedExpenditure: day.estimatedExpenditure,
        rmr: day.rmr, activeCalories: day.activeCalories, source: "canonical_founder_evidence", isSynthetic: false,
      })),
      confidenceEvidence: { evidenceWindow: {}, comparisonWindow: null, canonicalTrainingEvidence: [],
        energyDays: energy.dailyRecords, recoveryEvidenceRecords: [], photoSessions: [] },
    },
  };
  let published = null;
  const publicationService = {
    captureBaseline: () => ({ store, revision: 1, semanticDigest: "golden" }),
    publish: async (command) => { published = command; return { status: "published", committed: true, artifact: command.artifact }; },
  };
  const repositories = {
    users: { getUserById: async () => ({ id: "user_founder_001", timeZone: "America/Los_Angeles" }), getCurrentUser: async () => ({ id: "user_founder_001", timeZone: "America/Los_Angeles" }) },
    dailyBriefings: { getBriefingByEvidenceWindow: async () => null },
  };
  const service = createMonthlyBriefingService({ repositories, publicationService, now: () => new Date("2026-10-01T15:00:00.000Z") });
  const result = await service.generateForCurrentWindow({ userId: "user_founder_001", asOf: new Date("2026-10-01T15:00:00.000Z") });
  return { result, published: () => published, predecessor };
}

describe("Monthly production path is wired to MonthlyEvidenceIntelligenceV3", () => {
  beforeEach(() => { vi.mocked(createMonthlyEvidenceIntelligenceV3).mockClear(); });

  it("calls the intended Monthly intelligence from the real production path", async () => {
    const { result, published } = await buildMonthlyScenario();
    expect(result.state).toBe("completed");
    expect(createMonthlyEvidenceIntelligenceV3).toHaveBeenCalledTimes(1);
    const input = vi.mocked(createMonthlyEvidenceIntelligenceV3).mock.calls[0][0];
    expect(input.window).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30" });
    // Real canonical evidence, not fabricated: seven+ Nutrition days as daily totals.
    expect(input.nutrition.length).toBeGreaterThanOrEqual(7);
    expect(input.nutrition.every((item) => item.usable)).toBe(true);
    expect(input.activity.length).toBeGreaterThanOrEqual(6);
    expect(published()).not.toBeNull();
  });

  it("carries the source matrix, wearable-estimate and reliability semantics into the V3 evidence path", async () => {
    const { published } = await buildMonthlyScenario();
    const assessment = published().assessment;
    const eligible = assessment.evidenceEligibility.eligibleObservations;
    const matrix = eligible.filter((item) => item.observationId.includes("|monthly|monthly|"));
    expect(matrix.length).toBeGreaterThan(0);
    const activity = matrix.find((item) => item.capabilities[0].capabilityId === "monthly.evidence.activity");
    expect(activity.capabilities[0].metadata.measurementType).toBe("WEARABLE_ESTIMATE");
    expect(activity.limitations).toContain("active_expenditure_is_wearable_estimated");
    const nutrition = matrix.find((item) => item.capabilities[0].capabilityId === "monthly.evidence.nutrition");
    expect(nutrition.capabilities[0].metadata.ambiguity).toContain("intake_meal_derived_unverified");
    // The Monthly matrix reaches the V3 ambiguity path: wearable and intake ambiguity are structured.
    const types = assessment.strategicInterpretation.uncertaintyProfile.map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["energy_wearable_estimate", "energy_intake_uncertainty"]));
  });

  it("stores and serves the bounded Monthly intelligence with the artifact and keeps Confidence unchanged by it", async () => {
    const { published, predecessor } = await buildMonthlyScenario();
    const artifact = published().artifact;
    expect(artifact.briefing.monthlyIntelligenceV3).toMatchObject({
      schemaVersion: "monthly_evidence_intelligence_production_v1",
      confidenceConsequence: { narrativeInterestChangesConfidence: false, measurementUncertaintyAutomaticallyLowersConfidence: false },
    });
    expect(artifact.briefing.monthlyIntelligenceV3.sourceMatrix.map((row) => row.domain))
      .toEqual(expect.arrayContaining(["nutrition", "activity", "energy", "weight"]));
    expect(artifact.confidencePublication.schemaVersion).toBe("briefing_confidence_binding_v3");
    expect(published().assessment.currentPercentage).toBe(predecessor.currentPercentage);
  });
});
