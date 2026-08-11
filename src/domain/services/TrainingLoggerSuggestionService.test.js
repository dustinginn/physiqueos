import { describe, expect, it } from "vitest";
import { createTrainingLoggerSuggestion } from "./TrainingLoggerSuggestionService";

describe("TrainingLoggerSuggestionService", () => {
  it("does not infer a suggestion from too little history", () => {
    expect(createTrainingLoggerSuggestion({
      date: "2026-08-10",
      sessions: Array.from({ length: 5 }, (_, index) => session(`2026-07-${13 + index}`)),
    })).toBeNull();
  });

  it("learns a conservative recurring combination from confirmed workout history", () => {
    const sessions = [
      session("2026-07-06"),
      session("2026-07-13"),
      session("2026-07-20"),
      session("2026-07-07", "bench_press"),
      session("2026-07-14", "bench_press"),
      session("2026-07-21", "bench_press"),
    ];
    const suggestion = createTrainingLoggerSuggestion({
      date: "2026-08-10",
      sessions,
    });
    expect(suggestion).toMatchObject({
      categories: ["Biceps"],
      source: "confirmed_training_evidence_history",
    });
    expect(suggestion.reason).toContain("3 confirmed workouts");
  });
});

function session(date, canonicalExerciseId = "spider_curl") {
  return {
    id: `session_${date}_${canonicalExerciseId}`,
    evidence_type: "training",
    observed_at: date,
    exercises: [{
      canonicalExerciseId,
      name: canonicalExerciseId === "spider_curl" ? "Spider Curls" : "Bench Press",
      sets: [{ reps: 10, weight: 35 }],
    }],
  };
}
