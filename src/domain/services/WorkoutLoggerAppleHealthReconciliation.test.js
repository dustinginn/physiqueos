import { describe, expect, it } from "vitest";
import { auditHistoricalWorkoutLoggerApplePairs, reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";

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
  it("does not treat a non-Apple telemetry observation as Apple evidence", () => {
    const existing = [canonicalOf(structuredSession())];
    const telemetry = appleTelemetry({ source: { application: "Another workout provider" } });
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: { package_id: "non-apple", userId, evidence_objects: [telemetry] }, existingCanonicalObjects: existing, userId });
    expect(result.report.supersededCanonicalIds).toHaveLength(0);
  });

  it("does not merge an exercise-bearing cardio session into Apple strength", () => {
    const cardio = structuredSession({ metadata: { activity_type: "Outdoor Walk" } });
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: { package_id: "apple", userId, evidence_objects: [appleTelemetry()] }, existingCanonicalObjects: [canonicalOf(cardio)], userId });
    expect(result.report.supersededCanonicalIds).toHaveLength(0);
  });

  it("audits historical mutual uniqueness without modifying any record and excludes ambiguity/cardio/other owners", () => {
    const records = [
      canonicalOf(structuredSession()), canonicalOf(appleTelemetry()),
      canonicalOf(structuredSession({ id: "ambiguous-a", observed_at: "2026-09-13" })),
      canonicalOf(structuredSession({ id: "ambiguous-b", observed_at: "2026-09-13" })),
      canonicalOf(appleTelemetry({ id: "ambiguous-apple", observed_at: "2026-09-13" })),
      canonicalOf(appleTelemetry({ id: "walk", metadata: { activity_type: "Outdoor Walk", start_time: "2026-09-14T10:00:00Z" } })),
      canonicalOf(structuredSession({ id: "other-owner" }), { userId: "someone-else" }),
    ];
    const before = JSON.stringify(records);
    const audit = auditHistoricalWorkoutLoggerApplePairs({ canonicalObjects: records, userId });
    expect(audit.candidates).toHaveLength(1);
    expect(audit.candidates[0]).toMatchObject({ date: "2026-09-14", deterministic: true, sameDayStrengthCandidateCount: 2, exerciseCount: 1, setCount: 1 });
    expect(audit.excludedAmbiguous).toHaveLength(2);
    expect(JSON.stringify(records)).toBe(before);
  });

  it.each([false, true])("reconciles a NEW future workout in either confirmation order with relationships and telemetry preserved (Apple first=%s)", (appleFirst) => {
    const logger = structuredSession({ observed_at: "2026-10-01", exerciseRelationshipGroups: [{ id: "superset", relationshipType: "superset", memberExerciseIds: ["ex1", "ex2"] }], exercises: [
      structuredSession().exercises[0],
      { ...structuredSession().exercises[0], id: "ex2", canonicalExerciseId: "leg_extension", name: "Leg Extension" },
    ] });
    const apple = appleTelemetry({ observed_at: "2026-10-01", metadata: { ...appleTelemetry().metadata, start_time: "2026-10-01T07:45:00Z", end_time: "2026-10-01T08:44:00Z" } });
    const existing = [canonicalOf(appleFirst ? apple : logger)];
    const evidencePackage = { package_id: "new-future-workout", userId, evidence_objects: [appleFirst ? logger : apple] };
    const result = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId });
    const changedIds = new Set(result.changedObjects.map((record) => record.canonicalId));
    const after = [...existing.filter((record) => !changedIds.has(record.canonicalId)), ...result.changedObjects];
    const active = activeTrainingObjects(after);
    expect(active).toHaveLength(1);
    expect(active[0].payload.exercises).toHaveLength(2);
    expect(active[0].payload.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(2);
    expect(active[0].payload.exerciseRelationshipGroups).toHaveLength(1);
    expect(active[0].payload.metadata).toMatchObject({ active_calories: 438, average_heart_rate: 121, duration_seconds: 3540 });
    expect(reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: after, userId }).changedObjects).toHaveLength(0);
  });
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
