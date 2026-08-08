import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStrategyDomainModel } from "./StrategyDomainScreen";

const activeGoal = {
  id: "goal-current",
  primary: true,
  status: "active",
  title: "Build Lean Mass",
};

describe("Operating Plan strategy domains", () => {
  it("presents Recovery as one strategy with Foam Rolling support", () => {
    const model = buildStrategyDomainModel({
      category: "recovery",
      goals: [activeGoal],
      protocols: [{
        id: "recovery",
        category: "recovery",
        name: "Foam Rolling",
        relatedGoalIds: [activeGoal.id],
        status: "active",
      }],
      executionItems: [{
        id: "execution_foam_roll",
        active: true,
        cadence: { type: "daily" },
        linkedProtocolId: "recovery",
        preferredSchedule: {
          startDate: "2026-07-23",
          endDate: null,
          timeOfDay: "17:00",
        },
        type: "recovery",
      }],
    });

    expect(model.goalTitle).toBe("Build Lean Mass");
    expect(model.purpose).toContain("your Build Lean Mass goal");
    expect(model.supportingLine).toBe("Supporting your Build Lean Mass goal.");
    expect(model.helperCopy).toBe("Your current recovery strategy is supported by the following methods.");
    expect(model.methods).toEqual([expect.objectContaining({
      name: "Foam Rolling",
      purpose: expect.stringContaining("your Build Lean Mass goal"),
      supportSummary: expect.stringContaining("5:00 PM"),
      editSupportHref: "/profile/operating-plan/execution/execution_foam_roll",
    })]);
  });

  it("groups active peptides and reuses their current execution phase and schedule", () => {
    const protocols = [
      { id: "reta", category: "peptide", name: "Retatrutide", relatedGoalIds: [activeGoal.id], status: "active" },
      { id: "tesa", category: "peptide", name: "Tesamorelin", relatedGoalIds: [activeGoal.id], status: "active" },
    ];
    const executionItems = [
      {
        id: "execution_reta",
        active: true,
        cadence: { type: "specific_days" },
        preferredSchedule: { daysOfWeek: ["thursday"], timeOfDay: "21:45" },
        protocolRootId: "reta",
        timeline: [{ startDate: "2026-07-23", endDate: "2026-07-29", dose: { amount: "1.5", unit: "mg" } }],
        type: "peptide",
      },
      {
        id: "execution_tesa",
        active: true,
        cadence: { type: "specific_days" },
        preferredSchedule: { daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"], timeOfDay: "21:45" },
        protocolRootId: "tesa",
        timeline: [{ startDate: "2026-05-24", endDate: null, dose: { amount: ".5", unit: "mg" } }],
        type: "peptide",
      },
    ];

    const model = buildStrategyDomainModel({
      category: "peptide",
      executionItems,
      goals: [
        { id: "goal-historical", primary: false, status: "active", title: "Preserve Lean Mass" },
        activeGoal,
      ],
      localDate: "2026-08-03",
      protocols: protocols.map((protocol) => ({
        ...protocol,
        relatedGoalIds: ["goal-historical", activeGoal.id],
      })),
    });

    expect(model.methods.map((method) => method.name)).toEqual(["Retatrutide", "Tesamorelin"]);
    expect(model.goalTitle).toBe("Build Lean Mass");
    expect(model.helperCopy).toBe("The following peptides currently support this strategy.");
    expect(model.methods[0]).toEqual(expect.objectContaining({
      currentDose: "No active phase",
      currentSchedule: expect.stringContaining("9:45 PM"),
      editSupportHref: "/profile/operating-plan/execution/peptides/reta?edit=1",
      purpose: expect.stringContaining("your Build Lean Mass goal"),
    }));
    expect(model.methods[0].purpose).not.toMatch(/fat-loss|Current Goal|Goal strategy/i);
    expect(model.methods[1].currentDose).toBe("0.5 mg");
    expect(model.methods[1].purpose).not.toMatch(/preserve lean mass|lean-mass preservation|Current Goal/i);
  });

  it("groups only active supplements and links directly to their existing support editors", () => {
    const model = buildStrategyDomainModel({
      category: "supplement",
      protocols: [
        { id: "electrolytes", category: "supplement", name: "Electrolytes", relatedGoalIds: [activeGoal.id], status: "active" },
        { id: "paused", category: "supplement", name: "Paused", status: "paused" },
      ],
      goals: [activeGoal],
      executionItems: [{
        id: "execution_electrolytes",
        active: true,
        cadence: { type: "daily" },
        preferredSchedule: { timeOfDay: "morning" },
        protocolRootId: "electrolytes",
        type: "supplement",
      }],
    });

    expect(model.methods).toEqual([expect.objectContaining({
      name: "Electrolytes",
      purpose: expect.stringContaining("hydration"),
      supportSummary: expect.stringMatching(/Daily.*Morning/),
      editSupportHref: "/profile/operating-plan/execution/supplements/electrolytes?edit=1",
    })]);
    expect(model.methods[0].purpose).toContain("your Build Lean Mass goal");
    expect(model.helperCopy).toBe("The following supplements currently support this strategy.");
  });

  it("falls back to natural current-strategy language when no goal title is available", () => {
    const model = buildStrategyDomainModel({
      category: "peptide",
      protocols: [{ id: "peptide", category: "peptide", name: "Peptide", status: "active" }],
    });

    expect(model.purpose).toContain("your current strategy");
    expect(model.methods[0].purpose).toContain("your current strategy");
    expect(model.supportingLine).toBeNull();
  });

  it("uses Support terminology without changing the existing editor implementations", () => {
    const screen = fs.readFileSync(new URL("./StrategyDomainScreen.jsx", import.meta.url), "utf8");
    expect(screen).toContain("Recovery Strategy");
    expect(screen).toContain("Peptide Strategy");
    expect(screen).toContain("Supplement Strategy");
    expect(screen).toContain("Current Recovery Methods");
    expect(screen).toContain("Current Peptides");
    expect(screen).toContain("Current Supplements");
    expect(screen).toContain("Edit Support");
    expect(screen).not.toContain("Edit Execution");
    expect(screen).not.toContain("current Goal");
    expect(screen).not.toContain("active Goal");
    expect(screen).not.toContain("Goal strategy");
  });
});
