import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "./Phase3CommandService.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
const now = () => new Date("2026-08-11T12:00:00.000Z");

describe("Phase 4 canonical command persistence ports", () => {
  it("preserves command outcomes across independent legacy-copy adapters", async () => {
    const left = fixture(); const right = fixture();
    const commands = [
      ["submitWeight", { localDate: "2026-08-11", value: 180 }, null],
      ["submitCheckIn", { localDate: "2026-08-11", value: 180, estimatedCalories: 2100 }, null],
      ["completePriority", { priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1"],
      ["editProtocol", { protocolId: "protocol-one", patch: { title: "Updated" } }, "1"],
      ["editGoal", { goalId: "goal-one", patch: { title: "Updated Goal" } }, "1"],
      ["confirmEvidenceReview", { reviewId: "review-one" }, "1"],
      ["correctTrainingSession", { sessionId: "training-one", corrections: [{ field: "load" }] }, "1"],
    ];
    for (const [name, payload, expectedVersion] of commands) {
      const context = commandContext(payload, expectedVersion, `command-${name}`);
      const a = await createCanonicalPersistenceCommandPorts({ records: left, now })[name](context);
      const b = await createCanonicalPersistenceCommandPorts({ records: right, now })[name](context);
      expect(a).toEqual(b);
    }
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it("rejects stale writes and suppresses a duplicate occurrence completion", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "first"));
    expect(first.result.revision).toBe(2);
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "second"));
    expect(repeated.result.status).toBe("already_completed");
    await expect(ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "first" } }, "9", "stale"))).rejects.toMatchObject({ code: "EXPECTED_VERSION_CONFLICT" });
  });

  it("preserves dose-aware completion semantics and exact occurrence idempotency", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.completePriority(commandContext({
      priorityId: "priority-one", occurrenceDate: "2026-08-11",
      dose: "0.5 mg", protocolId: "protocol-one",
    }, "1", "dose-aware"));
    expect(first.result.status).toBe("completed");
    expect(records.snapshot().reminders[0].completionHistory).toEqual([
      expect.objectContaining({
        id: "priority-one:2026-08-11",
        evidenceDate: "2026-08-11",
        effectiveDose: "0.5 mg",
        protocolId: "protocol-one",
        satisfactionType: "scheduled_protocol_execution",
      }),
    ]);
    const repeated = await ports.completePriority(commandContext({
      priorityId: "priority-one", occurrenceDate: "2026-08-11",
      dose: "0.5 mg", protocolId: "protocol-one",
    }, "1", "dose-aware-retry"));
    expect(repeated.result.status).toBe("already_completed");
    expect(records.snapshot().reminders[0].completionHistory).toHaveLength(1);
  });

  it("keeps independent aggregate writes independent", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const [goal, protocol] = await Promise.all([
      ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal B" } }, "1", "goal")),
      ports.editProtocol(commandContext({ protocolId: "protocol-one", patch: { title: "Protocol B" } }, "1", "protocol")),
    ]);
    expect(goal.result.record.title).toBe("Goal B");
    expect(protocol.result.record.title).toBe("Protocol B");
  });

  it("enqueues no durable outbox work for any committed canonical write", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const committed = await ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal C" } }, "1", "no-outbox"));
    expect(committed.status).toBe("committed");
    expect(committed.outbox).toEqual([]);
    const duplicate = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup"));
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup-2"));
    expect(duplicate.outbox).toEqual([]);
    expect(repeated.outbox).toEqual([]);
  });

  it("commits Native Nutrition and manual Activity canonically and stages Training for the exact review lifecycle", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const nutrition = await ports.upsertNutritionDay(commandContext({
      localDate: "2026-08-11", dailyTotals: { calories: 2400, protein_g: 190 }, meals: [],
    }, null, "nutrition"));
    const activity = await ports.upsertActivityDay(commandContext({
      localDate: "2026-08-11", dailyActivity: { move_calories: 720, exercise_minutes: 60 },
      sourceIdentity: "activity-screen-1", source: { application: "Apple Fitness", modality: "screenshot" },
    }, null, "activity"));
    const training = await ports.commitTrainingSession(commandContext({
      sessionId: "native-session-one", localDate: "2026-08-11",
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    }, null, "training"));
    expect(nutrition.result).toMatchObject({ canonicalId: "nutrition|2026-08-11|nutrition-day", revision: 1, goalId: "goal-one", phaseId: "phase-one" });
    expect(activity.result).toMatchObject({ canonicalId: "activity_day|2026-08-11", revision: 1, goalId: "goal-one", phaseId: "phase-one" });
    expect(training.result).toMatchObject({ status: "confirmation_requested", intendedDate: "2026-08-11", sessionId: "native-session-one" });
    expect(training.result.exerciseIds).toEqual(["bench_press"]);
    const snapshot = records.snapshot();
    expect(snapshot.canonicalEvidenceObjects.map((item) => item.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    expect(snapshot.evidenceReviews.find((item) => item.id === training.result.reviewId)).toMatchObject({
      source: "training_logger", status: "pending", evidenceTypes: ["training"],
    });
    expect(snapshot.piEnergyConfidenceWorkItems.length).toBeGreaterThan(0);
  });

  it("preserves bodyweight and added-load semantics through the Native workout staging boundary", async () => {
    const records = fixture();
    const result = await createCanonicalPersistenceCommandPorts({ records, now }).commitTrainingSession(commandContext({
      sessionId: "native-bodyweight-loading", localDate: "2026-08-11",
      exercises: [{
        canonicalExerciseId: "pull_up",
        sets: [
          { setId: "bw", reps: 8, load: null, loadType: "bodyweight", unit: "bodyweight" },
          { setId: "weighted", reps: 6, load: 25, loadType: "external_load", unit: "lb" },
        ],
      }, {
        canonicalExerciseId: "plank",
        sets: [
          { setId: "duration", durationSeconds: 60, load: null, loadType: "bodyweight", unit: "bodyweight" },
        ],
      }],
    }, null, "training-bodyweight-loading"));
    const review = records.snapshot().evidenceReviews.find((item) => item.id === result.result.reviewId);
    const sets = review.interpretedEvidence.evidence_objects
      .find((item) => item.evidence_type === "training").exercises[0].sets;
    expect(sets[0]).toMatchObject({ reps: 8, weight: null, weight_unit: "bodyweight", load_type: "bodyweight" });
    expect(sets[1]).toMatchObject({ reps: 6, weight: 25, weight_unit: "lb", load_type: "external_load" });
    const durationSet = review.interpretedEvidence.evidence_objects
      .find((item) => item.evidence_type === "training").exercises[1].sets[0];
    expect(durationSet).toMatchObject({
      reps: null,
      duration_seconds: 60,
      weight: null,
      weight_unit: "bodyweight",
      load_type: "bodyweight",
    });
  });

  it("stages a Founder-created Native exercise with its canonical definition and resolves duplicate names", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.commitTrainingSession(commandContext({
      sessionId: "native-new-exercise", localDate: "2026-08-11",
      exercises: [{
        occurrenceId: "zercher-1",
        provisionalExercise: { name: "Zercher Squat", primaryMuscleGroupId: "quads" },
        sets: [{ setId: "set-1", reps: 8, load: 135, unit: "lb" }],
      }],
    }, null, "new-exercise"));
    expect(first.result.exerciseIds).toEqual(["zercher_squat"]);
    const staged = records.snapshot().evidenceReviews.find((item) => item.id === first.result.reviewId)
      .interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "training")
      .exercises[0];
    expect(staged).toMatchObject({
      canonicalExerciseId: "zercher_squat",
      resolutionStatus: "resolved_new_canonical",
      provisionalExercise: {
        resolutionStatus: "resolved_new_canonical",
        confirmedDefinition: {
          id: "zercher_squat", name: "Zercher Squat", primary_muscle_group_id: "quads",
        },
      },
    });

    await records.put({
      ownerUserId, collection: "canonicalExerciseLibrary", recordId: "zercher_squat",
      payload: staged.provisionalExercise.confirmedDefinition,
    });
    const duplicate = await ports.commitTrainingSession(commandContext({
      sessionId: "native-existing-exercise", localDate: "2026-08-11",
      exercises: [{
        occurrenceId: "zercher-2",
        provisionalExercise: { name: "Zercher Squat", primaryMuscleGroupId: "quads" },
        sets: [{ reps: 6, load: 155, unit: "lb" }],
      }],
    }, null, "existing-exercise"));
    expect(duplicate.result.exerciseIds).toEqual(["zercher_squat"]);
    const resolved = records.snapshot().evidenceReviews.find((item) => item.id === duplicate.result.reviewId)
      .interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "training")
      .exercises[0];
    expect(resolved).toMatchObject({ canonicalExerciseId: "zercher_squat", resolutionStatus: "resolved_existing_canonical" });
    expect(resolved.provisionalExercise).toBeNull();
  });

  it("rejects direct device-health Activity and version-safely edits a staged DEXA review", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.upsertActivityDay(commandContext({
      localDate: "2026-08-11", dailyActivity: { move_calories: 700 }, sourceIdentity: "health-1",
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
    }, null, "health"))).rejects.toMatchObject({ code: "ACTIVITY_HEALTHKIT_FORBIDDEN" });
    const edited = await ports.editDexaReview(commandContext({
      reviewId: "review-dexa", evidenceObjectId: "dexa-one",
      measurements: { measuredAt: "2026-08-10", totalMass: 180, bodyFatPercentage: 12, fatMass: 21.6, leanMass: 151, boneMineralContent: 7.4 },
    }, "1", "dexa-edit"));
    expect(edited.result).toMatchObject({ status: "updated", reviewId: "review-dexa", revision: 2 });
    const correctedDexa = records.snapshot().evidenceReviews.find((item) => item.id === "review-dexa")
      .interpretedEvidence.evidence_objects[0];
    expect(correctedDexa).toMatchObject({
      measuredAt: "2026-08-10",
      totalMass: { value: 180, unit: "lb" },
      bodyFatPercentage: 12,
      fatMass: { value: 21.6, unit: "lb" },
      leanMass: { value: 151, unit: "lb" },
      boneMineralContent: { value: 7.4, unit: "lb" },
      restingMetabolicRate: { value: null, unit: "kcal/day" },
      visceralAdiposeTissue: {
        mass: { value: null, unit: "lb" },
        volume: { value: null, unit: "in3" },
      },
    });
    await expect(ports.editDexaReview(commandContext({
      reviewId: "review-dexa", evidenceObjectId: "dexa-one",
      measurements: { measuredAt: "2026-08-10", totalMass: 181 },
    }, "1", "dexa-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("saves a Nutrition strategy successor, superseding the current version and advancing currentVersionId", async () => {
    const records = nutritionStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const saved = await ports.saveNutritionStrategy(commandContext({
      protocolId: "nutrition-protocol",
      expectedCurrentVersionId: "nutrition-protocol_v1",
      draft: {
        proteinBasis: "fixed_grams", proteinRatio: 1, fixedProteinGrams: 200,
        carbohydrateStrategy: "balanced", fatStrategy: "higher_fat",
      },
    }, null, "nutrition-strategy-save"));
    expect(saved.result.status).toBe("updated");
    expect(saved.result.protocolId).toBe("nutrition-protocol");
    const successorId = saved.result.currentVersionId;
    expect(successorId).not.toBe("nutrition-protocol_v1");
    const snapshot = records.snapshot();
    const protocol = snapshot.protocols.find((item) => item.id === "nutrition-protocol");
    expect(protocol.currentVersionId).toBe(successorId);
    const previous = snapshot.protocolVersions.find((item) => item.id === "nutrition-protocol_v1");
    expect(previous.status).toBe("superseded");
    const successor = snapshot.protocolVersions.find((item) => item.id === successorId);
    expect(successor.effectiveStrategy).toMatchObject({
      proteinBasis: "fixed_grams", fixedProtein: 200, proteinTarget: 200,
      carbohydrateStrategy: "balanced", fatStrategy: "higher_fat",
    });
  });

  it("rejects a Nutrition strategy save against a stale expectedCurrentVersionId without mutating state", async () => {
    const records = nutritionStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.saveNutritionStrategy(commandContext({
      protocolId: "nutrition-protocol",
      expectedCurrentVersionId: "nutrition-protocol_v0-stale",
      draft: {
        proteinBasis: "fixed_grams", proteinRatio: 1, fixedProteinGrams: 200,
        carbohydrateStrategy: "balanced", fatStrategy: "higher_fat",
      },
    }, null, "nutrition-strategy-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
    const snapshot = records.snapshot();
    expect(snapshot.protocols.find((item) => item.id === "nutrition-protocol").currentVersionId).toBe("nutrition-protocol_v1");
    expect(snapshot.protocolVersions).toHaveLength(1);
  });

  it("treats an unchanged Nutrition strategy save as a no-op rather than an error", async () => {
    const records = nutritionStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const saved = await ports.saveNutritionStrategy(commandContext({
      protocolId: "nutrition-protocol",
      expectedCurrentVersionId: "nutrition-protocol_v1",
      draft: {
        proteinBasis: "body_weight", proteinRatio: 1, fixedProteinGrams: 150,
        carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum",
      },
    }, null, "nutrition-strategy-unchanged"));
    expect(saved.result).toMatchObject({ status: "unchanged", currentVersionId: "nutrition-protocol_v1" });
    expect(records.snapshot().protocolVersions).toHaveLength(1);
  });

  it("rejects an invalid Nutrition strategy draft without mutating state", async () => {
    const records = nutritionStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.saveNutritionStrategy(commandContext({
      protocolId: "nutrition-protocol",
      expectedCurrentVersionId: "nutrition-protocol_v1",
      draft: {
        proteinBasis: "body_weight", proteinRatio: 9, fixedProteinGrams: 150,
        carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum",
      },
    }, null, "nutrition-strategy-invalid"))).rejects.toMatchObject({ code: "NUTRITION_STRATEGY_INVALID" });
    expect(records.snapshot().protocolVersions).toHaveLength(1);
  });

  it("saves a Training strategy successor, superseding the current version and advancing currentVersionId", async () => {
    const records = trainingStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const saved = await ports.saveTrainingStrategy(commandContext({
      protocolId: "training-protocol",
      expectedCurrentVersionId: "training-protocol_v1",
      draft: {
        frequencies: [
          { area: "arms", count: 0 }, { area: "core", count: 1 }, { area: "lower_body", count: 2 },
          { area: "back", count: 2 }, { area: "chest", count: 2 }, { area: "shoulders", count: 1 },
        ],
        priorities: ["back", "shoulders"],
        progression: "aggressive",
      },
    }, null, "training-strategy-save"));
    expect(saved.result.status).toBe("updated");
    const successorId = saved.result.currentVersionId;
    expect(successorId).not.toBe("training-protocol_v1");
    const snapshot = records.snapshot();
    const protocol = snapshot.protocols.find((item) => item.id === "training-protocol");
    expect(protocol.currentVersionId).toBe(successorId);
    const previous = snapshot.protocolVersions.find((item) => item.id === "training-protocol_v1");
    expect(previous.status).toBe("superseded");
    const successor = snapshot.protocolVersions.find((item) => item.id === successorId);
    expect(successor.trainingStrategy).toMatchObject({
      weeklyFrequencies: { arms: 0, core: 1, lower_body: 2, back: 2, chest: 2, shoulders: 1 },
      physiquePriorities: ["back", "shoulders"],
      progression: { pace: "aggressive" },
    });
  });

  it("rejects a Training strategy save against a stale expectedCurrentVersionId without mutating state", async () => {
    const records = trainingStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.saveTrainingStrategy(commandContext({
      protocolId: "training-protocol",
      expectedCurrentVersionId: "training-protocol_v0-stale",
      draft: {
        frequencies: [{ area: "chest", count: 3 }],
        priorities: ["chest"],
        progression: "aggressive",
      },
    }, null, "training-strategy-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
    const snapshot = records.snapshot();
    expect(snapshot.protocols.find((item) => item.id === "training-protocol").currentVersionId).toBe("training-protocol_v1");
    expect(snapshot.protocolVersions).toHaveLength(1);
  });

  it("treats an unchanged Training strategy save as a no-op rather than an error", async () => {
    const records = trainingStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const saved = await ports.saveTrainingStrategy(commandContext({
      protocolId: "training-protocol",
      expectedCurrentVersionId: "training-protocol_v1",
      draft: {
        frequencies: [
          { area: "arms", count: 0 }, { area: "core", count: 0 }, { area: "lower_body", count: 1 },
          { area: "back", count: 1 }, { area: "chest", count: 1 }, { area: "shoulders", count: 0 },
        ],
        priorities: ["chest"],
        progression: "moderate",
      },
    }, null, "training-strategy-unchanged"));
    expect(saved.result).toMatchObject({ status: "unchanged", currentVersionId: "training-protocol_v1" });
    expect(records.snapshot().protocolVersions).toHaveLength(1);
  });

  it("rejects an invalid Training strategy draft (zero total weekly sessions) without mutating state", async () => {
    const records = trainingStrategyFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.saveTrainingStrategy(commandContext({
      protocolId: "training-protocol",
      expectedCurrentVersionId: "training-protocol_v1",
      draft: { frequencies: [], priorities: ["chest"], progression: "moderate" },
    }, null, "training-strategy-invalid"))).rejects.toMatchObject({ code: "TRAINING_STRATEGY_INVALID" });
    expect(records.snapshot().protocolVersions).toHaveLength(1);
  });

  it("adds an existing canonical exercise to My Library idempotently", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.addToMyLibrary(commandContext({ canonicalExerciseId: "dumbbell_reverse_lunge" }, null, "my-library-add"));
    expect(first.result).toEqual({ status: "added", canonicalExerciseId: "dumbbell_reverse_lunge" });
    expect(records.snapshot().myLibraryMemberships).toEqual([
      { id: "dumbbell_reverse_lunge", canonicalExerciseId: "dumbbell_reverse_lunge", addedAt: "2026-08-11T12:00:00.000Z", version: 1 },
    ]);

    const replay = await ports.addToMyLibrary(commandContext({ canonicalExerciseId: "dumbbell_reverse_lunge" }, null, "my-library-add-again"));
    expect(replay.result).toEqual({ status: "already_member", canonicalExerciseId: "dumbbell_reverse_lunge" });
    expect(records.snapshot().myLibraryMemberships).toHaveLength(1);
  });

  it("creates a new canonical exercise, persists it, and immediately adds it to My Library", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const created = await ports.createCanonicalExercise(commandContext({
      canonicalName: "Chest Supported Row", primaryMuscleGroupId: "back", equipment: "machine",
    }, null, "create-exercise"));
    expect(created.result.status).toBe("created");
    expect(created.result.exercise).toMatchObject({ id: "chest_supported_row", name: "Chest Supported Row" });
    const snapshot = records.snapshot();
    expect(snapshot.canonicalExerciseLibrary).toHaveLength(1);
    expect(snapshot.canonicalExerciseLibrary[0]).toMatchObject({ id: "chest_supported_row" });
    expect(snapshot.myLibraryMemberships).toEqual([
      { id: "chest_supported_row", canonicalExerciseId: "chest_supported_row", addedAt: "2026-08-11T12:00:00.000Z", version: 1 },
    ]);
  });

  it("rejects creating a canonical exercise that exactly matches an existing static identity", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.createCanonicalExercise(commandContext({
      canonicalName: "Leg Press", primaryMuscleGroupId: "quads",
    }, null, "create-exercise-duplicate-static"))).rejects.toMatchObject({
      code: "CANONICAL_EXERCISE_DUPLICATE",
      recovery: { existingCanonicalExerciseId: "leg_press" },
    });
    expect(records.snapshot().canonicalExerciseLibrary).toEqual([]);
    expect(records.snapshot().myLibraryMemberships ?? []).toEqual([]);
  });

  it("rejects creating a canonical exercise that matches an already runtime-created identity for this owner", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await ports.createCanonicalExercise(commandContext({
      canonicalName: "Chest Supported Row", primaryMuscleGroupId: "back",
    }, null, "create-exercise-first"));
    await expect(ports.createCanonicalExercise(commandContext({
      canonicalName: "Chest Supported Rows", primaryMuscleGroupId: "back",
    }, null, "create-exercise-second"))).rejects.toMatchObject({
      code: "CANONICAL_EXERCISE_DUPLICATE",
      recovery: { existingCanonicalExerciseId: "chest_supported_row" },
    });
    expect(records.snapshot().canonicalExerciseLibrary).toHaveLength(1);
  });

  it("rejects an invalid canonical exercise creation without mutating state", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.createCanonicalExercise(commandContext({
      canonicalName: "Chest Supported Row", primaryMuscleGroupId: "not-a-real-muscle-group",
    }, null, "create-exercise-invalid"))).rejects.toMatchObject({ code: "CANONICAL_EXERCISE_MUSCLE_GROUP_INVALID" });
    expect(records.snapshot().canonicalExerciseLibrary).toEqual([]);
  });

  it("saves recurring support (Foam Rolling) atomically across the execution item and its reminder, and rejects a stale edit", async () => {
    const records = recurringSupportFixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const draft = {
      supportSchedule: {
        frequency: "daily", daysOfWeek: [], intervalDays: 1, timing: "specific",
        specificTime: "08:40", startDate: "2026-07-23", endDate: null,
      },
      reminderPreference: "remind", notes: "",
    };
    const saved = await ports.saveRecurringSupport(commandContext({
      protocolId: "recovery", protocolCategory: "recovery",
      executionId: "execution_foam_roll", reminderId: "reminder_foam_roll_daily", draft,
    }, "1", "recurring-support-save"));
    expect(saved.result).toMatchObject({ status: "updated", executionId: "execution_foam_roll", executionRevision: 2 });
    const snapshot = records.snapshot();
    const execution = snapshot.executionItems.find((item) => item.id === "execution_foam_roll");
    expect(execution.preferredSchedule.timeOfDay).toBe("08:40");
    expect(execution.executionRevision).toBe(2);
    const reminder = snapshot.reminders.find((item) => item.id === "reminder_foam_roll_daily");
    expect(reminder.schedule.timeOfDay).toBe("08:40");

    await expect(ports.saveRecurringSupport(commandContext({
      protocolId: "recovery", protocolCategory: "recovery",
      executionId: "execution_foam_roll", reminderId: "reminder_foam_roll_daily",
      draft: { ...draft, supportSchedule: { ...draft.supportSchedule, specificTime: "09:00" } },
    }, "1", "recurring-support-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("dismisses only the owned current review without creating or changing canonical history", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const beforeCanonical = structuredClone(records.snapshot().canonicalEvidenceObjects);
    const dismissed = await ports.disposeEvidenceReview(commandContext({
      reviewId: "review-one", disposition: "discarded",
    }, "1", "dismiss-review"));
    expect(dismissed.result).toMatchObject({ status: "discarded", reviewId: "review-one", revision: 2 });
    const snapshot = records.snapshot();
    expect(snapshot.evidenceReviews.find((item) => item.id === "review-one")).toMatchObject({
      status: "discarded",
      disposition: { discardedAt: "2026-08-11T12:00:00.000Z", discardedBy: ownerUserId },
    });
    expect(snapshot.canonicalEvidenceObjects).toEqual(beforeCanonical);
    await expect(ports.disposeEvidenceReview(commandContext({
      reviewId: "review-dexa", disposition: "discarded",
    }, "9", "dismiss-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(ports.disposeEvidenceReview({
      ...commandContext({ reviewId: "review-one", disposition: "discarded" }, "1", "wrong-owner"),
      ownerUserId: "other-owner",
      principal: { ...principal, userId: "other-owner" },
    })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("replays an identical Evidence Review dismissal without a second transition", async () => {
    const records = fixture();
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: createCanonicalPersistenceCommandPorts({ records, now }),
    });
    const input = {
      commandType: Phase3Command.DISPOSE_EVIDENCE_REVIEW,
      principal,
      metadata: { idempotencyKey: "dismiss-review-retry", expectedVersion: "1" },
      payload: { reviewId: "review-one", disposition: "discarded" },
    };
    expect((await service.execute(input)).outcome).toBe("committed");
    expect((await service.execute(input)).outcome).toBe("replayed");
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-one");
    expect(review).toMatchObject({ status: "discarded", version: 2 });
  });

  it("binds owned private screenshot evidence to exactly one Native Training session", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const payload = {
      sessionId: "native-session-media", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    };
    const result = await ports.commitTrainingSession(commandContext(payload, null, "training-media"));
    expect(result.result).toMatchObject({
      status: "confirmation_requested", reviewId: "review-training-support",
      reviewRevision: 2, sessionId: "native-session-media",
    });
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review).toMatchObject({
      status: "pending",
      interpretedEvidence: {
        review_metadata: {
          nativeTrainingSessionId: "native-session-media",
          supportingEvidenceReviewId: "review-training-support",
        },
        provenance: { source_artifacts: [
          expect.objectContaining({ id: "training-screen-1", storage_path: "media://01999999-9999-4999-8999-999999999999" }),
          expect.objectContaining({ kind: "structured_training_logger_draft" }),
        ] },
      },
    });
    const session = review.interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "training");
    expect(session.provenance.source_artifact_refs).toEqual(expect.arrayContaining([
      "training-screen-1", "training_logger_draft_native-session-media",
    ]));
    expect(session.metadata.supporting_media).toEqual([
      { mediaReference: "media://01999999-9999-4999-8999-999999999999" },
    ]);
  });

  it("rejects stale, wrong-owner, wrong-date, and cross-session Training screenshot bindings", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const base = {
      sessionId: "native-session-media", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    };
    await expect(ports.commitTrainingSession(commandContext({ ...base, supportingEvidenceReviewVersion: 9 }, null, "stale-media")))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(ports.commitTrainingSession({
      ...commandContext(base, null, "wrong-owner-media"), ownerUserId: "other-owner",
      principal: { ...principal, userId: "other-owner" },
    })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(ports.commitTrainingSession(commandContext({ ...base, localDate: "2026-08-10" }, null, "wrong-date-media")))
      .rejects.toMatchObject({ code: "TRAINING_SUPPORTING_EVIDENCE_DATE_MISMATCH" });

    const bound = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    await records.put({
      ownerUserId, collection: "evidenceReviews", recordId: bound.id, expectedVersion: bound.version,
      payload: { ...bound, interpretedEvidence: { ...bound.interpretedEvidence, review_metadata: { nativeTrainingSessionId: "another-session" } } },
    });
    await expect(ports.commitTrainingSession(commandContext({ ...base, supportingEvidenceReviewVersion: 2 }, null, "wrong-session-media")))
      .rejects.toMatchObject({ code: "TRAINING_SUPPORTING_EVIDENCE_ALREADY_BOUND" });
  });

  it("replays a Training screenshot commit without duplicating its review or attachment", async () => {
    const records = fixture();
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: createCanonicalPersistenceCommandPorts({ records, now }),
    });
    const input = {
      commandType: Phase3Command.COMMIT_TRAINING_SESSION,
      principal,
      metadata: { idempotencyKey: "native-training-media-retry" },
      payload: {
        sessionId: "native-session-media", localDate: "2026-08-11",
        supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
        exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
      },
    };
    expect((await service.execute(input)).outcome).toBe("committed");
    expect((await service.execute(input)).outcome).toBe("replayed");
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review.version).toBe(2);
    expect(review.interpretedEvidence.provenance.source_artifacts.filter((item) => item.id === "training-screen-1")).toHaveLength(1);
  });

  it("does not bind supporting media when the Training commit fails validation", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.commitTrainingSession(commandContext({
      sessionId: "native-session-invalid", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "unknown-exercise", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    }, null, "training-media-invalid"))).rejects.toMatchObject({ code: "CANONICAL_EXERCISE_UNAVAILABLE" });
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review.version).toBe(1);
    expect(review.interpretedEvidence.review_metadata?.nativeTrainingSessionId).toBeUndefined();
    expect(records.snapshot().evidencePackages).toEqual([]);
  });
});

