import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import {
  getDEXAScanWindow,
  getDEXATimelineReport,
} from "./DEXAEvidenceContextService";
import {
  buildDEXAReport,
  scopeDEXAReportContext,
} from "./ProgressReportingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("DEXA Evidence Context", () => {
  it("defaults to All DEXA and honors valid explicit contexts", async () => {
    const [fallback, invalid, visible, all] = await Promise.all([
      getDEXATimelineReport({
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getDEXATimelineReport({
        context: "invalid",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getDEXATimelineReport({ context: "visible-abs" }),
      getDEXATimelineReport({ context: "all" }),
    ]);

    expect(fallback.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All DEXA",
      scanWindow: null,
    });
    expect(invalid.timeline.contextId).toBe("all");
    expect(visible.timeline).toMatchObject({
      contextId: "visible-abs",
      scanWindow: EVIDENCE_CONTEXT_WINDOWS["visible-abs"],
    });
    expect(all.timeline).toMatchObject({
      contextId: "all",
      selectedLabel: "All DEXA",
      scanWindow: null,
    });
    expect(fallback.timeline.options.map((option) => option.label)).toEqual([
      "Build Lean Mass",
      "Visible Abs",
      "All DEXA",
    ]);
  }, 30000);

  it("keeps lifecycle windows non-overlapping while centralizing the DEXA baseline exception", () => {
    expect(EVIDENCE_CONTEXT_WINDOWS["build-lean-mass"]).toEqual({
      startDate: "2026-07-19",
      endDate: null,
    });
    expect(getDEXAScanWindow({
      contextId: "build-lean-mass",
      endDate: "2026-07-24",
    })).toEqual({
      baselineDate: "2026-07-18",
      startDate: "2026-07-18",
      endDate: "2026-07-24",
    });
  });

  it("scopes all production DEXA surfaces from one valid scan set", async () => {
    const before = fs.readFileSync(storePath);
    const [build, visible, all] = await Promise.all([
      getDEXATimelineReport({
        context: "build-lean-mass",
        currentDate: new Date("2026-07-24T12:00:00Z"),
      }),
      getDEXATimelineReport({ context: "visible-abs" }),
      getDEXATimelineReport({ context: "all" }),
    ]);

    expect(build.report.history.map((scan) => scan.date)).toEqual(["2026-07-18"]);
    expect(build.report.latestScan.date).toBe("2026-07-18");
    expect(build.report.delta).toBeNull();
    expect(build.report.chart.points.map((point) => point.date)).toEqual(["2026-07-18"]);
    expect(build.report.regionalMassCharts).toEqual([]);

    expect(visible.report.history.map((scan) => scan.date)).toEqual([
      "2026-07-18",
      "2026-06-20",
      "2026-05-24",
    ]);
    expect(visible.report.latestScan.date).toBe("2026-07-18");
    expect(visible.report.delta).not.toBeNull();
    expect(all.report.history.length).toBeGreaterThan(visible.report.history.length);
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);

  it("includes future Build scans and compares them only against the July 18 baseline", () => {
    const context = {
      dexaScans: [
        scan("before", "2026-06-20", 10.7, 18.4, 146.2),
        scan("baseline", "2026-07-18", 7.7, 12.8, 147.5),
        scan("future", "2026-08-18", 8.1, 13.5, 151),
      ],
      goals: [],
    };
    const snapshot = structuredClone(context);
    const scoped = scopeDEXAReportContext(context, {
      startDate: "2026-07-18",
      endDate: "2026-08-18",
    });
    const report = buildDEXAReport(scoped);

    expect(scoped.dexaScans.map((item) => item.id)).toEqual(["baseline", "future"]);
    expect(report.latestScan.date).toBe("2026-08-18");
    expect(report.delta).toEqual({
      bodyFat: "+0.4 pts",
      fatMass: "+0.7 lb",
      leanMass: "+3.5 lb",
    });
    expect(context).toEqual(snapshot);
  });

  it("does not fall back to complete history for an empty context", () => {
    const context = { dexaScans: [scan("old", "2026-01-01", 12, 20, 145)], goals: [] };
    const report = buildDEXAReport(scopeDEXAReportContext(context, {
      startDate: "2099-01-01",
      endDate: "2099-01-02",
    }));

    expect(report.latestScan).toBeNull();
    expect(report.delta).toBeNull();
    expect(report.history).toEqual([]);
    expect(report.chart.points).toEqual([]);
    expect(report.summary.every((item) => item.value === "Pending")).toBe(true);
  });
});

function scan(id, measuredAt, bodyFatPercentage, fatMass, leanMass) {
  return {
    id,
    measuredAt,
    bodyFatPercentage,
    fatMass: { value: fatMass, unit: "lb" },
    leanMass: { value: leanMass, unit: "lb" },
    totalMass: { value: fatMass + leanMass + 7, unit: "lb" },
    restingMetabolicRate: { value: 1800, unit: "kcal" },
    sourceFileId: `${id}.pdf`,
  };
}
