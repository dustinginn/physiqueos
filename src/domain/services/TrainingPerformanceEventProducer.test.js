import { describe, expect, it } from "vitest";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";

const SESSION_ID = "training_2026-07-25_traditional_strength_training_1";
const CANONICAL_ID =
  "training|2026-07-25|traditional strength training|||6108||527";
const ANALYSIS_ID =
  "analysis_training_evidence_submission_20260726021441961_images";

describe("TrainingPerformanceEventProducer", () => {
  it("produces one current-session volume event and one reps-at-load event", () => {
    const events = produce({
      exercises: [exercise("EZ Bar Curls", [[13, 70], [15, 65]])],
      observations: [
        observation("ez_bar_curl", "EZ Bar Curls", [
          volumePr(3700, 3380),
          repsPr(15, 65, 13),
        ], 3700),
      ],
    });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "reps_at_load_pr",
      "session_volume_pr",
    ]);
    expect(events.find((event) => event.eventType === "session_volume_pr")).toMatchObject({
      currentValue: 3700,
      previousBaselineValue: 3380,
      improvement: 320,
      sessionVolume: 3700,
    });
    expect(events.find((event) => event.eventType === "reps_at_load_pr")).toMatchObject({
      currentValue: 15,
      previousBaselineValue: 13,
      improvement: 2,
      load: 65,
      reps: 15,
    });
  });

  it("deduplicates repeated identical qualifying sets while retaining distinct achievements", () => {
    const events = produce({
      exercises: [exercise("EZ Bar Curls", [[15, 65], [15, 65], [12, 70]])],
      observations: [
        observation("ez_bar_curl", "EZ Bar Curls", [
          repsPr(15, 65, 13),
          repsPr(15, 65, 13),
          repsPr(12, 70, 10),
        ], 3000),
      ],
    });
    expect(events).toHaveLength(2);
    expect(events.map((event) => [event.reps, event.load]).sort()).toEqual([
      [12, 70],
      [15, 65],
    ]);
  });

  it("does not produce tied volume or tied reps-at-load events", () => {
    expect(
      produce({
        exercises: [exercise("Spider Curls", [[14, 40]])],
        observations: [
          observation("spider_curl", "Spider Curls", [
            volumePr(2240, 2240),
            repsPr(14, 40, 14),
          ], 2240),
        ],
      })
    ).toEqual([]);
  });

  it("ignores a non-current historical descriptor and a report with no PRs", () => {
    expect(
      produce({
        exercises: [exercise("Spider Curls", [[14, 40]])],
        observations: [
          observation(
            "spider_curl",
            "Spider Curls",
            [volumePr(2240, 2000)],
            2240,
            { date: "2026-07-22", sessionId: "historical" }
          ),
        ],
      })
    ).toEqual([]);
    expect(
      produce({
        exercises: [exercise("Spider Curls", [[14, 40]])],
        observations: [observation("spider_curl", "Spider Curls", [], 2240)],
      })
    ).toEqual([]);
  });

  it("produces exactly the six deduplicated July 25 events", () => {
    const events = produce(july25Fixture());
    expect(events).toHaveLength(6);
    expect(events.filter((event) => event.eventType === "session_volume_pr")).toHaveLength(4);
    expect(events.filter((event) => event.eventType === "reps_at_load_pr")).toHaveLength(2);
    expect(events.map((event) => [event.canonicalExerciseId, event.eventType])).toEqual(
      expect.arrayContaining([
        ["ez_bar_curl", "session_volume_pr"],
        ["ez_bar_curl", "reps_at_load_pr"],
        ["cable_pushdown", "session_volume_pr"],
        ["straight_bar_cable_pushdown", "session_volume_pr"],
        ["straight_bar_cable_pushdown", "reps_at_load_pr"],
        ["forearm_curl", "session_volume_pr"],
      ])
    );
    expect(new Set(events.map((event) => event.id))).toHaveLength(6);
    expect(events.every((event) => event.sourceSessionId === SESSION_ID)).toBe(true);
  });

  it("uses deterministic event IDs independent of creation time", () => {
    const input = {
      exercises: [exercise("Cable Rope Pushdowns", [[14, 110]])],
      observations: [
        observation("cable_pushdown", "Cable Rope Pushdowns", [
          volumePr(6160, 5830),
        ], 6160),
      ],
    };
    const first = produce(input, "2026-07-26T02:31:00.000Z");
    const second = produce(input, "2026-08-01T00:00:00.000Z");
    expect(first[0].id).toBe(second[0].id);
  });

  it("carries independent Variant and Superset context into durable events", () => {
    const variant = {
      key: "static_hold",
      label: "Static Hold",
      rawLabel: "Static Hold",
    };
    const relationshipContext = {
      relationship_type: "superset",
      member_index: 0,
      ordered_partners: [{
        canonical_exercise_id: "cable_pushdown",
        name: "Cable Rope Pushdowns",
      }],
    };
    const events = produce({
      exercises: [
        exercise("Spider Curls", [[15, 35]], {
          canonicalExerciseId: "spider_curl",
          executionVariant: variant,
          id: "spider",
        }),
        exercise("Cable Rope Pushdowns", [[15, 50]], {
          canonicalExerciseId: "cable_pushdown",
          id: "pushdown",
        }),
      ],
      exerciseRelationshipGroups: [{
        id: "superset_1",
        relationshipType: "superset",
        memberExerciseIds: ["spider", "pushdown"],
      }],
      observations: [observation("spider_curl", "Spider Curls", [
        repsPr(15, 35, 13),
      ], 525, {
        executionVariant: variant,
        relationshipContext,
      })],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      executionVariant: { key: "static_hold", label: "Static Hold" },
      relationshipContext: {
        relationshipType: "superset",
        orderedPartners: [
          expect.objectContaining({ canonicalExerciseId: "cable_pushdown" }),
        ],
      },
    });
  });
});

