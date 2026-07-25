import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import {
  buildWeightSummary,
  createProgressReportingService,
  getWeeklyAverages,
  scopeWeightReportContext,
} from "./ProgressReportingService";
import { getWeightTimelineReport } from "./WeightEvidenceContextService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Weight Evidence Context", () => {
  it("defines inclusive, non-overlapping canonical goal boundaries", () => {
    expect(EVIDENCE_CONTEXT_WINDOWS["visible-abs"]).toEqual({
      startDate: "2026-05-24",
      endDate: "2026-07-18",
    });
    expect(EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"]).toEqual({
      startDate: "2026-07-19",
      endDate: null,
    });
    expect(
      EVIDENCE_CONTEXT_WINDOWS["visible-abs"].endDate <
        EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"].startDate
    ).toBe(true);
  });

  it("defaults Weight to Build Lean Mass and honors explicit contexts", async () => {
    const [fallback, visible, all] = await Promise.all([
      getWeightTimelineReport({
        currentDate: new Date("2026-07-23T12:00:00Z"),
      }),
      getWeightTimelineReport({ context: "visible-abs" }),
      getWeightTimelineReport({ context: "all" }),
    ]);

    expect(fallback.timeline).toMatchObject({
      contextId: "build-lean-mass",
      startDate: "2026-07-19",
      endDate: "2026-07-23",
    });
    expect(visible.timeline).toMatchObject({
      contextId: "visible-abs",
      startDate: "2026-05-24",
      endDate: "2026-07-18",
    });
    expect(all.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All Weight",
      startDate: null,
      endDate: null,
    });
    expect(fallback.timeline.options.map((option) => option.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All Weight",
    ]);
  });

  it("builds the Build Lean Mass summary from July 19 onward", () => {
    const allWeights = fixtures();
    const summary = buildWeightSummary({
      allWeights,
      contextId: "build-lean-mass",
      dateWindow: { startDate: "2026-07-19", endDate: "2026-07-23" },
    });

    expect(summary).toEqual([
      { label: "Latest", value: "167.0 lb" },
      { label: "Since Start", value: "+3.0 lb" },
      { label: "Highest", value: "168.0 lb" },
      { label: "Lowest", value: "164.0 lb" },
    ]);
  });

  it("uses only the completed Visible Abs window for historical summary endpoints", () => {
    const summary = buildWeightSummary({
      allWeights: fixtures(),
      contextId: "visible-abs",
      dateWindow: { startDate: "2026-05-24", endDate: "2026-07-18" },
    });

    expect(summary).toEqual([
      { label: "Latest", value: "165.0 lb" },
      { label: "Since Start", value: "-4.0 lb" },
      { label: "Last Change", value: "+1.0 lb" },
      { label: "Lowest", value: "164.0 lb" },
    ]);
  });

  it("uses complete history for the All Weight summary", () => {
    expect(
      buildWeightSummary({
        allWeights: fixtures(),
        contextId: "all",
      })
    ).toEqual([
      { label: "Latest", value: "167.0 lb" },
      { label: "Since First", value: "-3.0 lb" },
      { label: "Highest", value: "170.0 lb" },
      { label: "Lowest", value: "164.0 lb" },
    ]);
  });

  it("keeps extrema available but does not fabricate sparse changes", () => {
    const only = [weight("only", "2026-07-19", 164)];
    expect(
      buildWeightSummary({
        allWeights: only,
        contextId: "build-lean-mass",
        dateWindow: { startDate: "2026-07-19", endDate: "2026-07-19" },
      })
    ).toEqual([
      { label: "Latest", value: "164.0 lb" },
      { label: "Since Start", value: "Pending" },
      { label: "Highest", value: "164.0 lb" },
      { label: "Lowest", value: "164.0 lb" },
    ]);

    expect(
      buildWeightSummary({
        allWeights: fixtures(),
        contextId: "visible-abs",
        dateWindow: { startDate: "2099-01-01", endDate: "2099-01-02" },
      }).map((item) => item.value)
    ).toEqual(["Pending", "Pending", "Pending", "Pending"]);

    expect(
      buildWeightSummary({
        allWeights: [weight("historical", "2026-07-18", 165)],
        contextId: "build-lean-mass",
        dateWindow: { startDate: "2026-07-19", endDate: "2026-07-23" },
      }).map((item) => item.value)
    ).toEqual(["Pending", "Pending", "Pending", "Pending"]);
  });

  it("scopes Weight and DEXA boundaries inclusively without mutation", () => {
    const context = {
      dexaScans: [
        { id: "visible", measuredAt: "2026-07-18" },
        { id: "build", measuredAt: "2026-07-19" },
      ],
      weights: fixtures(),
    };
    const snapshot = structuredClone(context);
    const visible = scopeWeightReportContext(context, {
      startDate: "2026-05-24",
      endDate: "2026-07-18",
    });
    const build = scopeWeightReportContext(context, {
      startDate: "2026-07-19",
      endDate: "2026-07-23",
    });

    expect(visible.weights.at(0).measuredAt).toBe("2026-05-24");
    expect(visible.weights.at(-1).measuredAt).toBe("2026-07-18");
    expect(build.weights.at(0).measuredAt).toBe("2026-07-19");
    expect(build.weights.at(-1).measuredAt).toBe("2026-07-23");
    expect(visible.dexaScans.map((scan) => scan.id)).toEqual(["visible"]);
    expect(build.dexaScans.map((scan) => scan.id)).toEqual(["build"]);
    expect(context).toEqual(snapshot);
  });

  it("builds boundary-crossing weekly averages only from scoped records", () => {
    const points = [
      { date: "2026-07-17", value: 164 },
      { date: "2026-07-18", value: 166 },
      { date: "2026-07-19", value: 170 },
      { date: "2026-07-20", value: 172 },
    ];
    const visible = getWeeklyAverages(
      points.filter((point) => point.date <= "2026-07-18")
    );
    const build = getWeeklyAverages(
      points.filter((point) => point.date >= "2026-07-19")
    );

    expect(visible).toEqual([
      expect.objectContaining({ average: 165, entries: 2, weekOverWeek: null }),
    ]);
    expect(build).toEqual([
      expect.objectContaining({ average: 171, entries: 2, weekOverWeek: null }),
    ]);
  });

  it(
    "keeps every time-dependent surface empty when the scoped dataset is empty",
    async () => {
      const report = await createProgressReportingService({
        repositories: FounderRepositories,
      }).getWeightReport(undefined, {
        dateWindow: { startDate: "2099-01-01", endDate: "2099-01-02" },
        summaryContextId: "build-lean-mass",
      });

      expect(report.summary.every((item) => item.value === "Pending")).toBe(true);
      expect(report.chart.points).toEqual([]);
      expect(report.chart.markers).toEqual([]);
      expect(report.weeklyAverages).toEqual([]);
      expect(report.history).toEqual([]);
    },
    30000
  );

  it(
    "updates summary, chart, weekly averages, and history from one scoped dataset",
    async () => {
      const before = fs.readFileSync(storePath);
      const [build, visible, all] = await Promise.all([
        getWeightTimelineReport({ context: "build-lean-mass" }),
        getWeightTimelineReport({ context: "visible-abs" }),
        getWeightTimelineReport({ context: "all" }),
      ]);

      expect(
        build.report.chart.points.every((point) => point.date >= "2026-07-19")
      ).toBe(true);
      expect(
        visible.report.chart.points.every(
          (point) => point.date >= "2026-05-24" && point.date <= "2026-07-18"
        )
      ).toBe(true);
      expect(build.report.chart.points).toEqual(
        build.report.history.slice().reverse()
      );
      expect(visible.report.chart.points).toEqual(
        visible.report.history.slice().reverse()
      );
      expect(build.report.history.length).toBeLessThan(all.report.history.length);
      expect(visible.report.history.length).toBeLessThan(all.report.history.length);
      expect(build.report.weeklyAverages).not.toEqual(all.report.weeklyAverages);
      expect(visible.report.weeklyAverages).not.toEqual(all.report.weeklyAverages);
      expect(
        build.report.chart.markers.every((marker) => marker.date >= "2026-07-19")
      ).toBe(true);
      expect(
        visible.report.chart.markers.every(
          (marker) => marker.date >= "2026-05-24" && marker.date <= "2026-07-18"
        )
      ).toBe(true);
      expect(build.report.summary.map((item) => item.label)).toEqual([
        "Latest",
        "Since Start",
        "Highest",
        "Lowest",
      ]);
      expect(visible.report.summary.map((item) => item.label)).toEqual([
        "Latest",
        "Since Start",
        "Last Change",
        "Lowest",
      ]);
      expect(all.report.summary.map((item) => item.label)).toEqual([
        "Latest",
        "Since First",
        "Highest",
        "Lowest",
      ]);
      expect(fs.readFileSync(storePath)).toEqual(before);
    },
    30000
  );
});

function fixtures() {
  return [
    weight("before", "2026-05-23", 170),
    weight("visible-start", "2026-05-24", 169),
    weight("visible-low", "2026-07-17", 164),
    weight("visible-end", "2026-07-18", 165),
    weight("build-start", "2026-07-19", 164),
    weight("build-high", "2026-07-20", 168),
    weight("latest", "2026-07-23", 167),
  ];
}

function weight(id, measuredAt, value) {
  return {
    id,
    measuredAt,
    weight: { unit: "lb", value },
  };
}
