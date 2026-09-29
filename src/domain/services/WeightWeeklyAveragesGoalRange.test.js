import { describe, expect, it } from "vitest";
import { createProviderWeightEvidenceReport } from "./ProgressReportingService";

// Synthetic weights only. Windows are the canonical Goal boundaries; both Goal
// windows begin on a Sunday, so every in-window bucket start is itself inside.
const BUILD_LEAN_MASS = { startDate: "2026-07-19", endDate: "2026-09-28" };
const VISIBLE_ABS = { startDate: "2026-05-24", endDate: "2026-07-18" };

describe("Weight Weekly Averages honor the full selected Goal range", () => {
  it("returns every calendar-week bucket of the window, newest first, with the oldest as Base", () => {
    const report = createProviderWeightEvidenceReport({
      weights: dailyWeights("2026-07-19", "2026-09-27"),
      dateWindow: { startDate: "2026-07-19", endDate: "2026-09-27" },
      summaryContextId: "build-lean-mass",
    });

    expect(report.weeklyAverages).toHaveLength(11);
    expect(report.weeklyAverages.map((week) => week.sortDate)).toEqual([
      "2026-09-27",
      "2026-09-20",
      "2026-09-13",
      "2026-09-06",
      "2026-08-30",
      "2026-08-23",
      "2026-08-16",
      "2026-08-09",
      "2026-08-02",
      "2026-07-26",
      "2026-07-19",
    ]);
    expect(report.weeklyAverages.at(-1)).toMatchObject({
      sortDate: "2026-07-19",
      weekOverWeek: null,
      entries: 7,
    });
    expect(
      report.weeklyAverages
        .slice(0, -1)
        .every((week) => typeof week.weekOverWeek === "number")
    ).toBe(true);
    expect(sumEntries(report)).toBe(report.chart.points.length);
  });

  it("starts at the calendar week of a mid-week Goal start using only in-window points", () => {
    const weights = [
      // Same calendar week as the Goal start, but before the window: must not
      // be pulled into the first bucket.
      ...dailyWeights("2026-07-19", "2026-07-21", () => 100),
      weight("2026-07-22", 180),
      weight("2026-07-23", 181),
      weight("2026-07-24", 182),
      ...dailyWeights("2026-07-26", "2026-08-01", () => 190),
    ];
    const report = createProviderWeightEvidenceReport({
      weights,
      dateWindow: { startDate: "2026-07-22", endDate: "2026-08-01" },
      summaryContextId: "build-lean-mass",
    });

    expect(report.weeklyAverages).toEqual([
      { week: "Jul 26", sortDate: "2026-07-26", average: 190, weekOverWeek: 9, entries: 7 },
      { week: "Jul 19", sortDate: "2026-07-19", average: 181, weekOverWeek: null, entries: 3 },
    ]);
    expect(report.chart.points[0].date).toBe("2026-07-22");
    expect(report.history.every((point) => point.date >= "2026-07-22")).toBe(true);
  });

  it("ends at a mid-week Goal end and stops rolling averages at the window end", () => {
    const report = createProviderWeightEvidenceReport({
      weights: dailyWeights("2026-07-05", "2026-07-18"),
      dateWindow: { startDate: "2026-07-05", endDate: "2026-07-15" },
      summaryContextId: "visible-abs",
    });

    expect(report.weeklyAverages.map((week) => week.sortDate)).toEqual([
      "2026-07-12",
      "2026-07-05",
    ]);
    expect(report.weeklyAverages[0]).toMatchObject({ sortDate: "2026-07-12", entries: 4 });
    expect(report.weeklyAverages[1]).toMatchObject({ sortDate: "2026-07-05", entries: 7 });
    expect(report.rollingAverages.sevenDay).toMatchObject({
      startDate: "2026-07-09",
      endDate: "2026-07-15",
      observationCount: 7,
    });
    expect(report.rollingAverages.threeDay).toMatchObject({
      startDate: "2026-07-13",
      endDate: "2026-07-15",
      observationCount: 3,
    });
    expect(report.history[0].date).toBe("2026-07-15");
  });

  it("keeps every week of a long Goal", () => {
    const report = createProviderWeightEvidenceReport({
      weights: dailyWeights("2026-01-04", "2026-05-23"),
      dateWindow: { startDate: "2026-01-04", endDate: "2026-05-23" },
      summaryContextId: "build-lean-mass",
    });

    expect(report.weeklyAverages).toHaveLength(20);
    expect(report.chart.points).toHaveLength(140);
    expect(report.history).toHaveLength(140);
    expect(sumEntries(report)).toBe(140);
    expect(report.weeklyAverages.at(-1)).toMatchObject({ sortDate: "2026-01-04", weekOverWeek: null });
    expect(report.weeklyAverages[0].sortDate).toBe("2026-05-17");
  });

  it("keeps a completed historical Goal to its own window with goal-relevant lowest extrema", () => {
    const weights = [
      // Lower than anything inside the window, on both sides of it.
      ...dailyWeights("2026-05-17", "2026-05-23", () => 140),
      ...dailyWeights("2026-05-24", "2026-07-18", (index) => 160 - index * 0.1),
      ...dailyWeights("2026-07-19", "2026-07-25", () => 140),
    ];
    const report = createProviderWeightEvidenceReport({
      weights,
      dateWindow: VISIBLE_ABS,
      summaryContextId: "visible-abs",
    });

    expect(report.evidenceWindow).toEqual(VISIBLE_ABS);
    expect(report.weeklyAverages.map((week) => week.sortDate)).toEqual([
      "2026-07-12",
      "2026-07-05",
      "2026-06-28",
      "2026-06-21",
      "2026-06-14",
      "2026-06-07",
      "2026-05-31",
      "2026-05-24",
    ]);
    expect(report.extrema.goalRelevant).toEqual(["lowest"]);
    expect(report.extrema.lowest).toMatchObject({ id: "w-2026-07-18", date: "2026-07-18" });
    expect(report.extrema.highest).toMatchObject({ id: "w-2026-05-24", date: "2026-05-24" });
    expect(report.chart.points.every((point) => isInside(point.date, VISIBLE_ABS))).toBe(true);
  });

  it("keeps an active Goal to its window with goal-relevant highest extrema from in-window points only", () => {
    const weights = [
      // Higher than anything inside the window, on both sides of it.
      ...dailyWeights("2026-07-12", "2026-07-18", () => 200),
      ...dailyWeights("2026-07-19", "2026-09-28", (index) => 150 + index * 0.1),
      ...dailyWeights("2026-09-29", "2026-10-03", () => 200),
    ];
    const report = createProviderWeightEvidenceReport({
      weights,
      dateWindow: BUILD_LEAN_MASS,
      summaryContextId: "build-lean-mass",
    });

    expect(report.evidenceWindow).toEqual(BUILD_LEAN_MASS);
    expect(report.weeklyAverages).toHaveLength(11);
    expect(report.weeklyAverages[0]).toMatchObject({ sortDate: "2026-09-27", entries: 2 });
    expect(report.weeklyAverages.at(-1)).toMatchObject({ sortDate: "2026-07-19", weekOverWeek: null });
    expect(report.extrema.goalRelevant).toEqual(["highest"]);
    expect(report.extrema.highest).toMatchObject({ id: "w-2026-09-28", date: "2026-09-28" });
    expect(report.extrema.lowest).toMatchObject({ id: "w-2026-07-19", date: "2026-07-19" });
    expect(report.chart.points.every((point) => isInside(point.date, BUILD_LEAN_MASS))).toBe(true);
  });

  it("uses every week of the complete history for All Weight", () => {
    const weights = [
      ...dailyWeights("2026-05-10", "2026-06-06"),
      ...dailyWeights("2026-07-19", "2026-10-03"),
    ];
    const report = createProviderWeightEvidenceReport({
      weights,
      dateWindow: null,
      summaryContextId: "all",
    });
    const expectedWeeks = distinctWeeks(weights.map((entry) => entry.measuredAt));

    expect(report.evidenceWindow).toBeNull();
    expect(expectedWeeks.size).toBe(15);
    expect(report.weeklyAverages).toHaveLength(expectedWeeks.size);
    expect(new Set(report.weeklyAverages.map((week) => week.sortDate))).toEqual(expectedWeeks);
    expect(report.extrema.goalRelevant).toEqual(["highest", "lowest"]);
    expect(sumEntries(report)).toBe(weights.length);
  });

  it("keeps a week with a single observation and compares it to the preceding existing bucket", () => {
    const report = createProviderWeightEvidenceReport({
      weights: [
        weight("2026-07-19", 160),
        weight("2026-07-21", 162),
        weight("2026-07-23", 164),
        weight("2026-07-29", 165),
      ],
      dateWindow: { startDate: "2026-07-19", endDate: "2026-08-01" },
      summaryContextId: "build-lean-mass",
    });

    expect(report.weeklyAverages).toEqual([
      { week: "Jul 26", sortDate: "2026-07-26", average: 165, weekOverWeek: 3, entries: 1 },
      { week: "Jul 19", sortDate: "2026-07-19", average: 162, weekOverWeek: null, entries: 3 },
    ]);
  });

  it("does not synthesize a calendar week without observations and compares across the gap", () => {
    const report = createProviderWeightEvidenceReport({
      weights: [
        weight("2026-07-20", 160),
        weight("2026-07-24", 162),
        weight("2026-08-03", 170),
        weight("2026-08-07", 172),
      ],
      dateWindow: { startDate: "2026-07-19", endDate: "2026-08-08" },
      summaryContextId: "build-lean-mass",
    });

    expect(report.weeklyAverages).toEqual([
      { week: "Aug 2", sortDate: "2026-08-02", average: 171, weekOverWeek: 10, entries: 2 },
      { week: "Jul 19", sortDate: "2026-07-19", average: 161, weekOverWeek: null, entries: 2 },
    ]);
    expect(report.weeklyAverages.some((week) => week.sortDate === "2026-07-26")).toBe(false);
  });

  describe("range parity across contexts", () => {
    const shared = [
      ...dailyWeights("2026-05-10", "2026-05-23", (index) => 170 - index * 0.2),
      ...dailyWeights("2026-05-24", "2026-07-18", (index) => 168 - index * 0.1),
      ...dailyWeights("2026-07-19", "2026-09-28", (index) => 162 + index * 0.1),
      ...dailyWeights("2026-09-29", "2026-10-03", (index) => 170 + index * 0.2),
    ];

    it.each([
      ["all", null],
      ["build-lean-mass", BUILD_LEAN_MASS],
      ["visible-abs", VISIBLE_ABS],
    ])(
      "keeps chart, history, rolling averages and weekly buckets inside the %s window",
      (contextId, dateWindow) => {
        const report = createProviderWeightEvidenceReport({
          weights: shared,
          dateWindow,
          summaryContextId: contextId,
        });
        const inside = (date) => isInside(date, dateWindow);

        expect(report.evidenceWindow).toEqual(dateWindow);
        expect(report.chart.points.length).toBeGreaterThan(0);
        expect(report.chart.points.every((point) => inside(point.date))).toBe(true);
        expect(report.history.every((point) => inside(point.date))).toBe(true);
        expect(report.history).toEqual([...report.chart.points].reverse());

        for (const rolling of [report.rollingAverages.threeDay, report.rollingAverages.sevenDay]) {
          expect(inside(rolling.startDate)).toBe(true);
          expect(inside(rolling.endDate)).toBe(true);
        }

        const chartWeeks = distinctWeeks(report.chart.points.map((point) => point.date));
        const bucketWeeks = report.weeklyAverages.map((week) => week.sortDate);
        expect(new Set(bucketWeeks)).toEqual(chartWeeks);
        expect(bucketWeeks).toHaveLength(chartWeeks.size);
        expect(bucketWeeks.every(inside)).toBe(true);
        expect(bucketWeeks).toEqual([...bucketWeeks].sort().reverse());
        expect(sumEntries(report)).toBe(report.chart.points.length);
        expect(report.weeklyAverages.at(-1).weekOverWeek).toBeNull();
      }
    );

    it("returns more weeks for All Weight than for either Goal window", () => {
      const all = createProviderWeightEvidenceReport({ weights: shared, dateWindow: null, summaryContextId: "all" });
      const build = createProviderWeightEvidenceReport({
        weights: shared,
        dateWindow: BUILD_LEAN_MASS,
        summaryContextId: "build-lean-mass",
      });
      const visible = createProviderWeightEvidenceReport({
        weights: shared,
        dateWindow: VISIBLE_ABS,
        summaryContextId: "visible-abs",
      });

      expect(build.weeklyAverages).toHaveLength(11);
      expect(visible.weeklyAverages).toHaveLength(8);
      expect(all.weeklyAverages.length).toBeGreaterThan(build.weeklyAverages.length);
      expect(all.weeklyAverages.length).toBeGreaterThan(visible.weeklyAverages.length);
    });
  });
});

function weight(measuredAt, value) {
  return {
    id: `w-${measuredAt}`,
    measuredAt,
    weight: { unit: "lb", value },
  };
}

function dailyWeights(startDate, endDate, valueAt = (index) => 150 + (index % 5) * 0.5) {
  const entries = [];

  for (let index = 0, date = startDate; date <= endDate; index += 1, date = shiftDate(date, 1)) {
    entries.push(weight(date, Number(valueAt(index).toFixed(1))));
  }

  return entries;
}

function shiftDate(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function weekStartOf(date) {
  return shiftDate(date, -new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

function distinctWeeks(dates) {
  return new Set(dates.map(weekStartOf));
}

function sumEntries(report) {
  return report.weeklyAverages.reduce((sum, week) => sum + week.entries, 0);
}

function isInside(date, window) {
  if (!window) return true;
  return (
    (!window.startDate || date >= window.startDate) &&
    (!window.endDate || date <= window.endDate)
  );
}
