import { describe, expect, it } from "vitest";
import { createTrainingDayReadModel } from "../../application/training/TrainingReadService.js";
import { composeLoggedTodaySummary } from "./LoggedTodayService.js";
import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService.js";

const USER = "founder";
const DATE = "2026-09-17";
const TARGET = "training|authoritative|training_logger_draft_20A8DDEE-E0E8-42DD-8A27-0CB180743F40";
const COLLIDING_SOURCE = "training|authoritative|Apple Health Screenshot 2.jpg";

function exercises(count, setCounts) {
  return Array.from({ length: count }, (_, index) => ({
    id: `exercise-${index + 1}`,
    canonicalExerciseId: index % 2 === 0 ? "ez_bar_curl" : "cable_pushdown",
    name: index % 2 === 0 ? "EZ Bar Curls" : "Cable Rope Pushdowns",
    body_region: "Arms",
    sets: Array.from({ length: setCounts[index] }, (_unused, setIndex) => ({
      id: `exercise-${index + 1}-set-${setIndex + 1}`,
      set_number: setIndex + 1,
      reps: 10,
      weight: 50,
      weight_unit: "lb",
    })),
  }));
}

function canonical(canonicalId, payload, provenance = {}) {
  return {
    canonicalId,
    createdAt: "2026-09-17T15:54:17.864Z",
    updatedAt: "2026-09-17T15:54:17.864Z",
    evidence_type: "training",
    firstObservedAt: payload.observed_at,
    lastObservedAt: payload.observed_at,
    payload,
    provenance: {
      evidence_package_ids: provenance.evidence_package_ids ?? [],
      source_artifact_refs: provenance.source_artifact_refs ?? [],
      contributing_evidence_object_ids: provenance.contributing_evidence_object_ids ?? [payload.id],
    },
    quality: { status: "active" },
    userId: USER,
  };
}

function structuredLogger() {
  return canonical(TARGET, {
    id: "training_logger_session_20A8DDEE-E0E8-42DD-8A27-0CB180743F40",
    evidence_type: "training",
    observed_at: DATE,
    captured_at: "2026-09-17T12:00:00.000Z",
    metadata: {
      activity_type: "Traditional Strength Training",
      logger_origin: "training_logger",
      logger_mode: "live",
      start_time: "2026-09-17T14:23:38Z",
    },
    exercises: exercises(4, [4, 4, 4, 3]),
    provenance: { source_artifact_refs: ["training_logger_draft_20A8DDEE-E0E8-42DD-8A27-0CB180743F40"] },
    source: { application: "Training Logger", modality: "manual" },
  }, { evidence_package_ids: ["training_logger_submission_20A8DDEE-E0E8-42DD-8A27-0CB180743F40"] });
}

function historicalCollision() {
  return canonical(COLLIDING_SOURCE, {
    id: "training_logger_session_ABB72390-C0D9-46B5-9F3F-939BA2820487",
    evidence_type: "training",
    observed_at: "2026-09-13",
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: "2026-09-15T07:58:00-07:00",
      end_time: "2026-09-15T08:55:00-07:00",
      duration_seconds: 3457,
      active_calories: 288,
      total_calories: 382,
      average_heart_rate: 106,
    },
    exercises: exercises(5, [4, 4, 4, 4, 4]),
    provenance: { source_artifact_refs: ["Apple Health Screenshot 2.jpg"] },
    source: { application: "Apple Fitness", modality: "screenshot" },
  }, { evidence_package_ids: ["older-package"], source_artifact_refs: ["Apple Health Screenshot 2.jpg"] });
}

function strength() {
  return {
    id: "training_2026-09-17_0738_traditional_strength_training",
    evidence_type: "training",
    observed_at: DATE,
    metadata: {
      activity_type: "Traditional Strength Training",
      start_time: "07:38:00",
      end_time: "08:37:00",
      duration_seconds: 3533,
      active_calories: 373,
      total_calories: 469,
      average_heart_rate: 113,
    },
    exercises: [],
    provenance: { source_artifact_refs: ["Apple Health Screenshot 2.jpg"] },
    source: { application: "Apple Fitness", modality: "screenshot" },
    reconciliation: {
      target_canonical_id: TARGET,
      match_basis: "explicit_native_training_support_binding",
    },
  };
}

