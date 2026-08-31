import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DEXAReportScreen from "./DEXAReportScreen.jsx";

describe("DEXAReportScreen", () => {
  it("keeps historical partial scans readable without failing the entire report", () => {
    const markup = renderToStaticMarkup(React.createElement(DEXAReportScreen, { report: {
      title: "DEXA",
      subtitle: "BodySpec body-composition scan history.",
      latestScan: null,
      summary: [],
      delta: null,
      chart: { points: [] },
      charts: [],
      regionalMassCharts: [],
      latestRegional: null,
      latestMuscleBalance: null,
      latestDetails: [],
      dataSources: [],
      history: [{ id: "partial", date: "2026-05-24", bodyFatPercentage: null, fatMass: null, leanMass: null, rmr: null }],
    } }));

    expect(markup).toContain("May 24, 2026");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("RMR unavailable");
  });
});
