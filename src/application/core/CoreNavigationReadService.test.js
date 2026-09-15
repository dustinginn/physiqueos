import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryCoreNavigationReadStore } from "../../platform/database/PostgresCoreNavigationReadStore.js";
import { createGoalsHubReadService } from "../goals/GoalsHubReadService.js";
import { createLogReadService } from "../log/LogReadService.js";
import { createOperatingPlanReadService } from "../plan/OperatingPlanReadService.js";
import { createYouProfileService } from "../../domain/services/YouProfileService.js";
import { resolveMorningWeighInSupport } from "../../domain/services/TrackingSupportService.js";
import {
  CORE_NAVIGATION_COLLECTIONS,
  createCoreNavigationReadService,
} from "./CoreNavigationReadService.js";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity.js";

const NOW = new Date("2026-08-29T12:00:00-07:00");

afterEach(() => registerRuntimeTrainingExercises([]));

describe("provider-native core navigation reads", () => {
  it("keeps Home output equivalent to the existing domain composition", async () => {
    const { legacyRepositories, narrow, runtime } = services();
    expect(await narrow.getHome()).toEqual(
      await createHomeBriefingService({
        repositories: legacyRepositories,
        readRuntimeStore: () => runtime,
        now: () => NOW,
      }).getHomeBriefing(runtime.user.id)
    );
  });

  it("keeps Log output equivalent, including direct-entry date and pending reviews", async () => {
    const { legacyRepositories, narrow, principal, runtime } = services();
    expect(await narrow.getLog()).toEqual(
      await createLogReadService({ repositories: legacyRepositories, now: () => NOW }).getLog({
        principal,
        timeZone: runtime.user.timeZone ?? runtime.user.timezone,
      })
    );
  });

  it("keeps Goals output equivalent, including Confidence and transition state", async () => {
    const { legacyRepositories, narrow, principal, runtime } = services();
    expect(await narrow.getGoals()).toEqual(
      await createGoalsHubReadService({
        repositories: legacyRepositories,
        readRuntimeStore: () => runtime,
      }).getGoalsHub({ principal })
    );
  });

  it("keeps Operating Plan output equivalent", async () => {
    const { legacyRepositories, narrow, principal } = services();
    expect(await narrow.getOperatingPlan()).toEqual(
      await createOperatingPlanReadService({ repositories: legacyRepositories })
        .getOperatingPlan({ principal })
    );
  });

  it("keeps the Profile output equivalent", async () => {
    const { legacyRepositories, narrow } = services();
    expect(await narrow.getProfile()).toEqual(
      await createYouProfileService({ repositories: legacyRepositories }).getYouProfile()
    );
  });

  it("keeps Tracking output equivalent", async () => {
    const { narrow, runtime } = services();
    expect(await narrow.getTracking()).toEqual({
      morningWeighIn: resolveMorningWeighInSupport({
        executionItems: runtime.executionItems,
        protocols: runtime.protocols,
        reminders: runtime.reminders,
        userId: runtime.user.id,
      }),
    });
  });

  it("resolves Recovery's recurring support (Foam Rolling) generically, without hardcoding the execution id", async () => {
    const { narrow } = recurringSupportServices();
    const result = await narrow.getRecurringSupport({ executionId: "execution_foam_roll" });
    expect(result.protocolId).toBe("recovery");
    expect(result.protocolCategory).toBe("recovery");
    expect(result.executionId).toBe("execution_foam_roll");
    expect(result.reminderId).toBe("reminder_foam_roll_daily");
    expect(result.title).toBe("Foam Rolling");
    expect(result.hydration.supportSchedule).toEqual({
      frequency: "daily", daysOfWeek: [], intervalDays: 1, timing: "specific",
      specificTime: "17:00", startDate: "2026-07-23", endDate: null,
    });
  });

  it("returns null for an execution id that does not exist or is not owned by this Founder", async () => {
    const { narrow } = recurringSupportServices();
    expect(await narrow.getRecurringSupport({ executionId: "execution_does_not_exist" })).toBeNull();
  });

  it("composes the Nutrition strategy detail and editor from the active protocol version", async () => {
    const { narrow } = nutritionStrategyServices();
    const result = await narrow.getNutritionStrategyDetail({ strategyId: "nutrition-protocol" });
    expect(result.protocolId).toBe("nutrition-protocol");
    expect(result.title).toBe("Macro Strategy");
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Carbohydrate Approach", value: "Performance" }),
    ]));
    expect(result.editor).toEqual({
      expectedCurrentVersionId: "nutrition-protocol_v1",
      proteinBasis: "body_weight",
      proteinRatio: 1,
      fixedProteinGrams: 150,
      carbohydrateStrategy: "performance",
      fatStrategy: "sustainable_minimum",
    });
  });

  it("returns null for a Nutrition strategy id that is not an active, owned Nutrition protocol", async () => {
    const { narrow } = nutritionStrategyServices();
    expect(await narrow.getNutritionStrategyDetail({ strategyId: "does-not-exist" })).toBeNull();
  });

  it("composes the Training strategy detail and editor from the active protocol version", async () => {
    const { narrow } = trainingStrategyServices();
    const result = await narrow.getTrainingStrategyDetail({ strategyId: "training-protocol" });
    expect(result.protocolId).toBe("training-protocol");
    expect(result.title).toBe("Lean Mass Goal Training");
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Weekly Structure", value: "3 area sessions" }),
      expect.objectContaining({ label: "Training Focus", value: "Chest" }),
      expect.objectContaining({ label: "Progression", value: "Moderate" }),
    ]));
    expect(result.editor).toEqual({
      expectedCurrentVersionId: "training-protocol_v1",
      frequencies: [
        { area: "arms", count: 0 }, { area: "core", count: 0 }, { area: "lower_body", count: 1 },
        { area: "back", count: 1 }, { area: "chest", count: 1 }, { area: "shoulders", count: 0 },
      ],
      priorities: ["chest"],
      progression: "moderate",
    });
  });

  it("returns null for a Training strategy id that is not an active, owned Training protocol", async () => {
    const { narrow } = trainingStrategyServices();
    expect(await narrow.getTrainingStrategyDetail({ strategyId: "does-not-exist" })).toBeNull();
  });

  it("projects the production peptide Support editor without exposing runtime records", async () => {
    const { narrow } = peptideSupportServices();
    const result = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(result).toMatchObject({
      protocolId: "peptide-protocol",
      executionId: "execution-peptide",
      executionRevision: 3,
      name: "Retatrutide",
      state: "CANONICAL",
      supportSchedule: {
        frequency: "weekly", daysOfWeek: ["thursday"], timing: "specific",
        specificTime: "21:45", startDate: "2026-05-21", endDate: null,
      },
      dosing: { pattern: "stay", startingDoseAmount: 0.5, startingDoseUnit: "mg", endDate: null },
      reminderPreference: "remind",
      timingContext: "fasted_before_bed",
    });
    expect(result.timeline).toEqual([
      expect.objectContaining({ doseAmount: 0.5, doseUnit: "mg", status: "active" }),
    ]);
    expect(result).not.toHaveProperty("reminder");
    expect(result).not.toHaveProperty("timelineHistory");
  });

  it("projects a bounded protocol-domain roll-up with typed Native support destinations", async () => {
    const { narrow } = peptideSupportServices();
    const result = await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" });
    expect(result).toMatchObject({
      category: "peptide",
      title: "Peptide Strategy",
      methods: [{
        id: "peptide-protocol",
        protocolId: "peptide-protocol",
        name: "Retatrutide",
        currentDose: "0.5 mg",
        editDestination: {
          id: "native.operating-plan.protocol.peptide",
          parameters: { protocolId: "peptide-protocol" },
        },
      }],
    });
    expect(result).not.toHaveProperty("protocols");
    expect(result).not.toHaveProperty("executionItems");
  });

  it("fails closed for an unavailable or ambiguous peptide Support plan", async () => {
    const { narrow, runtime } = peptideSupportServices();
    expect(await narrow.getPeptideSupport({ protocolId: "missing" })).toBeNull();
    runtime.executionItems.push({ ...runtime.executionItems[0], id: "duplicate-peptide" });
    expect(await narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).toBeNull();
    runtime.executionItems.pop();
    runtime.reminders.push({ ...runtime.reminders[0], id: "duplicate-reminder" });
    expect(await narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).toBeNull();
  });

  it("provides bounded Workout Logger and Morning Check-In models", async () => {
    const { narrow } = services();
    const logger = await narrow.getTrainingLogger();
    const morning = await narrow.getMorningCheckIn();
    expect(logger).toMatchObject({
      initialDate: "2026-08-29",
      initialCanonicalExercises: expect.any(Array),
      initialHistorySessions: expect.any(Array),
      initialPerformedExerciseIds: expect.any(Array),
      initialMyLibraryExerciseIds: expect.any(Array),
      initialProgressionRecommendations: expect.any(Array),
    });
    expect(morning).toMatchObject({
      today: "2026-08-29",
      reconciliationItems: expect.any(Array),
      briefingReconciliation: expect.any(Object),
    });
  });

  it("projects canonical progression recommendations and bodyweight loading semantics for Native", async () => {
    const { narrow, runtime } = services();
    for (const [index, date] of ["2026-08-01", "2026-08-08", "2026-08-15"].entries()) {
      runtime.canonicalEvidenceObjects.push({
        canonicalId: `training-pull-up-${index}`,
        quality: { status: "complete" },
        payload: {
          id: `session-pull-up-${index}`,
          evidence_type: "training",
          observed_at: date,
          exercises: [{
            id: `pull-up-${index}`,
            canonicalExerciseId: "pull_up",
            name: "Pull-Ups",
            sets: [{ reps: 6, weight: 25, weight_unit: "lb", load_type: "external_load" }],
          }],
        },
      });
    }

    const logger = await narrow.getTrainingLogger();
    expect(logger.initialProgressionRecommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        canonicalExerciseId: "pull_up",
        eyebrow: "Progression opportunity",
        prescription: "25 lb x 7",
        suggestedLoad: 25,
        suggestedLoadType: "external_load",
        suggestedReps: 7,
      }),
    ]));
    const set = logger.initialHistorySessions
      .find((session) => session.id === "session-pull-up-2").exercises[0].sets[0];
    expect(set).toMatchObject({ weight: 25, weight_unit: "lb", load_type: "external_load" });
  });

  it("computes My Library as performed history UNION explicit additions, without a membership record for performed-only exercises", async () => {
    const runtime = {
      user: { id: "user" },
      goals: [],
      canonicalEvidenceObjects: [{
        canonicalId: "training-performed-lunge",
        quality: { status: "complete" },
        payload: {
          id: "session-performed-lunge",
          evidence_type: "training",
          observed_at: "2026-08-20",
          exercises: [{
            id: "lunge-occurrence", canonicalExerciseId: "dumbbell_reverse_lunge", name: "Dumbbell Reverse Lunge",
            sets: [{ reps: 10, weight: 30, weight_unit: "lb", load_type: "external_load" }],
          }],
        },
      }],
      myLibraryMemberships: [
        { id: "leg_press_feet_high", canonicalExerciseId: "leg_press_feet_high", addedAt: "2026-08-19T00:00:00.000Z" },
      ],
    };
    const narrow = createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }),
      now: () => NOW,
    });

    const logger = await narrow.getTrainingLogger();

    expect(logger.initialPerformedExerciseIds).toContain("dumbbell_reverse_lunge");
    expect(logger.initialPerformedExerciseIds).not.toContain("leg_press_feet_high");
    expect(logger.initialMyLibraryExerciseIds).toEqual(expect.arrayContaining([
      "dumbbell_reverse_lunge", "leg_press_feet_high",
    ]));
    expect(new Set(logger.initialMyLibraryExerciseIds).size).toBe(logger.initialMyLibraryExerciseIds.length);
    expect(await narrow.getTrainingMyLibrary()).toEqual(logger.initialMyLibraryExerciseIds);
    expect(logger.initialCanonicalExercises.find((exercise) => exercise.id === "hyperextension_machine"))
      .toMatchObject({ primaryNavigationCategory: "glutes" });
    runtime.canonicalEvidenceObjects[0].quality.status = "superseded";
    expect(await narrow.getTrainingMyLibrary()).toEqual(["leg_press_feet_high"]);
  });

  it("hydrates the canonical registry before the first cold-start Workout Logger read", async () => {
    registerRuntimeTrainingExercises([]);
    const runtimeExercise = {
      id: "founder_cable_arc",
      name: "Founder Cable Arc",
      aliases: ["Original Cable Arc"],
      body_region: "upper_body",
      primary_muscle_group_id: "biceps",
      primary_muscle_groups: ["Biceps"],
    };
    let registryReads = 0;
    const { narrow } = services({
      readCanonicalExerciseRegistry: async () => {
        registryReads += 1;
        registerRuntimeTrainingExercises([runtimeExercise]);
        return [runtimeExercise];
      },
    });

    const logger = await narrow.getTrainingLogger();

    expect(registryReads).toBe(1);
    expect(logger.initialCanonicalExercises).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "founder_cable_arc" })])
    );
  });

  it("uses the deterministic same-day correction in the Morning Check-In read model", async () => {
    const { narrow, runtime } = services();
    runtime.weightEntries.push(
      {
        id: "weight_today_old",
        userId: runtime.user.id,
        measuredAt: "2026-08-29",
        weight: { value: 168.4, unit: "lb" },
        updatedAt: "2026-08-29T14:00:00.000Z",
      },
      {
        id: "weight_today_corrected",
        userId: runtime.user.id,
        measuredAt: "2026-08-29",
        weight: { value: 169.1, unit: "lb" },
        updatedAt: "2026-08-29T15:00:00.000Z",
      },
    );

    await expect(narrow.getMorningCheckIn()).resolves.toMatchObject({
      existingWeight: 169.1,
    });
  });

  it("uses screen-specific collection sets without reconstructing unrelated domains", () => {
    expect(CORE_NAVIGATION_COLLECTIONS.home).not.toContain("evidencePackages");
    expect(CORE_NAVIGATION_COLLECTIONS.home).not.toContain("trainingPerformanceEvents");
    expect(CORE_NAVIGATION_COLLECTIONS.log).toEqual([
      "user", "evidenceReviews", "canonicalEvidenceObjects",
    ]);
    expect(CORE_NAVIGATION_COLLECTIONS.goals).not.toContain("executionItems");
    expect(CORE_NAVIGATION_COLLECTIONS.operatingPlan).not.toContain("dailyBriefings");
    expect(CORE_NAVIGATION_COLLECTIONS.operatingPlan).not.toContain("analyses");
    expect(CORE_NAVIGATION_COLLECTIONS.trainingLogger).toEqual(["user", "goals", "canonicalEvidenceObjects", "myLibraryMemberships"]);
    expect(CORE_NAVIGATION_COLLECTIONS.profile).not.toContain("canonicalEvidenceObjects");
    expect(CORE_NAVIGATION_COLLECTIONS.tracking).toEqual(["user", "executionItems", "protocols", "reminders"]);
  });

  it("routes all four production surfaces through the narrow composition", () => {
    for (const route of [
      "src/screens/HomeScreen.jsx",
      "src/app/log/page.js",
      "src/screens/GoalsHubScreen.jsx",
      "src/app/profile/operating-plan/page.js",
      "src/app/log/training/page.js",
      "src/app/check-in/morning/page.js",
      "src/app/profile/page.js",
      "src/app/profile/operating-plan/tracking/page.js",
    ]) {
      const source = fs.readFileSync(route, "utf8");
      expect(source).toContain("getProductionCoreNavigationReadService");
      expect(source).not.toContain("runInactiveLegacyWebReadScope");
    }
  });
});

