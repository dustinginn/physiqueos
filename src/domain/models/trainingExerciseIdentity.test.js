import { afterEach, describe, expect, it } from "vitest";
import {
  FOUNDER_ALPHA_TRAINING_EXERCISES,
  listCanonicalTrainingExerciseIdentities,
  normalizeExercisePhrase,
  registerRuntimeTrainingExercises,
  resolveTrainingExerciseOccurrenceIdentity,
  resolveTrainingExerciseIdentity,
} from "./trainingExerciseIdentity";
import { normalizeTrainingExercises } from "./trainingSessionEvidence";

afterEach(() => registerRuntimeTrainingExercises([]));

describe("Founder Alpha incline bench identity",()=>{
  it.each(["Incline Bench Press","incline bench press","Barbell Incline Bench Press","Incline Barbell Press"])("resolves %s to the preferred incline identity",(label)=>{expect(resolveTrainingExerciseIdentity(label)).toMatchObject({canonicalExerciseId:"incline_bench_press",canonicalExerciseName:"Incline Bench Press",resolutionStatus:"resolved_high_confidence"});});
  it("keeps flat bench distinct",()=>{expect(resolveTrainingExerciseIdentity("Bench Press")).toMatchObject({canonicalExerciseId:"bench_press",canonicalExerciseName:"Bench Press"});expect(resolveTrainingExerciseIdentity("Incline Bench Press").canonicalExerciseId).not.toBe("bench_press");});
  it("does not collapse machine, Smith-machine, or dumbbell variants",()=>{expect(resolveTrainingExerciseIdentity("Chest Press Machine").canonicalExerciseId).not.toBe("bench_press");expect(resolveTrainingExerciseIdentity("Smith Machine Incline Bench Press").canonicalExerciseId).not.toBe("incline_bench_press");expect(resolveTrainingExerciseIdentity("Incline Dumbbell Press")).toMatchObject({canonicalExerciseId:"incline_dumbbell_press"});});
  it("uses the exact preferred display name and existing KB schema",()=>{const entry=FOUNDER_ALPHA_TRAINING_EXERCISES.find((item)=>item.id==="incline_bench_press");expect(entry).toMatchObject({name:"Incline Bench Press",equipment:"barbell",body_region:"Chest",primary_muscle_groups:["Upper Chest","Triceps","Front Delts"],movement_pattern:"Incline Press"});});
  it.each([
    ["Bench Press", "bench_press", "Bench Press"],
    ["Incline Bench Press", "incline_bench_press", "Incline Bench Press"],
    ["Leg Press", "leg_press", "Leg Press"],
    ["Leg Press, Sumo", "leg_press_sumo_stance", "Leg Press (Sumo Stance)"],
    ["Sumo Leg Press", "leg_press_sumo_stance", "Leg Press (Sumo Stance)"],
    ["Leg Press Sumo", "leg_press_sumo_stance", "Leg Press (Sumo Stance)"],
    ["Leg Press (Sumo)", "leg_press_sumo_stance", "Leg Press (Sumo Stance)"],
    ["Leg Press (Sumo Stance)", "leg_press_sumo_stance", "Leg Press (Sumo Stance)"],
    ["Glute Squat", "glute_squat", "Glute Squats"],
    ["Glute Squats", "glute_squat", "Glute Squats"],
    ["Romanian Deadlift", "romanian_deadlift", "Romanian Deadlifts"],
    ["Romanian Deadlifts", "romanian_deadlift", "Romanian Deadlifts"],
    ["Lying Hamstring Curls", "lying_leg_curl", "Lying Leg Curls"],
    ["Hyperextension Machine", "hyperextension_machine", "Hyperextension Machine"],
    ["Hypertension Machine", "hyperextension_machine", "Hyperextension Machine"],
    ["Hanging Leg Raise", "hanging_leg_raise", "Hanging Leg Raises"],
  ])("preserves the canonical identity of %s", (label, canonicalExerciseId, canonicalExerciseName) => {
    expect(resolveTrainingExerciseIdentity(label)).toMatchObject({
      canonicalExerciseId,
      canonicalExerciseName,
      resolutionStatus: "resolved_high_confidence",
    });
  });

  it("adds only the approved narrow variant aliases", () => {
    expect(resolveTrainingExerciseIdentity("Wide Squat").resolutionStatus).toBe("unrecognized");
    expect(resolveTrainingExerciseIdentity("Sumo Squat").resolutionStatus).toBe("unrecognized");
    expect(resolveTrainingExerciseIdentity("Squat").canonicalExerciseId).toBe("squat");
    expect(resolveTrainingExerciseIdentity("Leg Press").canonicalExerciseId).toBe("leg_press");
  });

  it("uses one app-wide runtime identity collection across independent callers", () => {
    registerRuntimeTrainingExercises([{
      id: "sumo_squat_machine",
      name: "Sumo Squat Machine",
      aliases: ["Wide Stance Squat Machine"],
    }]);
    expect(resolveTrainingExerciseIdentity("Sumo Squat Machine").canonicalExerciseId)
      .toBe("sumo_squat_machine");
    expect(resolveTrainingExerciseIdentity("Wide Stance Squat Machine").canonicalExerciseId)
      .toBe("sumo_squat_machine");
    expect(listCanonicalTrainingExerciseIdentities().at(-1)?.id)
      .toBe("sumo_squat_machine");
  });

  it("does not infer canonical membership from historical workout-shaped data", () => {
    const historicalWorkout = {
      exercises: [{ id: "sumo_squat_machine", name: "Sumo Squat Machine" }],
    };
    expect(historicalWorkout.exercises).toHaveLength(1);
    expect(resolveTrainingExerciseIdentity("Sumo Squat Machine").resolutionStatus)
      .toBe("unrecognized");
  });

  it("treats a stored canonicalExerciseId as authoritative over a conflicting display name", () => {
    registerRuntimeTrainingExercises([{
      id: "founder_cable_arc",
      name: "Founder Cable Arc",
      aliases: ["Original Cable Arc"],
      primary_muscle_group_id: "biceps",
      primary_muscle_groups: ["Biceps"],
    }]);

    expect(resolveTrainingExerciseOccurrenceIdentity({
      canonicalExerciseId: "founder_cable_arc",
      name: "Bench Press",
    })).toMatchObject({
      canonicalExerciseId: "founder_cable_arc",
      canonicalExerciseName: "Founder Cable Arc",
      matchSignals: ["stored_canonical_exercise_id"],
    });
  });

  it("centralizes the legacy name fallback only for occurrences without a stored canonical ID", () => {
    expect(resolveTrainingExerciseOccurrenceIdentity({
      name: "Barbell Incline Bench Press",
    })).toMatchObject({
      canonicalExerciseId: "incline_bench_press",
      canonicalExerciseName: "Incline Bench Press",
      resolutionStatus: "resolved_high_confidence",
    });
  });

  it("rejects runtime ID and alias collisions without corrupting the current registry", () => {
    registerRuntimeTrainingExercises([{
      id: "founder_cable_arc",
      name: "Founder Cable Arc",
      aliases: [],
    }]);

    expect(() => registerRuntimeTrainingExercises([{
      id: "runtime_bench_duplicate",
      name: "Runtime Bench Duplicate",
      aliases: ["Bench Press"],
    }])).toThrow(expect.objectContaining({
      code: "CANONICAL_EXERCISE_REGISTRY_CONFLICT",
    }));
    expect(resolveTrainingExerciseIdentity("Founder Cable Arc"))
      .toMatchObject({ canonicalExerciseId: "founder_cable_arc" });
  });

  it("keeps the stored ID while normalizing a renamed persisted occurrence", () => {
    registerRuntimeTrainingExercises([{
      id: "founder_cable_arc",
      name: "Founder Cable Arc",
      aliases: ["Original Cable Arc"],
      primary_muscle_group_id: "biceps",
      primary_muscle_groups: ["Biceps"],
    }]);

    expect(normalizeTrainingExercises([{
      canonicalExerciseId: "founder_cable_arc",
      name: "Bench Press",
      sets: [{ reps: 10, weight: 40 }],
    }])[0]).toMatchObject({
      canonicalExerciseId: "founder_cable_arc",
      name: "Bench Press",
    });
  });
});

