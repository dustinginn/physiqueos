import { describe, expect, it } from "vitest";
import {
  createTrainingLoggerProgressionRecommendation,
  listComparablePerformances,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "./TrainingLoggerProgressionService";

describe("TrainingLoggerProgressionService", () => {
  it("returns no synthetic recommendation when comparable evidence is insufficient", () => {
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      goalContext: { title: "Build Lean Mass" },
      nowDate: "2026-08-10",
      sessions: [session("2026-08-01", { load: 35, reps: 12 })],
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      confidence: "low",
      recommendedLoad: null,
      recommendedReps: null,
    });
  });

  it("changes the expected progression window by Goal phase", () => {
    const sessions = [
      session("2026-07-18", { load: 35, reps: 12 }),
      session("2026-07-12", { load: 35, reps: 12 }),
      session("2026-07-05", { load: 35, reps: 12 }),
    ];
    const gain = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      goalContext: { title: "Build Lean Mass" },
      nowDate: "2026-08-10",
      sessions,
    });
    const maintenance = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      goalContext: { title: "Maintenance" },
      nowDate: "2026-08-10",
      sessions,
    });
    expect(gain.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
    expect(maintenance.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN);
  });

  it("uses user-wide cadence only after enough actual progression events", () => {
    const sessions = [
      ...progressionSeries("bench_press", "2026-05", [40, 45, 50, 55, 60]),
      session("2026-07-20", { load: 35, reps: 12 }),
      session("2026-07-13", { load: 35, reps: 12 }),
      session("2026-07-06", { load: 35, reps: 12 }),
    ];
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      goalContext: { title: "Maintenance" },
      nowDate: "2026-08-10",
      sessions,
    });
    expect(result.calibration.userCadenceDays).not.toBeNull();
    expect(result.calibration.effectiveCadenceDays).toBe(result.calibration.userCadenceDays);
  });

  it("prefers movement-specific cadence when sufficient comparable history exists", () => {
    const sessions = [
      session("2026-06-01", { load: 25, reps: 10 }),
      session("2026-06-08", { load: 30, reps: 10 }),
      session("2026-06-15", { load: 35, reps: 10 }),
      session("2026-06-22", { load: 40, reps: 10 }),
      session("2026-07-01", { load: 40, reps: 10 }),
      session("2026-07-08", { load: 40, reps: 10 }),
      session("2026-07-15", { load: 40, reps: 10 }),
    ];
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      goalContext: { title: "Maintenance" },
      nowDate: "2026-08-10",
      sessions,
    });
    expect(result.calibration.movementCadenceDays).toBe(7);
    expect(result.calibration.effectiveCadenceDays).toBe(7);
  });

  it("keeps Variant and Superset contexts out of ordinary comparisons", () => {
    const ordinary = session("2026-08-01", { load: 35, reps: 12 });
    const variant = session("2026-08-02", {
      load: 40,
      reps: 8,
      variant: "Static Hold",
    });
    const superset = session("2026-08-03", {
      load: 45,
      reps: 10,
      supersetPartner: "cable_pushdown",
    });
    const comparable = listComparablePerformances({
      canonicalExerciseId: "spider_curl",
      sessions: [ordinary, variant, superset],
    });
    expect(comparable).toHaveLength(1);
    expect(comparable[0].load).toBe(35);
  });
});

function session(date, {
  exerciseId = "spider_curl",
  load,
  reps,
  supersetPartner = null,
  variant = null,
}) {
  const exercise = {
    id: `${exerciseId}_${date}`,
    canonicalExerciseId: exerciseId,
    name: exerciseId === "spider_curl" ? "Spider Curls" : "Bench Press",
    ...(variant ? { executionVariant: variant } : {}),
    sets: [{ reps, weight: load, weight_unit: "lb" }],
  };
  const partner = supersetPartner ? {
    id: `${supersetPartner}_${date}`,
    canonicalExerciseId: supersetPartner,
    name: "Cable Rope Pushdowns",
    sets: [{ reps: 12, weight: 50, weight_unit: "lb" }],
  } : null;
  return {
    id: `session_${exerciseId}_${date}`,
    evidence_type: "training",
    observed_at: date,
    exercises: [exercise, partner].filter(Boolean),
    ...(partner ? {
      exerciseRelationshipGroups: [{
        id: `superset_${date}`,
        relationshipType: "superset",
        memberExerciseIds: [exercise.id, partner.id],
        provenance_ref: "test",
      }],
    } : {}),
  };
}

function progressionSeries(exerciseId, month, loads) {
  return loads.map((load, index) => session(
    `${month}-${String(1 + index * 7).padStart(2, "0")}`,
    { exerciseId, load, reps: 10 }
  ));
}
