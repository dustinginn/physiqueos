import { describe, expect, it } from "vitest";
import {
  createWeeklyTrainingPresentationModel,
  selectWeeklyTrainingHighlights,
} from "./WeeklyTrainingPresentationService";

const window = { startDate: "2026-07-19", endDate: "2026-07-25" };
const category = (id, status, exercises, confidence = "high") => ({
  subject: { type: "training_category", id, label: id },
  status,
  direction: status === "improving" ? "positive" : status === "regressing" ? "negative" : "neutral",
  confidence: { level: confidence },
  explanationData: {
    exercise_count: exercises.length,
    exercise_names: exercises,
  },
});
const exercise = ({
  id,
  name,
  status = "improving",
  date = "2026-07-24",
  percent = 10,
  confidence = "high",
  pr = true,
  lifecycle = "new",
  current = 2000,
  previous = 1800,
}) => ({
  subject: { type: "exercise", id, label: name },
  status,
  confidence: { level: confidence },
  lifecycle: { state: lifecycle },
  supportingEvidenceIds: ["one", "two", "three"],
  explanationData: {
    last_session: { date, total_volume: current },
    previous_comparable_session: { total_volume: previous },
    pr_detection: { detected: pr, type: "session_volume" },
    volume_trend: { percent_change: percent },
  },
});

const categoryObservations = [
  category("back", "plateauing", ["Rows", "Pull-Ups"]),
  category("biceps", "improving", ["EZ Bar Curls", "Forearm Curls"]),
  category("chest", "improving", ["Incline Dumbbell Press", "Chest Fly Machine"]),
  category("core", "improving", ["Cable Crunches"]),
  category("glutes", "improving", ["Romanian Deadlifts", "Glute Squats"]),
  category("hamstrings", "insufficient_data", ["Lying Leg Curls"], "low"),
  category("quads", "improving", ["Leg Extensions", "Hack Squats"]),
  category("shoulders", "improving", ["Lateral Raises"]),
  category("triceps", "improving", ["Cable Rope Pushdowns"]),
];
const exerciseObservations = [
  exercise({ id: "incline", name: "Incline Dumbbell Press", percent: 66.7, confidence: "moderate" }),
  exercise({ id: "rdl", name: "Romanian Deadlifts", percent: 56.8, confidence: "moderate" }),
  exercise({ id: "legs", name: "Leg Extensions", percent: 56 }),
  exercise({ id: "crunch", name: "Cable Crunches", percent: 18.6 }),
  exercise({ id: "rope", name: "Cable Rope Pushdowns", percent: 5.7 }),
];

function model(overrides = {}) {
  return createWeeklyTrainingPresentationModel({
    window,
    trainingDays: 6,
    piObservations: [...categoryObservations, ...exerciseObservations],
    ...overrides,
  });
}

describe("WeeklyTrainingPresentationService", () => {
  it("renders the current Weekly breadth from mutually exclusive canonical categories", () => {
    const result = model({
      performanceEvents: [{
        id: "event-leg-extension",
        workoutDate: "2026-07-23",
        canonicalExerciseName: "Leg Extensions",
      }],
    });
    expect(result).toMatchObject({
      trainingDayCount: 6,
      completedSessionCount: 6,
      comparableCategoryCount: 9,
      counts: {
        improving: 7,
        stable: 0,
        plateauing: 1,
        regressing: 0,
        insufficient: 1,
      },
    });
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(9);
    expect(result).not.toHaveProperty("conclusion");
    expect(result).not.toHaveProperty("phaseContext");
    expect(result).not.toHaveProperty("energyContext");
    expect(result.sourcePerformanceEventIds).toEqual(["event-leg-extension"]);
    expect(result.highlights.find((item) => item.exercise === "Leg Extensions").performanceEventIds).toEqual(["event-leg-extension"]);
  });

  it("orders risk before plateau, strong improvement, stable, and insufficient deterministically", () => {
    const observations = [
      category("stable_area", "stable", ["A"]),
      category("weak_improvement", "improving", ["B"], "moderate"),
      category("strong_improvement", "improving", ["C"], "high"),
      category("plateau", "plateauing", ["D"]),
      category("regression", "regressing", ["E"]),
      category("unknown", "insufficient_data", ["F"], "low"),
    ];
    const first = model({ piObservations: observations }).categorySummaries.map((item) => item.id);
    const second = model({ piObservations: [...observations].reverse() }).categorySummaries.map((item) => item.id);
    expect(first).toEqual(["regression", "plateau", "strong_improvement", "weak_improvement"]);
    expect(second).toEqual(first);
  });

  it("keeps category facts without selecting what should receive attention", () => {
    expect(model()).not.toHaveProperty("needsAttention");
    const noConcern = model({
      piObservations: categoryObservations
        .filter((item) => item.subject.id !== "back")
        .concat(exerciseObservations),
    });
    expect(noConcern).not.toHaveProperty("needsAttention");
  });

  it("does not infer a broad Training conclusion from one or several same-exercise PRs", () => {
    const oneCategory = [category("core", "improving", ["Cable Crunches"])];
    expect(model({ piObservations: [...oneCategory, exerciseObservations[3]] })).not.toHaveProperty("broadState");
    expect(model({
      piObservations: [
        ...oneCategory,
        exercise({ id: "crunch-1", name: "Cable Crunches", percent: 20 }),
        exercise({ id: "crunch-2", name: "Cable Crunches", percent: 15 }),
      ],
    })).not.toHaveProperty("broadState");
  });

  it("selects at most three meaningful, category-diverse highlights without defaulting to Cable Crunches", () => {
    const highlights = model().highlights;
    expect(highlights).toHaveLength(3);
    expect(highlights.map((item) => item.exercise)).toEqual([
      "Leg Extensions",
      "Incline Dumbbell Press",
      "Romanian Deadlifts",
    ]);
    expect(highlights.map((item) => item.exercise)).not.toContain("Cable Crunches");
    expect(highlights.every((item) => !Object.hasOwn(item, "explanation"))).toBe(true);
    expect(JSON.stringify(highlights)).not.toMatch(/lean mass|tissue gain/i);
  });

  it("allows fewer highlights and suppresses stale lifecycle claims", () => {
    const highlights = selectWeeklyTrainingHighlights({
      window,
      categories: categoryObservations.map((item) => ({
        id: item.subject.id,
        exercises: item.explanationData.exercise_names,
      })),
      observations: [
        exercise({ id: "fresh", name: "Leg Extensions" }),
        exercise({ id: "stale", name: "Cable Crunches", lifecycle: "background", percent: 90 }),
      ],
    });
    expect(highlights).toHaveLength(1);
    expect(highlights[0].exercise).toBe("Leg Extensions");
  });

  it("preserves category facts without producing a broad interpretation", () => {
    expect(model()).not.toHaveProperty("broadState");
    const regression = model({
      piObservations: [
        category("back", "regressing", ["Rows"]),
        category("chest", "regressing", ["Press"]),
      ],
    });
    expect(regression).not.toHaveProperty("broadState");
    expect(regression.categorySummaries[0].status).toBe("regressing");
  });

  it("uses a factual safe fallback when historical structured breadth is absent", () => {
    const result = createWeeklyTrainingPresentationModel({ window, trainingDays: 3 });
    expect(result).not.toHaveProperty("broadState");
    expect(result).not.toHaveProperty("conclusion");
    expect(result.highlights).toEqual([]);
    expect(result).not.toHaveProperty("needsAttention");
  });
});
