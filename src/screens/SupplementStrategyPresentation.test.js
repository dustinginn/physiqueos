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

  it("adds only configured supplements to Execution and reuses their summaries", () => {
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
    const execution = buildOperatingPlan({ protocols, executionItems, energyStrategy: null, nutritionContext: null, trainingProtocol: null })
      .find((section) => section.title === "Execution");
    expect(execution.items.map((item) => [item.title, item.detail])).toEqual([
      ["Tongkat Ali", "Daily · Morning"],
    ]);
    expect(execution.items.some((item) => item.title === "Fadogia Agrestis")).toBe(false);
    expect(execution.items.some((item) => item.title === "Multivitamin")).toBe(false);
    protocols[2].status = "active";
    const restored = buildOperatingPlan({ protocols, executionItems, energyStrategy: null, nutritionContext: null, trainingProtocol: null })
      .find((section) => section.title === "Execution");
    expect(restored.items.some((item) => item.title === "Multivitamin")).toBe(false);
  });
});
