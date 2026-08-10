import fs from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("persisted Monthly artifact route", () => {
  it("uses only the render compatibility projection after the persisted read", () => {
    expect(pageSource).toContain("projectPersistedMonthlyPresentationForRendering");
    expect(pageSource).toContain("artifact.briefing.monthlyPresentation");
    expect(pageSource).toContain("<MonthlyBriefingScreen");
    expect(pageSource).toContain("reconciliation={reconciliation}");
    expect(pageSource).not.toMatch(/createMonthlyArtifact|generate|regenerate|publish|persist|updateGoal|saveDailyBriefing/);
  });
});