/// A small, hand-built runtime carrying the real Foam Rolling shape
/// (matching `RecurringSupportManagementService.test.js`'s own fixture) —
/// the shared `services()` phase5-synthetic runtime above intentionally
/// carries only minimal stub records with no realistic recovery/tracking
/// data, so it can't exercise `getRecurringSupport`'s actual field mapping.
function recurringSupportServices() {
  const runtime = {
    user: { id: "user" },
    protocols: [{
      id: "recovery", userId: "user", category: "recovery", name: "Foam Rolling",
      status: "active", activatedAt: "2026-07-23T16:54:00.550Z",
    }],
    executionItems: [{
      id: "execution_foam_roll", userId: "user", type: "recovery", title: "Foam Rolling",
      description: "Support recovery and keep training quality available.", active: true,
      linkedProtocolId: "recovery", cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00", startDate: "2026-07-23" },
      reminderPreference: "in_app", notes: "",
    }],
    reminders: [{
      id: "reminder_foam_roll_daily", userId: "user", title: "Foam Roll", type: "recovery_reminder",
      linkedEntityType: "protocol", linkedEntityId: "recovery", active: true,
      schedule: { type: "daily", timeOfDay: "17:00" },
    }],
  };
  return {
    runtime,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }),
      now: () => NOW,
    }),
  };
}

