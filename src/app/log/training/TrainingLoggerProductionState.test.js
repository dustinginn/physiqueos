import { describe, expect, it } from "vitest";
import {
  canFinishTrainingLoggerDraft,
  addTrainingExercise,
  addTrainingSet,
  assignTrainingVariant,
  createTrainingLoggerProductionDraft,
  createTrainingSuperset,
  initializeTrainingLoggerMode,
  listTrainingLoggerCategories,
  listTrainingLoggerExercises,
  removeTrainingSet,
  serializeTrainingLoggerRecoveryDraft,
  toggleTrainingSetCompletion,
  TRAINING_LOGGER_MODES,
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
