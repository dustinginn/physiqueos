import { describe, expect, it } from "vitest";
import { createProviderWeightEvidenceReport } from "./ProgressReportingService.js";

describe("Native Weight reporting source contract", () => {
  it("publishes canonical current revision, rolling averages, recent weigh-ins, extrema dates, and DEXA anchors", () => {
    const weights = [
      weight("before", "2026-05-23", 170, 1),
      weight("visible-start", "2026-05-24", 169, 2),
      weight("visible-low", "2026-07-17", 164, 3),
      weight("visible-end", "2026-07-18", 165, 4),
      weight("build-start", "2026-07-19", 164, 5),
      weight("build-high", "2026-07-20", 168, 6),
      weight("latest", "2026-07-23", 167, 7),
    ];
    const report = createProviderWeightEvidenceReport({
      weights,
      dexaScans: [{ id: "dexa-1", measuredAt: "2026-07-18" }],
      summaryContextId: "all",
    });
    expect(report.current).toMatchObject({ id: "latest", date: "2026-07-23", revision: 7 });
    expect(report.recentWeighIns.map((item) => item.id)).toEqual([
      "latest", "build-high", "build-start", "visible-end", "visible-low", "visible-start", "before",
    ]);
    expect(report.rollingAverages).toMatchObject({
      threeDay: { requestedDays: 3, observationCount: 1, startDate: "2026-07-23", endDate: "2026-07-23", value: 167 },
      sevenDay: { requestedDays: 7, observationCount: 5, startDate: "2026-07-17", endDate: "2026-07-23", value: 165.6 },
    });
    expect(report.extrema).toMatchObject({
      goalRelevant: ["highest", "lowest"],
      highest: { id: "before", date: "2026-05-23", value: 170, revision: 1 },
      lowest: { id: "visible-low", date: "2026-07-17", value: 164, revision: 3 },
    });
    expect(report.chart.markers).toEqual([{ id: "dexa-1", date: "2026-07-18", label: "DEXA" }]);
  });
});

function weight(id, measuredAt, value, version) {
  return { id, measuredAt, version, weight: { value, unit: "lb" } };
}
