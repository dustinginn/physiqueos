import { describe, expect, it, vi } from "vitest";
import { createBriefingNavigationReadService } from "./BriefingNavigationReadService.js";

describe("Native Briefing detail composition", () => {
  it("classifies repository-backed DEXA and Photo events without relying on artifact id prefixes", async () => {
    const historyStore = {
      listHistory: vi.fn(async () => ({ artifacts: [
        { id: "opaque-a", artifactType: "event", cadence: "event", generatedAt: "2026-09-01T12:00:00.000Z", trigger: { type: "dexa_scan" } },
        { id: "opaque-b", artifactType: "event", cadence: "event", generatedAt: "2026-08-15T12:00:00.000Z", briefing: { photoEventNarrative: { photoSessionId: "photo-1" } } },
      ], hasMore: false, nextCursor: null })),
      getArtifact: vi.fn(),
      getAnalysis: vi.fn(),
    };
    const result = await createBriefingNavigationReadService({ store: historyStore }).listNativeHistory({ limit: 50 });
    expect(result.items.map((item) => item.artifactType)).toEqual(["dexa_event", "photo_event"]);
  });

  it("isolates unsupported legacy rows instead of poisoning Native history", async () => {
    const historyStore = {
      listHistory: vi.fn(async () => ({ artifacts: [
        { id: "legacy-daily", cadence: null, artifactType: null, generatedAt: "2026-09-13T13:00:00.000Z" },
        weeklyArtifact(),
      ] })),
      getArtifact: vi.fn(), getAnalysis: vi.fn(),
    };
    const result = await createBriefingNavigationReadService({ store: historyStore }).listNativeHistory({ limit: 50 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ artifactId: "weekly-2026-09-06", cadence: "weekly" });
  });

  it("returns the artifact-bound finished Weekly screen presentation instead of the raw artifact", async () => {
    const artifact = weeklyArtifact();
    const service = createBriefingNavigationReadService({ store: store(artifact) });
    const result = await service.getNativeArtifact({ artifactId: artifact.id });
    expect(result).toMatchObject({
      artifact: { artifactId: artifact.id, cadence: "weekly", version: 3 },
      goalPhaseAttribution: { goalId: "goal-build", phaseId: "phase-1" },
      historical: { frozen: true, artifactBound: true },
      presentation: {
        hero: { eyebrow: "Weekly Briefing" },
        training: { available: true },
        navigation: { backLabel: "Briefing History" },
      },
    });
    expect(result).not.toHaveProperty("briefing");
    expect(JSON.stringify(result)).not.toContain("raw-internal-marker");
  });

  it("returns the finished Midweek editorial presentation with historical Confidence binding", async () => {
    const artifact = midweekArtifact();
    const confidenceAssessment = {
      schemaVersion: "canonical_confidence_assessment_v2",
      id: "confidence-1", currentPercentage: 60, priorPercentage: 59,
      confidenceBand: "moderate", movement: "no_meaningful_change",
      movementMagnitude: 1, sourceCutoff: "2026-09-09T06:59:59.999Z", publisherType: "midweek",
      sourceLineage: {}, evidenceDurability: { contradictionState: "none" },
    };
    const service = createBriefingNavigationReadService({
      store: store(artifact, { confidenceAssessment }),
    });
    const result = await service.getNativeArtifact({ artifactId: artifact.id });
    expect(result).toMatchObject({
      artifact: { artifactId: artifact.id, cadence: "midweek", version: 2 },
      historical: { frozen: true, artifactBound: true },
      presentation: {
        hero: { verdict: "Calories are moving closer to supporting stronger training." },
        coachTake: { recommendation: expect.stringMatching(/full week/i) },
        goalConfidence: { explanationModel: { sourceAssessmentId: "confidence-1" } },
      },
    });
    expect(result.presentation.hero.verdict).not.toBe("Raw verdict");
    expect(result).not.toHaveProperty("briefing");
  });

  it("returns a bounded frozen DEXA artifact without unrelated live context", async () => {
    const artifact = {
      id: "opaque-dexa", artifactType: "event", cadence: "event", generatedAt: "2026-09-13T06:28:58.012Z",
      trigger: { evidenceType: "dexa", evidenceId: "scan-1", occurredAt: "2026-09-12" },
      goalContext: { goalId: "goal-build", phaseId: "phase-2" },
      briefing: { dexaEventNarrative: { scanId: "scan-1", snapshot: { scanDate: "2026-09-12", leanMass: 145.37 } } },
    };
    const service = createBriefingNavigationReadService({ store: store(artifact) });
    const result = await service.getNativeArtifact({ artifactId: artifact.id });
    expect(result).toEqual({
      artifact,
      goals: [],
    });
    expect(result).not.toHaveProperty("dexaScans");
    expect(result).not.toHaveProperty("phaseReviewDecisions");
    expect(result).not.toHaveProperty("workItems");
    expect(result).not.toHaveProperty("revision");
  });
});

