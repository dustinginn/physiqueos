import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../../data/repositories/DailyBriefingRepository";
import { createMidweekBriefingService } from "../../services/MidweekBriefingService.js";
import { createWeeklyNarrativeService } from "../../services/WeeklyNarrativeService.js";
import { createEnergyPIObservations } from "../../services/EnergyPIObservationService.js";
import { createEnergyVariabilityBaselineDays } from "../../services/CadenceEnergyAssessmentService.js";
import { adaptCadenceEvidenceObservationsV3 } from "../ProductionConfidenceNarrativeV3Adapter.js";
import { adaptEnergyObservationsV3 } from "../CadenceEnergyObservationsV3.js";
import { deriveEnergyExecutionV3 } from "./EnergyAmbiguityV3.js";
import { assessEnergyVariabilityV3 } from "./EnergyVariabilityV3.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { createPairedCalibrationFixtures } from "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import {
  ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS,
  isComparableNutritionDay,
  resolveEnergyVariabilityBaselineWindow,
  selectEnergyVariabilityBaselineSeries,
} from "./EnergyVariabilityBaselineV3.js";

// Release Blocker 2. EnergyVariabilityV3 needs >=14 paired historical days
// (that minimum is asserted below and is NOT lowered). The recurring cadences
// only supply an equal-length comparison window (3 days Midweek, 7 Weekly), so
// the signal could never fire live. These tests prove the bounded preceding
// baseline reaches the engine through the REAL cadence read path, is bounded
// to the active protocol regime, never contains current-window values, and
// keeps completeness separate from target distance and interpretation.

const TARGET = 2500;
const goalContract = (energyStrategy = {}) => ({
  goalId: "goal_1",
  phase: { phaseId: "phase_1" },
  strategy: {
    strategyRevisionId: "strategy_1",
    energyStrategy: {
      intakeTarget: { value: TARGET, unit: "kcal/day" },
      activityTarget: { value: 800, unit: "kcal/day" },
      adjustmentAuthorization: "user_required",
      automaticAdjustmentAllowed: false,
      ...energyStrategy,
    },
  },
});

function shift(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function range(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = shift(date, 1)) dates.push(date);
  return dates;
}
function row(date, calorieIntake, nutritionCompleteness = "complete") {
  return {
    date, calorieIntake, activeCalories: 500, rmr: 1700, rmrScanId: "dexa_1", rmrScanDate: "2026-01-01",
    estimatedExpenditure: 2200, energyBalance: calorieIntake - 2200,
    nutritionCompleteness, pairedCompleteness: nutritionCompleteness,
    nutritionAuthority: { tier: "full_day_asserted", ambiguity: [] },
    activitySource: { captureMethod: "device_aggregate", reliability: "high", measurementType: "wearable_estimate" },
  };
}
const rowsFor = (dates, valueOf, completeness = "complete") =>
  dates.map((date, index) => row(date, typeof valueOf === "function" ? valueOf(date, index) : valueOf, completeness));

// A contract that has been through the REAL createGoalContractV3 normalizer,
// exactly like the live adapter's contract (the normalizer must keep
// energyStrategy.effectiveAt or the regime boundary is unknowable live).
function normalizedGoalContract(energyStrategy = {}) {
  const base = createPairedCalibrationFixtures().weekly.goalContract;
  return createGoalContractV3({
    ...base,
    strategy: {
      ...base.strategy,
      energyStrategy: {
        intakeTarget: { value: TARGET, unit: "kcal/day" },
        activityTarget: { value: 800, unit: "kcal/day" },
        adjustmentAuthorization: "user_required",
        automaticAdjustmentAllowed: false,
        ...energyStrategy,
      },
    },
  });
}

