import { describe, expect, it } from "vitest";
import { buildMacroTrendPaths, formatWeekRange } from "./NutritionMacroTrendChart";

describe("Nutrition macro trend chart", () => {
  it("draws weekly points continuously and preserves canonical labels", () => {
    const paths = buildMacroTrendPaths([
      { weekStart: "2026-07-05", x: 10, y: 30 },
      { weekStart: "2026-07-12", x: 20, y: 20 },
      { weekStart: "2026-07-19", x: 30, y: 10 },
    ]);

    expect(paths).toEqual(["M 10 30 L 20 20 L 30 10"]);
    expect(formatWeekRange({
      weekStart: "2026-07-19",
      weekEnd: "2026-07-25",
    })).toBe("Jul 19–Jul 25");
  });

  it("does not connect across missing calendar weeks", () => {
    expect(buildMacroTrendPaths([
      { weekStart: "2026-07-05", x: 10, y: 30 },
      { weekStart: "2026-07-12", x: 20, y: 20 },
      { weekStart: "2026-07-26", x: 40, y: 10 },
      { weekStart: "2026-08-02", x: 50, y: 5 },
    ])).toEqual([
      "M 10 30 L 20 20",
      "M 40 10 L 50 5",
    ]);
  });
});
