import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./EnergyWeeklyChart.jsx", import.meta.url),
  "utf8"
);

describe("EnergyWeeklyChart semantic presentation", () => {
  it("keeps Intake yellow and Estimated expenditure blue", () => {
    expect(source).toContain("var(--energy-intake)");
    expect(source).toContain("var(--energy-expenditure)");
  });

  it("emphasizes balance in detail without adding a balance bar", () => {
    expect(source).toContain('metric="balance"');
    expect(source).not.toMatch(/className=.*energy-balance.*ChartBar/);
  });
});
