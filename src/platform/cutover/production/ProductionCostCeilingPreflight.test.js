import { describe, expect, it } from "vitest";
import { createVerifyCostCeilingPreflight } from "./ProductionCostCeilingPreflight.js";

describe("ProductionCostCeilingPreflight — construction", () => {
  it("requires a configured positive maximumMonthlyCostUsd", () => {
    expect(() => createVerifyCostCeilingPreflight({})).toThrow();
    expect(() => createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 0 })).toThrow();
    expect(() => createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: -5 })).toThrow();
  });
});

describe("ProductionCostCeilingPreflight — verifyCostCeiling", () => {
  it("passes when the declared expected cost is within the configured ceiling", async () => {
    const preflight = createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 100 });
    const result = await preflight({ input: { expectedMonthlyCostUsd: 60 } });
    expect(result).toMatchObject({ ready: true, mutated: false, expectedMonthlyCostUsd: 60, maximumMonthlyCostUsd: 100 });
  });

  it("fails closed when no expected cost is declared", async () => {
    const preflight = createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 100 });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_COST_CEILING_UNKNOWN" });
  });

  it("fails closed when the declared expected cost exceeds the configured ceiling", async () => {
    const preflight = createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 100 });
    const result = await preflight({ input: { expectedMonthlyCostUsd: 150 } });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_COST_CEILING_EXCEEDED" });
  });

  it("passes exactly at the ceiling boundary", async () => {
    const preflight = createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd: 100 });
    const result = await preflight({ input: { expectedMonthlyCostUsd: 100 } });
    expect(result.ready).toBe(true);
  });
});
