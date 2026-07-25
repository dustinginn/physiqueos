import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const operatingPlan = fs.readFileSync(
  new URL("../../../../../screens/OperatingPlanScreen.jsx", import.meta.url),
  "utf8"
);

describe("legacy Cut Energy Strategy route archive", () => {
  it("guards at the server boundary with the unified strategy resolver", () => {
    expect(route).toContain("createOperatingPlanEnergyStrategyService");
    expect(route).toContain(".getActiveStrategy(user.id)");
    expect(route).toContain('redirect("/profile/operating-plan")');
    expect(route.indexOf(".getActiveStrategy(user.id)")).toBeLessThan(
      route.lastIndexOf('redirect("/profile/operating-plan")')
    );
  });

  it("does not instantiate or render the legacy builder", () => {
    expect(route).not.toContain("createCutEnergyStrategyService");
    expect(route).not.toContain("CutEnergyStrategyBuilderScreen");
    expect(route).not.toContain("activateCutEnergyStrategy");
    expect(route).not.toMatch(
      /Cut Energy Strategy|rest of your cut|Step 1 of 9|Late-stage cut|1900|2100/
    );
  });

  it("does not use legacy links or expose a live Operating Plan link", () => {
    expect(route).not.toContain("energyStrategyLinks");
    expect(operatingPlan).not.toContain(
      'href: "/profile/operating-plan/energy/new"'
    );
  });
});
