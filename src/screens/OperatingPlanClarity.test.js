import fs from "node:fs";
import { describe, expect, it } from "vitest";

const plan = fs.readFileSync(new URL("./OperatingPlanScreen.jsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("./OperatingPlanStrategyDetailScreen.jsx", import.meta.url), "utf8");
const executionDetail = fs.readFileSync(new URL("./ExecutionItemBuilderScreen.jsx", import.meta.url), "utf8");
const protocolDetail = fs.readFileSync(new URL("./ProtocolDetailScreen.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/profile/operating-plan/strategy/[strategyType]/[strategyId]/page.js", import.meta.url), "utf8");

describe("Operating Plan clarity routes", () => {
  it("preserves the approved card set while omitting Hydration", () => {
    for (const title of ["Execution", "Coaching Updates", "Energy Strategy", "Nutrition", "Peptides", "Recovery", "Supplements", "Training"]) expect(plan).toContain(`title: "${title}"`);
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

  it("preserves Recovery and Execution destinations", () => {
    expect(plan).toContain("`/profile/protocols/${protocol.id}?from=operating-plan`");
    expect(plan).toContain("`/profile/operating-plan/execution/${item.id}`");
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

  it("keeps Recovery and Supplement details strategy-only", () => {
    const strategyView = protocolDetail.slice(
      protocolDetail.indexOf("function StrategyProtocolDetail"),
      protocolDetail.indexOf("function ProtocolPurpose"),
    );
    expect(strategyView).toContain("Current Strategy");
    expect(strategyView).toContain("Goal Supported");
    expect(strategyView).toContain("Started");
    expect(strategyView).toContain("Activity");
    expect(strategyView).not.toMatch(/Current Schedule|Dose|Research|Evidence|EditEntry/);
  });

  it("keeps Peptide details strategy-only and separate from Execution", () => {
    const strategyView = protocolDetail.slice(
      protocolDetail.indexOf("function StrategyProtocolDetail"),
      protocolDetail.indexOf("function ProtocolPurpose"),
    );
    expect(strategyView).toContain("Peptide Strategy");
    expect(strategyView).toContain("Purpose");
    expect(strategyView).toContain("Current Strategy");
    expect(strategyView).toContain("Goal Supported");
    expect(strategyView).toContain("Started");
    expect(strategyView).toContain("Status");
    expect(strategyView).not.toMatch(/Dosing Timeline|Next Dose|Reminder|Priority|Execution notes/);
  });

  it("moves Coaching Updates to a read-only strategy destination", () => {
    expect(plan).toContain('getOperatingPlanStrategyHref("briefings", coachingProtocol.id)');
    expect(detail).not.toContain("Save");
  });
});