// Runs the real Energy path: per-day rows -> EnergyPIObservationService (with
// the bounded baseline) -> CadenceEnergyObservationsV3 -> EnergyAmbiguityV3.
function runEnergy({ window, currentRows, priorRows, effectiveAt = null, useBaseline = true }) {
  const baselineWindow = resolveEnergyVariabilityBaselineWindow(window);
  const comparisonWindow = { startDate: shift(window.startDate, -7), endDate: shift(window.endDate, -7) };
  const piObservations = createEnergyPIObservations({
    days: [...priorRows.filter((day) => day.date >= comparisonWindow.startDate && day.date <= comparisonWindow.endDate),
      ...currentRows],
    observationWindow: window,
    comparisonWindow,
    semanticHorizon: "cadence",
    ...(useBaseline ? { baselineDays: priorRows, baselineWindow } : {}),
  });
  const contract = goalContract(effectiveAt ? { effectiveAt } : {});
  const observations = adaptEnergyObservationsV3({
    observations: piObservations, goalContract: contract, artifactId: "t", evidenceCutoff: window.endDate,
  });
  const intake = observations.find((item) => item.capabilities.some((c) => c.capabilityId === "execution.energy_intake"));
  return {
    piObservations,
    intakeMetadata: intake?.capabilities.find((c) => c.capabilityId === "execution.energy_intake").metadata,
    execution: deriveEnergyExecutionV3({ goalContract: contract, observations }),
  };
}

const MIDWEEK = { startDate: "2026-09-13", endDate: "2026-09-15" };
const WEEKLY = { startDate: "2026-09-13", endDate: "2026-09-19" };
const priorDates = (window, count) => range(shift(window.startDate, -count), shift(window.startDate, -1));

describe("EnergyVariabilityV3 historical baseline — regime boundary survives contract normalization", () => {
  it("createGoalContractV3 preserves energyStrategy.effectiveAt (it used to be dropped, making the boundary unknowable live)", () => {
    const contract = normalizedGoalContract({ effectiveAt: "2026-08-30T17:00:00.000Z" });
    expect(contract.strategy.energyStrategy.effectiveAt).toBe("2026-08-30T17:00:00.000Z");
    expect(normalizedGoalContract().strategy.energyStrategy.effectiveAt).toBeNull();
  });

  it("a normalized contract drives segmentation end to end (pre-effective days excluded)", () => {
    const window = MIDWEEK;
    const prior = rowsFor(priorDates(window, 42), (date) => (date < "2026-08-30" ? 3100 : TARGET));
    const currentRows = rowsFor(range(window.startDate, window.endDate), 3100);
    const piObservations = createEnergyPIObservations({
      days: currentRows, observationWindow: window, semanticHorizon: "cadence",
      baselineDays: prior, baselineWindow: resolveEnergyVariabilityBaselineWindow(window),
    });
    const run = (effectiveAt) => {
      const contract = normalizedGoalContract({ effectiveAt });
      const observations = adaptEnergyObservationsV3({
        observations: piObservations, goalContract: contract, artifactId: "t", evidenceCutoff: window.endDate,
      });
      return deriveEnergyExecutionV3({ goalContract: contract, observations }).variability;
    };
    expect(run("2026-08-30T00:00:00.000Z").historicalOffPlanRatio).toBe(0);
    expect(run("2026-08-30T00:00:00.000Z").nudgeWarranted).toBe(true);
    expect(run("2026-06-01T00:00:00.000Z").nudgeWarranted).toBe(false);
  });
});

describe("EnergyVariabilityV3 historical baseline — constants and window", () => {
  it("keeps the 14-paired-day minimum (not lowered) and documents a 42-day bounded lookback", () => {
    expect(ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS).toBe(42);
    const thirteen = assessEnergyVariabilityV3({
      periodDailyDeviations: range("2026-09-13", "2026-09-15").map((date) => ({ date, hasPairedEvidence: true, deviationRatio: 3 })),
      historicalDailyDeviations: range("2026-08-01", "2026-08-13").map((date) => ({ date, hasPairedEvidence: true, deviationRatio: 0 })),
    });
    const fourteen = assessEnergyVariabilityV3({
      periodDailyDeviations: range("2026-09-13", "2026-09-15").map((date) => ({ date, hasPairedEvidence: true, deviationRatio: 3 })),
      historicalDailyDeviations: range("2026-08-01", "2026-08-14").map((date) => ({ date, hasPairedEvidence: true, deviationRatio: 0 })),
    });
    expect(thirteen.hasSufficientHistoricalBaseline).toBe(false);
    expect(thirteen.nudgeWarranted).toBe(false);
    expect(fourteen.hasSufficientHistoricalBaseline).toBe(true);
    expect(fourteen.nudgeWarranted).toBe(true);
  });

  it("resolves a baseline that ends the day before the window and does not depend on the cadence window length", () => {
    for (const window of [MIDWEEK, WEEKLY]) {
      const baseline = resolveEnergyVariabilityBaselineWindow(window);
      expect(baseline.endDate).toBe("2026-09-12");
      expect(baseline.startDate).toBe("2026-08-02");
      expect(range(baseline.startDate, baseline.endDate)).toHaveLength(42);
    }
  });

  it("rejects a window without a start date rather than guessing an unbounded range", () => {
    expect(() => resolveEnergyVariabilityBaselineWindow({})).toThrow(/startDate/);
  });
});