/// A small, hand-built runtime carrying a realistic active Nutrition
/// protocol/version pair — isolated from the shared phase5-synthetic
/// `services()` runtime for the same reason `recurringSupportServices()`
/// is: the shared runtime carries no realistic strategy content to exercise
/// `getNutritionStrategyDetail`'s actual detail/editor composition.
function nutritionStrategyServices() {
  const runtime = {
    user: { id: "user", displayName: "Founder" },
    goals: [{ id: "goal-one", userId: "user", title: "Lean Mass Goal", primary: true, status: "active" }],
    protocols: [{
      id: "nutrition-protocol", userId: "user", category: "nutrition", protocolType: "nutrition",
      name: "Nutrition Strategy", status: "active", currentVersionId: "nutrition-protocol_v1",
      currentGoalIds: ["goal-one"], activatedAt: "2026-07-01T00:00:00.000Z",
    }],
    protocolVersions: [{
      id: "nutrition-protocol_v1", protocolId: "nutrition-protocol", versionNumber: 1,
      status: "active", effectiveAt: "2026-07-01", endedAt: null,
      effectiveStrategy: {
        proteinBasis: "body_weight", proteinRatio: 1, fixedProtein: null, proteinTarget: null,
        carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum",
      },
      goalLinks: [{ goalId: "goal-one", relationship: "supports" }],
    }],
  };
  return {
    runtime,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }),
      now: () => NOW,
    }),
  };
}

