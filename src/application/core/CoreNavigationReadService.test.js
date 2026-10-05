import fs from "node:fs";
import { generatePeptideDosingTimeline } from "../../domain/models/PeptideDosingStrategyModel.js";
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

  it("Log follows a requested daily-driver zone without changing the canonical default", async () => {
    const { narrow } = services();
    expect((await narrow.getLog()).localDate).toBe("2026-08-29");
    expect((await narrow.getLog({ timeZone: "Asia/Tokyo" })).localDate).toBe("2026-08-30");
    expect((await narrow.getLog({ timeZone: null })).localDate).toBe("2026-08-29");
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

  it("preserves Tracking's canonical evidence reminder identity for Morning Weigh-In edits", async () => {
    const { narrow } = morningWeighInRecurringSupportServices();
    const result = await narrow.getRecurringSupport({ executionId: "execution_morning_weigh_in" });
    expect(result).toMatchObject({
      protocolId: "weight",
      protocolCategory: "weight",
      executionId: "execution_morning_weigh_in",
      reminderId: "reminder_morning_weight",
      hydration: { executionRevision: 7 },
    });
  });

  it("fails a recurring Support read closed when canonical reminder linkage is ambiguous", async () => {
    const { narrow, runtime } = morningWeighInRecurringSupportServices();
    runtime.reminders.push({ ...runtime.reminders[0], id: "reminder_morning_weight_duplicate" });
    expect(await narrow.getRecurringSupport({ executionId: "execution_morning_weigh_in" })).toBeNull();
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

  it("reads Recovery with the exact null-owner timezone and current schedule without rewriting the older root", async () => {
    const { narrow, runtime } = recurringSupportServices();
    runtime.user.timezone = null;
    runtime.protocols[0].schedule = { timeOfDay: "17:00" };
    runtime.executionItems[0].executionRevision = 3;
    runtime.executionItems[0].preferredSchedule = { daysOfWeek: [], timeOfDay: "08:40", startDate: "2026-09-14", endDate: null };
    runtime.reminders[0].schedule = { type: "daily", timeOfDay: "08:40", startDate: "2026-09-14", endDate: null, timezone: null };
    const before = JSON.stringify(runtime);
    expect(await narrow.getOperatingPlanProtocolDomain({ protocolId: "recovery" })).toMatchObject({ category: "recovery", methods: [{ name: "Foam Rolling" }] });
    expect(await narrow.getRecurringSupport({ executionId: "execution_foam_roll" })).toMatchObject({ hydration: {
      executionRevision: 3, supportSchedule: { frequency: "daily", specificTime: "08:40", startDate: "2026-09-14", endDate: null } } });
    expect(JSON.stringify(runtime)).toBe(before);
  });

  it("reads two linked Peptide executions with null owner/reminder timezone while preserving dosing history", async () => {
    const { narrow, runtime } = peptideSupportServices();
    delete runtime.user.timeZone; runtime.user.timezone = null;
    runtime.executionItems[0].executionRevision = 4;
    runtime.reminders[0].schedule.timezone = null;
    runtime.protocols.push({ ...runtime.protocols[0], id: "second-peptide", name: "Tesamorelin" });
    const second = structuredClone(runtime.executionItems[0]);
    Object.assign(second, { id: "second-execution", title: "Tesamorelin", protocolRootId: "second-peptide", linkedStrategyIds: ["second-peptide"] });
    second.preferredSchedule.daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday"];
    runtime.executionItems.push(second);
    runtime.reminders.push({ ...structuredClone(runtime.reminders[0]), id: "second-reminder", linkedEntityId: "second-peptide" });
    const before = JSON.stringify(runtime);
    const domain = await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" });
    expect(domain.methods).toHaveLength(2);
    for (const id of ["peptide-protocol", "second-peptide"]) expect(await narrow.getPeptideSupport({ protocolId: id })).toMatchObject({
      executionRevision: 4, supportSchedule: { specificTime: "21:45", endDate: null } });
    expect(JSON.stringify(runtime)).toBe(before);
  });

  it("projects each Supplement's own reminder state and keeps Next due when notifications are off", async () => {
    const { narrow } = supplementSupportServices();
    const domain = await narrow.getOperatingPlanProtocolDomain({ protocolId: "fadogia" });
    expect(domain.methods.map((item) => ({ id: item.protocolId, reminderEnabled: item.reminderEnabled })))
      .toEqual([
        { id: "electrolytes", reminderEnabled: false },
        { id: "fadogia", reminderEnabled: true },
      ]);
    await expect(narrow.getSupplementSupport({ protocolId: "fadogia" })).resolves.toMatchObject({
      reminderPreference: "remind",
      nextDue: "Aug 30, 2026 · 8:00 AM",
    });
    await expect(narrow.getSupplementSupport({ protocolId: "electrolytes" })).resolves.toMatchObject({
      reminderPreference: "none",
      nextDue: "Aug 29, 2026 · 8:00 AM",
    });
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
      initialCategorySuggestion: null,
      initialCanonicalExercises: expect.any(Array),
      initialHistorySessions: expect.any(Array),
      initialPerformedExerciseIds: expect.any(Array),
      initialMyLibraryExerciseIds: expect.any(Array),
      initialProgressionRecommendations: expect.any(Array),
      contextualProgressionRecommendations: expect.any(Array),
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
    // Additive Server-owned set-level load semantics for Native's completion copy.
    expect(set.load_semantics).toBe("weighted_bodyweight");
  });

  it("projects additive superset-context progression recommendations from the separate superset pool", async () => {
    const { narrow, runtime } = services();
    const session = (canonicalId, date, exercises, groups = []) => ({
      canonicalId,
      quality: { status: "complete" },
      payload: { id: canonicalId, evidence_type: "training", observed_at: date, exercises, exerciseRelationshipGroups: groups },
    });
    const legExtension = (id, weight, reps) => ({
      id, canonicalExerciseId: "leg_extension", name: "Leg Extensions",
      sets: [{ reps, weight, weight_unit: "lb", load_type: "external_load" }],
    });
    const sissy = (id, weight, reps) => ({
      id, canonicalExerciseId: "sissy_squat", name: "Sissy Squats",
      sets: [{ reps, weight, weight_unit: "lb", load_type: "external_load" }],
    });
    const pendulum = (id) => ({
      id, canonicalExerciseId: "pendulum_squat_machine", name: "Pendulum Squat Machine",
      sets: [{ reps: 11, weight: 55, weight_unit: "lb", load_type: "external_load" }],
    });
    runtime.canonicalEvidenceObjects.push(
      session("standalone-1", "2026-08-01", [legExtension("le-s1", 90, 15)]),
      session("standalone-2", "2026-08-08", [legExtension("le-s2", 90, 15)]),
      session("superset-1", "2026-08-15", [legExtension("le-p1", 80, 15), sissy("ss-p1", 50, 12), pendulum("pe-p1")],
        [{ id: "g1", relationshipType: "superset", memberExerciseIds: ["le-p1", "ss-p1"] }]),
      session("superset-2", "2026-08-22", [legExtension("le-p2", 80, 15), sissy("ss-p2", 50, 12)],
        [{ id: "g2", relationshipType: "superset", memberExerciseIds: ["le-p2", "ss-p2"] }]),
      session("pendulum-superset-once", "2026-08-23", [pendulum("pe-p2"), legExtension("le-p3", 70, 10)],
        [{ id: "g3", relationshipType: "superset", memberExerciseIds: ["pe-p2", "le-p3"] }]),
    );

    const logger = await narrow.getTrainingLogger();
    // Standalone is unchanged: only the standalone pool (90 x 15).
    expect(logger.initialProgressionRecommendations.find((item) => item.canonicalExerciseId === "leg_extension"))
      .toMatchObject({ suggestedLoad: 90, suggestedReps: 15 });
    expect(logger.initialProgressionRecommendations.find((item) => item.canonicalExerciseId === "leg_extension"))
      .not.toHaveProperty("relationship");

    const contextual = logger.contextualProgressionRecommendations;
    const legWithSissy = contextual.filter((item) =>
      item.canonicalExerciseId === "leg_extension" && item.relationship.relationshipKey === "superset|partners:sissy_squat");
    expect(legWithSissy).toEqual([expect.objectContaining({
      suggestedLoad: 80,
      suggestedReps: 15,
      relationship: { relationshipType: "superset", relationshipKey: "superset|partners:sissy_squat", partnerCanonicalExerciseIds: ["sissy_squat"] },
    })]);
    expect(contextual.find((item) => item.canonicalExerciseId === "sissy_squat")).toMatchObject({
      suggestedLoad: 50,
      suggestedReps: 12,
      relationship: { relationshipKey: "superset|partners:leg_extension", partnerCanonicalExerciseIds: ["leg_extension"] },
    });
    // One comparable session in a context is insufficient: no claim at all.
    expect(contextual.some((item) => item.relationship.relationshipKey === "superset|partners:pendulum_squat_machine")).toBe(false);
    expect(contextual.some((item) => item.canonicalExerciseId === "pendulum_squat_machine")).toBe(false);
    // Standalone sissy history does not exist, so no standalone recommendation leaks from the superset pool.
    expect(logger.initialProgressionRecommendations.some((item) => item.canonicalExerciseId === "sissy_squat")).toBe(false);
  });

  it("classifies historical bodyweight encodings and machine zeros with one Server-owned rule", async () => {
    const { narrow, runtime } = services();
    runtime.canonicalEvidenceObjects.push({
      canonicalId: "training-mixed-encodings",
      quality: { status: "complete" },
      payload: {
        id: "session-mixed-encodings",
        evidence_type: "training",
        observed_at: "2026-09-13",
        exercises: [{
          id: "hlr", canonicalExerciseId: "hanging_leg_raise", name: "Hanging Leg Raises",
          sets: [
            { reps: 18, weight: null, weight_unit: "bodyweight", load_type: "bodyweight" },
            { reps: 20, weight: 0, weight_unit: "lb", load_type: "external_load" },
          ],
        }, {
          id: "machine", canonicalExerciseId: "iso_lateral_high_row", name: "Iso-Lateral High Rows",
          sets: [{ reps: 12, weight: 0, weight_unit: "lb", load_type: "external_load" }],
        }],
      },
    });
    const session = (await narrow.getTrainingLogger()).initialHistorySessions
      .find((item) => item.id === "session-mixed-encodings");
    expect(session.exercises[0].sets.map((set) => set.load_semantics)).toEqual(["bodyweight", "bodyweight"]);
    expect(session.exercises[1].sets[0].load_semantics).toBe("external_load");
    // Stored values are read, never rewritten.
    expect(session.exercises[0].sets[1]).toMatchObject({ weight: 0, weight_unit: "lb", load_type: "external_load" });
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
      "healthKitCanonicalWorkouts", "healthKitWorkoutLinks", "healthKitWorkoutLinkClaims",
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

function morningWeighInRecurringSupportServices() {
  const runtime = {
    user: { id: "user" },
    protocols: [{
      id: "weight", userId: "user", category: "weight", name: "Morning Weigh-In",
      status: "active", activatedAt: "2026-07-23T16:54:00.550Z",
    }],
    executionItems: [{
      id: "execution_morning_weigh_in", userId: "user", type: "evidence", title: "Morning Weigh-In",
      active: true, linkedProtocolId: "weight", linkedEvidenceTypes: ["morning_weight"],
      cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "morning" }, executionRevision: 7,
    }],
    reminders: [{
      id: "reminder_morning_weight", userId: "user", title: "Morning Weigh-In", type: "evidence_reminder",
      linkedEntityType: "protocol", linkedEntityId: "weight", active: true,
      schedule: { type: "daily", timeOfDay: "morning" },
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

function supplementSupportServices() {
  const protocols = [
    { id: "electrolytes", name: "Electrolytes" },
    { id: "fadogia", name: "Fadogia Agrestis" },
  ].map(({ id, name }) => ({
    id, name, userId: "user", category: "supplement", status: "active",
    currentVersionId: `${id}_v1`, currentGoalIds: ["goal-one"], relatedGoalIds: ["goal-one"],
  }));
  const runtime = {
    user: { id: "user", displayName: "Founder", timeZone: "America/Los_Angeles" },
    goals: [{ id: "goal-one", userId: "user", title: "Lean Mass Goal", status: "active" }],
    protocols,
    protocolVersions: protocols.map((protocol) => ({
      id: protocol.currentVersionId, protocolId: protocol.id, status: "active", endedAt: null,
      effectiveAt: "2026-07-25", goalLinks: [{ goalId: "goal-one", relationship: "supports" }],
    })),
    executionItems: [
      {
        id: "execution-electrolytes", userId: "user", type: "supplement", title: "Electrolytes",
        active: true, protocolRootId: "electrolytes", linkedGoalIds: ["goal-one"],
        supplementVersionId: "electrolytes_v1", cadence: { type: "daily" },
        preferredSchedule: { daysOfWeek: [], timeOfDay: "08:00", startDate: "2026-07-25", endDate: null },
        reminderPreference: "none", dose: { amount: "", unit: "" }, executionRevision: 1,
        createdAt: "2026-07-25T19:09:22.991Z",
      },
      {
        id: "execution-fadogia", userId: "user", type: "supplement", title: "Fadogia Agrestis",
        active: true, protocolRootId: "fadogia", linkedGoalIds: ["goal-one"],
        supplementVersionId: "fadogia_v1", cadence: { type: "every_other_day" },
        preferredSchedule: { daysOfWeek: [], timeOfDay: "08:00", startDate: "2026-07-25", endDate: null },
        reminderPreference: "remind", dose: { amount: "", unit: "" }, executionRevision: 1,
        createdAt: "2026-07-25T19:09:22.991Z",
      },
    ],
    reminders: [
      {
        id: "reminder-electrolytes", userId: "user", type: "supplement_reminder",
        linkedEntityId: "electrolytes", linkedExecutionId: "execution-electrolytes", active: false,
        schedule: { type: "daily", timeOfDay: "08:00", startDate: "2026-07-25" }, completionHistory: [],
      },
      {
        id: "unrelated-electrolytes-reminder", userId: "user", type: "recovery_reminder",
        linkedEntityId: "electrolytes", active: true,
      },
      {
        id: "reminder-fadogia", userId: "user", type: "supplement_reminder",
        linkedEntityId: "fadogia", linkedExecutionId: "execution-fadogia", active: true,
        schedule: { type: "every_other_day", timeOfDay: "08:00", startDate: "2026-07-25" }, completionHistory: [],
      },
    ],
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

describe("peptide Support next due honours pause windows (S3)", () => {
  // NOW is Saturday 2026-08-29 (America/Los_Angeles); the plan is Thursdays 21:45.
  it("skips suspended Thursdays and returns null while a suspension is open", async () => {
    const { narrow, runtime } = peptideSupportServices();
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({ nextDue: "Sep 3, 2026 · 9:45 PM" });
    runtime.executionItems[0].scheduleSuspensions = [{ pausedFrom: "2026-09-01", resumedOn: "2026-09-10" }];
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({ nextDue: "Sep 10, 2026 · 9:45 PM" });
    runtime.executionItems[0].scheduleSuspensions = [{ pausedFrom: "2026-09-01", resumedOn: "2026-09-11" }];
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({ nextDue: "Sep 17, 2026 · 9:45 PM" });
    runtime.executionItems[0].scheduleSuspensions = [{ pausedFrom: "2026-08-29", resumedOn: null }];
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({ nextDue: null });
    runtime.executionItems[0].scheduleSuspensions = null;
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({ nextDue: "Sep 3, 2026 · 9:45 PM" });
  });
});

describe("peptide Support S4 read contract (additive keys)", () => {
  // NOW is Saturday 2026-08-29 (America/Los_Angeles); the plan is Thursdays 21:45.
  it("exposes lifecycle, current dose, history, planned changes, next due date/time and priorityId", async () => {
    const { narrow } = peptideSupportServices();
    const result = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(result).toMatchObject({
      priorityId: "reminder-peptide",
      lifecycle: { state: "active", since: null, history: [] },
      dosingMode: "structured",
      dosing: { pattern: "stay" },
      currentDose: { amount: 0.5, unit: "mg" },
      currentDoseLabel: "0.5 mg",
      currentPhase: { startDate: "2026-05-21", endDate: null },
      plannedChanges: [],
      dosingHistory: [{ startDate: "2026-05-21", endDate: null, dose: { amount: 0.5, unit: "mg" }, label: "0.5 mg · May 21 – Ongoing" }],
      advancedPlan: false,
      nextDue: "Sep 3, 2026 · 9:45 PM",
      nextDueDate: "2026-09-03",
      nextDueTime: "21:45",
      localDate: "2026-08-29",
    });
    expect(result.timeline).toHaveLength(1);
    expect(result).not.toHaveProperty("timelineHistory");
    expect(result).not.toHaveProperty("scheduleSuspensions");
  });

  it("reads back a paused peptide: lifecycle paused with since, no next due, domain dose Paused with the protocol still active", async () => {
    const { narrow, runtime } = peptideSupportServices();
    runtime.executionItems[0].scheduleSuspensions = [{
      pausedFrom: "2026-08-27", resumedOn: null, pausedAt: "2026-08-27T16:00:00.000Z", resumedAt: null,
      reason: "Travel", pausedExecutionRevision: 3, resumedExecutionRevision: null,
    }];
    const support = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(support).toMatchObject({
      state: "CANONICAL",
      lifecycle: { state: "paused", since: "2026-08-27", history: [{ state: "paused", effectiveDate: "2026-08-27", at: "2026-08-27T16:00:00.000Z", reason: "Travel" }] },
      currentDose: { amount: 0.5, unit: "mg" },
      nextDue: null, nextDueDate: null, nextDueTime: null,
    });
    const domain = await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" });
    expect(domain.methods[0]).toMatchObject({
      lifecycleState: "active",
      executionLifecycle: { state: "paused", since: "2026-08-27" },
      currentDose: "Paused",
      editDestination: { id: "native.operating-plan.protocol.peptide", parameters: { protocolId: "peptide-protocol" } },
    });
    runtime.executionItems[0].scheduleSuspensions[0].resumedOn = "2026-08-28";
    runtime.executionItems[0].scheduleSuspensions[0].resumedAt = "2026-08-28T16:00:00.000Z";
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({
      lifecycle: { state: "active", since: "2026-08-28", history: [{ state: "paused" }, { state: "active", effectiveDate: "2026-08-28" }] },
      nextDueDate: "2026-09-03", nextDueTime: "21:45",
    });
    expect((await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" })).methods[0]).toMatchObject({
      executionLifecycle: { state: "active", since: "2026-08-28" }, currentDose: "0.5 mg",
    });
  });

  it("keeps tonight's dose due under a pause dated tomorrow and nulls it once today is inside the window", async () => {
    // NOW is Saturday 2026-08-29; move the plan to Saturdays so tonight's dose is still open.
    const { narrow, runtime } = peptideSupportServices();
    runtime.executionItems[0].preferredSchedule = { ...runtime.executionItems[0].preferredSchedule, daysOfWeek: ["saturday"] };
    runtime.reminders[0].schedule = { ...runtime.reminders[0].schedule, daysOfWeek: ["saturday"] };
    runtime.executionItems[0].scheduleSuspensions = [{ pausedFrom: "2026-08-30", resumedOn: null, pausedAt: "2026-08-29T16:00:00.000Z" }];
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({
      lifecycle: { state: "paused", since: "2026-08-30" },
      nextDue: "Aug 29, 2026 · 9:45 PM", nextDueDate: "2026-08-29", nextDueTime: "21:45",
    });
    expect((await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" })).methods[0]).toMatchObject({
      lifecycleState: "active", executionLifecycle: { state: "paused", since: "2026-08-30" }, currentDose: "0.5 mg",
    });

    runtime.executionItems[0].scheduleSuspensions = [{ pausedFrom: "2026-08-29", resumedOn: null, pausedAt: "2026-08-29T16:00:00.000Z" }];
    await expect(narrow.getPeptideSupport({ protocolId: "peptide-protocol" })).resolves.toMatchObject({
      lifecycle: { state: "paused", since: "2026-08-29" },
      nextDue: null, nextDueDate: null, nextDueTime: null,
    });
    expect((await narrow.getOperatingPlanProtocolDomain({ protocolId: "peptide-protocol" })).methods[0]).toMatchObject({
      executionLifecycle: { state: "paused", since: "2026-08-29" }, currentDose: "Paused",
    });
  });

  it("marks advancedPlan only for a generator plan with changes ahead and never for a future-dated stay", async () => {
    const { narrow, runtime } = peptideSupportServices();
    const execution = runtime.executionItems[0];
    execution.dosingStrategy = {
      pattern: "titrate_up", startingDose: { amount: "0.5", unit: "mg" }, startDate: "2026-08-20",
      stepAmount: "0.5", stepInterval: 1, stepUnit: "weeks", targetDose: "1.5", endDate: null,
    };
    execution.timeline = generatePeptideDosingTimeline(execution.dosingStrategy);
    const titration = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(titration).toMatchObject({
      dosingMode: "structured",
      currentDose: { amount: 1, unit: "mg" },
      currentDoseLabel: "1 mg",
      currentPhase: { startDate: "2026-08-27", endDate: "2026-09-02" },
      plannedChanges: [{ startDate: "2026-09-03", dose: { amount: 1.5, unit: "mg" }, label: "1.5 mg on Sep 3" }],
      advancedPlan: true,
    });
    expect(titration.dosingHistory.map((entry) => entry.label)).toEqual(["1 mg · Aug 27 – Sep 2", "0.5 mg · Aug 20 – Aug 26"]);
    expect(titration.timeline).toHaveLength(3);

    // A simple "change dose from Sep 10" (stay) on the Founder-shaped record keeps history and is not advanced.
    execution.dosingStrategy = { pattern: "stay", startingDose: { amount: "0.75", unit: "mg" }, startDate: "2026-09-10", endDate: null };
    execution.timeline = [
      { startDate: "2026-05-21", endDate: "2026-09-09", dose: { amount: "0.5", unit: "mg" }, notes: "" },
      { startDate: "2026-09-10", endDate: null, dose: { amount: "0.75", unit: "mg" }, notes: "" },
    ];
    const futureStay = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(futureStay).toMatchObject({
      dosingMode: "structured",
      dosing: { pattern: "stay", startDate: "2026-09-10" },
      currentDose: { amount: 0.5, unit: "mg" },
      currentDoseLabel: "0.5 mg",
      plannedChanges: [{ startDate: "2026-09-10", dose: { amount: 0.75, unit: "mg" }, label: "0.75 mg on Sep 10" }],
      advancedPlan: false,
    });
    expect(futureStay.timeline.map((phase) => phase.status)).toEqual(["active", "upcoming"]);

    // A generator-less (custom) record with a hand-authored future phase is never "advanced".
    execution.dosingStrategy = null;
    const custom = await narrow.getPeptideSupport({ protocolId: "peptide-protocol" });
    expect(custom).toMatchObject({ dosingMode: "legacy_custom", advancedPlan: false });
    expect(custom.plannedChanges).toHaveLength(1);
    expect(custom.dosing).not.toBeNull();
  });
});
