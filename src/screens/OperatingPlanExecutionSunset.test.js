import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStrategyDomainModel } from "./StrategyDomainScreen";

const activeGoal = { id: "goal", primary: true, status: "active", title: "Build Lean Mass" };

describe("Operating Plan standalone Execution sunset", () => {
  it("removes the card, trigger, drawer, and recurring-commitment copy", () => {
    const plan = fs.readFileSync(new URL("./OperatingPlanScreen.jsx", import.meta.url), "utf8");
    expect(plan).not.toContain('title: "Execution"');
    expect(plan).not.toContain("OperatingPlanDrawer");
    expect(plan).not.toContain("recurring commitments");
    expect(fs.existsSync(new URL("../components/operating-plan/OperatingPlanDrawer.jsx", import.meta.url))).toBe(false);
  });

  it("keeps every active method linked through its canonical domain", () => {
    const protocols = [
      ["recovery", "Foam Rolling", "recovery"],
      ["reta", "Retatrutide", "peptide"],
      ["tesa", "Tesamorelin", "peptide"],
      ["electrolytes", "Electrolytes", "supplement"],
      ["fadogia", "Fadogia Agrestis", "supplement"],
      ["multivitamin", "Multivitamin", "supplement"],
      ["tongkat", "Tongkat Ali", "supplement"],
    ].map(([id, name, category]) => ({ id, name, category, status: "active", relatedGoalIds: [activeGoal.id] }));
    const executionItems = protocols.map((protocol) => ({
      id: `execution_${protocol.id}`,
      active: true,
      cadence: { type: "daily" },
      linkedProtocolId: protocol.id,
      protocolRootId: protocol.id,
      preferredSchedule: { timeOfDay: "morning" },
      type: protocol.category,
      timeline: protocol.category === "peptide"
        ? [{ startDate: "2026-01-01", endDate: null, dose: { amount: "1", unit: "mg" } }]
        : undefined,
    }));

    const recovery = buildStrategyDomainModel({ category: "recovery", executionItems, goals: [activeGoal], protocols });
    const peptides = buildStrategyDomainModel({ category: "peptide", executionItems, goals: [activeGoal], localDate: "2026-08-07", protocols });
    const supplements = buildStrategyDomainModel({ category: "supplement", executionItems, goals: [activeGoal], protocols });
    expect(recovery.methods.map((item) => item.name)).toEqual(["Foam Rolling"]);
    expect(peptides.methods.map((item) => item.name)).toEqual(["Retatrutide", "Tesamorelin"]);
    expect(supplements.methods.map((item) => item.name)).toEqual(["Electrolytes", "Fadogia Agrestis", "Multivitamin", "Tongkat Ali"]);
    for (const method of [...recovery.methods, ...peptides.methods, ...supplements.methods]) {
      expect(method.editSupportHref).toMatch(/^\/profile\/operating-plan\/execution\//);
    }
  });

  it("retains Tracking and Coaching Updates configuration destinations", () => {
    const tracking = fs.readFileSync(new URL("./TrackingScreen.jsx", import.meta.url), "utf8");
    const coaching = fs.readFileSync(new URL("./StrategyEditorScreen.jsx", import.meta.url), "utf8");
    const trackingRoute = new URL("../app/profile/operating-plan/tracking/morning-weigh-in/page.js", import.meta.url);
    expect(tracking).toContain("/profile/operating-plan/tracking/morning-weigh-in");
    expect(fs.existsSync(trackingRoute)).toBe(true);
    expect(coaching).toContain("Progress Photos");
    expect(coaching).toContain("Remind me about Progress Photos");
    expect(coaching).toContain("DEXA");
    expect(coaching).toContain("Enable DEXA Event briefing");
  });
});