/// Mirrors `nutritionStrategyServices()` above with Training's own
/// `trainingStrategy` field shape (weeklyFrequencies/physiquePriorities/
/// progression), not Nutrition's `effectiveStrategy`.
function trainingStrategyServices() {
  const runtime = {
    user: { id: "user", displayName: "Founder" },
    goals: [{ id: "goal-one", userId: "user", title: "Lean Mass Goal", primary: true, status: "active" }],
    protocols: [{
      id: "training-protocol", userId: "user", category: "training", protocolType: "training",
      name: "Training Strategy", status: "active", currentVersionId: "training-protocol_v1",
      currentGoalIds: ["goal-one"], activatedAt: "2026-07-01T00:00:00.000Z",
    }],
    protocolVersions: [{
      id: "training-protocol_v1", protocolId: "training-protocol", versionNumber: 1,
      status: "active", effectiveAt: "2026-07-01", endedAt: null,
      trainingStrategy: {
        weeklyFrequencies: { arms: 0, core: 0, lower_body: 1, back: 1, chest: 1, shoulders: 0 },
        physiquePriorities: ["chest"],
        progression: { pace: "moderate" },
      },
      goalLinks: [{ goalId: "goal-one", relationship: "supports" }],
    }],
  };
  return {
    runtime,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }),
      now: () => NOW,
    }),
  };
}

