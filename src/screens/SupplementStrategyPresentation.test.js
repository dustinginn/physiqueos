import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOperatingPlan } from "./OperatingPlanScreen";

describe("supplement strategy presentation", () => {
  it("shows active supplements as strategy rows without execution detail", () => {
    const plan = buildOperatingPlan({
      energyStrategy: null, executionItems: [], nutritionContext: null, trainingProtocol: null,
      protocols: [
        { id: "active", category: "supplement", status: "active", name: "Creatine", purpose: "Strength support", schedule: { frequency: "daily" }, dose: "5 g" },
        { id: "paused", category: "supplement", status: "paused", name: "Paused", purpose: "Recovery" },
      ],
    });
    const supplements = plan.find((section) => section.title === "Supplements");
    expect(supplements.supplements).toBe(true);
    expect(supplements.items).toEqual([expect.objectContaining({
      title: "Supplement Strategy", detail: "Creatine", status: "Active",
    })]);
    expect(JSON.stringify(supplements)).not.toMatch(/5 g|daily|timing|reminder|priority|timeline/i);
  });

  it("keeps detail and editor copy free of execution fields", () => {
    const detail = fs.readFileSync(path.join(process.cwd(), "src/screens/StrategyDomainScreen.jsx"), "utf8");
    const editor = fs.readFileSync(path.join(process.cwd(), "src/screens/SupplementStrategyEditorScreen.jsx"), "utf8");
    expect(detail).toContain("Current support summary");
    expect(detail).toContain("Edit Support");
    expect(detail).not.toMatch(/Reminder|Priority|Timeline/);
    expect(editor).not.toMatch(/name="(?:dose|units|frequency|timing|reminders|priority|notes)"/);
  });

  it("keeps support schedules out of Operating Plan navigation", () => {
    const protocols = [
      { id: "tongkat", category: "supplement", status: "active", name: "Tongkat Ali" },
      { id: "fadogia", category: "supplement", status: "active", name: "Fadogia Agrestis" },
      { id: "multi", category: "supplement", status: "paused", name: "Multivitamin" },
    ];
    const executionItems = [{
      id: "execution_supplement_tongkat", userId: "founder", type: "supplement",
      protocolRootId: "tongkat", active: true, cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "morning" },
    }];
    const plan = buildOperatingPlan({ protocols, executionItems, energyStrategy: null, nutritionContext: null, trainingProtocol: null });
    const supplements = plan.find((section) => section.title === "Supplements");
    expect(plan.some((section) => section.title === "Execution")).toBe(false);
    expect(supplements.items).toEqual([expect.objectContaining({
      title: "Supplement Strategy",
      detail: "Tongkat Ali, Fadogia Agrestis",
    })]);
    expect(JSON.stringify(supplements)).not.toMatch(/Daily|Morning|execution_supplement/);
    expect(JSON.stringify(supplements)).not.toContain("Multivitamin");
    protocols[2].status = "active";
    const restored = buildOperatingPlan({ protocols, executionItems, energyStrategy: null, nutritionContext: null, trainingProtocol: null })
      .find((section) => section.title === "Supplements");
    expect(restored.items[0].detail).toBe("Tongkat Ali, Fadogia Agrestis, Multivitamin");
  });
});
