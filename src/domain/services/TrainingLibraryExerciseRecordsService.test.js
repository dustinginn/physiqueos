import { describe, expect, it } from "vitest";
import { createTrainingPerformanceEvent } from "../models/trainingPerformanceEvent";
import { createTrainingExecutionVariantResolver } from "../models/trainingExecutionVariantDefinition.js";
import {
  createSessionPerformanceRecordsReadModel,
  createTrainingLibraryExerciseRecordsReadModel,
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

  it("selects the strongest active record per semantic family independent of insertion", () => {
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

  it("collapses superseded session-volume history without arbitrary latest-N truncation", () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      volume({
        workoutDate: `2026-07-${String(25 - index).padStart(2, "0")}`,
        value: 7000 - index,
        baseline: 6000 - index,
      })
    );
    const model = compose("cable_pushdown", events);
    expect(model.records).toHaveLength(1);
    expect(model.records[0]).toMatchObject({ achievedValue: 7000, workoutDate: "2026-07-25" });
    expect(model).toMatchObject({
      visibleCount: 1,
      totalCount: 1,
      hiddenCount: 0,
      countLabel: null,
    });
  });

  it("keeps distinct reps-at-load identities while superseding an older PR at the same load", () => {
    const model = compose("ez_bar_curl", [
      reps({ workoutDate: "2026-07-01", reps: 12, baseline: 10, load: 65 }),
      reps({ workoutDate: "2026-07-15", reps: 15, load: 65 }),
      reps({ workoutDate: "2026-07-20", reps: 10, baseline: 8, load: 75 }),
    ]);
    expect(model.records.map((item) => [item.achievedValue, item.value])).toEqual([
      [10, "10 reps at 75 lb"],
      [15, "15 reps at 65 lb"],
    ]);
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

describe("Session performance records read model", () => {
  it("returns an empty list for a session without records", () => {
    expect(createSessionPerformanceRecordsReadModel({ events: [] })).toEqual([]);
    expect(createSessionPerformanceRecordsReadModel()).toEqual([]);
  });

  it("maps one event to the Native TrainingPerformanceRecord shape", () => {
    const event = volume();
    const [record, ...rest] = createSessionPerformanceRecordsReadModel({ events: [event] });
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      id: `training_library_record_${event.id}`,
      sourceEventId: event.id,
      canonicalExerciseId: "cable_pushdown",
      canonicalExerciseName: "Cable Rope Pushdowns",
      achievementType: "session_volume_pr",
      title: "Session volume record",
      value: "6,160 lb",
      previousBaseline: "Previous: 5,830 lb",
      improvement: "Improved by 330 lb",
      detail: "Previous: 5,830 lb · Improved by 330 lb",
      workoutDate: "2026-07-25",
      achievedValue: 6160,
    });
  });

  it("lists every record across exercises without reducing per type, in a deterministic order", () => {
    const events = [
      reps({ reps: 15, baseline: 13, load: 65 }),
      volume({ exerciseId: "ez_bar_curl", exerciseName: "EZ Bar Curls", value: 3000, baseline: 2800 }),
      reps({ reps: 10, baseline: 8, load: 75 }),
      volume(),
    ];
    const forward = createSessionPerformanceRecordsReadModel({ events });
    const reversed = createSessionPerformanceRecordsReadModel({ events: [...events].reverse() });
    expect(reversed).toEqual(forward);
    expect(forward.map((item) => [item.canonicalExerciseName, item.achievementType])).toEqual([
      ["Cable Rope Pushdowns", "session_volume_pr"],
      ["EZ Bar Curls", "session_volume_pr"],
      ["EZ Bar Curls", "reps_at_load_pr"],
      ["EZ Bar Curls", "reps_at_load_pr"],
    ]);
    const repsIds = forward.slice(2).map((item) => item.sourceEventId);
    expect(repsIds).toEqual([...repsIds].sort());
  });

  it("ignores legacy, unsupported, malformed and duplicate rows", () => {
    const valid = volume();
    expect(createSessionPerformanceRecordsReadModel({ events: [
      valid,
      structuredClone(valid),
      null,
      { id: "legacy_pr_row", exerciseId: "cable_pushdown", type: "volume", value: 7000 },
      { ...volume(), schemaVersion: "training_performance_event_v2", id: "future" },
      { ...volume(), eventType: "estimated_1rm_pr", id: "unsupported" },
      { ...volume(), sessionVolume: null, id: "malformed" },
      { ...volume(), canonicalExerciseId: undefined, id: "no_exercise" },
    ] }).map((item) => item.sourceEventId)).toEqual([valid.id]);
  });
});

describe("Performance Records stable variant identity (Build 92)", () => {
  const seeded = {
    id: "tev_pushdown_static_hold", canonicalExerciseId: "cable_pushdown", displayName: "Peak Squeeze", key: "peak_squeeze",
    legacyKeys: ["static_hold"], status: "retired", provenance: "legacy_seed", createdAt: "2026-10-01T00:00:00.000Z",
  };
  const legacy = volume({ workoutDate: "2026-07-25", value: 6000, executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "static hold" } });
  const renamed = volume({ workoutDate: "2026-08-01", value: 6100, executionVariant: { variantId: seeded.id, key: "peak_squeeze", label: "Peak Squeeze", rawLabel: "Peak Squeeze" } });
  const ordinary = volume({ workoutDate: "2026-07-28", value: 9000 });

  it("keeps one record family across a legacy key and a renamed/retired definition, separate from Ordinary", () => {
    const resolved = createTrainingLibraryExerciseRecordsReadModel({
      canonicalExerciseId: "cable_pushdown",
      events: [legacy, renamed, ordinary],
      variantResolver: createTrainingExecutionVariantResolver([seeded]),
    });
    expect(resolved.records).toHaveLength(2);
    expect(resolved.records.map((record) => record.executionVariant?.variantId ?? record.executionVariant?.key ?? "ordinary").sort())
      .toEqual(["ordinary", seeded.id].sort());
    // Without definitions the legacy key grouping is unchanged (the two keys differ).
    expect(compose("cable_pushdown", [legacy, renamed, ordinary]).records).toHaveLength(3);
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