function fixture() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" },
      phases: [{ id: "phase-one", goalId: "goal-one", name: "Build", purpose: "Build", order: 0, status: "active",
        startDate: "2026-08-01", startedAt: "2026-08-01", plannedReviewAt: "2026-09-01", reviewState: "scheduled", completionDecisionRequired: true, revision: 1 }] }],
    protocols: [{ id: "protocol-one", userId: ownerUserId, title: "Protocol", version: 1 }],
    executionItems: [{ id: "priority-one", userId: ownerUserId, completionHistory: [], version: 1 }],
    reminders: [{ id: "priority-one", userId: ownerUserId, title: "Priority", active: true, completionHistory: [], version: 1 }],
    evidenceReviews: [
      { id: "review-one", userId: ownerUserId, status: "pending", version: 1, evidenceTypes: ["activity_day"] },
      { id: "review-training-support", userId: ownerUserId, status: "pending", version: 1,
        evidenceTypes: ["training"], interpretedEvidence: {
          package_id: "training-support-package", observed_date: "2026-08-11",
          provenance: { evidence_date: "2026-08-11", source_artifacts: [{
            id: "training-screen-1", storage_path: "media://01999999-9999-4999-8999-999999999999", mime_type: "image/png",
          }] },
          evidence_objects: [{
            id: "apple-training-1", evidence_type: "training", observed_at: "2026-08-11",
            source: { application: "Apple Fitness", source_artifact_refs: ["training-screen-1"] },
            provenance: { source_artifact_refs: ["training-screen-1"] },
            metadata: { activity_type: "Traditional Strength Training", duration_seconds: 3600 },
            exercises: [],
          }],
        } },
      { id: "review-dexa", userId: ownerUserId, status: "pending", version: 1, interpretedEvidence: { package_id: "dexa-package", evidence_objects: [{
        id: "dexa-one", userId: ownerUserId, evidence_type: "dexa_scan", provider: "BodySpec", measuredAt: "2026-08-10", observed_at: "2026-08-10",
        totalMass: { value: 179, unit: "lb" }, bodyFatPercentage: 12, fatMass: { value: 21.5, unit: "lb" }, leanMass: { value: 150, unit: "lb" },
        boneMineralContent: { value: 7.5, unit: "lb" }, restingMetabolicRate: { value: 1810, unit: "kcal/day" },
        visceralAdiposeTissue: { mass: { value: 0.7, unit: "lb" }, volume: { value: 19, unit: "in3" } },
        source: { type: "dexa", name: "BodySpec" }, provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["pdf-one"] },
      }] } },
    ],
    trainingPerformanceEvents: [{ id: "training-one", userId: ownerUserId, version: 1 }],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [],
    canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}
