import { describe, expect, it } from "vitest";
import {
  createTrainingLoggerProgressionRecommendation,
  listComparablePerformances,
  resolveTrainingProgressionPhase,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "./TrainingLoggerProgressionService";

const CABLE = "cable_machine_front_raise";

describe("TrainingLoggerProgressionService", () => {
  it("fails conservatively when the active Training Strategy is absent or unsupported", () => {
    const sessions = [session("2026-09-01"), session("2026-09-15")];
    const absent = recommendation({ nowDate: "2026-09-15", sessions, trainingStrategy: null });
    const unsupported = recommendation({
      nowDate: "2026-09-15",
      sessions,
      trainingStrategy: strategy({ action: "add_reps_forever" }),
    });
    expect(absent).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      reasonCode: "training_strategy_progression_unavailable",
      progressionPolicy: { executable: false },
    });
    expect(unsupported).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      reasonCode: "unsupported_progression_action",
    });
  });

  it("reproduces Cable Machine Front Raises weekly: day 7 does not reset the day 0 exposure anchor", () => {
    const sessions = [session("2026-09-01"), session("2026-09-08")];
    expect(recommendation({ nowDate: "2026-09-14", sessions })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
      exposureStartDate: "2026-09-01",
      exposureDays: 13,
      qualifyingSuccessfulSessions: 2,
      progressionGates: { sessionCountGateSatisfied: true, exposureGateSatisfied: false },
    });
    expect(recommendation({ nowDate: "2026-09-15", sessions })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-01",
      exposureDays: 14,
      successfulSessionsRequired: 2,
      qualifyingSuccessfulSessions: 2,
      reasonCode: "progression_step_authority_unavailable",
      progressionStep: { kind: "none", reasonCode: "rep_range_authority_unavailable" },
    });
  });

  it("holds twice-weekly success until day 14 without moving the first-success anchor", () => {
    const sessions = ["2026-09-01", "2026-09-04", "2026-09-08", "2026-09-11"].map(session);
    expect(recommendation({ nowDate: "2026-09-14", sessions }).status)
      .toBe(TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN);
    expect(recommendation({ nowDate: "2026-09-15", sessions })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      qualifyingSuccessfulSessions: 4,
      exposureStartDate: "2026-09-01",
      exposureDays: 14,
    });
  });

  it("makes every-other-week and greater-than-14-day spacing eligible immediately after session two", () => {
    const day14 = [session("2026-09-01"), session("2026-09-15")];
    const day21 = [session("2026-09-01"), session("2026-09-22")];
    expect(recommendation({ nowDate: "2026-09-15", sessions: day14 }).status)
      .toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
    expect(recommendation({ nowDate: "2026-09-22", sessions: day21 })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureDays: 21,
    });
  });

  it("does not let a successful repeat delay an opportunity that already matured", () => {
    const firstTwo = [session("2026-09-01"), session("2026-09-08")];
    const repeated = [...firstTwo, session("2026-09-15")];
    const skipped = recommendation({ nowDate: "2026-09-15", sessions: firstTwo });
    const completed = recommendation({ nowDate: "2026-09-15", sessions: repeated });
    expect(skipped.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
    expect(completed).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: skipped.exposureStartDate,
      exposureDays: skipped.exposureDays,
      qualifyingSuccessfulSessions: 3,
    });
  });

  it("requires the configured success count even after the exposure window elapsed", () => {
    const one = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01")],
    });
    expect(one).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      reasonCode: "insufficient_comparable_finalized_sessions",
      progressionGates: { eligible: false },
    });

    const requiresThree = strategy({ successfulSessionsRequired: 3 });
    const two = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-08")],
      trainingStrategy: requiresThree,
    });
    const three = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-08"), session("2026-09-15")],
      trainingStrategy: requiresThree,
    });
    expect(two).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
      successfulSessionsRequired: 3,
      qualifyingSuccessfulSessions: 2,
    });
    expect(three.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
  });

  it("keeps regression/recovery ahead of otherwise-mature eligibility", () => {
    const result = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-08"), session("2026-09-15", { reps: 9 })],
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER,
      reasonCode: "latest_performance_regressed",
      recommendedLoad: 150,
      recommendedReps: 10,
    });
  });

  it("starts a new exposure and qualification run after a new load", () => {
    const sessions = [
      session("2026-09-01"),
      session("2026-09-08"),
      session("2026-09-15", { load: 160 }),
    ];
    expect(recommendation({ nowDate: "2026-09-29", sessions })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.ON_PACE,
      exposureStartDate: "2026-09-15",
      exposureDays: 14,
      qualifyingSuccessfulSessions: 1,
    });
    expect(recommendation({
      nowDate: "2026-09-29",
      sessions: [...sessions, session("2026-09-29", { load: 160 })],
    })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-15",
      qualifyingSuccessfulSessions: 2,
    });
  });

  it("treats rep progress as same-load progress while conservatively rebuilding the current success profile", () => {
    const sessions = [
      session("2026-09-01", { reps: 9 }),
      session("2026-09-08", { reps: 10 }),
      session("2026-09-15", { reps: 10 }),
    ];
    const result = recommendation({ nowDate: "2026-09-22", sessions });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-08",
      exposureDays: 14,
      qualifyingSuccessfulSessions: 2,
      progressionPolicy: { qualificationMode: "stable_completed_set_profile_transitional" },
    });
  });

  it("uses an explicit rep-range maximum and every persisted working set when configured", () => {
    const explicit = strategy({
      repIncrement: 1,
      repRange: { minimum: 8, maximum: 10 },
      workingSetsRequired: 4,
    });
    const success = [session("2026-09-01"), session("2026-09-15")];
    const oneSetMissed = [
      session("2026-09-01"),
      session("2026-09-15", { repsBySet: [10, 10, 10, 9] }),
    ];
    expect(recommendation({ nowDate: "2026-09-15", sessions: success, trainingStrategy: explicit }))
      .toMatchObject({
        status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
        progressionPolicy: { qualificationMode: "prescribed_double_progression_step", limitation: null },
      });
    expect(recommendation({ nowDate: "2026-09-15", sessions: oneSetMissed, trainingStrategy: explicit }))
      .toMatchObject({
        status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
        qualifyingSuccessfulSessions: 0,
      });
  });

  it("does not silently count a changed persisted set shape as the same transitional prescription", () => {
    const result = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-15", { setCount: 3 })],
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
      qualifyingSuccessfulSessions: 1,
      exposureStartDate: "2026-09-15",
    });
  });

  it("counts distinct same-day canonical sessions once each and de-duplicates one session id", () => {
    const distinct = [
      session("2026-09-01T08:00:00-07:00", { sessionId: "morning" }),
      session("2026-09-01T18:00:00-07:00", { sessionId: "evening" }),
    ];
    const duplicate = [distinct[0], structuredClone(distinct[0])];
    expect(recommendation({ nowDate: "2026-09-15", sessions: distinct })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      qualifyingSuccessfulSessions: 2,
    });
    expect(recommendation({ nowDate: "2026-09-15", sessions: duplicate })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
      qualifyingSuccessfulSessions: 0,
    });
  });

  it("preserves stored identity, alias fallback, Variant, and exact Superset partitions", () => {
    const alias = session("2026-09-01", { storedId: null, name: "Cable Machine Front Raises" });
    const stored = session("2026-09-15");
    expect(recommendation({ nowDate: "2026-09-15", sessions: [alias, stored] }).status)
      .toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);

    const variantSessions = [
      session("2026-09-01", { variant: "Static Hold" }),
      session("2026-09-15", { variant: "Static Hold" }),
    ];
    expect(recommendation({ nowDate: "2026-09-15", sessions: variantSessions }).qualifyingSuccessfulSessions).toBe(0);
    expect(recommendation({ nowDate: "2026-09-15", sessions: variantSessions, variant: "Static Hold" }).status)
      .toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);

    const supersetSessions = [
      session("2026-09-01", { supersetPartner: "cable_pushdown" }),
      session("2026-09-15", { supersetPartner: "cable_pushdown" }),
    ];
    expect(recommendation({ nowDate: "2026-09-15", sessions: supersetSessions }).qualifyingSuccessfulSessions).toBe(0);
    expect(recommendation({
      nowDate: "2026-09-15",
      sessions: supersetSessions,
      relationshipContext: {
        relationshipType: "superset",
        orderedPartners: [{ canonicalExerciseId: "cable_pushdown" }],
      },
    }).status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
  });

  it("keeps adaptive cadence diagnostic-only and Goal/phase changes out of exposure identity", () => {
    const sessions = [
      session("2026-07-01", { load: 130 }),
      session("2026-07-08", { load: 140 }),
      session("2026-07-15", { load: 150 }),
      session("2026-07-22", { load: 160 }),
      session("2026-09-01"),
      session("2026-09-08"),
    ];
    const cut = recommendation({
      goalContext: { title: "Build Mass", phase: { type: "cut" } },
      nowDate: "2026-09-15",
      sessions,
    });
    const gain = recommendation({
      goalContext: { title: "Build Mass", phase: { type: "gain" } },
      nowDate: "2026-09-15",
      sessions,
    });
    const maintenanceWithoutCadenceHistory = recommendation({
      goalContext: { phase: { type: "maintenance" } },
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-08")],
    });
    const beforeLockedExposure = recommendation({
      nowDate: "2026-09-14",
      sessions,
    });
    expect(cut.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
    expect(gain.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY);
    expect(maintenanceWithoutCadenceHistory).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      calibration: { effectiveCadenceDays: 28, eligibilityRole: "diagnostic_only" },
    });
    expect(beforeLockedExposure.status).toBe(TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN);
    expect(cut.calibration).toMatchObject({ phase: "cut", eligibilityRole: "diagnostic_only" });
    expect(cut.exposureStartDate).toBe(gain.exposureStartDate);
    expect(resolveTrainingProgressionPhase({ title: "Build Mass", phase: { type: "cut" } })).toBe("cut");
  });

  it("keeps eligibility separate from evidence-supported target selection", () => {
    const noIncrement = recommendation({
      nowDate: "2026-09-15",
      sessions: [session("2026-09-01"), session("2026-09-15")],
    });
    expect(noIncrement).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedAction: "consider_progression",
      recommendedLoad: null,
      targetSelection: { status: "unavailable" },
    });

    const withIncrement = recommendation({
      nowDate: "2026-09-15",
      sessions: [
        session("2026-07-01", { load: 130 }),
        session("2026-07-08", { load: 140 }),
        session("2026-07-15", { load: 150 }),
        session("2026-09-01"),
        session("2026-09-15"),
      ],
    });
    expect(withIncrement).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedAction: "consider_progression",
      recommendedLoad: null,
      recommendedReps: null,
      progressionStep: { kind: "none", reasonCode: "rep_range_authority_unavailable" },
      targetSelection: { status: "unavailable", policy: "rep_range_authority_unavailable" },
    });

    const configuredRepRange = recommendation({
      nowDate: "2026-09-15",
      sessions: [
        session("2026-07-01", { load: 130 }),
        session("2026-07-08", { load: 140 }),
        session("2026-07-15", { load: 150 }),
        session("2026-09-01"),
        session("2026-09-15"),
      ],
      trainingStrategy: strategy({
        repIncrement: 1,
        repRange: { minimum: 8, maximum: 10 },
        workingSetsRequired: 4,
      }),
    });
    expect(configuredRepRange).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      recommendedLoad: 160,
      recommendedReps: 8,
      progressionPolicy: { qualificationMode: "prescribed_double_progression_step" },
      progressionStep: { kind: "load", currentRepTarget: 10, resetRepTarget: 8 },
    });
  });

  it("keeps the validated Cable fixture as load progression only with explicit top and reset authority", () => {
    const sessions = [
      session("2026-07-20", { load: 130 }),
      session("2026-08-03", { load: 140 }),
      ...["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]
        .map((date) => session(date)),
    ];
    const result = recommendation({
      nowDate: "2026-10-06",
      sessions,
      trainingStrategy: strategy({
        loadResetRepTarget: 8,
        repIncrement: 1,
        repRange: { minimum: 8, maximum: 10 },
        workingSetsRequired: 4,
      }),
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-08",
      exposureDays: 28,
      qualifyingSuccessfulSessions: 5,
      recommendedAction: "use_suggestion",
      recommendedLoad: 160,
      recommendedReps: 8,
      progressionStep: {
        kind: "load",
        currentRepTarget: 10,
        nextRepTarget: 8,
        repRangeMin: 8,
        repRangeMax: 10,
        resetRepTarget: 8,
      },
    });
  });

  it("keeps the validated Spider Curl fixture at Maintain on day 13 regardless of a rep step", () => {
    const sessions = ["2026-09-23", "2026-09-27", "2026-10-03"].map((date) =>
      session(date, { load: 50, name: "Spider Curls", reps: 11, storedId: "spider_curl" })
    );
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "spider_curl",
      nowDate: "2026-10-06",
      sessions,
      trainingStrategy: strategy({
        repIncrement: 1,
        repRange: { minimum: 8, maximum: 12 },
        workingSetsRequired: 4,
      }),
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.MAINTAIN,
      exposureStartDate: "2026-09-23",
      exposureDays: 13,
      qualifyingSuccessfulSessions: 3,
      reasonCode: "minimum_exposure_gate_pending",
      progressionStep: { kind: "none" },
    });
  });

  it("progresses the validated weighted Pull-Up fixture by one rep at the same added load", () => {
    const sessions = ["2026-09-20", "2026-10-04"].map((date) =>
      session(date, { load: 25, name: "Pull-Ups", reps: 7, storedId: "pull_up" })
    );
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "pull_up",
      nowDate: "2026-10-06",
      sessions,
      trainingStrategy: strategy({
        repIncrement: 1,
        repRange: { minimum: 6, maximum: 8 },
        workingSetsRequired: 4,
      }),
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-20",
      exposureDays: 16,
      qualifyingSuccessfulSessions: 2,
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
      },
      targetSelection: { policy: "active_training_strategy_rep_increment" },
    });
  });

  it("fails closed for the Pull-Up fixture when rep-range authority is absent", () => {
    const sessions = ["2026-09-20", "2026-10-04"].map((date) =>
      session(date, { load: 25, name: "Pull-Ups", reps: 7, storedId: "pull_up" })
    );
    const result = createTrainingLoggerProgressionRecommendation({
      canonicalExerciseId: "pull_up",
      nowDate: "2026-10-06",
      sessions,
      trainingStrategy: strategy(),
    });
    expect(result).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      reasonCode: "progression_step_authority_unavailable",
      recommendedAction: "consider_progression",
      recommendedLoad: null,
      recommendedReps: null,
      progressionStep: { kind: "none", reasonCode: "rep_range_authority_unavailable" },
    });
  });

  it.each([
    [{ minimum: 3, maximum: 6 }, 5, 6],
    [{ minimum: 8, maximum: 12 }, 10, 11],
    [{ minimum: 12, maximum: 15 }, 13, 14],
  ])("uses the next explicit step inside low, middle, and high rep ranges", (repRange, reps, nextReps) => {
    const sessions = ["2026-09-01", "2026-09-15"].map((date) => session(date, { reps }));
    expect(recommendation({
      nowDate: "2026-09-15",
      sessions,
      trainingStrategy: strategy({ repIncrement: 1, repRange, workingSetsRequired: 4 }),
    })).toMatchObject({
      recommendedLoad: 150,
      recommendedReps: nextReps,
      progressionStep: { kind: "reps", currentRepTarget: reps, nextRepTarget: nextReps },
    });
  });

  it("honors an explicit non-one rep increment without crossing the prescribed ceiling", () => {
    const sessions = ["2026-09-01", "2026-09-15"].map((date) => session(date, { reps: 8 }));
    expect(recommendation({
      nowDate: "2026-09-15",
      sessions,
      trainingStrategy: strategy({
        repIncrement: 2,
        repRange: { minimum: 6, maximum: 10 },
        workingSetsRequired: 4,
      }),
    })).toMatchObject({ recommendedReps: 10, progressionStep: { kind: "reps" } });
  });

  it("keeps the load-exposure anchor across rep steps but requires confirmations at the current step", () => {
    const explicit = strategy({
      repIncrement: 1,
      repRange: { minimum: 6, maximum: 8 },
      workingSetsRequired: 4,
    });
    const oneAtSeven = [
      session("2026-09-01", { reps: 6 }),
      session("2026-09-08", { reps: 6 }),
      session("2026-09-15", { reps: 7 }),
    ];
    expect(recommendation({ nowDate: "2026-09-22", sessions: oneAtSeven, trainingStrategy: explicit }))
      .toMatchObject({
        status: TRAINING_LOGGER_PROGRESSION_STATUS.ON_PACE,
        exposureStartDate: "2026-09-01",
        exposureDays: 21,
        qualifyingSuccessfulSessions: 1,
        reasonCode: "successful_session_gate_pending",
      });
    expect(recommendation({
      nowDate: "2026-09-22",
      sessions: [...oneAtSeven, session("2026-09-22", { reps: 7 })],
      trainingStrategy: explicit,
    })).toMatchObject({
      status: TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY,
      exposureStartDate: "2026-09-01",
      qualifyingSuccessfulSessions: 2,
      recommendedReps: 8,
      progressionStep: { kind: "reps" },
    });
  });

  it("requires top-range confirmations before a load step and never counts lower-rep successes", () => {
    const explicit = strategy({
      repIncrement: 1,
      repRange: { minimum: 8, maximum: 10 },
      workingSetsRequired: 4,
    });
    const sessions = [
      session("2026-09-01", { reps: 9 }),
      session("2026-09-08", { reps: 9 }),
      session("2026-09-22", { reps: 10 }),
    ];
    expect(recommendation({ nowDate: "2026-09-22", sessions, trainingStrategy: explicit }))
      .toMatchObject({
        status: TRAINING_LOGGER_PROGRESSION_STATUS.ON_PACE,
        exposureStartDate: "2026-09-01",
        qualifyingSuccessfulSessions: 1,
        progressionStep: { kind: "none" },
      });
  });

  it("rep progression preserves exposure while a new load starts a new exposure window", () => {
    const explicit = strategy({
      repIncrement: 1,
      repRange: { minimum: 8, maximum: 10 },
      workingSetsRequired: 4,
    });
    const sessions = [
      session("2026-09-01", { reps: 8 }),
      session("2026-09-08", { reps: 8 }),
      session("2026-09-15", { reps: 9 }),
      session("2026-09-22", { load: 160, reps: 8 }),
      session("2026-09-29", { load: 160, reps: 8 }),
    ];
    expect(recommendation({ nowDate: "2026-10-06", sessions, trainingStrategy: explicit }))
      .toMatchObject({
        exposureStartDate: "2026-09-22",
        exposureDays: 14,
        qualifyingSuccessfulSessions: 2,
        recommendedLoad: 160,
        recommendedReps: 9,
        progressionStep: { kind: "reps" },
      });
  });

  it("keeps top-range load progression targetless when no safe increment is supported", () => {
    const sessions = ["2026-09-01", "2026-09-15"].map((date) => session(date));
    expect(recommendation({
      nowDate: "2026-09-15",
      sessions,
      trainingStrategy: strategy({
        repIncrement: 1,
        repRange: { minimum: 8, maximum: 10 },
        workingSetsRequired: 4,
      }),
    })).toMatchObject({
      recommendedAction: "consider_progression",
      recommendedLoad: null,
      recommendedReps: null,
      progressionStep: { kind: "load", nextLoad: null, nextRepTarget: 8 },
      targetSelection: { policy: "no_evidence_supported_load_increment" },
    });
  });

  it("resets comparable prescription evidence at the active protocol version effective date", () => {
    const explicit = strategy({
      repIncrement: 1,
      repRange: { minimum: 6, maximum: 8 },
      workingSetsRequired: 4,
    });
    explicit.progressionAuthority = {
      protocolVersionId: "training_v3",
      effectiveAt: "2026-09-15T00:00:00Z",
    };
    const sessions = [
      session("2026-09-01", { reps: 7 }),
      session("2026-09-15", { reps: 7 }),
    ];
    expect(recommendation({ nowDate: "2026-09-29", sessions, trainingStrategy: explicit }))
      .toMatchObject({
        status: TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT,
        reasonCode: "insufficient_comparable_finalized_sessions",
      });
  });

  it("lists only finalized comparable sessions for the requested context", () => {
    const ordinary = session("2026-09-01");
    const pending = { ...session("2026-09-02"), quality: { status: "pending" } };
    const variant = session("2026-09-03", { variant: "Static Hold" });
    const superset = session("2026-09-04", { supersetPartner: "cable_pushdown" });
    const comparable = listComparablePerformances({
      canonicalExerciseId: CABLE,
      sessions: [ordinary, pending, variant, superset],
    });
    expect(comparable).toHaveLength(1);
    expect(comparable[0].sessionId).toBe(ordinary.id);
  });
});

