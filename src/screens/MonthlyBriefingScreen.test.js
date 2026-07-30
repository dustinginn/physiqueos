import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./MonthlyBriefingScreen.jsx", import.meta.url), "utf8");
const energySource = fs.readFileSync(new URL("../components/monthly/MonthlyEnergyEvolution.jsx", import.meta.url), "utf8");

describe("MonthlyBriefingScreen visible integration", () => {
  it("preserves the accepted mobile editorial composition", () => {
    for (const value of ["monthly-hero", "max-w-[393px]", "overflow-x-hidden", "pb-32", "Timeline", "MonthAhead"]) {
      expect(source).toContain(value);
    }
    expect(source).not.toContain("StrategyReview");
    expect(source).not.toMatch(/Weight Domain|Training Domain|Nutrition Domain/);
  });

  it("renders roles conditionally without empty milestone, Energy, or DEXA shells", () => {
    expect(source).toContain("presentation.milestone &&");
    expect(source).toContain("presentation.training &&");
    expect(source).toContain("presentation.energy &&");
    expect(source).toContain("presentation.newBaseline &&");
    expect(source).not.toContain("<Eyebrow>Chapter</Eyebrow>");
  });

  it("keeps confidence and distinct editorial identities in the Hero and major sections", () => {
    expect(source).toContain("BriefingConfidenceAnchor");
    expect(source).toContain('testId="monthly-confidence"');
    expect(source.indexOf('testId="monthly-confidence"')).toBeLessThan(source.indexOf("<h1"));
    for (const value of ["TrainingProgress", "NewBaseline", "WhatChanged", "DefiningMoments", "MonthAhead"]) {
      expect(source).toContain(value);
    }
    expect(source).not.toContain("StrategyReview");
  });

  it("keeps preview controls separate from briefing content", () => {
    expect(source).toContain("PreviewChrome");
    expect(source).toContain("Editorial Decision Inspector");
    expect(source).toContain("preview.disclosure");
    expect(source).not.toMatch(/Continuation after|synthetic so the full month/i);
    expect(energySource).not.toMatch(/Observed through|preview continuation|Hatched columns|Variant A|Variant B/i);
  });

  it("provides weekly-only Energy context, summaries, and semantic colors", () => {
    expect(energySource).toContain("energy-weekly-variant");
    expect(energySource).not.toContain("energy-daily-variant");
    expect(energySource).not.toMatch(/>Daily<|setVariant|useState/);
    expect(energySource).toContain("monthly-energy-summary");
    expect(energySource).toContain("model.phaseLabel");
    expect(energySource).toContain("bg-amber-400");
    expect(energySource).toContain("bg-sky-500");
    expect(energySource).toContain("bg-emerald-500");
  });
});
