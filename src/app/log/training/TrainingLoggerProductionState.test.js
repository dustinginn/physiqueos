import { describe, expect, it } from "vitest";
import {
  addProvisionalTrainingExercise,
  canFinishTrainingLoggerDraft,
  canCreateNewTrainingLoggerExercise,
  addTrainingExercise,
  addTrainingSet,
  assignTrainingVariant,
  createTrainingLoggerProductionDraft,
  createTrainingSuperset,
  hydrateTrainingLoggerProductionDraft,
  initializeTrainingLoggerMode,
  listTrainingLoggerCategories,
  listTrainingLoggerExercises,
  listPerformedTrainingLoggerExerciseIds,
  removeTrainingSet,
  serializeTrainingLoggerRecoveryDraft,
  swapTrainingExercise,
  toggleTrainingSetCompletion,
  TRAINING_LOGGER_MODES,
  TRAINING_LOGGER_EXERCISE_SCOPES,
  updateTrainingSet,
  updateWorkoutContext,
} from "../../preview/training-logger/TrainingLoggerPreviewState";

describe("production Training Logger state", () => {
  it("uses the accepted user-facing taxonomy and the real canonical exercise source", () => {
    expect(listTrainingLoggerCategories()).toEqual([
      "Chest", "Back", "Shoulders", "Biceps", "Triceps",
      "Core", "Quads", "Hamstrings", "Glutes", "Calves",
    ]);
    expect(listTrainingLoggerCategories()).not.toContain("Lower Body");
    expect(listTrainingLoggerCategories()).not.toContain("Adductors");
    expect(listTrainingLoggerExercises({ categories: ["Biceps"], search: "spider" }))
      .toEqual([expect.objectContaining({ id: "spider_curl", name: "Spider Curls" })]);
    const runtimeExercise = {
      id: "runtime_curl",
      name: "Runtime Curl",
      body_region: "Arms",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: "Elbow Flexion",
      equipment: "cable",
    };
    expect(listTrainingLoggerExercises({
      categories: ["Biceps"],
      exerciseLibrary: [runtimeExercise],
    })).toEqual([runtimeExercise]);
    let runtimeDraft = createTrainingLoggerProductionDraft({
      exerciseLibrary: [runtimeExercise],
      workoutDate: "2026-08-10",
    });
    runtimeDraft = addTrainingExercise(runtimeDraft, "runtime_curl");
    expect(runtimeDraft.exercises[0]).toMatchObject({
      canonicalExerciseId: "runtime_curl",
      name: "Runtime Curl",
    });
  });

  it("uses confirmed performed history for the normal picker and keeps the global registry explicit", () => {
    const exerciseLibrary = [
      {
        id: "spider_curl",
        name: "Spider Curls",
        primary_muscle_groups: ["Biceps"],
        movement_pattern: "Elbow Flexion",
      },
      {
        id: "forearm_curl",
        name: "Forearm Curls",
        primary_muscle_groups: ["Biceps"],
        movement_pattern: "Elbow / Wrist Flexion",
      },
      {
        id: "cable_pushdown",
        name: "Cable Rope Pushdowns",
        primary_muscle_groups: ["Triceps"],
        movement_pattern: "Elbow Extension",
      },
    ];
    const performedExerciseIds = listPerformedTrainingLoggerExerciseIds([
      history("2026-08-01", { load: 35, reps: 12, variant: "Static Hold" }),
      {
        ...history("2026-08-02", { load: 35, reps: 12 }),
        exerciseRelationshipGroups: [{
          id: "superset_1",
          relationshipType: "superset",
          memberExerciseIds: ["spider_2026-08-02", "pushdown_2026-08-02"],
        }],
      },
      {
        id: "history_pushdown",
        evidence_type: "training",
        observed_at: "2026-08-02",
        exercises: [{
          id: "pushdown_2026-08-02",
          canonicalExerciseId: "cable_pushdown",
          name: "Cable Rope Pushdowns",
          sets: [{ reps: 12, weight: 40, weight_unit: "lb" }],
        }],
      },
    ]);

    expect(performedExerciseIds).toEqual(["spider_curl", "cable_pushdown"]);
    expect(listTrainingLoggerExercises({
      categories: ["Biceps"],
      exerciseLibrary,
      performedExerciseIds,
      scope: TRAINING_LOGGER_EXERCISE_SCOPES.PERFORMED_HISTORY,
    }).map((exercise) => exercise.id)).toEqual(["spider_curl"]);
    expect(listTrainingLoggerExercises({
      categories: ["Biceps"],
      exerciseLibrary,
      performedExerciseIds,
      scope: TRAINING_LOGGER_EXERCISE_SCOPES.ALL_CANONICAL,
    }).map((exercise) => exercise.id)).toEqual(["spider_curl", "forearm_curl"]);
  });

  it("adds an unperformed canonical exercise without duplicating its identity", () => {
    const exerciseLibrary = [{
      id: "runtime_curl",
      name: "Runtime Curl",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: "Elbow Flexion",
    }];
    let draft = createTrainingLoggerProductionDraft({
      exerciseLibrary,
      historySessions: [],
      workoutDate: "2026-08-10",
    });
    draft = addTrainingExercise(draft, "runtime_curl");
    draft = addTrainingExercise(draft, "runtime_curl");

    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0].canonicalExerciseId).toBe("runtime_curl");
  });

  it("accepts the complete confirmed-history identity set independently of capped performance history", () => {
    const draft = createTrainingLoggerProductionDraft({
      historySessions: [history("2026-08-01", { load: 35, reps: 12 })],
      performedExerciseIds: ["spider_curl", "forearm_curl"],
      workoutDate: "2026-08-10",
    });

    expect(draft.productionContext.performedExerciseIds)
      .toEqual(["spider_curl", "forearm_curl"]);
  });

  it("creates one shared live/retrospective draft and never fabricates retrospective time", () => {
    const initial = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    const live = initializeTrainingLoggerMode(initial, TRAINING_LOGGER_MODES.LIVE);
    const retrospective = updateWorkoutContext(
      initializeTrainingLoggerMode(initial, TRAINING_LOGGER_MODES.RETROSPECTIVE),
      { workoutDate: "2026-08-02", workoutTime: "16:00" }
    );
    expect(live.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(retrospective).toMatchObject({
      mode: "retrospective",
      workoutDate: "2026-08-02",
      workoutTime: null,
      startedAt: null,
    });
  });

  it("prepopulates only the exact comparable Variant and Superset occurrence", () => {
    const historySessions = [
      history("2026-08-01", { load: 35, reps: 12 }),
      history("2026-08-02", { load: 40, reps: 8, variant: "Static Hold" }),
    ];
    let draft = createTrainingLoggerProductionDraft({
      historySessions,
      workoutDate: "2026-08-10",
    });
    draft = addTrainingExercise(draft, "spider_curl");
    expect(draft.exercises[0].previousPerformance).toMatchObject({ load: 35, reps: 12 });
    draft = assignTrainingVariant(draft, draft.exercises[0].id, "Static Hold");
    expect(draft.exercises[0].previousPerformance).toMatchObject({ load: 40, reps: 8 });

    draft = addTrainingExercise(draft, "cable_pushdown");
    draft = createTrainingSuperset(draft, draft.exercises[0].id, draft.exercises[1].id);
    expect(draft.exercises[0].previousPerformance.firstUse).toBe(true);
  });

  it("supports dense set edit/add/remove and reversible Done state without canonical writes", () => {
    let draft = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    draft = addTrainingExercise(draft, "spider_curl");
    const exerciseId = draft.exercises[0].id;
    const firstSetId = draft.exercises[0].sets[0].id;
    draft = updateTrainingSet(draft, exerciseId, firstSetId, { reps: 11, load: 30 });
    draft = toggleTrainingSetCompletion(draft, exerciseId, firstSetId);
    expect(draft.exercises[0].sets[0]).toMatchObject({ reps: 11, load: 30, confirmed: true });
    draft = toggleTrainingSetCompletion(draft, exerciseId, firstSetId);
    expect(draft.exercises[0].sets[0].confirmed).toBe(false);
    const beforeAdd = draft.exercises[0].sets.length;
    draft = addTrainingSet(draft, exerciseId);
    expect(draft.exercises[0].sets).toHaveLength(beforeAdd + 1);
    draft = removeTrainingSet(draft, exerciseId, draft.exercises[0].sets.at(-1).id);
    expect(draft.exercises[0].sets).toHaveLength(beforeAdd);
  });

  it("does not finish a production draft with placeholder or missing performed sets", () => {
    let draft = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    draft = addTrainingExercise(draft, "spider_curl");
    expect(canFinishTrainingLoggerDraft(draft)).toBe(false);
    const exerciseId = draft.exercises[0].id;
    draft = {
      ...draft,
      exercises: [{
        ...draft.exercises[0],
        sets: [
          { ...draft.exercises[0].sets[0], reps: 10, load: 0 },
        ],
      }],
    };
    expect(canFinishTrainingLoggerDraft(draft)).toBe(true);
    draft = removeTrainingSet(draft, exerciseId, draft.exercises[0].sets[0].id);
    expect(canFinishTrainingLoggerDraft(draft)).toBe(false);
  });

  it("persists only recoverable draft interaction state, not loaded history or canonical state", () => {
    const draft = createTrainingLoggerProductionDraft({
      historySessions: [history("2026-08-01", { load: 35, reps: 12 })],
      workoutDate: "2026-08-10",
    });
    const serialized = serializeTrainingLoggerRecoveryDraft(draft);
    expect(serialized.productionContext).toBeUndefined();
    expect(serialized.isolation.canonicalTrainingSessionWritesEnabled).toBe(false);
  });

  it("offers provisional creation only for a genuinely unmatched exercise name", () => {
    const exerciseLibrary = [{
      id: "runtime_curl",
      name: "Runtime Curl",
      aliases: ["Founder Curl"],
      primary_muscle_groups: ["Biceps"],
    }];
    expect(canCreateNewTrainingLoggerExercise({ exerciseLibrary, search: "Runtime Curl" }))
      .toBe(false);
    expect(canCreateNewTrainingLoggerExercise({ exerciseLibrary, search: "founder curl" }))
      .toBe(false);
    expect(canCreateNewTrainingLoggerExercise({ exerciseLibrary, search: "Cross-body Cable Arc" }))
      .toBe(true);
    expect(canCreateNewTrainingLoggerExercise({ exerciseLibrary, search: "   " }))
      .toBe(false);
  });

  it("adds a draft-only provisional exercise with required name and category and recovers it intact", () => {
    const initial = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    expect(addProvisionalTrainingExercise(initial, { name: "Cable Arc" })).toBe(initial);
    expect(addProvisionalTrainingExercise(initial, { category: "Biceps" })).toBe(initial);

    let draft = addProvisionalTrainingExercise(initial, {
      category: "Biceps",
      name: "  Cross-body Cable Arc  ",
    });
    const occurrence = draft.exercises[0];
    draft = updateTrainingSet(draft, occurrence.id, occurrence.sets[0].id, {
      load: 22.5,
      reps: 14,
    });
    draft = assignTrainingVariant(draft, occurrence.id, "Static Hold");

    expect(draft.exercises[0]).toMatchObject({
      canonicalExerciseId: null,
      name: "Cross-body Cable Arc",
      resolutionStatus: "unresolved_provisional",
      executionVariant: { label: "Static Hold" },
      provisionalExercise: {
        suggestedPrimaryMuscleGroup: "Biceps",
        suggestedPrimaryMuscleGroupConfidence: "user_supplied",
      },
    });
    expect(draft.productionContext.exerciseLibrary).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Cross-body Cable Arc" })])
    );

    const recovered = hydrateTrainingLoggerProductionDraft(
      serializeTrainingLoggerRecoveryDraft(draft),
      { workoutDate: "2026-08-10" }
    );
    expect(recovered.exercises[0].provisionalExercise)
      .toEqual(draft.exercises[0].provisionalExercise);
    expect(recovered.exercises[0].sets[0]).toMatchObject({ load: 22.5, reps: 14 });
  });

  it("reuses an exact canonical alias rather than creating a duplicate provisional identity", () => {
    const exerciseLibrary = [{
      id: "runtime_curl",
      name: "Runtime Curl",
      aliases: ["Founder Curl"],
      primary_muscle_groups: ["Biceps"],
    }];
    const draft = addProvisionalTrainingExercise(createTrainingLoggerProductionDraft({
      exerciseLibrary,
      workoutDate: "2026-08-10",
    }), { category: "Biceps", name: "founder curl" });
    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0]).toMatchObject({
      canonicalExerciseId: "runtime_curl",
      name: "Runtime Curl",
    });
    expect(draft.exercises[0].provisionalExercise).toBeUndefined();
  });

  it("swaps atomically to the replacement exercise's own comparable history", () => {
    const exerciseLibrary = [
      {
        id: "spider_curl",
        name: "Spider Curls",
        primary_muscle_groups: ["Biceps"],
      },
      {
        id: "forearm_curl",
        name: "Forearm Curls",
        primary_muscle_groups: ["Biceps"],
      },
    ];
    const forearmHistory = {
      id: "forearm_history",
      evidence_type: "training",
      observed_at: "2026-08-05",
      exercises: [{
        id: "forearm_occurrence",
        canonicalExerciseId: "forearm_curl",
        name: "Forearm Curls",
        sets: [
          { reps: 15, weight: 25, weight_unit: "lb" },
          { reps: 13, weight: 25, weight_unit: "lb" },
        ],
      }],
    };
    let draft = createTrainingLoggerProductionDraft({
      exerciseLibrary,
      historySessions: [forearmHistory],
      workoutDate: "2026-08-10",
    });
    draft = addTrainingExercise(draft, "spider_curl");
    const occurrenceId = draft.exercises[0].id;
    draft = assignTrainingVariant(draft, occurrenceId, "Static Hold");
    draft = updateTrainingSet(draft, occurrenceId, draft.exercises[0].sets[0].id, {
      load: 225,
      reps: 3,
    });
    draft = swapTrainingExercise(draft, occurrenceId, {
      canonicalExerciseId: "forearm_curl",
    });

    expect(draft.exercises[0]).toMatchObject({
      id: occurrenceId,
      canonicalExerciseId: "forearm_curl",
      name: "Forearm Curls",
      executionVariant: null,
      previousPerformance: { load: 25, reps: 15, setCount: 2, firstUse: false },
    });
    expect(draft.exercises[0].sets).toHaveLength(2);
    expect(draft.exercises[0].sets.every((set) => set.load === 25)).toBe(true);
    expect(draft.exercises[0].sets.some((set) => set.load === 225)).toBe(false);
  });

  it("preserves a valid superset slot when swapping to a provisional exercise", () => {
    let draft = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    draft = addTrainingExercise(draft, "spider_curl");
    draft = addTrainingExercise(draft, "cable_pushdown");
    const replacedId = draft.exercises[0].id;
    const partnerId = draft.exercises[1].id;
    draft = createTrainingSuperset(draft, replacedId, partnerId);
    const groupBefore = structuredClone(draft.exerciseRelationshipGroups[0]);
    draft = swapTrainingExercise(draft, replacedId, {
      category: "Biceps",
      name: "Cross-body Cable Arc",
    });

    expect(draft.exerciseRelationshipGroups[0]).toEqual(groupBefore);
    expect(draft.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual([replacedId, partnerId]);
    expect(draft.exercises[0]).toMatchObject({
      id: replacedId,
      canonicalExerciseId: null,
      name: "Cross-body Cable Arc",
      executionVariant: null,
    });
    expect(draft.exercises[0].sets).toHaveLength(3);
    expect(draft.exercises[0].sets.every((set) => set.load === 0 && set.reps === 0))
      .toBe(true);
  });

  it("rejects a swap that would duplicate another canonical exercise", () => {
    let draft = createTrainingLoggerProductionDraft({ workoutDate: "2026-08-10" });
    draft = addTrainingExercise(draft, "spider_curl");
    draft = addTrainingExercise(draft, "cable_pushdown");
    const unchanged = swapTrainingExercise(draft, draft.exercises[0].id, {
      canonicalExerciseId: "cable_pushdown",
    });
    expect(unchanged).toBe(draft);
  });
});

function history(date, { load, reps, variant = null }) {
  return {
    id: `history_${date}_${variant ?? "ordinary"}`,
    evidence_type: "training",
    observed_at: date,
    exercises: [{
      id: `spider_${date}`,
      canonicalExerciseId: "spider_curl",
      name: "Spider Curls",
      ...(variant ? { executionVariant: variant } : {}),
      sets: [{ reps, weight: load, weight_unit: "lb" }],
    }],
  };
}