function produce(
  { exerciseRelationshipGroups = [], exercises, observations },
  timestamp = "2026-07-26T02:31:00.000Z"
) {
  return produceTrainingPerformanceEvents({
    canonicalTrainingSession: {
      canonicalId: CANONICAL_ID,
      payload: {
        id: SESSION_ID,
        evidence_type: "training",
        observed_at: "2026-07-25",
        exercises,
        ...(exerciseRelationshipGroups.length ? { exerciseRelationshipGroups } : {}),
      },
    },
    trainingAnalysis: {
      id: ANALYSIS_ID,
      metadata: { trainingPerformance: { exerciseObservations: observations } },
    },
    sourceReviewId: "evidence_review_20260726021515848",
    sourceEvidencePackageId: "evidence_submission_20260726021441961_images",
    now: () => new Date(timestamp),
  });
}

function observation(key, name, prs, totalVolume, overrides = {}) {
  return {
    exercise: { key, name },
    explanation_data: {
      last_session: {
        date: overrides.date ?? "2026-07-25",
        session_id: overrides.sessionId ?? SESSION_ID,
        total_volume: totalVolume,
        ...(overrides.executionVariant
          ? { execution_variant: overrides.executionVariant }
          : {}),
        ...(overrides.relationshipContext
          ? { relationship_context: overrides.relationshipContext }
          : {}),
      },
      pr_detection: { detected: prs.length > 0, prs },
    },
  };
}

function exercise(name, sets, context = {}) {
  return {
    ...context,
    name,
    sets: sets.map(([reps, weight], index) => ({
      set_number: index + 1,
      reps,
      weight,
      weight_unit: "lb",
    })),
  };
}

function volumePr(value, previousBest) {
  return { type: "session_volume", value, previous_best: previousBest, unit: "lb" };
}

function repsPr(value, load, previousBest) {
  return {
    type: "reps_at_load",
    value,
    previous_best: previousBest,
    load,
    load_unit: "lb",
    unit: "reps",
  };
}

function july25Fixture() {
  return {
    exercises: [
      exercise("Spider Curls", [[14, 40], [14, 40], [14, 40], [14, 40]]),
      exercise("EZ Bar Curls", [[13, 70], [12, 70], [15, 65], [15, 65]]),
      exercise("Cable Rope Pushdowns", [[14, 110], [14, 110], [14, 110], [14, 110]]),
      exercise("Straight Bar Cable Pushdowns", [[14, 120], [14, 120], [14, 120], [14, 120]]),
      exercise("Forearm Curls", [[30, 80], [28, 80], [25, 80], [26, 80]]),
    ],
    observations: [
      observation("spider_curl", "Spider Curls", [], 2240),
      observation("ez_bar_curl", "EZ Bar Curls", [
        repsPr(15, 65, 13),
        repsPr(15, 65, 13),
        volumePr(3700, 3380),
      ], 3700),
      observation("cable_pushdown", "Cable Rope Pushdowns", [
        volumePr(6160, 5830),
      ], 6160),
      observation("straight_bar_cable_pushdown", "Straight Bar Cable Pushdowns", [
        repsPr(14, 120, 13),
        repsPr(14, 120, 13),
        repsPr(14, 120, 13),
        repsPr(14, 120, 13),
        volumePr(6720, 6240),
      ], 6720),
      observation("forearm_curl", "Forearm Curls", [
        volumePr(8720, 7680),
      ], 8720),
    ],
  };
}
