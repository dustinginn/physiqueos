import { describe, expect, it } from "vitest";
import {
  createTrainingPerformanceEvent,
  getTrainingPerformanceEventIdentity,
  haveSameTrainingPerformanceEventAchievementSemantics,
  haveSameTrainingPerformanceEventSemantics,
  TRAINING_PERFORMANCE_EVENT_TYPES,
} from "./trainingPerformanceEvent";

describe("Training performance event context identity", () => {
  it("keeps the historical ordinary event identity unchanged", () => {
    expect(getTrainingPerformanceEventIdentity({
      canonicalExerciseId: "spider_curl",
      currentValue: 1400,
      eventType: TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR,
      sourceCanonicalTrainingId: "canonical",
      sourceSessionId: "session",
    })).toBe(
      "training_performance_event_v1|canonical|session|spider_curl|session_volume_pr|1400"
    );
  });

  it("distinguishes Variant and relationship-aware achievements", () => {
    expect(getTrainingPerformanceEventIdentity({
      canonicalExerciseId: "spider_curl",
      currentValue: 1400,
      eventType: TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR,
      executionVariant: {
        key: "static_hold",
        label: "Static Hold",
        rawLabel: "Static Hold",
      },
      relationshipContext: {
        relationshipType: "superset",
        orderedPartners: [{ canonicalExerciseId: "cable_pushdown" }],
      },
      sourceCanonicalTrainingId: "canonical",
      sourceSessionId: "session",
    })).toBe([
      "training_performance_event_v1",
      "canonical",
      "session",
      "spider_curl",
      "session_volume_pr",
      "1400",
      "variant:static_hold",
      "relationship:superset|partners:cable_pushdown",
    ].join("|"));
  });
});

describe("Training performance event achievement semantics", () => {
  it("ignores source provenance, creation time, and provider-managed version", () => {
    const original = volumeEvent();
    const replay = {
      ...original,
      sourceReviewId: "later-review",
      sourceEvidencePackageId: "later-package",
      sourceAnalysisId: "later-analysis",
      createdAt: "2026-08-30T12:00:00.000Z",
      version: 5,
    };

    expect(haveSameTrainingPerformanceEventAchievementSemantics(original, replay)).toBe(true);
    expect(haveSameTrainingPerformanceEventSemantics(original, replay)).toBe(false);
  });

  it.each([
    ["workoutDate", "2026-07-24"],
    ["sourceCanonicalTrainingId", "another-canonical-session"],
    ["sourceSessionId", "another-session"],
    ["canonicalExerciseId", "another-exercise"],
    ["canonicalExerciseName", "Another exercise"],
    ["eventType", TRAINING_PERFORMANCE_EVENT_TYPES.REPS_AT_LOAD_PR],
    ["currentValue", 6200],
    ["previousBaselineValue", 5800],
    ["improvement", 360],
    ["unit", "kg"],
    ["load", 100],
    ["loadUnit", "kg"],
    ["reps", 12],
    ["sessionVolume", 6200],
    ["executionVariant", { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" }],
    ["relationshipContext", {
      relationshipType: "superset",
      orderedPartners: [{ canonicalExerciseId: "cable_pushdown" }],
    }],
  ])("retains %s as strict achievement semantics", (field, value) => {
    const original = volumeEvent();
    expect(haveSameTrainingPerformanceEventAchievementSemantics(
      original,
      { ...original, [field]: value }
    )).toBe(false);
  });
});

function volumeEvent() {
  return createTrainingPerformanceEvent({
    eventType: TRAINING_PERFORMANCE_EVENT_TYPES.SESSION_VOLUME_PR,
    sourceReviewId: "review",
    sourceEvidencePackageId: "package",
    sourceCanonicalTrainingId: "canonical-session",
    sourceSessionId: "session",
    sourceAnalysisId: "analysis",
    workoutDate: "2026-07-25",
    canonicalExerciseId: "cable_pushdown",
    canonicalExerciseName: "Cable Rope Pushdowns",
    currentValue: 6160,
    previousBaselineValue: 5830,
    sessionVolume: 6160,
    unit: "lb",
    createdAt: "2026-07-26T02:31:00.000Z",
  });
}
