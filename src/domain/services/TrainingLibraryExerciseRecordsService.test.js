import { describe, expect, it } from "vitest";
import { createTrainingPerformanceEvent } from "../models/trainingPerformanceEvent";
import {
  createTrainingLibraryExerciseRecordsReadModel,
  TRAINING_LIBRARY_RECORD_LIMIT,
} from "./TrainingLibraryExerciseRecordsService";

describe("Training Library exercise records read model", () => {
  it("maps one matching session-volume event", () => {
    const model = compose("cable_pushdown", [volume()]);
    expect(model).toMatchObject({
      heading: "Performance Records",
      canonicalExerciseId: "cable_pushdown",
      visibleCount: 1,
      totalCount: 1,
      hiddenCount: 0,
      countLabel: null,
    });
    expect(model.records[0]).toMatchObject({
      title: "Session volume record",
      value: "6,160 lb",
      detail: "Previous: 5,830 lb · Improved by 330 lb",
      workoutDate: "2026-07-25",
    });
  });

  it("maps one matching reps-at-load event", () => {
    expect(compose("ez_bar_curl", [reps()]).records[0]).toMatchObject({
      title: "Reps-at-load record",
      value: "15 reps at 65 lb",
      detail: "Previous: 13 reps at this load",
    });
  });

  it("keeps Variant and relationship context as secondary record metadata", () => {
    const event = volume({
      exerciseId: "spider_curl",
      exerciseName: "Spider Curls",
      executionVariant: {
        key: "static_hold",
        label: "Static Hold",
        rawLabel: "Static Hold",
      },
      relationshipContext: {
        relationshipType: "superset",
        memberIndex: 0,
        orderedPartners: [{
          canonicalExerciseId: "cable_pushdown",
          name: "Cable Rope Pushdowns",
        }],
      },
    });
    expect(compose("spider_curl", [event]).records[0]).toMatchObject({
      canonicalExerciseId: "spider_curl",
      executionVariant: { key: "static_hold", label: "Static Hold" },
      relationshipContext: {
        relationshipType: "superset",
        orderedPartners: [
          expect.objectContaining({ canonicalExerciseId: "cable_pushdown" }),
        ],
      },
    });
  });

  it("keeps both event types distinct and puts volume first on the same date", () => {
    const model = compose("ez_bar_curl", [
      reps(),
      volume({ exerciseId: "ez_bar_curl", exerciseName: "EZ Bar Curls", value: 3700, baseline: 3380 }),
    ]);
    expect(model.records.map((item) => item.achievementType)).toEqual([
      "session_volume_pr",
      "reps_at_load_pr",
    ]);
  });

  it("matches exact canonical IDs and isolates duplicate display names", () => {
    const model = compose("exercise_a", [
      volume({ exerciseId: "exercise_a", exerciseName: "Shared Name" }),
      volume({ exerciseId: "exercise_b", exerciseName: "Shared Name" }),
    ]);
    expect(model.records).toHaveLength(1);
    expect(model.records[0].canonicalExerciseId).toBe("exercise_a");
  });

  it("orders by workout date, type, achieved value, and event ID independent of insertion", () => {
    const events = [
      reps({ workoutDate: "2026-07-24", reps: 18, load: 65 }),
      reps({ workoutDate: "2026-07-25", reps: 14, load: 70 }),
      volume({ exerciseId: "ez_bar_curl", exerciseName: "EZ Bar Curls", workoutDate: "2026-07-25", value: 3700, baseline: 3380 }),
      reps({ workoutDate: "2026-07-25", reps: 15, load: 65 }),
    ];
    const forward = compose("ez_bar_curl", events);
    const reverse = compose("ez_bar_curl", [...events].reverse());
    expect(forward).toEqual(reverse);
    expect(forward.records.map((item) => [item.workoutDate, item.achievementType, item.achievedValue])).toEqual([
      ["2026-07-25", "session_volume_pr", 3700],
      ["2026-07-25", "reps_at_load_pr", 15],
      ["2026-07-25", "reps_at_load_pr", 14],
      ["2026-07-24", "reps_at_load_pr", 18],
    ]);
  });

  it("exposes workoutDate and ignores a later reconciliation timestamp", () => {
    const item = compose("cable_pushdown", [
      volume({ workoutDate: "2026-07-18", createdAt: "2026-08-10T00:00:00Z" }),
    ]).records[0];
    expect(item.workoutDate).toBe("2026-07-18");
    expect(item).not.toHaveProperty("createdAt");
  });

  it("formats thousands, decimal loads, and non-pound units", () => {
    const model = compose("metric", [
      volume({ exerciseId: "metric", exerciseName: "Metric", value: 1234.5, baseline: 1200, unit: "kg" }),
      reps({ exerciseId: "metric", exerciseName: "Metric", load: 22.5, loadUnit: "kg" }),
    ]);
    expect(model.records[0]).toMatchObject({
      value: "1,234.5 kg",
      detail: "Previous: 1,200 kg · Improved by 34.5 kg",
    });
    expect(model.records[1].value).toBe("15 reps at 22.5 kg");
  });

  it("omits invalid previous and improvement copy safely", () => {
    const volumeEvent = volume();
    volumeEvent.previousBaselineValue = null;
    volumeEvent.improvement = null;
    const repsEvent = reps();
    repsEvent.previousBaselineValue = null;
    const volumeItem = compose("cable_pushdown", [volumeEvent]).records[0];
    const repsItem = compose("ez_bar_curl", [repsEvent]).records[0];
    expect(volumeItem.detail).toBeNull();
    expect(repsItem.detail).toBeNull();
  });

  it("deduplicates IDs and omits malformed or unsupported records", () => {
    const valid = volume();
    const model = compose("cable_pushdown", [
      valid,
      structuredClone(valid),
      { ...volume(), schemaVersion: "training_performance_event_v2", id: "future" },
      { ...volume(), eventType: "estimated_1rm_pr", id: "unsupported" },
      { ...volume(), sessionVolume: null, id: "malformed" },
    ]);
    expect(model.records).toHaveLength(1);
  });

  it("returns no section when no valid matching record exists", () => {
    expect(compose("spider_curl", [volume()])).toBeNull();
    expect(compose("spider_curl", [])).toBeNull();
  });

  it("limits the history to five and retains total and hidden counts", () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      volume({
        workoutDate: `2026-07-${String(25 - index).padStart(2, "0")}`,
        value: 7000 - index,
        baseline: 6000 - index,
      })
    );
    const model = compose("cable_pushdown", events);
    expect(model.records).toHaveLength(TRAINING_LIBRARY_RECORD_LIMIT);
    expect(model).toMatchObject({
      visibleCount: 5,
      totalCount: 8,
      hiddenCount: 3,
      countLabel: "Showing 5 of 8 records",
    });
  });

  it("renders the exact July 25 event distribution by exercise", () => {
    const fixtures = july25Events();
    expect(compose("ez_bar_curl", fixtures).records).toHaveLength(2);
    expect(compose("straight_bar_cable_pushdown", fixtures).records).toHaveLength(2);
    expect(compose("cable_pushdown", fixtures).records).toHaveLength(1);
    expect(compose("forearm_curl", fixtures).records).toHaveLength(1);
    expect(compose("spider_curl", fixtures)).toBeNull();
  });
});

