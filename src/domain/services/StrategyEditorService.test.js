import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStrategySuccessorPayload,
  createStrategyEditorModel,
  strategyEditorMessage,
} from "./StrategyEditorService";
import {
  ActiveProtocolSuccessorOutcome,
  createActiveProtocolSuccessorService,
  resolveProtocolVersionAtDate,
} from "./ActiveProtocolSuccessorService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("direct strategy editor models", () => {
  it("loads Nutrition as 1 g/lb without promoting the 167 g snapshot", () => {
    const model = createStrategyEditorModel({
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version: nutritionVersion(),
    });
    expect(model).toMatchObject({
      proteinBasis: "body_weight",
      proteinRatio: 1,
      fixedProtein: 180,
    });
    expect(model.proteinRatio).not.toBe(167);
    expect(model).not.toHaveProperty("calorieStrategy");
    expect(model.options).not.toHaveProperty("calorieStrategy");
  });

  it("builds valid Nutrition successors for ratio and fixed modes", () => {
    const ratio = buildStrategySuccessorPayload({
      form: nutritionForm({ proteinRatio: "1.1", carbohydrateStrategy: "balanced" }),
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version: nutritionVersion(),
    });
    expect(ratio).toMatchObject({
      valid: true,
      successorVersion: {
        effectiveStrategy: {
          proteinBasis: "body_weight",
          proteinRatio: 1.1,
          calorieStrategy: "increase_gradually",
          carbohydrateStrategy: "balanced",
          fatStrategy: "sustainable_minimum",
        },
      },
    });
    const fixed = buildStrategySuccessorPayload({
      form: nutritionForm({ proteinBasis: "fixed_grams", fixedProtein: "190" }),
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version: nutritionVersion(),
    });
    expect(fixed).toMatchObject({
      valid: true,
      successorVersion: {
        effectiveStrategy: {
          proteinBasis: "fixed_grams",
          proteinRatio: null,
          proteinTarget: 190,
          fixedProtein: 190,
        },
      },
    });
  });

  it("preserves hidden intake strategy and unrelated Nutrition data", () => {
    const version = nutritionVersion();
    version.change.reviewedChanges.calorieStrategy = "hold_steady";
    version.change.reviewedChanges.trainingDayFlexibility = true;
    const built = buildStrategySuccessorPayload({
      form: nutritionForm({
        calorieStrategy: "reduce_gradually",
        carbohydrateStrategy: "lower_carbohydrate",
        fatStrategy: "higher_fat",
      }),
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version,
    });

    expect(built).toMatchObject({
      valid: true,
      successorVersion: {
        effectiveStrategy: {
          calorieStrategy: "hold_steady",
          carbohydrateStrategy: "lower_carbohydrate",
          fatStrategy: "higher_fat",
          trainingDayFlexibility: true,
        },
      },
    });
  });

  it("rejects unchanged and invalid Nutrition drafts before persistence", () => {
    expect(buildStrategySuccessorPayload({
      form: nutritionForm(),
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version: nutritionVersion(),
    })).toMatchObject({ valid: false, outcome: "unchanged_successor" });
    expect(buildStrategySuccessorPayload({
      form: nutritionForm({ proteinRatio: "0" }),
      protocol: nutritionProtocol(),
      strategyType: "nutrition",
      version: nutritionVersion(),
    })).toMatchObject({ valid: false });
  });

  it("loads the authoritative Training structure and builds structured edits", () => {
    const model = createStrategyEditorModel({
      protocol: trainingProtocol(),
      strategyType: "training",
      version: trainingVersion(),
    });
    expect(model).toMatchObject({
      weeklySessionTarget: 9,
      priorities: ["arms", "core", "lower_body"],
      progression: "moderate",
    });
    expect(model).not.toHaveProperty("phase");
    expect(model.options).not.toHaveProperty("phases");
    const built = buildStrategySuccessorPayload({
      form: trainingForm({
        frequency_arms: "3",
        phase: "cut",
        priorities: ["back", "chest"],
        progression: "conservative",
      }),
      protocol: trainingProtocol(),
      strategyType: "training",
      version: trainingVersion(),
    });
    expect(built).toMatchObject({
      valid: true,
      successorVersion: {
        trainingStrategy: {
          weeklyFrequencies: { arms: 3, core: 2, lower_body: 2, back: 1, chest: 1, shoulders: 1 },
          physiquePriorities: ["back", "chest"],
          progression: { pace: "conservative" },
          nutritionPhase: "maintenance",
        },
      },
    });
  });

  it("preserves hidden phase context and unrelated Training data", () => {
    const version = trainingVersion();
    version.trainingStrategy.nutritionPhase = "lean_mass_build";
    version.trainingStrategy.recoveryGates = ["sleep", "performance"];
    const built = buildStrategySuccessorPayload({
      form: trainingForm({ phase: "cut", progression: "aggressive" }),
      protocol: trainingProtocol(),
      strategyType: "training",
      version,
    });

    expect(built).toMatchObject({
      valid: true,
      successorVersion: {
        trainingStrategy: {
          nutritionPhase: "lean_mass_build",
          progression: { pace: "aggressive" },
          recoveryGates: ["sleep", "performance"],
        },
      },
    });
  });

  it("rejects unchanged and invalid Training drafts", () => {
    expect(buildStrategySuccessorPayload({
      form: trainingForm(),
      protocol: trainingProtocol(),
      strategyType: "training",
      version: trainingVersion(),
    })).toMatchObject({ valid: false, outcome: "unchanged_successor" });
    expect(buildStrategySuccessorPayload({
      form: trainingForm({ frequency_arms: "-1" }),
      protocol: trainingProtocol(),
      strategyType: "training",
      version: trainingVersion(),
    }).valid).toBe(false);
  });

  it("creates one successor without changing Execution and preserves historical resolution", async () => {
    const fixture = isolatedStore();
    const executionBefore = structuredClone(fixture.store.executionItems);
    const built = buildStrategySuccessorPayload({
      form: trainingForm({ frequency_arms: "3" }),
      protocol: fixture.store.protocols[0],
      strategyType: "training",
      version: fixture.store.protocolVersions[0],
    });
    const result = await fixture.service.createSuccessor({
      protocolId: "training",
      expectedCurrentVersionId: "training-v2",
      effectiveDate: "2026-07-26",
      successorVersion: built.successorVersion,
      goalAssociation: { goalId: "goal-build", relationship: "supports" },
      provenance: {
        author: { id: "user", displayName: "Founder", type: "user" },
        reason: "Update active Training strategy.",
        confirmation: { confirmedByUser: true },
        details: { source: "test" },
      },
    });
    expect(result.outcome).toBe(ActiveProtocolSuccessorOutcome.SUCCESS);
    expect(fixture.store.executionItems).toEqual(executionBefore);
    expect(fixture.store.protocolVersions.filter((item) => item.status === "active")).toHaveLength(1);
    expect(resolveProtocolVersionAtDate(fixture.store.protocolVersions, "2026-07-25")?.id).toBe("training-v2");
    expect(resolveProtocolVersionAtDate(fixture.store.protocolVersions, "2026-07-26")?.id).toBe("training_v3");
    expect(fixture.store.protocols[0]).toMatchObject({
      currentGoalIds: ["goal-build"],
      activationProvenance: { sourceProtocolId: "historical-training" },
    });
  });

  it("creates a Nutrition successor while preserving hidden intake ownership", async () => {
    const fixture = isolatedStore({
      protocol: nutritionProtocol(),
      version: nutritionVersion(),
    });
    const built = buildStrategySuccessorPayload({
      form: nutritionForm({
        calorieStrategy: "reduce_gradually",
        carbohydrateStrategy: "balanced",
        fatStrategy: "balanced",
        proteinBasis: "fixed_grams",
        fixedProtein: "190",
      }),
      protocol: fixture.store.protocols[0],
      strategyType: "nutrition",
      version: fixture.store.protocolVersions[0],
    });
    const result = await fixture.service.createSuccessor({
      protocolId: "nutrition",
      expectedCurrentVersionId: "nutrition-v1",
      effectiveDate: "2026-07-26",
      successorVersion: built.successorVersion,
      goalAssociation: { goalId: "goal-build", relationship: "supports" },
      provenance: {
        author: { id: "user", displayName: "Founder", type: "user" },
        reason: "Update active Nutrition strategy.",
        confirmation: { confirmedByUser: true },
        details: { source: "test" },
      },
    });

    expect(result.outcome).toBe(ActiveProtocolSuccessorOutcome.SUCCESS);
    const successor = fixture.store.protocolVersions.find(
      (item) => item.id === result.successorVersionId
    );
    expect(successor.effectiveStrategy).toMatchObject({
      calorieStrategy: "increase_gradually",
      carbohydrateStrategy: "balanced",
      fatStrategy: "balanced",
      fixedProtein: 190,
      proteinBasis: "fixed_grams",
    });
  });

  it("maps typed outcomes to viewer-facing language", () => {
    expect(strategyEditorMessage("expected_version_conflict")).toMatch(/changed while you were editing/i);
    expect(strategyEditorMessage("persistence_failure")).toBe("We could not save this strategy. Nothing was changed.");
    expect(strategyEditorMessage("unchanged_successor")).toBe("No changes to save.");
  });
});

