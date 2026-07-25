import { describe, expect, it } from "vitest";
import {
  CADENCE_RMR_STRATEGIES,
  createCadenceEnergyAssessment,
  createCadenceEnergyComparison,
  isCadenceEnergyAssessment,
  validateCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";

const window = {
  startDate: "2026-07-19",
  endDate: "2026-07-21",
  timeZone: "America/Los_Angeles",
};
const nutritionDays = [
  { id: "n2", date: "2026-07-20", totals: { calories: 2200 } },
  { id: "n1", date: "2026-07-19", totals: { calories: 2100 } },
];
const activityDays = [
  { id: "a1", date: "2026-07-19", activeCalories: 500 },
  { id: "a2", date: "2026-07-20", activeCalories: 600 },
];
const scans = [
  { id: "old", measuredAt: "2026-07-01", restingMetabolicRate: { value: 1800 } },
  { id: "new", measuredAt: "2026-07-20", restingMetabolicRate: { value: 1900 } },
];

describe("CadenceEnergyAssessmentService", () => {
  it("reproduces latest eligible RMR across the full cadence window", () => {
    const result = createCadenceEnergyAssessment({
      cadence: "midweek",
      window,
      nutritionDays,
      activityDays,
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    expect(result.rmr).toMatchObject({
      value: 1900,
      sourceDexaId: "new",
      sourceDexaDate: "2026-07-20",
      latestEligibleUsedAcrossFullWindow: true,
    });
    expect(result.intake).toMatchObject({ total: 4300, average: 2150 });
    expect(result.activity).toMatchObject({ total: 1100, average: 550 });
    expect(result.estimatedExpenditure).toMatchObject({
      total: 4900,
      average: 2450,
    });
    expect(result.netBalance).toMatchObject({
      total: -600,
      average: -300,
      direction: "probably_below",
    });
    expect(result.coverage).toMatchObject({
      pairedDayCount: 2,
      missingDayCount: 1,
      state: "partial",
    });
    expect(result.supportingEvidenceIds).toEqual([
      "a1", "a2", "n1", "n2", "new",
    ]);
  });

  it("preserves historical per-day RMR selection", () => {
    const result = createCadenceEnergyAssessment({
      cadence: "midweek",
      window,
      nutritionDays,
      activityDays,
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.HISTORICAL_BY_DAY,
    });
    expect(result.dailyRecords.map((row) => row.rmrScanId)).toEqual([
      "old", "new", "new",
    ]);
    expect(result.estimatedExpenditure.total).toBe(4800);
    expect(result.rmr.historicalPerDaySelection).toBe(true);
    expect(result.rmr.value).toBeNull();
  });

  it("reports partial and missing coverage without fabricating balance", () => {
    const result = createCadenceEnergyAssessment({
      cadence: "weekly",
      window,
      nutritionDays: [nutritionDays[0]],
      activityDays: [activityDays[0]],
      dexaScans: [],
    });
    expect(result.netBalance.total).toBeNull();
    expect(result.coverage).toMatchObject({
      pairedDayCount: 0,
      unpairedNutritionDayCount: 1,
      unpairedActivityDayCount: 1,
      missingDayCount: 1,
      state: "insufficient",
    });
    expect(result.limitations).toContain("rmr_unavailable");
  });

  it("compares exact assessments using neutral directions", () => {
    const current = createCadenceEnergyAssessment({
      cadence: "midweek",
      window,
      nutritionDays,
      activityDays,
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    const previous = createCadenceEnergyAssessment({
      cadence: "midweek",
      window: { startDate: "2026-07-12", endDate: "2026-07-14" },
      nutritionDays: [{ id: "pn", date: "2026-07-12", totals: { calories: 2000 } }],
      activityDays: [{ id: "pa", date: "2026-07-12", activeCalories: 400 }],
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    expect(createCadenceEnergyComparison(current, previous)).toMatchObject({
      intake: { direction: "rising" },
      estimatedExpenditure: { direction: "rising" },
      rmrStrategyCompatible: true,
    });
  });

  it("is deterministic, immutable, JSON-safe, timezone-aware, and repository-free", () => {
    const input = {
      cadence: "midweek",
      window,
      nutritionDays: [{
        id: "n",
        observed_at: "2026-07-20T01:00:00Z",
        daily_totals: { calories: 2100 },
      }],
      activityDays: [{
        id: "a",
        observed_at: "2026-07-20T01:00:00Z",
        daily_activity: { move_calories: 500 },
      }],
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    };
    const before = structuredClone(input);
    const first = createCadenceEnergyAssessment(input);
    const second = createCadenceEnergyAssessment(input);
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(first.dailyRecords[0].date).toBe("2026-07-19");
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.provenance.repositoryReads).toBe(0);
    expect(isCadenceEnergyAssessment(first)).toBe(true);
    expect(validateCadenceEnergyAssessment(first)).toBe(first);
    expect(() => validateCadenceEnergyAssessment({})).toThrow(
      /Invalid cadence Energy assessment/
    );
  });

  it("exactly reproduces the existing Midweek Energy calculation contract", () => {
    const canonicalObjects = [
      {
        canonicalId: "n1",
        evidence_type: "nutrition",
        payload: {
          observed_at: "2026-07-19",
          daily_totals: { calories: 2100 },
        },
      },
      {
        canonicalId: "a1",
        evidence_type: "activity_day",
        payload: {
          observed_at: "2026-07-19",
          daily_activity: { move_calories: 500 },
        },
      },
      {
        canonicalId: "n2",
        evidence_type: "nutrition",
        payload: {
          observed_at: "2026-07-20",
          daily_totals: { calories: 2200 },
        },
      },
      {
        canonicalId: "a2",
        evidence_type: "activity_day",
        payload: {
          observed_at: "2026-07-20",
          daily_activity: { move_calories: 600 },
        },
      },
    ];
    const midweek = composeMidweekBriefingPreview({
      window: { ...window, briefingDate: "2026-07-22" },
      canonicalObjects,
      dexaScans: scans,
      generatedAt: "2026-07-22T12:00:00.000Z",
    }).energyBalance;
    const assessment = createCadenceEnergyAssessment({
      cadence: "midweek",
      window,
      nutritionDays: canonicalObjects.filter(
        (item) => item.evidence_type === "nutrition"
      ),
      activityDays: canonicalObjects.filter(
        (item) => item.evidence_type === "activity_day"
      ),
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    expect(assessment.intake).toMatchObject({
      total: midweek.totalIntake,
      average: midweek.averageIntake,
    });
    expect(assessment.activity).toMatchObject({
      total: midweek.totalActiveEnergy,
      average: midweek.averageActiveEnergy,
    });
    expect(assessment.rmr.value).toBe(midweek.restingEnergyBasis);
    expect(assessment.estimatedExpenditure.average).toBe(
      midweek.estimatedAverageExpenditure
    );
    expect(assessment.netBalance.average).toBe(
      midweek.estimatedAverageDailyBalance
    );
    expect(assessment.netBalance.total).toBe(midweek.cumulativeBalance);
    expect(assessment.coverage.pairedDayCount).toBe(midweek.comparableDays);
  });

  it("preserves partial source completeness without changing numeric totals", () => {
    const result = createCadenceEnergyAssessment({
      cadence: "weekly",
      window,
      nutritionDays: [
        {
          id: "n1",
          date: "2026-07-19",
          totals: { calories: 2100 },
          metadata: { completeness: "complete" },
        },
        {
          id: "n2",
          date: "2026-07-20",
          totals: { calories: 2200 },
          metadata: { completeness: "partial" },
        },
      ],
      activityDays: [
        {
          id: "a1",
          date: "2026-07-19",
          activeCalories: 500,
          metadata: { completeness: "complete" },
        },
        {
          id: "a2",
          date: "2026-07-20",
          activeCalories: 600,
          metadata: { completeness: "complete" },
        },
      ],
      dexaScans: scans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    expect(result.intake).toMatchObject({
      total: 4300,
      completeDayCount: 1,
      partialDayCount: 1,
      unknownDayCount: 0,
    });
    expect(result.activity).toMatchObject({
      total: 1100,
      completeDayCount: 2,
      partialDayCount: 0,
    });
    expect(result.coverage).toMatchObject({
      pairedDayCount: 2,
      completePairedDayCount: 1,
      partialPairedDayCount: 1,
      coverageRatio: 0.5,
      state: "partial",
    });
    expect(result.dailyRecords[1]).toMatchObject({
      nutritionCompleteness: "partial",
      activityCompleteness: "complete",
      pairedCompleteness: "partial",
      eligibility: { paired: true },
    });
    expect(result.limitations).toContain("paired_coverage_partial");
  });
});