describe("EnergyVariabilityV3 historical baseline — nudge behavior with a sufficient baseline", () => {
  const quiet = (window, count = 28) => rowsFor(priorDates(window, count), TARGET);

  it("Midweek (3-day): 14+ comparable prior days + a repeated upward current pattern nudges upward", () => {
    const { execution, intakeMetadata } = runEnergy({
      window: MIDWEEK, priorRows: quiet(MIDWEEK), currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100),
      effectiveAt: "2026-07-01",
    });
    expect(intakeMetadata.baselineDailySeries.length).toBeGreaterThanOrEqual(14);
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("upward");
  });

  it("Weekly (7-day): 14+ comparable prior days + a repeated downward current pattern nudges downward", () => {
    const { execution } = runEnergy({
      window: WEEKLY, priorRows: quiet(WEEKLY, 35),
      currentRows: rowsFor(range(WEEKLY.startDate, WEEKLY.endDate), (date, index) => (index < 4 ? 1900 : 2500)),
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("downward");
  });

  it("a single current-window spike does not nudge", () => {
    const { execution } = runEnergy({
      window: WEEKLY, priorRows: quiet(WEEKLY),
      currentRows: rowsFor(range(WEEKLY.startDate, WEEKLY.endDate), (date, index) => (index === 3 ? 4000 : 2500)),
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("isolated_or_mixed_deviation_not_a_pattern");
  });

  it("a single current-window valley does not nudge", () => {
    const { execution } = runEnergy({
      window: WEEKLY, priorRows: quiet(WEEKLY),
      currentRows: rowsFor(range(WEEKLY.startDate, WEEKLY.endDate), (date, index) => (index === 3 ? 1500 : 2500)),
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("isolated_or_mixed_deviation_not_a_pattern");
  });

  it("a person whose spikes are historically common is not over-triggered", () => {
    // ~57% of the last five weeks were well above plan for this person.
    const prior = rowsFor(priorDates(WEEKLY, 35), (date, index) => (index % 7 < 4 ? 3100 : 2500));
    const { execution } = runEnergy({
      window: WEEKLY, priorRows: prior,
      currentRows: rowsFor(range(WEEKLY.startDate, WEEKLY.endDate), (date, index) => (index < 4 ? 3100 : 2500)),
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.meetsPatternThreshold).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.reasonCode).toBe("within_this_persons_own_normal_range");
  });

  it("insufficient prior comparable history stays conservative (no nudge, low confidence)", () => {
    const { execution } = runEnergy({
      window: MIDWEEK, priorRows: rowsFor(priorDates(MIDWEEK, 10), TARGET),
      currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100), effectiveAt: "2026-07-01",
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
    expect(execution.variability.confidence).toBe("low_insufficient_history");
    expect(execution.variability.reasonCode).toBe("insufficient_history_for_user_relative_baseline");
  });

  it("without the extended baseline the same live-shaped cadence can never reach the minimum (the defect this fixes)", () => {
    const { execution } = runEnergy({
      window: MIDWEEK, priorRows: quiet(MIDWEEK), currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100),
      effectiveAt: "2026-07-01", useBaseline: false,
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });
});

describe("EnergyVariabilityV3 historical baseline — protocol-regime segmentation", () => {
  // The full 42-day lookback; the FIRST 28 days sit under a previous regime
  // (a higher target, so 3,100 kcal was on plan then but is well above today's
  // 2,500); the LAST 14 days are on plan under the current regime.
  const prior = rowsFor(priorDates(MIDWEEK, 42), (date) => (date < "2026-08-30" ? 3100 : TARGET));
  const currentRows = rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100);

  it("days before energyStrategy.effectiveAt never enter the baseline (and would have masked the pattern if they did)", () => {
    const segmented = runEnergy({ window: MIDWEEK, priorRows: prior, currentRows, effectiveAt: "2026-08-30" });
    expect(segmented.execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(segmented.execution.variability.historicalOffPlanRatio).toBe(0);
    expect(segmented.execution.variability.nudgeWarranted).toBe(true);
    // Contrast: the same rows with the regime boundary ignored (effective long
    // ago) are dominated by pre-change days and no longer read as unusual.
    const unsegmented = runEnergy({ window: MIDWEEK, priorRows: prior, currentRows, effectiveAt: "2026-07-01" });
    expect(unsegmented.execution.variability.historicalOffPlanRatio).toBeGreaterThan(0.6);
    expect(unsegmented.execution.variability.nudgeWarranted).toBe(false);
  });

  it("a change that leaves fewer than 14 comparable days is conservative (no nudge)", () => {
    const { execution } = runEnergy({ window: MIDWEEK, priorRows: prior, currentRows, effectiveAt: "2026-09-05" });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("a change inside the current window excludes the pre-change current days from the pattern as well", () => {
    const { execution } = runEnergy({ window: MIDWEEK, priorRows: rowsFor(priorDates(MIDWEEK, 28), TARGET), currentRows, effectiveAt: "2026-09-14" });
    expect(execution.variability.pairedDayCount).toBe(2);
  });

  it("with no known effective date the extended lookback is not trusted (regime unprovable) and stays conservative", () => {
    const { execution } = runEnergy({ window: MIDWEEK, priorRows: rowsFor(priorDates(MIDWEEK, 28), TARGET), currentRows });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });
});

describe("EnergyVariabilityV3 historical baseline — current window is never part of the baseline", () => {
  it("baseline rows are strictly before the window and current values are absent, even if upstream leaks them", () => {
    const window = WEEKLY;
    const leaked = [...rowsFor(priorDates(window, 28), TARGET), ...rowsFor(range(window.startDate, window.endDate), 4000)];
    const series = selectEnergyVariabilityBaselineSeries({
      days: leaked, observationWindow: window, baselineWindow: resolveEnergyVariabilityBaselineWindow(window),
    });
    expect(series).toHaveLength(28);
    expect(series.every((day) => day.date < window.startDate)).toBe(true);
    expect(series.some((day) => day.value === 4000)).toBe(false);
    expect(new Set(series.map((day) => day.date)).size).toBe(series.length);
  });

  it("the served baseline series and the assessed history share no date with the current period", () => {
    const window = WEEKLY;
    const currentRows = rowsFor(range(window.startDate, window.endDate), (date, index) => (index < 4 ? 4000 : 2500));
    const { intakeMetadata, execution } = runEnergy({
      window, priorRows: rowsFor(priorDates(window, 30), TARGET), currentRows, effectiveAt: "2026-07-01",
    });
    const currentDates = new Set(intakeMetadata.dailySeries.map((day) => day.date));
    expect(intakeMetadata.baselineDailySeries.some((day) => currentDates.has(day.date))).toBe(false);
    expect(intakeMetadata.baselineWindow.endDate < window.startDate).toBe(true);
    // Historical off-plan ratio reflects only the quiet prior days: 0, not the
    // 4,000 kcal current days.
    expect(execution.variability.historicalOffPlanRatio).toBe(0);
  });

  it("EnergyAmbiguityV3 drops any historical day on/after the current period even if handed one", () => {
    const observation = {
      observationId: "o", limitations: [], quality: { status: "adequate" },
      capabilities: [{
        capabilityId: "execution.energy_intake", value: 2500,
        metadata: {
          plan: { state: "on_plan", targetValue: 2500, observedValue: 2500, deviation: 0, deviationRatio: 0, unit: "kcal/day", toleranceRatio: 0.1, targetSource: "p", authorization: "user_required" },
          measurementType: "RECORDED_INPUT",
          dailySeries: [{ date: "2026-09-13", value: 3100 }, { date: "2026-09-14", value: 3100 }, { date: "2026-09-15", value: 3100 }],
          comparisonDailySeries: [],
          baselineDailySeries: [
            ...range("2026-08-10", "2026-09-12").map((date) => ({ date, value: 2500 })),
            // Leaked current-window days (would make the current pattern look "normal").
            { date: "2026-09-13", value: 3100 }, { date: "2026-09-14", value: 3100 }, { date: "2026-09-15", value: 3100 },
          ],
        },
      }],
    };
    const execution = deriveEnergyExecutionV3({ goalContract: goalContract({ effectiveAt: "2026-07-01" }), observations: [observation] });
    expect(execution.variability.historicalOffPlanRatio).toBe(0);
    expect(execution.variability.nudgeWarranted).toBe(true);
  });
});

describe("EnergyVariabilityV3 historical baseline — completeness vs adherence vs interpretation (N7)", () => {
  it("1,500 / 2,500 / 4,000 kcal days are all technically comparable; target distance never excludes a day", () => {
    for (const kcal of [1500, 2500, 4000]) {
      expect(isComparableNutritionDay(row("2026-08-01", kcal))).toBe(true);
    }
    const { execution, intakeMetadata } = runEnergy({
      window: MIDWEEK,
      priorRows: rowsFor(priorDates(MIDWEEK, 28), (date, index) => [1500, 2500, 4000][index % 3]),
      currentRows: [row("2026-09-13", 1500), row("2026-09-14", 2500), row("2026-09-15", 4000)],
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.pairedDayCount).toBe(3);
    expect(intakeMetadata.baselineDailySeries).toHaveLength(28);
  });

  it("days whose nutrition source is not confirmed complete are excluded from the baseline and cannot masquerade as below-plan days", () => {
    // 14 complete on-plan days plus 20 PARTIAL days that read as very low intake.
    const prior = [
      ...rowsFor(range("2026-08-10", "2026-08-23"), TARGET),
      ...rowsFor(range("2026-08-24", "2026-09-12"), 900, "partial"),
    ];
    const { execution, intakeMetadata } = runEnergy({
      window: MIDWEEK, priorRows: prior, currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100), effectiveAt: "2026-07-01",
    });
    expect(intakeMetadata.baselineDailySeries).toHaveLength(14);
    expect(intakeMetadata.baselineDailySeries.every((day) => day.nutritionCompleteness === "complete")).toBe(true);
    expect(execution.variability.historicalOffPlanRatio).toBe(0);
    expect(execution.variability.nudgeWarranted).toBe(true);
  });

  it("too few complete-source days leaves the baseline insufficient even when many days were logged partially", () => {
    const prior = [
      ...rowsFor(range("2026-08-10", "2026-08-16"), TARGET),
      ...rowsFor(range("2026-08-17", "2026-09-12"), 900, "partial"),
      ...rowsFor(["2026-08-02"], TARGET, "unknown"),
    ];
    const { execution } = runEnergy({
      window: MIDWEEK, priorRows: prior, currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 3100), effectiveAt: "2026-07-01",
    });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("partial current-window days are not counted as paired days or as a below-plan pattern", () => {
    const { execution } = runEnergy({
      window: WEEKLY, priorRows: rowsFor(priorDates(WEEKLY, 28), TARGET),
      currentRows: [
        ...rowsFor(range("2026-09-13", "2026-09-15"), 1000, "partial"),
        ...rowsFor(range("2026-09-16", "2026-09-19"), TARGET),
      ],
      effectiveAt: "2026-07-01",
    });
    expect(execution.variability.pairedDayCount).toBe(4);
    expect(execution.variability.offPlanDayCount).toBe(0);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("the variability nudge never uses forgotten-meal or intent language", () => {
    const { execution } = runEnergy({
      window: MIDWEEK, priorRows: rowsFor(priorDates(MIDWEEK, 28), TARGET),
      currentRows: rowsFor(range(MIDWEEK.startDate, MIDWEEK.endDate), 1900), effectiveAt: "2026-07-01",
    });
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(JSON.stringify(execution.variability)).not.toMatch(/forgot|forget|skipp|missed a meal|on purpose|intent/i);
  });
});

// ---------------------------------------------------------------------------
// Live-path proof: the REAL cadence services read the canonical evidence,
// derive the bounded preceding history, and the resulting PI observations
// reach EnergyVariabilityV3 with a sufficient baseline.
// ---------------------------------------------------------------------------

const wrap = (id, type, date, payload) => ({
  canonicalId: id, evidence_type: type, lastObservedAt: date, quality: { status: "active" },
  payload: { id, evidence_type: type, observed_at: date, quality: { status: "complete" }, ...payload },
});
const nutritionDay = (date, calories, completeness = "complete") =>
  wrap(`nutrition-${date}`, "nutrition", date, {
    metadata: { completeness },
    daily_totals: { calories, protein_g: 180, completeness },
  });
const activityDay = (date) =>
  wrap(`activity-${date}`, "activity_day", date, { daily_activity: { move_calories: 700 } });

function liveEvidence({ from, to, currentFrom, currentKcal, priorKcal = TARGET }) {
  return range(from, to).flatMap((date) => [
    nutritionDay(date, date >= currentFrom ? currentKcal : priorKcal),
    activityDay(date),
  ]);
}

async function captureMidweek(canonicalObjects) {
  const wednesday = new Date("2026-07-22T19:00:00Z");
  const user = { id: "user-1", timeZone: "America/Los_Angeles" };
  const repositories = {
    users: { getCurrentUser: async () => user, getUserById: async () => user },
    dailyBriefings: createDailyBriefingRepository([]),
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonicalObjects) },
    weights: { listWeightEntries: async () => [] },
    dexaScans: { listDEXAScans: async () => [] },
    goals: { getActiveGoal: async () => ({ id: "goal-build", title: "Build Lean Mass", phases: [] }) },
  };
  let captured = null;
  const service = createMidweekBriefingService({
    repositories, now: () => wednesday,
    confidenceStoreResolver: () => null,
    cadenceLifecycle: { publish: async (input) => { captured = input; return { committed: true, status: "created", artifact: input.artifact }; } },
  });
  const result = await service.generateForCurrentWindow({ asOf: wednesday });
  return { result, captured, repositories };
}

async function captureWeekly(canonicalObjects) {
  let captured = null;
  const repositories = {
    users: { getCurrentUser: async () => ({ timeZone: "America/Los_Angeles" }) },
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonicalObjects) },
    weights: { listWeightEntries: async () => [] },
    dailyBriefings: {
      listCompletedBriefingsInWindow: async () => [], listDailyBriefings: async () => [],
      getLatestWeeklyBriefing: async () => null, getBriefingByEvidenceWindow: async () => null,
    },
    goals: { getActiveGoal: async () => ({ id: "goal-build", title: "Build Lean Mass", status: "active", primary: true, type: "lean_mass_gain" }), listGoals: async () => [] },
  };
  const service = createWeeklyNarrativeService({
    repositories, now: () => new Date("2026-07-12T18:00:00Z"),
    cadenceLifecycle: { publish: async (input) => { captured = input; return { committed: true, status: "created", artifact: input.artifact }; } },
  });
  await service.generate({ userId: "user", reason: "test" });
  return { captured, repositories };
}

function variabilityFromEnvelope(piEnvelope, artifact, effectiveAt = "2026-06-01T00:00:00.000Z") {
  const contract = normalizedGoalContract({ effectiveAt });
  const observations = adaptCadenceEvidenceObservationsV3({
    goalContract: contract,
    phase: { id: "phase_1" },
    artifact,
    piEnvelope,
    evidenceCutoff: `${artifact.evidenceWindow.endDate}T23:59:59.999Z`,
  });
  return deriveEnergyExecutionV3({ goalContract: contract, observations });
}

describe("EnergyVariabilityV3 historical baseline — LIVE cadence path reaches a sufficient baseline", () => {
  it("Midweek (3-day window): the real service read yields >=14 preceding comparable days and the upward pattern nudges", async () => {
    // Midweek window 2026-07-19..07-21; 40 prior weeks-days of normal intake.
    const evidence = liveEvidence({ from: "2026-06-07", to: "2026-07-21", currentFrom: "2026-07-19", currentKcal: 3100 });
    const { result, captured, repositories } = await captureMidweek(evidence);
    expect(result.state).toBe("completed");
    expect(captured.piEnvelope).toBeTruthy();
    expect(captured.artifact.evidenceWindow).toMatchObject({ startDate: "2026-07-19", endDate: "2026-07-21" });
    // The history came from the SAME single canonical read the cadence already
    // performs; no parallel ingestion.
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);

    const intake = captured.piEnvelope.shadow.observations.find((item) => item.kind === "energy_intake" && item.explanationData?.dailySeries);
    expect(intake.explanationData.dailySeries.map((day) => day.date)).toEqual(["2026-07-19", "2026-07-20", "2026-07-21"]);
    const baseline = intake.explanationData.baselineDailySeries;
    expect(baseline.length).toBeGreaterThanOrEqual(14);
    expect(baseline.length).toBeLessThanOrEqual(ENERGY_VARIABILITY_BASELINE_LOOKBACK_DAYS);
    expect(baseline.every((day) => day.date < "2026-07-19" && day.date >= "2026-06-07")).toBe(true);
    expect(intake.explanationData.baselineWindow).toEqual({ startDate: "2026-06-07", endDate: "2026-07-18" });

    const execution = variabilityFromEnvelope(captured.piEnvelope, captured.artifact);
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(true);
    expect(execution.variability.dominantDirection).toBe("upward");
  });

  it("Midweek: a short history (under 14 comparable prior days) stays conservative through the real path", async () => {
    const evidence = liveEvidence({ from: "2026-07-10", to: "2026-07-21", currentFrom: "2026-07-19", currentKcal: 3100 });
    const { captured } = await captureMidweek(evidence);
    const execution = variabilityFromEnvelope(captured.piEnvelope, captured.artifact);
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("Midweek: a single current-window spike does not nudge even with a full baseline", async () => {
    const evidence = [
      ...liveEvidence({ from: "2026-06-07", to: "2026-07-20", currentFrom: "2026-07-99", currentKcal: TARGET }),
      nutritionDay("2026-07-21", 4200), activityDay("2026-07-21"),
    ];
    const { captured } = await captureMidweek(evidence);
    const execution = variabilityFromEnvelope(captured.piEnvelope, captured.artifact);
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("Midweek: partially-logged prior days are excluded from the baseline through the real path (N7)", async () => {
    const evidence = [
      ...range("2026-06-07", "2026-07-08").flatMap((date) => [nutritionDay(date, 900, "partial"), activityDay(date)]),
      ...range("2026-07-09", "2026-07-18").flatMap((date) => [nutritionDay(date, TARGET), activityDay(date)]),
      ...range("2026-07-19", "2026-07-21").flatMap((date) => [nutritionDay(date, 3100), activityDay(date)]),
    ];
    const { captured } = await captureMidweek(evidence);
    const intake = captured.piEnvelope.shadow.observations.find((item) => item.kind === "energy_intake" && item.explanationData?.dailySeries);
    expect(intake.explanationData.baselineDailySeries.every((day) => day.nutritionCompleteness === "complete")).toBe(true);
    expect(intake.explanationData.baselineDailySeries.length).toBe(10);
    const execution = variabilityFromEnvelope(captured.piEnvelope, captured.artifact);
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(false);
    expect(execution.variability.nudgeWarranted).toBe(false);
  });

  it("Weekly (7-day window): the real service read yields >=14 preceding comparable days beyond the 7-day comparison window", async () => {
    // Weekly window 2026-07-05..07-11 (now = 07-12); 5 prior weeks of history.
    const evidence = liveEvidence({ from: "2026-06-01", to: "2026-07-11", currentFrom: "2026-07-05", currentKcal: 3100 });
    const { captured, repositories } = await captureWeekly(evidence);
    expect(captured.piEnvelope.observations).toBeTruthy();
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);

    const intake = captured.piEnvelope.observations.find((item) => item.kind === "energy_intake" && item.explanationData?.dailySeries);
    expect(intake.explanationData.dailySeries).toHaveLength(7);
    // The equal-length comparison window alone can never reach 14 days...
    expect(intake.explanationData.comparisonDailySeries.length).toBeLessThan(14);
    // ...but the bounded preceding baseline does.
    const baseline = intake.explanationData.baselineDailySeries;
    expect(baseline.length).toBeGreaterThanOrEqual(14);
    expect(baseline.every((day) => day.date < "2026-07-05")).toBe(true);
    expect(intake.explanationData.baselineWindow).toEqual({ startDate: "2026-05-24", endDate: "2026-07-04" });

    const execution = variabilityFromEnvelope(captured.piEnvelope, { evidenceWindow: { startDate: "2026-07-05", endDate: "2026-07-11" } });
    expect(execution.variability.hasSufficientHistoricalBaseline).toBe(true);
    expect(execution.variability.nudgeWarranted).toBe(true);
  });

  it("createEnergyVariabilityBaselineDays is non-fatal: invalid input yields null so generation is never blocked", () => {
    expect(createEnergyVariabilityBaselineDays({ window: null })).toBeNull();
    const ok = createEnergyVariabilityBaselineDays({
      cadence: "midweek", timeZone: "America/Los_Angeles", window: { startDate: "2026-07-19", endDate: "2026-07-21" },
      nutritionDays: [], activityDays: [], dexaScans: [],
    });
    expect(ok.window).toEqual({ startDate: "2026-06-07", endDate: "2026-07-18" });
  });
});