function nutritionProtocol() {
  return {
    id: "nutrition",
    userId: "user",
    protocolType: "nutrition",
    category: "nutrition",
    status: "active",
    currentVersionId: "nutrition-v1",
    currentGoalIds: ["goal-build"],
    relatedGoalIds: ["goal-build"],
    effectiveStrategy: nutritionStrategy(),
  };
}
function nutritionStrategy() {
  return {
    proteinBasis: "body_weight",
    proteinRatio: 1,
    proteinTarget: 167,
    fixedProtein: 180,
    calorieStrategy: "increase_gradually",
    carbohydrateStrategy: "performance",
    fatStrategy: "sustainable_minimum",
  };
}
function nutritionVersion() {
  return {
    id: "nutrition-v1",
    protocolId: "nutrition",
    versionNumber: 1,
    status: "active",
    effectiveAt: "2026-07-21",
    change: { previousVersionId: "historical-v1", reviewedChanges: nutritionStrategy() },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    confirmation: { authority: "accepted_goal_transition" },
  };
}
function trainingProtocol() {
  return {
    id: "training",
    userId: "user",
    protocolType: "training",
    category: "training",
    status: "active",
    currentVersionId: "training-v2",
    currentGoalIds: ["goal-build"],
    relatedGoalIds: ["goal-build"],
    activationProvenance: { sourceProtocolId: "historical-training" },
  };
}
function trainingVersion() {
  return {
    id: "training-v2",
    protocolId: "training",
    versionNumber: 2,
    status: "active",
    effectiveAt: "2026-07-20",
    endedAt: null,
    author: { id: "user", displayName: "Founder" },
    change: { reason: "Current", previousVersionId: "training-v1" },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    intent: { summary: "Build with structured Training." },
    confirmation: { confirmedByUser: true },
    trainingStrategy: {
      weeklyFrequencies: { arms: 2, core: 2, lower_body: 2, back: 1, chest: 1, shoulders: 1 },
      physiquePriorities: ["arms", "core", "lower_body"],
      progression: { pace: "moderate" },
      nutritionPhase: "maintenance",
    },
  };
}
function nutritionForm(overrides = {}) {
  return form({
    proteinBasis: "body_weight",
    proteinRatio: "1",
    fixedProtein: "180",
    carbohydrateStrategy: "performance",
    fatStrategy: "sustainable_minimum",
    ...overrides,
  });
}
function trainingForm(overrides = {}) {
  return form({
    frequency_arms: "2", frequency_core: "2", frequency_lower_body: "2",
    frequency_back: "1", frequency_chest: "1", frequency_shoulders: "1",
    priorities: ["arms", "core", "lower_body"],
    progression: "moderate",
    ...overrides,
  });
}
function form(values) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item);
  }
  return result;
}
function isolatedStore({
  protocol = trainingProtocol(),
  version = trainingVersion(),
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "strategy-editor-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const store = {
    revision: 2,
    protocols: [protocol],
    protocolVersions: [version],
    goals: [{ id: "goal-build" }],
    executionItems: [{ id: "execution", preferredSchedule: { timeOfDay: "17:00" } }],
    dailyBriefings: [{ id: "briefing" }],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  return {
    store,
    service: createActiveProtocolSuccessorService({
      runtimeStorePath: filePath,
      liveStore: store,
      now: () => new Date("2026-07-26T12:00:00Z"),
    }),
  };
}
