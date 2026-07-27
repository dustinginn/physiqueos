import { describe, expect, it } from "vitest";
import { createTrainingPerformanceSuccessPresentation } from "./TrainingPerformanceSuccessPresentationService";

describe("TrainingPerformanceSuccessPresentationService", () => {
  it("renders one newly created session-volume achievement", () => {
    const presentation = present([volumeEvent()]);
    expect(presentation).toMatchObject({
      heading: "Workout achievements",
      recordCount: 1,
      summary: "1 new record",
      items: [
        {
          exerciseName: "Cable Rope Pushdowns",
          eventType: "session_volume_pr",
          detail: "New session-volume record: 6,160 lb, up 330 lb.",
        },
      ],
    });
  });

  it("renders reps-at-load semantics without calling it a generic best-set or load PR", () => {
    const presentation = present([repsEvent()]);
    expect(presentation.items[0].detail).toBe(
      "New reps-at-load record: 14 reps at 120 lb. Previous best at this load: 13 reps."
    );
    expect(JSON.stringify(presentation)).not.toMatch(
      /best set|heaviest|strength PR|one-rep|max PR/i
    );
  });

  it("counts records rather than exercises and keeps two event types distinct", () => {
    const presentation = present([
      volumeEvent({ canonicalExerciseName: "EZ Bar Curls" }),
      repsEvent({ canonicalExerciseName: "EZ Bar Curls", load: 65, reps: 15 }),
    ]);
    expect(presentation.summary).toBe("2 new records");
    expect(presentation.items).toHaveLength(2);
    expect(presentation.items.map((item) => item.eventType)).toEqual([
      "session_volume_pr",
      "reps_at_load_pr",
    ]);
  });

  it("uses confirmed-session exercise order and volume-before-reps ordering", () => {
    const presentation = present(
      [
        volumeEvent({ canonicalExerciseName: "Forearm Curls" }),
        repsEvent({ canonicalExerciseName: "EZ Bar Curls", load: 65, reps: 15 }),
        volumeEvent({ canonicalExerciseName: "EZ Bar Curls" }),
      ],
      ["EZ Bar Curls", "Forearm Curls"]
    );
    expect(presentation.items.map((item) => [item.exerciseName, item.eventType])).toEqual([
      ["EZ Bar Curls", "session_volume_pr"],
      ["EZ Bar Curls", "reps_at_load_pr"],
      ["Forearm Curls", "session_volume_pr"],
    ]);
  });

  it("uses deterministic name and event-type fallback ordering", () => {
    const presentation = present(
      [
        repsEvent({ canonicalExerciseName: "Zulu Curls" }),
        repsEvent({ canonicalExerciseName: "Alpha Curls" }),
        volumeEvent({ canonicalExerciseName: "Alpha Curls" }),
      ],
      ["Unrelated Exercise"]
    );
    expect(presentation.items.map((item) => [item.exerciseName, item.eventType])).toEqual([
      ["Alpha Curls", "session_volume_pr"],
      ["Alpha Curls", "reps_at_load_pr"],
      ["Zulu Curls", "reps_at_load_pr"],
    ]);
  });

  it("formats whole and decimal values without noise and preserves non-pound units", () => {
    const presentation = present([
      volumeEvent({
        sessionVolume: 12345,
        currentValue: 12345,
        previousBaselineValue: 12000,
        improvement: 345,
        unit: "kg",
      }),
      repsEvent({ load: 42.5, loadUnit: "kg", reps: 8 }),
    ]);
    expect(presentation.items[0].detail).toContain("12,345 kg, up 345 kg");
    expect(presentation.items[1].detail).toContain("8 reps at 42.5 kg");
  });

  it("omits unsupported improvement copy", () => {
    for (const overrides of [
      { improvement: null },
      { improvement: undefined },
      { improvement: 0 },
      { improvement: -10 },
      { improvement: "invalid" },
      { previousBaselineValue: null },
      { previousBaselineValue: 5800, improvement: 330 },
    ]) {
      expect(
        present([volumeEvent(overrides)]).items[0].detail
      ).toBe("New session-volume record: 6,160 lb.");
    }
  });

  it("ignores existing events and matched-only replay results", () => {
    const review = reviewFixture({
      outcome: "matched",
      newlyCreatedEvents: [volumeEvent()],
      existingEvents: [volumeEvent()],
    });
    expect(createTrainingPerformanceSuccessPresentation(review)).toBeNull();
  });

  it("preserves the persisted original receipt across route refresh without duplication", () => {
    const review = reviewFixture({
      outcome: "created",
      newlyCreatedEvents: [volumeEvent(), volumeEvent()],
      existingEvents: [],
    });
    const first = createTrainingPerformanceSuccessPresentation(review);
    const refreshed = createTrainingPerformanceSuccessPresentation(
      structuredClone(review)
    );
    expect(first).toEqual(refreshed);
    expect(refreshed.items).toHaveLength(1);
  });

  it.each([
    ["missing list", undefined],
    ["empty list", []],
  ])("preserves generic success for %s", (_label, newlyCreatedEvents) => {
    expect(
      createTrainingPerformanceSuccessPresentation(
        reviewFixture({ newlyCreatedEvents })
      )
    ).toBeNull();
  });

  it("omits malformed and unsupported events while retaining valid events", () => {
    const presentation = present([
      null,
      { eventType: "session_volume_pr", canonicalExerciseName: "", sessionVolume: 100, unit: "lb" },
      { eventType: "session_volume_pr", canonicalExerciseName: "Bad", sessionVolume: null, unit: "lb" },
      { eventType: "future_pr", canonicalExerciseName: "Future", currentValue: 1 },
      volumeEvent(),
    ]);
    expect(presentation.items).toHaveLength(1);
    expect(presentation.items[0].exerciseName).toBe("Cable Rope Pushdowns");
  });

  it("preserves generic success when every event is invalid", () => {
    expect(
      present([
        { eventType: "future_pr", canonicalExerciseName: "Future" },
        { eventType: "reps_at_load_pr", canonicalExerciseName: "Incomplete" },
      ])
    ).toBeNull();
  });

  it("preserves non-Training confirmation behavior", () => {
    const review = reviewFixture({ newlyCreatedEvents: [volumeEvent()] });
    review.interpretedEvidence.evidence_objects = [
      { evidence_type: "nutrition", observed_at: "2026-07-25" },
    ];
    expect(createTrainingPerformanceSuccessPresentation(review)).toBeNull();
  });

  it("renders the six-event July 25 receipt without Spider Curls or duplicates", () => {
    const events = [
      volumeEvent({ canonicalExerciseName: "EZ Bar Curls", sessionVolume: 3700, currentValue: 3700 }),
      repsEvent({ canonicalExerciseName: "EZ Bar Curls", reps: 15, load: 65 }),
      volumeEvent(),
      volumeEvent({ canonicalExerciseName: "Straight Bar Cable Pushdowns", sessionVolume: 6720, currentValue: 6720 }),
      repsEvent(),
      volumeEvent({ canonicalExerciseName: "Forearm Curls", sessionVolume: 8720, currentValue: 8720 }),
      repsEvent(),
    ];
    const presentation = present(events, [
      "Spider Curls",
      "EZ Bar Curls",
      "Cable Rope Pushdowns",
      "Straight Bar Cable Pushdowns",
      "Forearm Curls",
    ]);
    expect(presentation.recordCount).toBe(6);
    expect(presentation.items.filter((item) => item.eventType === "session_volume_pr")).toHaveLength(4);
    expect(presentation.items.filter((item) => item.eventType === "reps_at_load_pr")).toHaveLength(2);
    expect(presentation.items.map((item) => item.exerciseName)).not.toContain("Spider Curls");
  });
});

