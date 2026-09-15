import { describe, expect, it } from "vitest";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";

// Build 33: proves the fix for the Founder-observed defect where a
// structured Workout Logger strength session and an independently
// confirmed Apple Watch strength-workout screenshot for the SAME physical
// workout produced TWO canonical TrainingSessions instead of one
// reconciled session. See CanonicalEvidenceService.js's
// `isOpenAppleStrengthTelemetry`/`isOpenStructuredTrainingSession`/
// `findOpenWorkoutLoggerAppleHealthMatch` for the matching rule.

const userId = "founder";

function structuredSession(overrides = {}) {
  return {
    id: "training_logger_session_1",
    evidence_type: "training",
    observed_at: "2026-09-14",
    metadata: {
      activity_type: "Traditional Strength Training",
      logger_mode: "live",
      logger_origin: "training_logger",
      source_workout_id: null,
    },
    exercises: [{
      id: "ex1",
      canonicalExerciseId: "leg_press_feet_middle",
      name: "Leg Press (Feet Middle)",
      sets: [{
        id: "s1", set_number: 1, reps: 15, weight: 225, weight_unit: "lb",
        load_type: "external_load", measurement_type: "weighted_reps",
      }],
    }],
    provenance: { source_artifact_refs: ["training_logger_draft_1"] },
    source: { modality: "manual", application: "Training Logger" },
    quality: { status: "complete", limitations: [] },
    ...overrides,
  };
}

function appleTelemetry(overrides = {}) {
  return {
    id: "apple-screenshot-1",
    evidence_type: "training",
    observed_at: "2026-09-14",
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: "2026-09-14T07:45:00.000Z",
      end_time: "2026-09-14T08:44:00.000Z",
      duration_seconds: 3540,
      active_calories: 438,
      average_heart_rate: 121,
    },
    exercises: [],
    provenance: { source_artifact_refs: ["apple-screenshot-1.png"] },
    source: { application: "Apple Fitness", integration: "apple_health_screenshot_interpretation" },
    quality: { status: "complete" },
    ...overrides,
  };
}

function canonicalOf(payload, overrides = {}) {
  return {
    canonicalId: `training|evidence|${payload.id}`,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T09:00:00.000Z",
    evidence_type: "training",
    firstObservedAt: payload.observed_at,
    lastObservedAt: payload.observed_at,
    payload,
    provenance: {
      source_artifact_refs: payload.provenance.source_artifact_refs,
      evidence_package_ids: ["earlier-package"],
    },
    quality: { status: "active" },
    userId,
    ...overrides,
  };
}

function activeTrainingObjects(objects) {
  return objects.filter((object) => object.quality?.status !== "superseded" && object.evidence_type === "training");
}

describe("Workout Logger + Apple Health same-day strength reconciliation", () => {
  it("merges a later Apple strength telemetry confirmation into the existing structured session as ONE canonical TrainingSession", () => {
    const existing = [canonicalOf(structuredSession())];
    const evidencePackage = { package_id: "apple-package-1", userId, evidence_objects: [appleTelemetry()] };

    const result = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });

    const active = result.changedObjects.filter((object) => object.quality?.status === "active");
    const superseded = result.changedObjects.filter((object) => object.quality?.status === "superseded");
    expect(active).toHaveLength(1);
    expect(superseded).toHaveLength(1);
    expect(superseded[0].canonicalId).toBe("training|evidence|training_logger_session_1");

    const merged = active[0].payload;
    expect(merged.exercises).toHaveLength(1);
    expect(merged.exercises[0].canonicalExerciseId).toBe("leg_press_feet_middle");
    expect(merged.metadata.start_time).toBe("2026-09-14T07:45:00.000Z");
    expect(merged.metadata.end_time).toBe("2026-09-14T08:44:00.000Z");
    expect(merged.metadata.active_calories).toBe(438);
    expect(merged.metadata.average_heart_rate).toBe(121);
    expect(merged.metadata.logger_mode).toBe("live");
    expect(merged.provenance.source_artifact_refs).toEqual(expect.arrayContaining([
      "training_logger_draft_1", "apple-screenshot-1.png",
    ]));
  });

  it("merges correctly in the reverse confirmation order — Apple telemetry confirmed first, structured session confirmed second", () => {
    const existing = [canonicalOf(appleTelemetry())];
    const evidencePackage = { package_id: "logger-package-1", userId, evidence_objects: [structuredSession()] };

    const result = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });

    const active = result.changedObjects.filter((object) => object.quality?.status === "active");
    expect(active).toHaveLength(1);
    const merged = active[0].payload;
    expect(merged.exercises).toHaveLength(1);
    expect(merged.metadata.start_time).toBe("2026-09-14T07:45:00.000Z");
    expect(merged.metadata.active_calories).toBe(438);
  });

  it("does not merge, and does not touch either session, when the Founder has two genuinely distinct open strength sessions that day", () => {
    const sessionA = structuredSession({ id: "training_logger_session_A" });
    const sessionB = structuredSession({
      id: "training_logger_session_B",
      exercises: [{
        id: "ex2", canonicalExerciseId: "pendulum_squat_machine", name: "Pendulum Squat Machine",
        sets: [{ id: "s2", set_number: 1, reps: 11, weight: 55, weight_unit: "lb", load_type: "external_load", measurement_type: "weighted_reps" }],
      }],
      provenance: { source_artifact_refs: ["training_logger_draft_B"] },
    });
    const existing = [canonicalOf(sessionA), canonicalOf(sessionB)];
    const evidencePackage = { package_id: "apple-package-ambiguous", userId, evidence_objects: [appleTelemetry()] };

    const result = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });

    expect(result.report.addedCanonicalIds).toHaveLength(1);
    expect(result.report.supersededCanonicalIds).toHaveLength(0);
    const allActive = activeTrainingObjects([...existing, ...result.changedObjects]);
    expect(new Set(allActive.map((object) => object.canonicalId)).size).toBe(3);
  });

  it("does not merge a separate cardio workout on the same day into the strength session", () => {
    const existing = [canonicalOf(structuredSession())];
    const walk = appleTelemetry({
      id: "apple-walk-1",
      metadata: {
        activity_type: "Outdoor Walk",
        start_time: "2026-09-14T18:00:00.000Z",
        end_time: "2026-09-14T18:30:00.000Z",
        duration_seconds: 1800,
      },
    });
    const evidencePackage = { package_id: "apple-walk-package", userId, evidence_objects: [walk] };

    const result = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });

    expect(result.report.addedCanonicalIds).toHaveLength(1);
    expect(result.report.supersededCanonicalIds).toHaveLength(0);
  });

  it("keeps replayed Apple telemetry confirmation idempotent after a merge (no third canonical object)", () => {
    const existing = [canonicalOf(structuredSession())];
    const evidencePackage = { package_id: "apple-package-1", userId, evidence_objects: [appleTelemetry()] };

    const first = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });
    const changedIds = new Set(first.changedObjects.map((object) => object.canonicalId));
    const afterFirst = [
      ...existing.filter((object) => !changedIds.has(object.canonicalId)),
      ...first.changedObjects,
    ];

    const second = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: afterFirst, userId });
    expect(second.changedObjects).toHaveLength(0);
  });
});
