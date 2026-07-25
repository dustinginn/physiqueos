import { describe, expect, it } from "vitest";
import {
  buildOperatingPlan,
  deriveAuthoritativeRecurringExecutionItems,
  formatExecutionSchedule,
  isConcreteExecutionItem,
} from "./OperatingPlanScreen";

const recurringItems = [
  { active: true, cadence: { type: "daily" }, id: "execution_morning_weigh_in", title: "Morning Weigh-in" },
  { active: true, cadence: { type: "daily" }, id: "execution_foam_roll", title: "Foam Rolling" },
  { active: true, cadence: { type: "specific_weekdays" }, id: "execution_retatrutide", linkedProtocolId: "reta", title: "Retatrutide", type: "protocol" },
  { active: true, cadence: { type: "specific_weekdays" }, id: "execution_tesamorelin", linkedProtocolId: "tesa", title: "Tesamorelin", type: "protocol" },
  { active: true, cadence: { type: "weekly" }, id: "execution_progress_photos", title: "Progress Photos" },
  { active: true, cadence: { type: "scheduled_date" }, completedAt: "2026-07-18", id: "execution_dexa", title: "DEXA" },
];

const peptideProtocols = [
  { id: "reta", name: "Retatrutide", category: "peptide", status: "active" },
  { id: "tesa", name: "Tesamorelin", category: "peptide", status: "active" },
];

const strategyStatements = [
  "goal_commitment_nutrition_daily_1",
  "goal_commitment_training_weekly_2",
  "goal_commitment_activity_weekly_3",
  "goal_commitment_energy_weekly_6",
  "goal_commitment_briefings_weekly_8",
].map((id) => ({ active: true, id, title: id }));

describe("Operating Plan execution presentation", () => {
  it("shows only concrete recurring actions", () => {
    const sections = buildOperatingPlan({
      energyStrategy: null,
      executionItems: [...recurringItems, ...strategyStatements],
      nutritionContext: null,
      protocols: peptideProtocols,
      trainingProtocol: null,
    });
    const execution = sections.find((section) => section.title === "Execution");
    expect(execution.subtitle).toBe("5 recurring commitments");
    expect(execution.items.map((item) => item.id)).toEqual([
      "execution_foam_roll",
      "execution_morning_weigh_in",
      "execution_progress_photos",
      "execution_retatrutide",
      "execution_tesamorelin",
    ]);
    expect(execution.items.some((item) => item.id === "execution_dexa")).toBe(false);
  });

  it("classifies strategy, review, and coaching statements without altering source records", () => {
    const before = structuredClone(strategyStatements);
    expect(strategyStatements.every((item) => !isConcreteExecutionItem(item))).toBe(true);
    expect(strategyStatements).toEqual(before);
  });

  it("excludes inactive, non-authoritative, and one-time records deterministically", () => {
    const records = [
      ...recurringItems,
      { active: false, cadence: { type: "daily" }, id: "archived" },
      { active: true, cadence: { type: "daily" }, id: "paused", status: "paused" },
      { active: true, cadence: { type: "daily" }, id: "orphan", protocolRootId: "missing", type: "supplement" },
    ];
    const forward = deriveAuthoritativeRecurringExecutionItems({
      executionItems: records,
      protocols: peptideProtocols,
    });
    const reverse = deriveAuthoritativeRecurringExecutionItems({
      executionItems: records.slice().reverse(),
      protocols: peptideProtocols,
    });

    expect(forward.map((item) => item.id)).toEqual(reverse.map((item) => item.id));
    expect(forward.map((item) => item.id)).toEqual([
      "execution_foam_roll",
      "execution_morning_weigh_in",
      "execution_progress_photos",
      "execution_retatrutide",
      "execution_tesamorelin",
    ]);
  });

  it("uses natural execution summaries without placeholder fields", () => {
    expect(formatExecutionSchedule({ cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "17:00" } })).toBe("Daily · 5:00 PM");
    expect(formatExecutionSchedule({ cadence: { type: "specific_weekdays" }, preferredSchedule: { daysOfWeek: ["thursday"], timeOfDay: "21:45" } })).toBe("Thursday · 9:45 PM");
    expect(formatExecutionSchedule({ cadence: { type: "specific_weekdays" }, preferredSchedule: { daysOfWeek: ["sunday","monday","tuesday","wednesday","thursday"], timeOfDay: "21:45" } })).toBe("Sun–Thu · 9:45 PM");
    expect(formatExecutionSchedule({ cadence: { type: "weekly" }, preferredSchedule: { daysOfWeek: ["saturday"], timeOfDay: "afternoon" } })).toBe("Saturday · Afternoon");
    expect(formatExecutionSchedule({ cadence: { type: "scheduled_date" }, preferredSchedule: {} })).toBe("Not scheduled");
  });

  it("renders Execution first and all strategy sections in the required order", () => {
    const protocols=[
      {id:"briefings",category:"briefings",status:"active"},
      ...peptideProtocols,
      {id:"recovery",name:"Recovery",category:"recovery",status:"active"},
      {id:"supplement",name:"Supplement",category:"supplement",status:"active"},
    ];
    const sections=buildOperatingPlan({energyStrategy:null,executionItems:[recurringItems[0]],nutritionContext:null,protocols,trainingProtocol:null});
    expect(sections.map((section)=>section.title)).toEqual(["Execution","Coaching Updates","Energy Strategy","Nutrition","Peptides","Recovery","Supplements","Training"]);
    const peptides=sections.find((section)=>section.title==="Peptides");
    expect(peptides.items.map((item)=>item.title)).toEqual(["Retatrutide","Tesamorelin"]);
    expect(peptides.items.every((item)=>item.href.startsWith("/profile/protocols/")&&!item.href.includes("/execution/"))).toBe(true);
    const execution=sections[0];
    expect(execution.items.map((item)=>item.id)).toEqual(["execution_morning_weigh_in"]);
  });
});