function present(events, exerciseOrder) {
  return createTrainingPerformanceSuccessPresentation(
    reviewFixture({ newlyCreatedEvents: events, exerciseOrder })
  );
}

function reviewFixture({
  newlyCreatedEvents = [],
  existingEvents = [],
  outcome = "created",
  exerciseOrder = ["Cable Rope Pushdowns", "Straight Bar Cable Pushdowns"],
} = {}) {
  return {
    status: "confirmed",
    interpretedEvidence: {
      evidence_objects: [
        {
          evidence_type: "training",
          observed_at: "2026-07-25",
          exercises: exerciseOrder.map((name) => ({ name, sets: [] })),
        },
      ],
    },
    commitProgress: {
      training_performance_events: {
        status: "completed",
        result: {
          status: "completed",
          outcome,
          newlyCreatedEvents,
          existingEvents,
        },
      },
    },
  };
}

function volumeEvent(overrides = {}) {
  return {
    id: "volume-event",
    eventType: "session_volume_pr",
    canonicalExerciseName: "Cable Rope Pushdowns",
    sessionVolume: 6160,
    currentValue: 6160,
    previousBaselineValue: 5830,
    improvement: 330,
    unit: "lb",
    ...overrides,
  };
}

function repsEvent(overrides = {}) {
  return {
    id: "reps-event",
    eventType: "reps_at_load_pr",
    canonicalExerciseName: "Straight Bar Cable Pushdowns",
    reps: 14,
    currentValue: 14,
    previousBaselineValue: 13,
    improvement: 1,
    load: 120,
    loadUnit: "lb",
    unit: "reps",
    ...overrides,
  };
}
