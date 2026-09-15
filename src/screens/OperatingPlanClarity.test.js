import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOperatingPlan } from "../application/plan/OperatingPlanReadService.js";

const plan = fs.readFileSync(new URL("./OperatingPlanScreen.jsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("./OperatingPlanStrategyDetailScreen.jsx", import.meta.url), "utf8");
const executionDetail = fs.readFileSync(new URL("./ExecutionItemBuilderScreen.jsx", import.meta.url), "utf8");
const domainDetail = fs.readFileSync(new URL("./StrategyDomainScreen.jsx", import.meta.url), "utf8");
const domainPresentation = fs.readFileSync(new URL("../domain/services/StrategyDomainReadService.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/profile/operating-plan/strategy/[strategyType]/[strategyId]/page.js", import.meta.url), "utf8");
const sections = buildOperatingPlan({
  energyStrategy: { protocolId: "energy", selectedPace: "maintenance_calibration" },
  nutritionContext: { activeProtocolId: "nutrition" },
  trainingProtocol: { protocolId: "training", trainingStrategy: { weeklyFrequencies: { chest: 2 } } },
  protocols: ["recovery", "peptide", "supplement", "briefings"].map((category) => ({ id: category, category, status: "active", name: category })),
});

describe("Operating Plan clarity routes", () => {
  it("preserves the approved card set while omitting Hydration", () => {
    expect(sections.map((section) => section.title)).toEqual(["Energy Strategy", "Nutrition", "Training", "Recovery", "Peptides", "Supplements", "Tracking", "Coaching Updates"]);
    expect(plan).not.toContain('title: "Execution"');
    expect(plan).not.toContain("OperatingPlanDrawer");
    expect(plan).not.toContain("recurring commitments");
    expect(plan).not.toContain("nutrition-hydration");
    expect(plan).not.toContain('title: "Hydration"');
  });

  it("routes active strategies by stable identity rather than generic evidence pages", () => {
    for (const strategyType of ["energy", "nutrition", "training"]) {
      expect(sections.flatMap((section) => section.items)).toContainEqual(expect.objectContaining({
        href: `/profile/operating-plan/strategy/${strategyType}/${strategyType}`,
        destination: { id: "plan.strategy", parameters: { strategyType, strategyId: strategyType } },
      }));
    }
    expect(plan).not.toContain('href: "/progress/nutrition"');
    expect(route).toContain("strategyId, strategyType");
  });

  it("preserves Recovery destination while retiring generic Execution navigation", () => {
    expect(sections.find((section) => section.title === "Recovery").items[0]).toMatchObject({
      href: "/profile/protocols/recovery?from=operating-plan",
      destination: { id: "plan.support", parameters: { supportType: "protocol", supportId: "recovery" } },
    });
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
    expect(domainPresentation).toContain("Recovery Strategy");
    expect(domainPresentation).toContain("Supplement Strategy");
    expect(domainPresentation).toContain("Current Recovery Methods");
    expect(domainPresentation).toContain("Current Supplements");
    expect(domainDetail).toContain("Current support summary");
    expect(domainDetail).toContain("Edit Support");
    expect(domainDetail).not.toMatch(/Research Summary|Evidence Role|Edit Protocol/);
  });

  it("groups Peptides while preserving direct links to the existing support editors", () => {
    expect(domainPresentation).toContain("Peptide Strategy");
    expect(domainPresentation).toContain("Current Peptides");
    expect(domainDetail).toContain("Current dose");
    expect(domainDetail).toContain("Current schedule");
    expect(domainPresentation).toContain("/execution/peptides/");
    expect(domainDetail).not.toMatch(/Dosing Timeline|Next Dose|Reminder|Priority|Execution notes/);
  });

  it("moves Coaching Updates to a read-only strategy destination", () => {
    expect(sections.find((section) => section.title === "Coaching Updates").items[0]).toMatchObject({
      destination: { id: "plan.strategy", parameters: { strategyType: "briefings", strategyId: "briefings" } },
    });
    expect(detail).not.toContain("Save");
  });
});
