import fs from "node:fs";
import { describe, expect, it } from "vitest";

const production = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const preview = fs.readFileSync(
  new URL("../../preview/progress/energy/page.js", import.meta.url),
  "utf8"
);

describe("production Energy route", () => {
  it("uses the canonical Energy service and screen", () => {
    for (const source of [production, preview]) {
      expect(source).toContain("getEnergyEvidenceReport");
      expect(source).toContain("EnergyEvidenceScreen");
    }
    expect(production).toContain('export const dynamic = "force-dynamic"');
  });

  it("keeps preview and production as thin wrappers without duplicate calculations", () => {
    expect(production).not.toMatch(/reconcileEnergyDays|aggregateEnergyWeeks/);
    expect(preview).not.toMatch(/reconcileEnergyDays|aggregateEnergyWeeks/);
  });
});
