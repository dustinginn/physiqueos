import { describe, expect, it } from "vitest";
import { describeEnergyStrategyIdentity } from "./strategyIdentityPresentation";

describe("strategyIdentityPresentation", () => {
  it("derives a phase-named identity from the active phase, never echoing the internal mode string", () => {
    const identity = describeEnergyStrategyIdentity({ mode: "Phase Execution", phaseName: "Recomposition Phase" });
    expect(identity.title).toBe("Recomposition Phase Energy Plan");
    expect(identity.title).not.toMatch(/phase execution/i);
  });

  it("falls back to a generic phase-plan title when no phase name is available", () => {
    const identity = describeEnergyStrategyIdentity({ mode: "Phase Execution" });
    expect(identity.title).toBe("Current Phase Energy Plan");
    expect(identity.title).not.toMatch(/phase execution/i);
  });

  it("translates calibration mode into calorie-calibration language", () => {
    const identity = describeEnergyStrategyIdentity({ mode: "Maintenance Calibration" });
    expect(identity.title).toBe("Calorie Calibration");
    expect(identity.title).not.toMatch(/maintenance calibration/i);
  });

  it("is case-insensitive on the internal mode value", () => {
    expect(describeEnergyStrategyIdentity({ mode: "phase execution" }).title).toBe("Current Phase Energy Plan");
  });

  it("returns null for an unrecognized mode so callers can apply their own fallback", () => {
    expect(describeEnergyStrategyIdentity({ mode: "some_future_mode" })).toBeNull();
    expect(describeEnergyStrategyIdentity({})).toBeNull();
  });

  it("works for an arbitrary future phase name, proving this generalizes beyond Lean Mass Build", () => {
    const identity = describeEnergyStrategyIdentity({ mode: "Phase Execution", phaseName: "Cutting Phase" });
    expect(identity.title).toBe("Cutting Phase Energy Plan");
  });
});
