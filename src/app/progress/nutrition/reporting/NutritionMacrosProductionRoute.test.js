import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(new URL("./[reportId]/page.js", import.meta.url), "utf8");
const screen = fs.readFileSync(
  new URL("../../../../screens/NutritionMacrosReportScreen.jsx", import.meta.url),
  "utf8"
);
const appearance = fs.readFileSync(
  new URL("../../../../presentation/nutritionMacroPresentation.js", import.meta.url),
  "utf8"
);

describe("Nutrition Macros production route", () => {
  it("dispatches Macros while preserving Calories and the remaining placeholders", () => {
    expect(route).toContain('reportId === "macros"');
    expect(route).toContain("getNutritionMacrosReport");
    expect(route).toContain("<NutritionMacrosReportScreen");
    expect(route).toContain('reportId === "calories"');
    expect(route).toContain("<NutritionCaloriesReportScreen");
    expect(route).toContain("<NutritionKnowledgeScreen");
  });

  it("uses the mobile shell, shared context selector, canonical day links, and two drawers", () => {
    expect(screen).toContain("max-w-[393px]");
    expect(screen).toContain("overflow-x-hidden");
    expect(screen).not.toMatch(/w-screen|min-w-\[/);
    expect(screen).toContain("<TrainingTimelineSelector");
    expect(screen.match(/<FloatingSheet/g)).toHaveLength(2);
    expect(screen).toContain("href={day.href}");
  });

  it("keeps a single centralized, persistent macro appearance mapping", () => {
    expect(appearance).toContain('protein: Object.freeze');
    expect(appearance).toContain('carbohydrates: Object.freeze');
    expect(appearance).toContain('fat: Object.freeze');
    expect(appearance).toContain("var(--macro-protein)");
    expect(appearance).toContain("var(--macro-carbohydrates)");
    expect(appearance).toContain("var(--macro-fat)");
  });

  it("contains the approved factual sections and no target or Energy interpretation", () => {
    for (const title of [
      "Period Summary",
      "Macro Distribution",
      "Average Daily Macros",
      "Macro Trends Over Time",
      "Weekly Averages",
      "Recent Daily Macros",
    ]) {
      expect(screen).toContain(title);
    }
    expect(screen).not.toMatch(/deficit|surplus|energy balance|on target|over target|under target/i);
  });
});
