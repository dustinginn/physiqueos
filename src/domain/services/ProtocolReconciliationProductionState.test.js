import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOperatingPlan } from "../../screens/OperatingPlanScreen";
import { createDailyFocusService } from "./DailyFocusService";
import { resolveActiveOperatingPlanEnergyStrategy } from "./OperatingPlanEnergyStrategyService";

const store = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "private/founder/runtime-store.json"), "utf8")
);
const targetGoalId =
  "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";

describe("production protocol reconciliation state", () => {
  it("renders the reconciled Operating Plan from authoritative active sources", () => {
    const sections = buildOperatingPlan({
      energyStrategy: resolveActiveOperatingPlanEnergyStrategy({
        goals: store.goals,
        protocols: store.protocols,
        userId: store.user.id,
      }),
      executionItems: store.executionItems,
      nutritionContext: store.nutritionContext,
      protocols: store.protocols,
      trainingProtocol: { trainingStrategy: { weeklyFrequencies: {}, progression: { pace: "steady" } } },
    });
    expect(sections.find((item) => item.title === "Energy Strategy").items[0])
      .toMatchObject({ title: "Maintenance Calibration", status: "Active" });
    expect(sections.find((item) => item.title === "Nutrition").items[0])
      .toMatchObject({ title: "Maintenance Calibration", detail: "1 g per lb of body weight · intake adjusted gradually" });
    expect(sections.find((item) => item.title === "Supplements").subtitle)
      .toBe("4 active protocols");
    expect(sections.find((item) => item.title === "Recovery").items)
      .toEqual([expect.objectContaining({ title: "Foam Rolling", status: "Active" })]);
    const execution = sections.find((item) => item.title === "Execution");
    expect(execution.subtitle).toBe("9 recurring commitments");
    expect(execution.items.map((item) => item.id)).toEqual([
      "execution_foam_roll",
      "execution_morning_weigh_in",
      "execution_progress_photos",
      "execution_retatrutide",
      "execution_supplement_protocol_electrolytes_founder",
      "execution_supplement_protocol_fadogia_agrestis_founder",
      "execution_supplement_protocol_multivitamin_founder",
      "execution_supplement_protocol_tongkat_ali_founder",
      "execution_tesamorelin",
    ]);
  });

  it("merges the Retatrutide transition into its sole execution priority", () => {
    const priorities = createDailyFocusService().getDailyFocus({
      checkIns: store.dailyCheckIns,
      latestWeight: store.weightEntries.at(-1),
      weightEntries: store.weightEntries,
      protocols: store.protocols,
      progressPhotos: store.progressPhotos,
      reminders: store.reminders,
      now: new Date(2026, 6, 23, 8),
    });
    const ids = priorities.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "reminder_foam_roll_daily")).toHaveLength(1);
    expect(ids).toContain("reminder_retatrutide");
    expect(ids).not.toContain("dose-change-protocol_retatrutide_founder-2026-07-23");
    expect(priorities.find((item) => item.id === "reminder_retatrutide")).toMatchObject({
      metadata: "1.5 mg tonight",
      changeLabel: "Taper begins today",
      completable: true,
      completionId: "reminder_retatrutide",
    });
  });

  it("keeps one future source for Foam Rolling and current Build Lean Mass context", () => {
    const foamProtocol = store.protocols.find((item) => item.name === "Foam Rolling" && item.status === "active");
    const foamExecution = store.executionItems.find((item) => item.id === "execution_foam_roll");
    const foamReminder = store.reminders.find((item) => item.id === "reminder_foam_roll_daily");
    expect(foamProtocol).toMatchObject({
      category: "recovery",
      ownership: "user_created",
      schedule: { type: "daily", timeOfDay: "17:00" },
      manualCompletion: true,
      currentGoalIds: [targetGoalId],
    });
    expect(foamExecution).toMatchObject({ active: true, linkedProtocolId: foamProtocol.id });
    expect(foamReminder).toMatchObject({ active: true, linkedEntityId: foamProtocol.id });
    expect(store.reminders.filter((item) =>
      item.active !== false && /_commitment_recovery_daily_/.test(item.id)
    )).toHaveLength(0);
  });

  it("preserves peptide schedules, taper history, and historical/current goal separation", () => {
    const reta = store.protocols.find((item) => item.id === "protocol_retatrutide_founder");
    const tesa = store.protocols.find((item) => item.id === "protocol_tesamorelin_founder");
    expect(reta).toMatchObject({
      status: "active",
      currentGoalIds: [targetGoalId],
      historicalGoalIds: expect.arrayContaining(["goal_visible_abs_at_rest"]),
    });
    expect(reta.doseHistory.find((item) => item.startDate === "2026-07-23"))
      .toMatchObject({ dose: 1.5, doseUnit: "mg" });
    expect(tesa).toMatchObject({
      status: "active",
      dose: { value: 0.5, unit: "mg" },
      schedule: {
        daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
        timeOfDay: "night",
        timingContext: "fasted_before_bed",
      },
      currentGoalIds: [targetGoalId],
      historicalGoalIds: expect.arrayContaining(["goal_visible_abs_at_rest"]),
    });
  });
});