function recommendation(overrides = {}) {
  return createTrainingLoggerProgressionRecommendation({
    canonicalExerciseId: CABLE,
    goalContext: { title: "Build Lean Mass" },
    trainingStrategy: strategy(),
    ...overrides,
  });
}

function strategy({
  action = "increase_load",
  loadResetRepTarget = null,
  minimumExposureDays = 14,
  repIncrement = null,
  repRange = null,
  successfulSessionsRequired = 2,
  workingSetsRequired = null,
} = {}) {
  return {
    progression: {
      defaultRule: {
        type: "double_progression_confirmed_sessions",
        condition: "reach_top_of_rep_range",
        action,
        successfulSessionsRequired,
        minimumExposureDays,
        ...(repRange ? { repRange } : {}),
        ...(repIncrement ? { repIncrement } : {}),
        ...(loadResetRepTarget ? { loadResetRepTarget } : {}),
        ...(workingSetsRequired ? { workingSetsRequired } : {}),
      },
      exerciseOverrides: [],
    },
  };
}

function session(date, {
  load = 150,
  name = "Cable Machine Front Raises",
  reps = 10,
  repsBySet = null,
  sessionId = null,
  setCount = 4,
  storedId = CABLE,
  supersetPartner = null,
  variant = null,
} = {}) {
  const id = sessionId ?? `session_${date}`;
  const exercise = {
    id: `occurrence_${id}`,
    ...(storedId ? { canonicalExerciseId: storedId } : {}),
    name,
    ...(variant ? { executionVariant: variant } : {}),
    sets: Array.from({ length: setCount }, (_, index) => ({
      reps: repsBySet?.[index] ?? reps,
      weight: load,
      weight_unit: "lb",
    })),
  };
  const partner = supersetPartner ? {
    id: `partner_${id}`,
    canonicalExerciseId: supersetPartner,
    name: "Cable Rope Pushdowns",
    sets: [{ reps: 12, weight: 50, weight_unit: "lb" }],
  } : null;
  return {
    id,
    evidence_type: "training",
    observed_at: date,
    exercises: [exercise, partner].filter(Boolean),
    ...(partner ? {
      exerciseRelationshipGroups: [{
        id: `superset_${id}`,
        relationshipType: "superset",
        memberExerciseIds: [exercise.id, partner.id],
        provenance_ref: "test",
      }],
    } : {}),
  };
}
