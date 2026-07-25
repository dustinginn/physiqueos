import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(
  new URL("./DEXAReportScreen.jsx", import.meta.url),
  "utf8"
);
const route = fs.readFileSync(
  new URL("../app/progress/dexa/page.js", import.meta.url),
  "utf8"
);

describe("production DEXA Evidence Context presentation", () => {
  it("inserts the canonical selector without changing the DEXA shell", () => {
    expect(route).toContain("getDEXATimelineReport");
    expect(screen).toContain('ariaLabel="DEXA evidence context"');
    expect(screen).toContain('currentPath="/progress/dexa"');
    expect(screen).toContain("max-w-[393px]");
  });

  it("keeps every existing DEXA section on the scoped report", () => {
    expect(screen).toContain("report.summary.map");
    expect(screen).toContain("report.delta");
    expect(screen).toContain('title="Core Trends"');
    expect(screen).toContain('title="Supplemental Metrics"');
    expect(screen).toContain('title="Regional Tissue Lean Mass"');
    expect(screen).toContain('title="Regional Tissue Fat Mass"');
    expect(screen).toContain('title="Scan History"');
    expect(screen).toContain("report.history.map");
  });

  it("removes Related Goals while preserving Data Sources", () => {
    expect(screen).not.toContain('mode="related-goals"');
    expect(screen).not.toContain("relatedGoals={report.relatedGoals}");
    expect(screen).toContain('mode="data-sources"');
    expect(screen).toContain("dataSources={report.dataSources}");
  });

  it("preserves Scan History Show All and original-file interactions", () => {
    expect(screen).toContain('<ReportDrawer title="Scan History">');
    expect(screen).toContain("href={scan.sourceHref}");
    expect(screen).toContain("View Original PDF");
    expect(screen).not.toMatch(/w-screen|min-w-\[/);
  });
});
