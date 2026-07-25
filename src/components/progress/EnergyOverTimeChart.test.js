import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeriesPaths } from "./EnergyOverTimeChart";

const source = fs.readFileSync(
  new URL("./EnergyOverTimeChart.jsx", import.meta.url),
  "utf8"
);

describe("EnergyOverTimeChart", () => {
  it("renders two distinguishable series and keeps balance detail-only", () => {
    expect(source).toContain('stroke="var(--energy-intake)"');
    expect(source).toContain('stroke="var(--energy-expenditure)"');
    expect(source).toContain('strokeDasharray="6 4"');
    expect(source).toContain('label="Average balance"');
    expect(source).not.toContain("balanceY");
    expect(source).not.toContain('buildSeriesPaths(points, "balance');
    expect(source).toContain('metric="balance"');
  });

  it("does not connect through unavailable values or fabricate a one-point trend", () => {
    const points = [
      { x: 0, intakeY: 10 },
      { x: 1, intakeY: null },
      { x: 2, intakeY: 20 },
      { x: 3, intakeY: 30 },
    ];
    expect(buildSeriesPaths(points, "intakeY")).toEqual(["M 2 20 L 3 30"]);
    expect(buildSeriesPaths([{ x: 1, intakeY: 10 }], "intakeY")).toEqual([]);
  });

  it("supports range and keyboard selected-point interaction", () => {
    expect(source).toContain("ENERGY_RANGE_OPTIONS.map");
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === " "');
    expect(source).toContain("reconcileSelectedWeekId");
  });
});