function peptideSupportServices() {
  const runtime = {
    user: { id: "user", displayName: "Founder", timeZone: "America/Los_Angeles" },
    protocols: [{
      id: "peptide-protocol", userId: "user", category: "peptide", name: "Retatrutide",
      purpose: "Support the active body-composition strategy.", status: "active", currentGoalIds: ["goal-one"],
    }],
    executionItems: [{
      id: "execution-peptide", userId: "user", type: "peptide", title: "Retatrutide", active: true,
      protocolRootId: "peptide-protocol", linkedStrategyIds: ["peptide-protocol"], linkedGoalIds: ["goal-one"],
      cadence: { type: "weekly" },
      preferredSchedule: { daysOfWeek: ["thursday"], timeOfDay: "21:45", startDate: "2026-05-21", endDate: null },
      timingContext: "fasted_before_bed", reminderPreference: "remind", priority: "high", notes: "Current plan",
      dosingStrategy: { pattern: "stay", startingDose: { amount: "0.5", unit: "mg" }, startDate: "2026-05-21", endDate: null },
      timeline: [{ startDate: "2026-05-21", endDate: null, dose: { amount: "0.5", unit: "mg" }, notes: "" }],
      executionRevision: 3,
    }],
    reminders: [{
      id: "reminder-peptide", userId: "user", type: "protocol_reminder", linkedEntityId: "peptide-protocol",
      active: true, schedule: { type: "weekly", daysOfWeek: ["thursday"], timeOfDay: "21:45" },
    }],
  };
  return {
    runtime,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }),
      now: () => NOW,
    }),
  };
}

function services({ readCanonicalExerciseRegistry = null } = {}) {
  const runtime = createPhase5SyntheticRuntime();
  const legacyRuntime = structuredClone(runtime);
  const legacyRepositories = createSeedRepositories(legacyRuntime, {
    allowStagedMutations: false,
  });
  const principal = Object.freeze({
    userId: runtime.user.id,
    deviceId: "test-device",
    sessionId: "test-session",
    scopes: Object.freeze([]),
  });
  return {
    runtime,
    principal,
    legacyRepositories,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({
        readRuntimeStore: () => runtime,
      }),
      now: () => NOW,
      readCanonicalExerciseRegistry,
    }),
  };
}
