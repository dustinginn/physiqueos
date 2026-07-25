import fs from "node:fs";
import { describe, expect, it } from "vitest";

const placeholder = fs.readFileSync(
  new URL("./ProgressPlaceholderScreen.jsx", import.meta.url),
  "utf8"
);
const weight = fs.readFileSync(new URL("./WeightReportScreen.jsx", import.meta.url), "utf8");
const dexa = fs.readFileSync(new URL("./DEXAReportScreen.jsx", import.meta.url), "utf8");
const context = fs.readFileSync(
  new URL("../components/progress/EvidenceReportContext.jsx", import.meta.url),
  "utf8"
);

describe("Evidence detail supporting-context hierarchy", () => {
  it("keeps Nutrition evidence and history while protocol and Related Goals stay removed", () => {
    const start = placeholder.indexOf("function NutritionEvidenceReport");
    const end = placeholder.indexOf("function TrainingEvidenceReport", start);
    const section = placeholder.slice(start, end);
    expect(section).toContain('title="Latest Nutrition Day"');
    expect(section).toContain('title="Recent Nutrition History"');
    expect(section).not.toContain('title="Current Nutrition Protocol"');
    expect(placeholder.indexOf('mode="related-goals"')).toBeLessThan(
      placeholder.indexOf('mode="data-sources"')
    );
  });

  it("places Training protocol, Related Goals, and provenance last in that order", () => {
    const start = placeholder.indexOf("function TrainingEvidenceReport");
    const end = placeholder.indexOf("function ActivityEvidenceReport", start);
    const section = placeholder.slice(start, end);
    const history = section.indexOf('title="Recent Training History"');
    const protocol = section.indexOf('title="Current Protocol"');
    const goals = section.indexOf('mode="related-goals"');
    const sources = section.indexOf("<TrainingSourceMetadataFooter");
    expect(history).toBeLessThan(protocol);
    expect(protocol).toBeLessThan(goals);
    expect(goals).toBeLessThan(sources);
  });

  it("keeps Activity history while the protocol card stays removed", () => {
    const start = placeholder.indexOf("function ActivityEvidenceReport");
    const end = placeholder.indexOf("function LatestActivityDayCard", start);
    const section = placeholder.slice(start, end);
    expect(section).toContain('title="Recent Activity History"');
    expect(section).not.toContain('title="Current Activity Protocol"');
  });

  it("removes redundant Weight Related Goals while preserving Data Sources", () => {
    expect(weight).not.toContain('mode="related-goals"');
    expect(weight.indexOf("Weight History")).toBeLessThan(
      weight.indexOf('mode="data-sources"')
    );
  });

  it("removes DEXA Related Goals while preserving Data Sources after history", () => {
    const history = dexa.indexOf("Scan History");
    const sources = dexa.indexOf('mode="data-sources"');
    expect(history).toBeLessThan(sources);
    expect(dexa).not.toContain('mode="related-goals"');
  });

  it("uses one standard support stack without compounding shared card margins", () => {
    [placeholder, weight, dexa].forEach((source) => {
      expect(source).toContain('className="mt-4 space-y-4"');
      expect(source).toContain("flush");
    });
    expect(context).toContain('flush ? "" : "mb-4"');
    expect(context).toContain('flush ? "" : "mt-4"');
  });
});
