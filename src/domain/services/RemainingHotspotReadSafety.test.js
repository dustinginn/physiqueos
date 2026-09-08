import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("remaining production hotspot read boundaries", () => {
  it.each([
    "src/app/progress/[stream]/page.js",
    "src/app/briefing/daily/page.js",
    "src/app/briefings/weekly/page.js",
  ])("uses a bounded production read on %s", (file) => {
    const source = read(file);
    expect(source).toContain("loadProductionBoundedFounderReadContext");
    expect(source).not.toContain("loadProductionApplicationScopedRuntime");
  });

  it("routes Timeline through a provider-native read service", () => {
    const source = read("src/app/timeline/page.js");
    expect(source).toContain("getProductionEvidenceTimelineReadService");
    expect(source).not.toContain("FounderRepositories");
  });

  it("keeps supporting Goal collections explicit and excludes oversized unrelated history", () => {
    const source = read("src/domain/services/NarrativeGoalPresentationLoader.js");
    expect(source).toContain('"canonicalEvidenceObjects"');
    expect(source).not.toContain('"dailyBriefings"');
    expect(source).not.toContain('"evidencePackages"');
    expect(source).not.toContain('"analyses"');
  });

  it("keeps every Founder Profile page off the broad compatibility repository facade", () => {
    const root = path.join(process.cwd(), "src/app/profile");
    const pages = walk(root).filter((file) => file.endsWith("page.js"));
    expect(pages.length).toBeGreaterThan(10);
    for (const file of pages) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, path.relative(process.cwd(), file)).not.toContain("FounderRepositories");
      expect(source, path.relative(process.cwd(), file)).not.toContain("loadProductionApplicationScopedRuntime");
    }
  });

  it.each([
    "src/app/goals/[goalId]/edit/page.js",
    "src/app/progress/nutrition/enrichment-review/page.js",
  ])("keeps additional production drill-down %s on bounded reads", (file) => {
    const source = read(file);
    expect(source).toContain("loadProductionBoundedFounderReadContext");
    expect(source).not.toContain("FounderRepositories");
    expect(source).not.toContain("loadApplicationCanonicalRuntime");
  });
});

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });
}
