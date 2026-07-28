import { describe, expect, it, vi } from "vitest";
import { MONTHLY_DECISION_SCHEMA_FIELDS, MONTHLY_STORY_TYPES, composeMonthlyBriefingPreview, createMonthlyBriefingPreviewService } from "./MonthlyBriefingPreviewService";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";

const baseWeights = [
  { id: "jun-01", measuredAt: "2026-06-01", weight: { value: 177.1, unit: "lb" } },
  { id: "jun-15", measuredAt: "2026-06-15", weight: { value: 171.6, unit: "lb" } },
  { id: "jun-30", measuredAt: "2026-06-30", weight: { value: 166.8, unit: "lb" } },
];

const baseGoal = {
  id: "goal-visible-abs",
  title: "Visible Abs at Rest",
  timeline: { startDate: "2026-05-01", targetDate: "2026-07-18" },
};

const baseDexaScans = [
  { id: "may", measuredAt: "2026-05-24", bodyFatPercentage: { value: 13.6 }, fatMass: { value: 24.7 }, leanMass: { value: 149.1 } },
  { id: "jun", measuredAt: "2026-06-20", bodyFatPercentage: { value: 10.8 }, fatMass: { value: 18.9 }, leanMass: { value: 148.7 } },
];

const baseProgressPhotos = [
  { id: "photo-05", capturedAt: "2026-06-05", view: "front", imagePath: "private/founder/photos/2026-06-05-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
  { id: "photo-26", capturedAt: "2026-06-26", view: "front", imagePath: "private/founder/photos/2026-06-26-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
];

const baseDailyBriefings = [
  {
    id: "close",
    generatedAt: "2026-06-30T12:52:43Z",
    hero: { confidence: 90 },
    goalStatus: { primary: { progress: 92 } },
    progressEvidence: {
      dexa: { summary: "DEXA confirmed fat reduction while preserving structure." },
      photos: { summary: "Photo sequence remained directional." },
    },
  },
];

const julyInput = {
  weights: monthlyPreviewFixtures.julyContinuation.weights,
  dexaScans: monthlyPreviewFixtures.julyContinuation.dexaScans,
  progressPhotos: monthlyPreviewFixtures.julyContinuation.progressPhotos,
  dailyBriefings: monthlyPreviewFixtures.julyContinuation.dailyBriefings,
  energyContinuations: monthlyPreviewFixtures.julyContinuation.energyContinuations ?? [],
  trainingObservations: monthlyPreviewFixtures.julyContinuation.trainingObservations ?? [],
  goal: monthlyPreviewFixtures.julyContinuation.goal,
  syntheticContinuation: monthlyPreviewFixtures.julyContinuation.syntheticContinuation,
};

const ordinaryInput = {
  weights: monthlyPreviewFixtures.ordinaryMonth.weights,
  dexaScans: monthlyPreviewFixtures.ordinaryMonth.dexaScans,
  progressPhotos: monthlyPreviewFixtures.ordinaryMonth.progressPhotos,
  dailyBriefings: monthlyPreviewFixtures.ordinaryMonth.dailyBriefings,
  energyContinuations: monthlyPreviewFixtures.ordinaryMonth.energyContinuations ?? [],
  trainingObservations: monthlyPreviewFixtures.ordinaryMonth.trainingObservations ?? [],
  goal: monthlyPreviewFixtures.ordinaryMonth.goal,
  syntheticContinuation: monthlyPreviewFixtures.ordinaryMonth.syntheticContinuation,
};

const baseCompose = (fixture, synthetic = fixture.syntheticContinuation) => composeMonthlyBriefingPreview({
  weights: fixture.weights,
  dexaScans: fixture.dexaScans,
  progressPhotos: fixture.progressPhotos,
  dailyBriefings: fixture.dailyBriefings,
  energyContinuations: fixture.energyContinuations ?? [],
  trainingObservations: fixture.trainingObservations ?? [],
  goal: fixture.goal,
  syntheticContinuation: synthetic,
});

const makeSyntheticAsReal = (fixture) => ({
  ...fixture,
  syntheticContinuation: {
    ...fixture.syntheticContinuation,
    weights: (fixture.syntheticContinuation.weights ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    dexaScans: (fixture.syntheticContinuation.dexaScans ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    progressPhotos: (fixture.syntheticContinuation.progressPhotos ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    energyContinuations: (fixture.syntheticContinuation.energyContinuations ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    trainingObservations: (fixture.syntheticContinuation.trainingObservations ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    dailyBriefings: (fixture.syntheticContinuation.dailyBriefings ?? []).map((entry) => ({ ...entry, isSynthetic: false, source: "real", fixtureId: null, fixtureVersion: null, fixtureSeed: null, syntheticDateRange: null })),
    fixtureId: null,
    fixtureVersion: null,
    fixtureSeed: null,
  },
});

function getByType(decision, storyType) {
  return decision.candidates.find((candidate) => candidate.storyType === storyType);
}

function latestRealJulyBoundaryDate(input) {
  const dates = [];
  const all = [
    ...input.weights,
    ...input.progressPhotos,
    ...input.dexaScans,
    ...input.trainingObservations,
    ...input.energyContinuations,
  ];
  all.forEach((entry) => {
    if (entry?.measuredAt) dates.push(entry.measuredAt);
    if (entry?.capturedAt) dates.push(entry.capturedAt);
    if (entry?.date) dates.push(entry.date);
  });
  return dates.filter(Boolean).sort().at(-1) ?? null;
}

function candidateIdsByStoryType(decision) {
  return Object.fromEntries(decision.candidates.map((candidate) => [candidate.storyType, candidate.storyId]));
}

describe("Monthly Briefing Preview stabilization", () => {
  const requiredStoryTypes = [
    "goal_completion",
    "goal_start",
    "phase_transition",
    "new_baseline",
    "dexa_baseline",
    "dexa_comparison",
    "dexa_contradiction",
    "energy_trend",
    "training_evolution",
    "recovery_issue",
    "interruption",
    "recommendation_change",
    "confidence_shift",
    "photo_progression",
    "weight_context",
    "risk_signal",
  ];

  it("keeps accepted monthly presentation fields", () => {
    const narrative = composeMonthlyBriefingPreview({
      weights: baseWeights,
      dexaScans: baseDexaScans,
      progressPhotos: baseProgressPhotos,
      dailyBriefings: baseDailyBriefings,
      goal: baseGoal,
    });
    expect(narrative.id).toBe("monthly_briefing_preview_2026_07_01");
    expect(narrative.preview).toBe(true);
    expect(narrative.deliveryDate).toBe("2026-07-01");
    expect(narrative.reviewWindow).toEqual({ startDate: "2026-06-01", endDate: "2026-07-30", deliveryDate: "2026-07-01" });
    expect(narrative.hero.title).toBeTypeOf("string");
    expect(narrative.weightStory.points).toHaveLength(3);
    expect(narrative.chapterAhead.guidance).toHaveLength(4);
    expect(narrative.costOfProgress).toBeNull();
  });

  it("corrects July goal completion to 2026-07-18 with 7.7% final body fat", () => {
    const july = baseCompose(julyInput);
    const decision = july.editorialDecision;
    const completion = getByType(decision, "goal_completion");
    const baseline = getByType(decision, "new_baseline");
    const ids = candidateIdsByStoryType(decision);
    expect(completion).toBeTruthy();
    expect(completion.storyWindow.startDate).toBe("2026-07-18");
    expect(completion.storyWindow.endDate).toBe("2026-07-18");
    expect(completion.storyId).toBe(ids.goal_completion);
    expect(completion.storyId).toContain("2026-07-18");
    expect(completion.evidenceRefs.join(" ")).toContain("goal_2026-07-18");
    expect(baseline).toBeTruthy();
    expect(baseline.provenance.bodyFat).toBe(7.7);
    expect(baseline.timeWindow.startDate).toBe("2026-07-18");
    requiredStoryTypes.forEach((storyType) => {
      expect(MONTHLY_STORY_TYPES).toContain(storyType);
    });
    MONTHLY_DECISION_SCHEMA_FIELDS.forEach((field) => {
      expect(completion).toHaveProperty(field);
    });
  });

  it("computes synthetic continuation dynamically from the latest real evidence", () => {
    const july = baseCompose(julyInput);
    const latestReal = latestRealJulyBoundaryDate({
      weights: julyInput.weights,
      progressPhotos: julyInput.progressPhotos,
      dexaScans: julyInput.dexaScans,
      trainingObservations: julyInput.trainingObservations,
      energyContinuations: julyInput.energyContinuations,
    });
    const synthetic = july.editorialDecision.synthetic;

    expect(latestReal).toBe("2026-06-30");
    expect(synthetic.active).toBe(true);
    expect(synthetic.realEvidenceCutoff).toBe("2026-06-30");
    expect(synthetic.syntheticStart).toBe("2026-07-01");
    expect(synthetic.syntheticEnd).toBe("2026-07-30");

    const syntheticDates = [
      ...julyInput.syntheticContinuation.weights,
      ...julyInput.syntheticContinuation.dexaScans,
      ...julyInput.syntheticContinuation.progressPhotos,
      ...julyInput.syntheticContinuation.energyContinuations,
      ...julyInput.syntheticContinuation.trainingObservations,
    ]
      .map((entry) => entry.measuredAt || entry.date || entry.capturedAt)
      .filter(Boolean)
      .sort();
    expect(syntheticDates.every((date) => date > "2026-06-30")).toBe(true);
  });

  it("keeps carry-in comparison context separate from July story windows", () => {
    const july = baseCompose(julyInput);
    const decision = july.editorialDecision;
    const boundary = "2026-07-01";
    const candidates = decision.candidates.filter((candidate) => ["phase_transition", "energy_trend", "training_evolution", "dexa_baseline", "dexa_comparison", "photo_progression", "weight_context", "risk_signal", "interruption"].includes(candidate.storyType));
    candidates.forEach((candidate) => {
      expect(candidate.storyWindow).toBeTruthy();
      expect(candidate.storyWindow.startDate >= boundary).toBe(true);
      if (candidate.carryInContext) {
        expect(candidate.comparisonWindow).toBeTruthy();
      }
    });

    const comparison = getByType(decision, "dexa_comparison");
    if (comparison) {
      expect(comparison.storyWindow.startDate >= boundary).toBe(true);
      expect(comparison.carryInContext).toBe(true);
      expect(comparison.provenance.direction).not.toBe("improving");
    }
  });

  it("keeps synthetic records in fixture metadata-only slots without affecting production composition context", () => {
    const julyWithSynthetic = baseCompose(julyInput);
    const julyWithoutSynthetic = baseCompose(julyInput, null);

    const syntheticRecords = julyWithSynthetic.editorialDecision.candidates.filter((candidate) => candidate.syntheticInvolvement);
    expect(syntheticRecords.length).toBeGreaterThan(0);
    expect(syntheticRecords.every((entry) => entry.provenance.source.startsWith("monthly_"))).toBe(true);
    expect(julyWithSynthetic.editorialDecision.synthetic.active).toBe(true);
    expect(julyWithoutSynthetic.editorialDecision.synthetic.active).toBe(false);
    expect(julyWithoutSynthetic.weightStory.points).toEqual(julyWithSynthetic.weightStory.points);
  });

  it("separates bounded milestones from ranked editorial stories and keeps capacity for editorial stories", () => {
    const july = baseCompose(julyInput);
    const decision = july.editorialDecision;
    const ids = candidateIdsByStoryType(decision);
    const bounded = decision.boundedMilestoneCandidateIds;
    const ranked = decision.rankedEditorialStoryIds;
    const hero = decision.heroThesisCandidateIds;

    expect(decision.renderedCandidateIds).toEqual(expect.arrayContaining(ranked));
    expect(decision.renderedCandidateIds).toEqual(expect.arrayContaining(bounded));
    expect(decision.rankedEditorialStoryIds.length).toBeLessThanOrEqual(7);
    expect(bounded).toContain(ids.goal_completion);
    expect(ranked.includes(ids.goal_completion)).toBe(false);
    expect(ranked.length).toBeGreaterThanOrEqual(2);

    const heroTypes = hero
      .map((id) => decision.candidates.find((candidate) => candidate.storyId === id)?.storyType)
      .filter(Boolean);
    expect(heroTypes[0]).toBe("new_baseline");
    expect(heroTypes).toContain("energy_trend");
    expect(heroTypes).toContain("training_evolution");
  });

  it("keeps ordinary-month fixture transition-free and non-contradictory", () => {
    const ordinary = baseCompose(ordinaryInput);
    const decision = ordinary.editorialDecision;
    ["goal_completion", "goal_start", "phase_transition", "dexa_baseline", "new_baseline", "risk_signal", "interruption", "dexa_comparison", "dexa_contradiction"].forEach((type) => {
      expect(getByType(decision, type)).toBeNull();
    });
    expect(getByType(decision, "photo_progression")).toBeTruthy();
    expect(getByType(decision, "training_evolution")).toBeTruthy();
    expect(decision.synthetic.active).toBe(false);
    expect(decision.selectedStoryCount).toBeGreaterThan(0);
    expect(decision.selectedStoryCount).toBeLessThanOrEqual(7);
  });

  it("does not include unsupported risk/interruption stories from July fixture", () => {
    const july = baseCompose(julyInput);
    expect(getByType(july.editorialDecision, "risk_signal")).toBeNull();
    expect(getByType(july.editorialDecision, "interruption")).toBeNull();
  });

  it("keeps ranked editorial candidate schema and suppression metadata deterministic", () => {
    const july = baseCompose(julyInput);
    const julyWithReal = baseCompose(julyInput, makeSyntheticAsReal(julyInput).syntheticContinuation);
    const withSyntheticScores = july.editorialDecision.candidates.map((candidate) => [candidate.storyId, candidate.score]);
    const withRealScores = julyWithReal.editorialDecision.candidates.map((candidate) => [candidate.storyId, candidate.score]);
    expect(withSyntheticScores).toEqual(withRealScores);

    const candidateSchema = july.editorialDecision.candidates.at(0);
    MONTHLY_DECISION_SCHEMA_FIELDS.forEach((field) => {
      expect(candidateSchema).toHaveProperty(field);
    });

    const excluded = july.editorialDecision.candidates.find((candidate) => !candidate.included);
    if (excluded) {
      expect(excluded.exclusionReason).toBeTruthy();
    }
  });

  it("keeps Monthly service read-only and production-safe", async () => {
    const repositories = {
      weights: { listWeightEntries: vi.fn(async () => baseWeights) },
      dexaScans: { listDEXAScans: vi.fn(async () => baseDexaScans) },
      progressPhotos: { listPhotos: vi.fn(async () => baseProgressPhotos) },
      dailyBriefings: { listDailyBriefings: vi.fn(async () => baseDailyBriefings) },
      goals: { getActiveGoal: vi.fn(async () => baseGoal) },
      operations: {
        createDailyBriefing: vi.fn(),
        updateGoal: vi.fn(),
        persistBriefing: vi.fn(),
      },
      logs: { create: vi.fn() },
    };

    const beforeWeights = JSON.stringify(baseWeights);
    const beforeDexa = JSON.stringify(baseDexaScans);
    const beforePhotos = JSON.stringify(baseProgressPhotos);
    const beforeDaily = JSON.stringify(baseDailyBriefings);

    const result = await createMonthlyBriefingPreviewService({ repositories }).preview({ userId: "founder" });

    expect(result.id).toBe("monthly_briefing_preview_2026_07_01");
    expect(repositories.weights.listWeightEntries).toHaveBeenCalledWith("founder");
    expect(repositories.dexaScans.listDEXAScans).toHaveBeenCalledWith("founder");
    expect(repositories.progressPhotos.listPhotos).toHaveBeenCalledWith("founder");
    expect(repositories.dailyBriefings.listDailyBriefings).toHaveBeenCalledWith("founder");
    expect(repositories.goals.getActiveGoal).toHaveBeenCalledWith("founder");
    expect(repositories.operations.createDailyBriefing).not.toHaveBeenCalled();
    expect(repositories.operations.updateGoal).not.toHaveBeenCalled();
    expect(repositories.logs.create).not.toHaveBeenCalled();
    expect(JSON.stringify(baseWeights)).toBe(beforeWeights);
    expect(JSON.stringify(baseDexaScans)).toBe(beforeDexa);
    expect(JSON.stringify(baseProgressPhotos)).toBe(beforePhotos);
    expect(JSON.stringify(baseDailyBriefings)).toBe(beforeDaily);
  });
});

