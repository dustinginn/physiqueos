import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./WeeklyBriefingScreen.jsx", import.meta.url),
  "utf8"
);

describe("WeeklyBriefingScreen canonical presentation boundary", () => {
  it("renders only the complete screen presentation model", () => {
    expect(source).toContain("createWeeklyBriefingScreenPresentation");
    for (const value of [
      "presentation.hero.body",
      "presentation.energy",
      "presentation.weight",
      "presentation.photos",
      "presentation.bodyComposition",
      "training.priorityCategories",
      "presentation.coachInsight",
    ]) expect(source).toContain(value);
    for (const unsafe of [
      "cards.hero.presentation",
      "cards.snapshot.presentation",
      "cards.progress.training.presentation",
      "cards.interpretation.presentation",
      "cards.coachInsight.presentation",
    ]) expect(source).not.toContain(unsafe);
  });

  it("preserves the completed-week mobile section order and Midweek family", () => {
    for (const value of [
      "weekly-hero",
      "Energy Balance",
      "Weight Context",
      "Progress Photos",
      "Training Response",
      "weekly-body-composition",
      "weekly-coach-take",
      "Coach&apos;s Take",
      "Biggest Takeaway",
      "My Recommendation",
      "Into Next Week",
      "EnergyBalanceChart",
      "BriefingConfidenceAnchor",
      "overflow-x-hidden",
      "max-w-[393px]",
      "pb-32",
    ]) expect(source).toContain(value);
  });

  it("keeps arrays and optional sections behind normalized fields", () => {
    expect(source).toContain("training.priorityCategories.map");
    expect(source).toContain("training.highlights.slice(0, 3)");
    expect(source).toContain("actions.map");
    expect(source).toContain("presentation.training.available &&");
    expect(source).toContain("presentation.bodyComposition &&");
  });

  it("reserves semantic status colors for their canonical meanings", () => {
    expect(source).toContain('tone === "success"');
    expect(source).toContain('tone === "warning"');
    expect(source).toContain('tone === "danger"');
    expect(source).toContain("text-[var(--chart-3)]");
    expect(source).toContain("text-[var(--destructive)]");
  });
});