function store(artifact, overrides = {}) {
  return {
    getAnalysis: vi.fn(),
    listHistory: vi.fn(async () => ({ artifacts: [] })),
    getArtifact: vi.fn(async () => ({
      artifact,
      user: { id: "owner", timeZone: "America/Los_Angeles" },
      goals: [], phaseReviewDecisions: [], workItems: [], revision: 9,
      confidenceAssessment: overrides.confidenceAssessment ?? null,
    })),
  };
}

function weeklyArtifact() {
  return {
    id: "weekly-2026-09-06", artifactType: "scheduled", cadence: "weekly", version: 3,
    generatedAt: "2026-09-06T14:00:00.000Z", evidenceCutoff: "2026-09-06T06:59:59.999Z",
    evidenceWindow: { id: "week-1", startDate: "2026-08-30", endDate: "2026-09-05", timeZone: "America/Los_Angeles" },
    goalContext: { goalId: "goal-build", phaseId: "phase-1" },
    briefing: { rawInternal: "raw-internal-marker", weeklyNarrative: {
      weekStart: "2026-08-30", weekEnd: "2026-09-05", goalConfidence: null,
      context: {
        activeGoalSummary: { id: "goal-build", title: "Build Lean Mass" },
        activePhase: { id: "phase-1", name: "Establish Maintenance", ageDays: 7 },
        pi: { observations: [], rankedClaims: { rankedCandidates: [] } },
      },
      cards: {
        snapshot: { facts: [] },
        progress: { training: { completedDays: 0 }, weight: null, photo: null, dexa: null },
      },
    } },
  };
}

function midweekArtifact() {
  return {
    id: "midweek-2026-09-09", artifactType: "scheduled", cadence: "midweek", version: 2,
    generatedAt: "2026-09-09T14:00:00.000Z", evidenceCutoff: "2026-09-09T06:59:59.999Z",
    evidenceWindow: { id: "midweek-1", startDate: "2026-09-06", endDate: "2026-09-08", timeZone: "America/Los_Angeles" },
    goalContext: { goalId: "goal-build", phaseId: "phase-1" },
    confidencePublication: { assessmentId: "confidence-1", publisherType: "midweek" },
    briefing: {
      hero: { verdict: "Raw verdict", summary: "Raw summary" },
      energyBalance: { estimatedDailyBalanceMidpoint: -200, chartPoints: [] },
      training: { highlights: [], watch: [], interpretation: "Raw interpretation", prioritySignals: [] },
      goalConfidence: { assessmentId: "confidence-1", score: 60, band: "moderate" },
      activeGoal: { id: "goal-build", name: "Build Lean Mass" },
      activePhase: { id: "phase-1", name: "Establish Maintenance" },
      prioritiesThroughSunday: [], charts: {}, weightContext: {}, bodyComposition: {},
    },
  };
}
