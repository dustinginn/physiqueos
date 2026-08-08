import fs from "node:fs";
import { describe, expect, it } from "vitest";

const plan = fs.readFileSync(new URL("./OperatingPlanScreen.jsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("./OperatingPlanStrategyDetailScreen.jsx", import.meta.url), "utf8");
const executionDetail = fs.readFileSync(new URL("./ExecutionItemBuilderScreen.jsx", import.meta.url), "utf8");
const domainDetail = fs.readFileSync(new URL("./StrategyDomainScreen.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/profile/operating-plan/strategy/[strategyType]/[strategyId]/page.js", import.meta.url), "utf8");

describe("Operating Plan clarity routes", () => {
  it("preserves the approved card set while omitting Hydration", () => {
    for (const title of ["Coaching Updates", "Energy Strategy", "Nutrition", "Peptides", "Recovery", "Supplements", "Tracking", "Training"]) expect(plan).toContain(`title: "${title}"`);
    expect(plan).not.toContain('title: "Execution"');
    expect(plan).not.toContain("OperatingPlanDrawer");
    expect(plan).not.toContain("recurring commitments");
    expect(plan).not.toContain("nutrition-hydration");
    expect(plan).not.toContain('title: "Hydration"');
  });

  it("routes active strategies by stable identity rather than generic evidence pages", () => {
    expect(plan).toContain('getOperatingPlanStrategyHref("energy", link.protocolId)');
    expect(plan).toContain('getOperatingPlanStrategyHref("nutrition", nutritionContext?.activeProtocolId)');
    expect(plan).toContain('getOperatingPlanStrategyHref("training", version.protocolId)');
    expect(plan).not.toContain('href: "/progress/nutrition"');
    expect(route).toContain("strategyId, strategyType");
  });

  it("preserves Recovery destination while retiring generic Execution navigation", () => {
    expect(plan).toContain("`/profile/protocols/${recoveryProtocols[0].id}?from=operating-plan`");
    expect(plan).not.toContain("`/profile/operating-plan/execution/${item.id}`");
  });

  it("provides a safe viewer-facing missing state and no peptide fields", () => {
    expect(detail).toContain("This strategy is not available right now.");
    expect(detail).toContain('href="/profile/operating-plan"');
    expect(detail).not.toMatch(/Dose pending|Current Dose|Provenance|Canonical|Runtime|Schema/);
  });

  it("guards unsupported execution identities before configured fields are read", () => {
    expect(executionDetail).toContain("if (!config) return <ExecutionUnavailable");
    expect(executionDetail.indexOf("if (!config)")).toBeLessThan(executionDetail.indexOf("config.cadenceLocked"));
    expect(executionDetail).toContain("This execution item is not available here.");
  });

  it("groups Recovery and Supplements around strategy purpose and current support", () => {
    expect(domainDetail).toContain("Recovery Strategy");
    expect(domainDetail).toContain("Supplement Strategy");
    expect(domainDetail).toContain("Current Recovery Methods");
    expect(domainDetail).toContain("Current Supplements");
    expect(domainDetail).toContain("Current support summary");
    expect(domainDetail).toContain("Edit Support");
    expect(domainDetail).not.toMatch(/Research Summary|Evidence Role|Edit Protocol/);
  });

  it("groups Peptides while preserving direct links to the existing support editors", () => {
    expect(domainDetail).toContain("Peptide Strategy");
    expect(domainDetail).toContain("Current Peptides");
    expect(domainDetail).toContain("Current dose");
    expect(domainDetail).toContain("Current schedule");
    expect(domainDetail).toContain("/execution/peptides/");
    expect(domainDetail).not.toMatch(/Dosing Timeline|Next Dose|Reminder|Priority|Execution notes/);
  });

  it("moves Coaching Updates to a read-only strategy destination", () => {
    expect(plan).toContain('getOperatingPlanStrategyHref("briefings", coachingProtocol.id)');
    expect(detail).not.toContain("Save");
  });
});
