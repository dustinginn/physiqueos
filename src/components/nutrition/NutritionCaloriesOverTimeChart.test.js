import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNutritionCalorieSeriesPaths } from "./NutritionCaloriesOverTimeChart";

const source = fs.readFileSync(
  new URL("./NutritionCaloriesOverTimeChart.jsx", import.meta.url),
  "utf8"
);

describe("Nutrition Calories over time presentation", () => {
  it("renders the accepted ranges and exactly one Nutrition series", () => {
    expect(source).toContain("LONG_RANGE_OPTIONS.map");
    expect(source).toContain('stroke="var(--chart-3)"');
    expect(source.match(/<path/g)).toHaveLength(1);
    expect(source).not.toMatch(/expenditure|balance|deficit|surplus/i);
  });

  it("preserves gaps and does not fabricate a one-point line", () => {
    expect(
      buildNutritionCalorieSeriesPaths([
        { weekStart: "2026-06-28", x: 0, y: 10 },
        { weekStart: "2026-07-12", x: 20, y: 20 },
        { weekStart: "2026-07-19", x: 30, y: 30 },
      ])
    ).toEqual(["M 20 20 L 30 30"]);
    expect(
      buildNutritionCalorieSeriesPaths([
        { weekStart: "2026-07-19", x: 30, y: 30 },
      ])
    ).toEqual([]);
  });

  it("supports keyboard selection and factual logged-day detail", () => {
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === " "');
    expect(source).toContain('label="Logged days"');
    expect(source).toContain("More weekly history is needed to show a trend.");
  });
});