function commandContext(payload, expectedVersion, commandId) {
  return { ownerUserId, principal, metadata: { commandId, expectedVersion }, payload };
}

/// Isolated from the shared `fixture()` above — a realistic active Nutrition
/// protocol/version pair (Web's own `saveStrategy` shape:
/// `protocolType`/`category` "nutrition", `currentVersionId` pointing at an
/// active, unended version with a real `effectiveStrategy`), rather than the
/// shared fixture's generic version-less "protocol-one" stub.
function nutritionStrategyFixture() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", displayName: "Founder", version: 1 }],
    protocols: [{
      id: "nutrition-protocol", userId: ownerUserId, category: "nutrition", protocolType: "nutrition",
      name: "Nutrition Strategy", status: "active", currentVersionId: "nutrition-protocol_v1",
      currentGoalIds: ["goal-one"], relatedGoalIds: [], activatedAt: "2026-07-01T00:00:00.000Z", version: 1,
    }],
    protocolVersions: [{
      id: "nutrition-protocol_v1", protocolId: "nutrition-protocol", versionNumber: 1,
      status: "active", effectiveAt: "2026-07-01", endedAt: null,
      effectiveStrategy: {
        proteinBasis: "body_weight", proteinRatio: 1, fixedProtein: null, proteinTarget: null,
        carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum",
      },
      goalLinks: [{ goalId: "goal-one", relationship: "supports" }],
      author: { type: "user", id: ownerUserId, displayName: "Founder" },
      intent: { summary: "Support the active Goal with the current Nutrition strategy." },
      change: { reason: "Initial strategy.", changedFields: [], previousVersionId: null },
      confirmation: { confirmedByUser: true }, createdAt: "2026-07-01T00:00:00.000Z", version: 1,
    }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" }, phases: [] }],
    executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [],
    canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}

