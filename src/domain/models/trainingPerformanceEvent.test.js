import { describe, expect, it } from "vitest";
import {
  getTrainingPerformanceEventIdentity,
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
