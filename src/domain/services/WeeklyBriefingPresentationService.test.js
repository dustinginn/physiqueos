import { describe, expect, it, vi } from "vitest";
import {
  adaptWeeklyArtifactForPresentation,
  createWeeklyEnergyProgressModel,
} from "./WeeklyBriefingPresentationService";

const window = {
  id: "weekly_2026-07-19_2026-07-25",
  startDate: "2026-07-19",
  endDate: "2026-07-25",
  timeZone: "America/Los_Angeles",
};

describe("WeeklyBriefingPresentationService", () => {
  it("maps the canonical closed-window assessment into a compact seven-day model", () => {
    const model = createWeeklyEnergyProgressModel({
      window,
      dailyRecords: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-07-${19 + index}`,
        calorieIntake: 2400 + index,
        estimatedExpenditure: 2500 + index,
        energyBalance: -100,
        eligibility: { paired: true },
      })),
      intake: { average: 2403 },
      estimatedExpenditure: { average: 2503 },
      netBalance: { average: -100 },
      coverage: { pairedDayCount: 7, eligibleDayCount: 7 },
      provenance: { calculationMethod: "canonical_reconciled_rmr_plus_active" },
    });

    expect(model.chart.points).toHaveLength(7);
    expect(model.chart.points[0]).toMatchObject({
      label: "Su",
      intake: 2400,
      expenditure: 2500,
      balance: -100,
      complete: true,
    });
    expect(model).toMatchObject({
      averageIntake: 2403,
      averageExpenditure: 2503,
      averageBalance: -100,
      pairedDayCount: 7,
      eligibleDayCount: 7,
    });
  });

  it("adapts artifact-owned PI summaries without reading mutable repositories", async () => {
    const artifact = {
      id: "weekly_briefing_2026-07-19_2026-07-25",
      evidenceWindow: window,
      briefing: {
        weeklyNarrative: {
          cards: { progress: { weight: { weeklyAverage: 164.4 } } },
          context: {
            pi: {
              observations: [
                { domain: "energy", kind: "energy_intake", explanationData: { currentAverage: 2400 } },
                { domain: "energy", kind: "energy_expenditure", explanationData: { currentAverage: 2500 } },
                { domain: "energy", kind: "energy_balance", explanationData: { currentAverage: -100 } },
                {
                  domain: "energy",
                  kind: "paired_day_coverage",
                  supportingEvidenceIds: ["nutrition|2026-07-19|n1", "activity_day|2026-07-19"],
                  explanationData: { evidenceDays: 7, completePairedDays: 1, partialDays: 0 },
                },
              ],
            },
          },
        },
      },
    };
    const nutrition = {
      evidence_type: "nutrition",
      date: "2026-07-19",
      calories: 2400,
      quality: { status: "active" },
    };
    const activity = {
      evidence_type: "activity_day",
      date: "2026-07-19",
      move_calories: 800,
      quality: { status: "active" },
    };
    const repositories = {
      canonicalEvidence: {
        listCanonicalEvidenceObjects: vi.fn().mockResolvedValue([nutrition, activity]),
      },
      dexaScans: { listDEXAScans: vi.fn().mockResolvedValue([]) },
    };

    const result = await adaptWeeklyArtifactForPresentation({
      artifact,
      repositories,
      userId: "founder",
    });

    expect(result).not.toBe(artifact);
    expect(artifact.briefing.weeklyNarrative.cards.progress.energy).toBeUndefined();
    expect(result.briefing.weeklyNarrative.cards.progress.energy).toBeTruthy();
    expect(result.briefing.weeklyNarrative.cards.progress.energy.averageIntake).toBe(2400);
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).not.toHaveBeenCalled();
  });

  it("adds canonical selector output to structured artifacts without repository reads", async () => {
    const energy = { chart: { points: [] } };
    const presentation = { counts: {}, categorySummaries: [] };
    const artifact = {
      briefing: {
        weeklyNarrative: {
          cards: { progress: { energy, training: { presentation } } },
          context: {
            pi: {
              observations: [
                { id: "t1", domain: "training", status: "improving", subject: { type: "training_category", id: "chest" } },
                { id: "t2", domain: "training", status: "improving", subject: { type: "training_category", id: "quads" } },
                { id: "e1", domain: "energy", kind: "energy_balance", explanationData: { currentAverage: -405 } },
                { id: "w1", domain: "weight", kind: "weight_trend" },
                { id: "p1", domain: "photos", kind: "photo_visual_stability" },
              ],
            },
          },
        },
      },
    };
    const repositories = {
      canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn() },
    };
    const result = await adaptWeeklyArtifactForPresentation({ artifact, repositories });
    expect(result).not.toBe(artifact);
    expect(result.briefing.weeklyNarrative.narrativePresentationSelection.interpretation.items.map((item) => item.key)).toEqual([
      "training",
      "energy",
      "weight",
      "photos",
    ]);
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).not.toHaveBeenCalled();
  });
});
