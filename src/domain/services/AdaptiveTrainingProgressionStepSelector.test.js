import { describe, expect, it } from "vitest";
import {
  createTrainingLoggerProgressionRecommendation,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "./TrainingLoggerProgressionService";

const CABLE = "cable_machine_front_raise";
const PULL_UP = "pull_up";
const SPIDER = "spider_curl";

describe("Adaptive progression step V1", () => {
  it("selects the audited Pull-Up rep rebuild at +25 lb as 4 x 8", () => {
    const sessions = [
      workout("2026-07-01", PULL_UP, { load: null, loadType: "bodyweight", reps: 13, unit: "bodyweight" }),
      workout("2026-08-01", PULL_UP, { load: 25, reps: 6 }),
      workout("2026-08-08", PULL_UP, { load: 25, reps: 6 }),
      workout("2026-08-15", PULL_UP, { load: 25, reps: 6 }),
      workout("2026-08-22", PULL_UP, { load: 25, repsBySet: [6, 6, 7, 7] }),
      workout("2026-09-20", PULL_UP, { load: 25, reps: 7 }),
      workout("2026-10-06", PULL_UP, { load: 25, reps: 7 }),
    ];

    expect(recommend(PULL_UP, "2026-10-06", sessions)).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedAction: "use_suggestion",
      recommendedLoad: 25,
      recommendedLoadType: "external_load",
      recommendedReps: 8,
      progressionStep: {
        kind: "reps",
        currentLoad: 25,
        nextLoad: 25,
        currentRepTarget: 7,
        nextRepTarget: 8,
        loadType: "weighted_bodyweight",
        unit: "lb",
        reasonCode: "same_load_rep_rebuild_supported",
        confidence: "supported",
      },
    });
  });

  it("selects the audited Cable rep rebuild at 150 lb as 4 x 11", () => {
    const sessions = [
      workout("2026-06-01", CABLE, { load: 130, reps: 13 }),
      workout("2026-06-15", CABLE, { load: 140, reps: 12 }),
      workout("2026-07-01", CABLE, { load: 150, reps: 9 }),
      workout("2026-07-08", CABLE, { load: 150, reps: 9 }),
      ...["2026-08-01", "2026-08-08", "2026-08-15", "2026-09-15", "2026-10-06"]
        .map((date) => workout(date, CABLE, { load: 150, reps: 10 })),
    ];

    expect(recommend(CABLE, "2026-10-06", sessions)).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedLoad: 150,
      recommendedReps: 11,
      progressionStep: {
        kind: "reps",
        currentRepTarget: 10,
        nextRepTarget: 11,
        reasonCode: "same_load_rep_rebuild_supported",
        confidence: "supported",
      },
    });
  });

  it("does not invoke the selector for audited Spider Curl evidence at 13 of 14 days", () => {
    const sessions = ["2026-09-24", "2026-10-01", "2026-10-06"]
      .map((date) => workout(date, SPIDER, { load: 50, reps: 11 }));
    const result = recommend(SPIDER, "2026-10-07", sessions);

    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
      exposureStartDate: "2026-09-24",
      exposureDays: 13,
      qualifyingSuccessfulSessions: 3,
      reasonCode: "minimum_exposure_gate_pending",
    });
    expect(result).not.toHaveProperty("progressionStep");
  });

  it("fails closed after eligibility when history is sparse", () => {
    expect(recommend(CABLE, "2026-09-15", [
      workout("2026-09-01", CABLE, { load: 150, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 150, reps: 10 }),
    ])).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedAction: "consider_progression",
      recommendedLoad: null,
      recommendedReps: null,
      progressionStep: { kind: "none", confidence: "insufficient" },
    });
  });

  it("uses a clear same-load rebuild when no compatible load increment exists", () => {
    const sessions = [
      workout("2026-07-01", CABLE, { load: 100, reps: 12 }),
      workout("2026-08-01", CABLE, { load: 110, reps: 8 }),
      workout("2026-09-01", CABLE, { load: 110, reps: 9 }),
      workout("2026-09-15", CABLE, { load: 110, reps: 9 }),
    ];
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep).toMatchObject({
      kind: "reps",
      nextLoad: 110,
      nextRepTarget: 10,
    });
  });

  it("uses a uniquely repeated compatible increment after the current run rebuilt its trigger profiles", () => {
    const sessions = [
      workout("2026-05-01", CABLE, { load: 100, reps: 10 }),
      workout("2026-05-15", CABLE, { load: 110, reps: 8 }),
      workout("2026-06-01", CABLE, { load: 110, reps: 10 }),
      workout("2026-06-15", CABLE, { load: 120, reps: 8 }),
      workout("2026-08-01", CABLE, { load: 120, reps: 10 }),
      workout("2026-09-01", CABLE, { load: 120, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 120, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-09-15", sessions)).toMatchObject({
      recommendedAction: "consider_progression",
      recommendedLoad: 130,
      recommendedReps: null,
      progressionStep: {
        kind: "load",
        currentLoad: 120,
        nextLoad: 130,
        currentRepTarget: 10,
        nextRepTarget: null,
        reasonCode: "repeated_compatible_load_increment_supported",
        confidence: "supported",
      },
    });
  });

  it("rejects competing recurring increment sizes", () => {
    const loads = [100, 110, 120, 125, 130];
    const sessions = loads.map((load, index) =>
      workout(`2026-0${index + 4}-01`, CABLE, { load, reps: 10 }));
    sessions.push(
      workout("2026-09-01", CABLE, { load: 130, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 130, reps: 10 }),
    );
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep).toMatchObject({
      kind: "none",
      reasonCode: "no_supported_step",
    });
  });

  it("does not turn one historical increment into a load step", () => {
    const sessions = [
      workout("2026-07-01", CABLE, { load: 100, reps: 10 }),
      workout("2026-08-01", CABLE, { load: 110, reps: 10 }),
      workout("2026-09-01", CABLE, { load: 110, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 110, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep.kind).toBe("none");
  });

  it("never lets bodyweight to weighted-bodyweight seed a future added-load increment", () => {
    const sessions = [
      workout("2026-07-01", PULL_UP, { load: null, loadType: "bodyweight", reps: 12, unit: "bodyweight" }),
      workout("2026-08-01", PULL_UP, { load: 25, reps: 7 }),
      workout("2026-09-01", PULL_UP, { load: 25, reps: 8 }),
      workout("2026-09-15", PULL_UP, { load: 25, reps: 8 }),
    ];
    expect(recommend(PULL_UP, "2026-09-15", sessions).progressionStep).toMatchObject({
      kind: "reps",
      loadType: "weighted_bodyweight",
      nextLoad: 25,
      nextRepTarget: 9,
    });
  });

  it("uses ordinary external-load semantics for machine history", () => {
    const result = recommend(CABLE, "2026-09-15", [
      workout("2026-07-01", CABLE, { load: 100, reps: 10 }),
      workout("2026-07-15", CABLE, { load: 110, reps: 10 }),
      workout("2026-08-01", CABLE, { load: 120, reps: 10 }),
      workout("2026-09-01", CABLE, { load: 120, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 120, reps: 10 }),
    ]);
    expect(result.progressionStep).toMatchObject({ kind: "load", loadType: "external_load" });
  });

  it("fails closed on ambiguous load semantics", () => {
    const sessions = ["2026-09-01", "2026-09-15"].map((date) => workout(date, CABLE, {
      load: 25,
      loadType: "bodyweight",
      reps: 10,
      unit: "bodyweight",
    }));
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep).toMatchObject({
      kind: "none",
      reasonCode: "ambiguous_load_semantics",
    });
  });

  it("fails closed when the latest working profile is non-uniform", () => {
    const sessions = ["2026-09-01", "2026-09-15"].map((date) => workout(date, CABLE, {
      load: 150,
      repsBySet: [10, 10, 9, 9],
    }));
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep).toMatchObject({
      kind: "none",
      reasonCode: "non_uniform_current_profile",
    });
  });

  it("does not borrow increment votes across execution variants", () => {
    const sessions = [
      workout("2026-06-01", CABLE, { load: 100, reps: 10, variant: "Static Hold" }),
      workout("2026-06-15", CABLE, { load: 110, reps: 10, variant: "Static Hold" }),
      workout("2026-07-01", CABLE, { load: 120, reps: 10, variant: "Static Hold" }),
      workout("2026-09-01", CABLE, { load: 150, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 150, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep.kind).toBe("none");
  });

  it("does not borrow increment votes across relationship contexts", () => {
    const sessions = [
      workout("2026-06-01", CABLE, { load: 100, reps: 10, partner: "cable_pushdown" }),
      workout("2026-06-15", CABLE, { load: 110, reps: 10, partner: "cable_pushdown" }),
      workout("2026-07-01", CABLE, { load: 120, reps: 10, partner: "cable_pushdown" }),
      workout("2026-09-01", CABLE, { load: 150, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 150, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-09-15", sessions).progressionStep.kind).toBe("none");
  });

  it("keeps recovery precedence and never invokes the selector on regression", () => {
    const result = recommend(CABLE, "2026-09-15", [
      workout("2026-08-01", CABLE, { load: 150, reps: 10 }),
      workout("2026-09-01", CABLE, { load: 150, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 150, reps: 9 }),
    ]);
    expect(result.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER);
    expect(result).not.toHaveProperty("progressionStep");
  });

  it("recomputes naturally when future finalized rep evidence arrives", () => {
    const base = [
      workout("2026-07-01", PULL_UP, { load: null, loadType: "bodyweight", reps: 13, unit: "bodyweight" }),
      workout("2026-08-01", PULL_UP, { load: 25, reps: 6 }),
      workout("2026-08-15", PULL_UP, { load: 25, reps: 7 }),
      workout("2026-09-01", PULL_UP, { load: 25, reps: 7 }),
    ];
    expect(recommend(PULL_UP, "2026-09-01", base).progressionStep.nextRepTarget).toBe(8);
    const future = [
      ...base,
      workout("2026-09-15", PULL_UP, { load: 25, reps: 8 }),
      workout("2026-10-01", PULL_UP, { load: 25, reps: 8 }),
    ];
    expect(recommend(PULL_UP, "2026-10-01", future).progressionStep.nextRepTarget).toBe(9);
  });

  it("lets future finalized transitions establish repeated increment evidence without stored learned state", () => {
    const base = [
      workout("2026-06-01", CABLE, { load: 100, reps: 10 }),
      workout("2026-07-01", CABLE, { load: 110, reps: 10 }),
      workout("2026-08-01", CABLE, { load: 110, reps: 10 }),
      workout("2026-08-15", CABLE, { load: 110, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-08-15", base).progressionStep.kind).toBe("none");
    const future = [
      ...base,
      workout("2026-09-01", CABLE, { load: 120, reps: 10 }),
      workout("2026-09-15", CABLE, { load: 120, reps: 10 }),
    ];
    expect(recommend(CABLE, "2026-09-15", future).progressionStep).toMatchObject({
      kind: "load",
      nextLoad: 130,
      nextRepTarget: null,
    });
  });
});

function recommend(canonicalExerciseId, nowDate, sessions) {
  return createTrainingLoggerProgressionRecommendation({
    canonicalExerciseId,
    nowDate,
    sessions,
    trainingStrategy: {
      progression: {
        defaultRule: {
          type: "double_progression_confirmed_sessions",
          condition: "reach_top_of_rep_range",
          action: "increase_load",
          successfulSessionsRequired: 2,
          minimumExposureDays: 14,
        },
        exerciseOverrides: [],
      },
    },
  });
}

function workout(date, canonicalExerciseId, {
  load,
  loadType = "external_load",
  partner = null,
  reps = 10,
  repsBySet = null,
  unit = "lb",
  variant = null,
} = {}) {
  const id = `session_${canonicalExerciseId}_${date}_${load}_${variant ?? "ordinary"}_${partner ?? "standalone"}`;
  const exercise = {
    id: `occurrence_${id}`,
    canonicalExerciseId,
    name: canonicalExerciseId,
    ...(variant ? { executionVariant: variant } : {}),
    sets: Array.from({ length: 4 }, (_, index) => ({
      load_type: loadType,
      reps: repsBySet?.[index] ?? reps,
      weight: load,
      weight_unit: unit,
    })),
  };
  const partnerExercise = partner ? {
    id: `partner_${id}`,
    canonicalExerciseId: partner,
    name: partner,
    sets: [{ load_type: "external_load", reps: 10, weight: 50, weight_unit: "lb" }],
  } : null;
  return {
    id,
    evidence_type: "training",
    observed_at: date,
    exercises: [exercise, partnerExercise].filter(Boolean),
    ...(partnerExercise ? {
      exerciseRelationshipGroups: [{
        id: `relationship_${id}`,
        relationshipType: "superset",
        memberExerciseIds: [exercise.id, partnerExercise.id],
        provenance_ref: "test",
      }],
    } : {}),
  };
}
