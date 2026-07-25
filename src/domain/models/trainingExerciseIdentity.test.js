import { describe, expect, it } from "vitest";
import { FOUNDER_ALPHA_TRAINING_EXERCISES, resolveTrainingExerciseIdentity } from "./trainingExerciseIdentity";

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
});
