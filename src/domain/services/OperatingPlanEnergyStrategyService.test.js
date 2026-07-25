import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createOperatingPlanEnergyStrategyService,
  resolveActiveOperatingPlanEnergyStrategy,
} from "./OperatingPlanEnergyStrategyService";
import { buildOperatingPlan } from "../../screens/OperatingPlanScreen";
import { FounderRepositories } from "../../data/repositories/founderRepositories";

const userId = "user";
const activeGoal = {
  id: "build",
  userId,
  primary: true,
  status: "active",
  title: "Build Lean Mass",
};
const completedGoal = {
  id: "visible",
  userId,
  primary: false,
  status: "completed",
  title: "Visible Abs",
};
const energy = (overrides = {}) => ({
  id: "energy",
  userId,
  protocolType: "energy",
  category: "energy",
  status: "active",
  relatedGoalIds: [activeGoal.id],
  effectiveStrategy: {
    mode: "Maintenance Calibration",
    evaluationCadence: "Weekly",
    calorieStrategy: "increase_gradually",
    activityStrategy: "reduce_slightly",
  },
  activationProvenance: {
    sourceProtocolId: "virtual_energy",
    provenanceSourceType: "virtual_plan",
  },
  activatedAt: "2026-07-23T12:00:00.000Z",
  ...overrides,
});

describe("Operating Plan active Energy Strategy resolver", () => {
  it("resolves the active goal's unified maintenance calibration without legacy links", () => {
    const result = resolveActiveOperatingPlanEnergyStrategy({
      goals: [completedGoal, activeGoal],
      protocols: [energy()],
      userId,
    });

    expect(result).toEqual({
      isConfigured: true,
      goalId: "build",
      protocolId: "energy",
      protocolVersionId: null,
      status: "active",
      mode: "Maintenance Calibration",
      selectedPace: "maintenance_calibration",
      evaluationCadence: "Weekly",
      nutritionStrategy: "increase_gradually",
      activityStrategy: "reduce_slightly",
      effectiveDate: "2026-07-23T12:00:00.000Z",
      provenance: {
        sourceProtocolId: "virtual_energy",
        sourceType: "virtual_plan",
      },
    });
    expect(JSON.stringify(result)).not.toContain("energyStrategyLinks");
  });

  it("treats calibration as configured without fixed calorie or activity targets", () => {
    const result = resolveActiveOperatingPlanEnergyStrategy({
      goals: [activeGoal],
      protocols: [energy()],
      userId,
    });
    const section = buildOperatingPlan({
      energyStrategy: result,
      executionItems: [],
      nutritionContext: {
        estimatedDailyCaloricIntake: null,
        calibrationStrategy: {},
      },
      protocols: [],
      trainingProtocol: null,
    }).find((item) => item.title === "Energy Strategy");

    expect(section.subtitle).toBe("Active");
    expect(section.items[0]).toMatchObject({
      title: "Maintenance Calibration",
      status: "Active",
      href: "/profile/operating-plan/strategy/energy/energy",
    });
    expect(JSON.stringify(section)).not.toMatch(
      /Not configured|Build Strategy| cut|0â€“0 calories/
    );
  });

  it.each(["planned", "archived", "paused", "superseded"])(
    "does not treat a %s protocol as active",
    (status) => {
      expect(
        resolveActiveOperatingPlanEnergyStrategy({
          goals: [activeGoal],
          protocols: [energy({ status })],
          userId,
        })
      ).toBeNull();
    }
  );

  it("rejects completed goals, another goal's protocol, and malformed active strategy safely", () => {
    expect(
      resolveActiveOperatingPlanEnergyStrategy({
        goals: [completedGoal],
        protocols: [energy()],
        userId,
      })
    ).toBeNull();
    expect(
      resolveActiveOperatingPlanEnergyStrategy({
        goals: [activeGoal],
        protocols: [energy({ relatedGoalIds: ["other"] })],
        userId,
      })
    ).toBeNull();
    expect(
      resolveActiveOperatingPlanEnergyStrategy({
        goals: [activeGoal],
        protocols: [energy({ effectiveStrategy: {} })],
        userId,
      })
    ).toBeNull();
  });

  it("stops on ambiguous active goals or strategies", () => {
    expect(() =>
      resolveActiveOperatingPlanEnergyStrategy({
        goals: [activeGoal, { ...activeGoal, id: "other" }],
        protocols: [],
        userId,
      })
    ).toThrow("Multiple active primary goals");
    expect(() =>
      resolveActiveOperatingPlanEnergyStrategy({
        goals: [activeGoal],
        protocols: [energy(), energy({ id: "duplicate" })],
        userId,
      })
    ).toThrow("Multiple active Energy Strategies");
  });

  it("resolves current production without mutating runtime state", async () => {
    const storePath = path.resolve(
      process.cwd(),
      "private/founder/runtime-store.json"
    );
    const before = fs.readFileSync(storePath);
    const user = await FounderRepositories.users.getCurrentUser();
    const result = await createOperatingPlanEnergyStrategyService({
      repositories: FounderRepositories,
    }).getActiveStrategy(user.id);

    expect(result).toMatchObject({
      isConfigured: true,
      mode: "Maintenance Calibration",
      selectedPace: "maintenance_calibration",
      status: "active",
    });
    expect(fs.readFileSync(storePath)).toEqual(before);
  }, 30000);
});