describe("memoized exercise phrase normalization (performance)", () => {
  function referenceNormalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[-_]/g, " ")
      .replace(/\bdb\b/g, "dumbbell")
      .replace(/\bez\b/g, "ez")
      .replace(/\bpresses\b/g, "press")
      .replace(/\bflies\b/g, "fly")
      .replace(/\b(thrust|curl|squat|lunge|row|raise|extension|abduction|adduction)s\b/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  it("returns exactly the uncached normalization for every registry name and alias, repeatedly", () => {
    const phrases = FOUNDER_ALPHA_TRAINING_EXERCISES.flatMap((item) => [item.name, item.id, ...(item.aliases ?? [])]);
    expect(phrases.length).toBeGreaterThan(100);
    for (let pass = 0; pass < 3; pass += 1) {
      for (const phrase of phrases) expect(normalizeExercisePhrase(phrase)).toBe(referenceNormalize(phrase));
    }
  });

  it("matches for non-string, empty, and edge inputs", () => {
    for (const value of [null, undefined, "", "  ", 42, "DB  Curls", "EZ-bar_curls", "Leg Presses", "Chest Flies", "Hip Thrusts ", "Ab_Adductions"]) {
      expect(normalizeExercisePhrase(value)).toBe(referenceNormalize(value));
      expect(normalizeExercisePhrase(value)).toBe(referenceNormalize(value));
    }
  });

  it("stays exact beyond the memo bound", () => {
    const inputs = Array.from({ length: 5000 }, (_, index) => `Incline DB Presses ${index}_set-${index % 7}`);
    for (const value of inputs) expect(normalizeExercisePhrase(value)).toBe(referenceNormalize(value));
    for (const value of inputs.slice(0, 50)) expect(normalizeExercisePhrase(value)).toBe(referenceNormalize(value));
  });
});