function walk(id, start, calories) {
  return {
    id,
    evidence_type: "training",
    observed_at: DATE,
    metadata: {
      activity_type: "Outdoor Walk",
      start_time: start,
      duration_seconds: id.endsWith("1") ? 995 : 954,
      active_calories: calories,
      distance: id.endsWith("1") ? 0.95 : 0.91,
      distance_unit: "mi",
    },
    exercises: [],
    provenance: { source_artifact_refs: [`${id}.jpg`] },
    source: { application: "Apple Fitness", modality: "screenshot" },
  };
}

function supportPackage() {
  return {
    package_id: "evidence_submission_B8D00FF51649430A9E7E7BD2749D8395_images",
    userId: USER,
    review_metadata: { targetTrainingSessionCanonicalId: TARGET },
    evidence_objects: [
      walk("walk-1", "06:02:00", 88),
      strength(),
      walk("walk-2", "09:10:00", 103),
    ],
  };
}

function apply(existing, result) {
  const changed = new Map(result.changedObjects.map((record) => [record.canonicalId, record]));
  return [
    ...existing.filter((record) => !changed.has(record.canonicalId)),
    ...result.changedObjects,
  ];
}

describe("Build 38 Logger supporting-evidence production regression", () => {
  it("keeps the exact 4-exercise/15-set Logger survivor, enriches it, and leaves two walks independent", () => {
    const existing = [structuredLogger(), historicalCollision()];
    const result = reconcileConfirmedEvidencePackage({
      evidencePackage: supportPackage(),
      existingCanonicalObjects: existing,
      userId: USER,
    });
    const after = apply(existing, result);
    const target = after.find((record) => record.canonicalId === TARGET);
    const collision = after.find((record) => record.canonicalId === COLLIDING_SOURCE);

    expect(result.report.supersededCanonicalIds).not.toContain(COLLIDING_SOURCE);
    expect(collision).toEqual(existing[1]);
    expect(target).toMatchObject({
      canonicalId: TARGET,
      lastObservedAt: DATE,
      quality: { status: "active" },
      payload: {
        id: "training_logger_session_20A8DDEE-E0E8-42DD-8A27-0CB180743F40",
        observed_at: DATE,
        captured_at: "2026-09-17T12:00:00.000Z",
        metadata: {
          logger_origin: "training_logger",
          start_time: "07:38:00",
          end_time: "08:37:00",
          duration_seconds: 3533,
          active_calories: 373,
          total_calories: 469,
          average_heart_rate: 113,
        },
        source: { modality: "mixed" },
      },
    });
    expect(target.payload.exercises).toHaveLength(4);
    expect(target.payload.exercises.flatMap((exercise) => exercise.sets)).toHaveLength(15);
    expect(after.filter((record) => record.quality?.status !== "superseded" &&
      record.payload?.metadata?.activity_type === "Outdoor Walk")).toHaveLength(2);

    const day = createTrainingDayReadModel({ canonicalEvidenceObjects: after, date: DATE, timeZone: "America/Los_Angeles" });
    expect(day.summary).toMatchObject({ sessionCount: 3, strengthSessions: 1, exerciseCount: 4, hasWalking: true, hasCardio: true });
    expect(day.sessions.map((session) => session.kind)).toEqual(["strength", "walking", "walking"]);
    expect(day.sessions.find((session) => session.kind === "strength")).toMatchObject({ id: TARGET, exerciseCount: 4 });
    expect(composeLoggedTodaySummary({ canonicalObjects: after, dateKey: DATE }).rows[0])
      .toMatchObject({ summary: "Strength Training · Outdoor Walk", href: "/progress/training" });
  });

  it("fails safe until the exact Logger target is durable, then survives relaunch and replay without duplication", () => {
    const evidencePackage = supportPackage();
    expect(() => reconcileConfirmedEvidencePackage({
      evidencePackage,
      existingCanonicalObjects: [historicalCollision()],
      userId: USER,
    })).toThrow("exact structured Training target is unavailable");

    const existing = JSON.parse(JSON.stringify([structuredLogger(), historicalCollision()]));
    const first = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: existing, userId: USER });
    const afterRelaunch = JSON.parse(JSON.stringify(apply(existing, first)));
    const replay = reconcileConfirmedEvidencePackage({ evidencePackage, existingCanonicalObjects: afterRelaunch, userId: USER });
    expect(replay.changedObjects).toHaveLength(0);
    expect(afterRelaunch.filter((record) => record.canonicalId === TARGET)).toHaveLength(1);
    expect(afterRelaunch.filter((record) => record.quality?.status !== "superseded" &&
      record.payload?.metadata?.activity_type === "Outdoor Walk")).toHaveLength(2);
  });
});