/// Isolated from the shared `fixture()` above — a realistic active Training
/// protocol/version pair, mirroring `nutritionStrategyFixture()`'s shape but
/// with Training's own `trainingStrategy` field (weeklyFrequencies,
/// physiquePriorities, progression), not Nutrition's `effectiveStrategy`.
function trainingStrategyFixture() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", displayName: "Founder", version: 1 }],
    protocols: [{
      id: "training-protocol", userId: ownerUserId, category: "training", protocolType: "training",
      name: "Training Strategy", status: "active", currentVersionId: "training-protocol_v1",
      currentGoalIds: ["goal-one"], relatedGoalIds: [], activatedAt: "2026-07-01T00:00:00.000Z", version: 1,
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
      author: { type: "user", id: ownerUserId, displayName: "Founder" },
      intent: { summary: "Support the active Goal with the current Training strategy." },
      change: { reason: "Initial strategy.", changedFields: [], previousVersionId: null },
      confirmation: { confirmedByUser: true }, createdAt: "2026-07-01T00:00:00.000Z", version: 1,
    }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" }, phases: [] }],
    executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [],
    canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}

/// Isolated from the shared `fixture()` above (which uses generic
/// "priority-one" stub executionItems/reminders shared by every other test
/// in this file) — the real Foam Rolling shape, matching
/// `RecurringSupportManagementService.test.js`'s own fixture.
function recurringSupportFixture() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    protocols: [{
      id: "recovery", userId: ownerUserId, category: "recovery", name: "Foam Rolling",
      status: "active", activatedAt: "2026-07-23T16:54:00.550Z", version: 1,
    }],
    executionItems: [{
      id: "execution_foam_roll", userId: ownerUserId, type: "recovery", title: "Foam Rolling",
      active: true, linkedProtocolId: "recovery", cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00", startDate: "2026-07-23" },
      executionRevision: 1, notes: "", version: 1,
    }],
    reminders: [{
      id: "reminder_foam_roll_daily", userId: ownerUserId, title: "Foam Roll", type: "recovery_reminder",
      linkedEntityType: "protocol", linkedEntityId: "recovery", active: true,
      schedule: { type: "daily", timeOfDay: "17:00" }, version: 1,
    }],
    goals: [], evidenceReviews: [], trainingPerformanceEvents: [],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [],
    canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}
