import fs from "node:fs";
import { describe, expect, it } from "vitest";

const production = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const preview = fs.readFileSync(
  new URL("../../preview/progress/energy/page.js", import.meta.url),
  "utf8"
);

describe("production Energy route", () => {
  it("uses the canonical Energy service and screen", () => {
    // The production route composes the same accepted report the Native
    // production contract also builds on (createProviderEnergyEvidenceReport,
    // see NativeProductionContractService.js's "energy" case). The preview
    // route fetches its own repositories through the higher-level
    // getEnergyEvidenceReport wrapper around that same composition -- the two
    // routes intentionally call different entry points into one shared
    // service, so only the entry point each route actually uses is asserted.
    expect(production).toContain("createProviderEnergyEvidenceReport");
    expect(preview).toContain("getEnergyEvidenceReport");
    for (const source of [production, preview]) {
      expect(source).toContain("EnergyEvidenceScreen");
    }
    expect(production).toContain('export const dynamic = "force-dynamic"');
  });

  it("keeps preview and production as thin wrappers without duplicate calculations", () => {
    expect(production).not.toMatch(/reconcileEnergyDays|aggregateEnergyWeeks/);
    expect(preview).not.toMatch(/reconcileEnergyDays|aggregateEnergyWeeks/);
  });
});