function compose(canonicalExerciseId, events) {
  return createTrainingLibraryExerciseRecordsReadModel({
    canonicalExerciseId,
    events,
  });
}

function volume({
  exerciseId = "cable_pushdown",
  exerciseName = "Cable Rope Pushdowns",
  workoutDate = "2026-07-25",
  createdAt = "2026-07-26T02:31:00.342Z",
  value = 6160,
  baseline = 5830,
  unit = "lb",
  executionVariant = null,
  relationshipContext = null,
} = {}) {
  return { ...createTrainingPerformanceEvent({
    eventType: "session_volume_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: `canonical_${workoutDate}`,
    sourceSessionId: `session_${workoutDate}`,
    sourceAnalysisId: "analysis",
    workoutDate,
    canonicalExerciseId: exerciseId,
    canonicalExerciseName: exerciseName,
    currentValue: value,
    executionVariant,
    previousBaselineValue: baseline,
    relationshipContext,
    sessionVolume: value,
    unit,
    createdAt,
  }) };
}

function reps({
  exerciseId = "ez_bar_curl",
  exerciseName = "EZ Bar Curls",
  workoutDate = "2026-07-25",
  createdAt = "2026-07-26T02:31:00.342Z",
  reps: count = 15,
  baseline = 13,
  load = 65,
  loadUnit = "lb",
} = {}) {
  return { ...createTrainingPerformanceEvent({
    eventType: "reps_at_load_pr",
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: `canonical_${workoutDate}`,
    sourceSessionId: `session_${workoutDate}`,
    sourceAnalysisId: "analysis",
    workoutDate,
    canonicalExerciseId: exerciseId,
    canonicalExerciseName: exerciseName,
    currentValue: count,
    previousBaselineValue: baseline,
    load,
    loadUnit,
    reps: count,
    unit: "reps",
    createdAt,
  }) };
}

function july25Events() {
  return [
    volume({ exerciseId: "ez_bar_curl", exerciseName: "EZ Bar Curls", value: 3700, baseline: 3380 }),
    reps(),
    volume(),
    volume({ exerciseId: "straight_bar_cable_pushdown", exerciseName: "Straight Bar Cable Pushdowns", value: 6720, baseline: 6240 }),
    reps({ exerciseId: "straight_bar_cable_pushdown", exerciseName: "Straight Bar Cable Pushdowns", reps: 14, load: 120 }),
    volume({ exerciseId: "forearm_curl", exerciseName: "Forearm Curls", value: 8720, baseline: 7680 }),
  ];
}
