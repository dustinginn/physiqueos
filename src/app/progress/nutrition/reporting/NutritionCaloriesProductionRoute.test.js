import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  new URL("./[reportId]/page.js", import.meta.url),
  "utf8"
);
const screen = fs.readFileSync(
  new URL("../../../../screens/NutritionCaloriesReportScreen.jsx", import.meta.url),
  "utf8"
);
const placeholder = fs.readFileSync(
  new URL("../../../../screens/NutritionKnowledgeScreen.jsx", import.meta.url),
  "utf8"
);
const service = fs.readFileSync(
  new URL(
    "../../../../domain/services/NutritionCaloriesReportingService.js",
    import.meta.url
  ),
  "utf8"
);

describe("Nutrition Calories production route", () => {
  it("dispatches Calories to the focused production report", () => {
    expect(route).toContain('reportId === "calories"');
    expect(route).toContain("getNutritionCaloriesReport");
    expect(route).toContain("<NutritionCaloriesReportScreen");
    expect(route).toContain("context: query?.context");
  });

  it("keeps the remaining configured Nutrition reports on the placeholder", () => {
    expect(route).toContain("getPlaceholderReport");
    expect(route).toContain("<NutritionKnowledgeScreen");
    for (const id of ["adherence", "consistency"]) {
      expect(placeholder).not.toContain(`slug === "${id}"`);
    }
  });

  it("keeps the production shell, context selector, drawers, and canonical day links", () => {
    expect(screen).toContain("max-w-[393px]");
    expect(screen).toContain("overflow-x-hidden");
    expect(screen).not.toMatch(/w-screen|min-w-\[/);
    expect(screen).toContain("<TrainingTimelineSelector");
    expect(screen.match(/<FloatingSheet/g)).toHaveLength(2);
    expect(screen).toContain("href={day.href}");
    expect(screen).not.toContain("/progress/nutrition/calories/day");
  });

  it("uses factual copy and preserves target neutrality", () => {
    expect(screen).toContain(
      "Daily intake, weekly averages, and calorie history over time."
    );
    expect(service).toContain("Target unavailable for this period");
    expect(screen).not.toMatch(
      /deficit context|goal impact|on target|over target|under target|adjustment/i
    );
  });
});
