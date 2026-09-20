import { describe, expect, it, vi } from "vitest";
import {
  applyTrainingFalseSupersessionCorrection,
  getTrainingFalseSupersessionCorrectedCanonicalId,
  planTrainingFalseSupersessionCorrection,
  SEP_13_FALSE_SUPERSESSION_TARGET as TARGET,
  TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE,
} from "./TrainingFalseSupersessionCorrectionService";
import { assessWorkoutDuplicatePair } from "./WorkoutDuplicateIdentityService";
import {
  resolveTrainingPerformanceEventLiveness,
  TrainingPerformanceEventLiveness,
} from "./TrainingPerformanceEventLiveness";

const REPEATING_FILENAME = "Apple Health Screenshot 2.jpg";
const USER = "user_founder_001";
const SEP_17_ID = TARGET.mustRemainActiveSessionIds[0];
const SEP_19_ID = TARGET.mustRemainActiveSessionIds[1];
const draftOf = (sessionId) => sessionId.replace("training_logger_session_", "training_logger_draft_");

const CANONICAL_IDS = {
  "Pull-Ups": "pull_up", "Hanging Leg Raises": "hanging_leg_raise", "Iso-Lateral High Rows": "iso_lateral_high_row",
  "Cable Crunches": "cable_crunch", "Wide Grip Seated Cable Rows": "wide_grip_seated_cable_row",
};
const exercises = (names) => names.map((name, index) => ({
  id: `occ-${index}`, name, canonicalExerciseId: CANONICAL_IDS[name] ?? name.toLowerCase().replace(/\W+/g, "_"),
  sets: Array.from({ length: 4 }, (_, setIndex) => ({
    set_number: setIndex + 1, reps: 10 + index, weight: 100, weight_unit: "lb", load_type: "external_load", set_type: "weighted_reps",
  })),
}));

function canonical({ canonicalId, sessionId, date, status = "active", supersededBy = null, refs, telemetry, names, packages = [] }) {
  const payload = {
    id: sessionId, evidence_type: "training", observed_at: date, captured_at: `${date}T12:00:00.000Z`,
    source: { modality: "mixed", application: "Apple Fitness + Training Logger", source_artifact_refs: refs },
    provenance: { source_artifact_refs: refs },
    metadata: { activity_type: "Traditional Strength Training", ...telemetry },
    reconciliation: { disposition: "linked_to_detailed_training_session", source_workout_id: `apple_workout_${date}` },
    exercises: exercises(names),
  };
  return {
    canonicalId, evidence_type: "training", userId: USER, lastObservedAt: date, firstObservedAt: date,
    quality: status === "active" ? { status } : { status, supersededBy, supersededAt: "2026-09-16T22:49:40.840Z", reason: "A newer interpretation of the same training session became canonical." },
    provenance: { evidence_package_ids: packages, source_artifact_refs: refs, contributing_evidence_object_ids: [sessionId] },
    payload,
  };
}

const sep13Telemetry = { start_time: "15:44:00", end_time: "17:21:00", duration_seconds: 5825, active_calories: 578 };
const sep15Telemetry = { start_time: "2026-09-15T07:58:00-07:00", end_time: "2026-09-15T08:55:00-07:00", duration_seconds: 3457, active_calories: 288 };

function fixture() {
  const original = canonical({
    canonicalId: TARGET.originalCanonicalId, sessionId: TARGET.sessionId, date: "2026-09-13",
    status: "superseded", supersededBy: TARGET.contaminatedCanonicalIds[0],
    refs: [draftOf(TARGET.sessionId), REPEATING_FILENAME], telemetry: sep13Telemetry,
    names: ["Pull-Ups", "Hanging Leg Raises", "Iso-Lateral High Rows", "Cable Crunches", "Wide Grip Seated Cable Rows"],
    packages: ["training_logger_submission_ABB72390"],
  });
  const contaminated = canonical({
    canonicalId: TARGET.contaminatedCanonicalIds[0], sessionId: TARGET.sessionId, date: "2026-09-13",
    status: "superseded", supersededBy: `training|authoritative|${draftOf(SEP_17_ID)}`,
    refs: [draftOf(TARGET.sessionId), REPEATING_FILENAME], telemetry: sep15Telemetry,
    names: ["Hanging Leg Raises", "Cable Crunches", "Pull-Ups", "Iso-Lateral High Rows", "Wide Grip Seated Cable Rows"],
    packages: ["training_logger_submission_ABB72390", "evidence_submission_CDA0400_images"],
  });
  const sep17 = canonical({
    canonicalId: `training|authoritative|${draftOf(SEP_17_ID)}`, sessionId: SEP_17_ID, date: "2026-09-17",
    refs: [draftOf(SEP_17_ID), REPEATING_FILENAME],
    telemetry: { start_time: "07:38:00", end_time: "08:37:00", duration_seconds: 3533, active_calories: 373 },
    names: ["Seated Hip Adductions", "Hyperextension Machine", "Glute Squats", "Hip Thrusts"],
  });
  const sep19 = canonical({
    canonicalId: `training|authoritative|${draftOf(SEP_19_ID)}`, sessionId: SEP_19_ID, date: "2026-09-19",
    refs: [draftOf(SEP_19_ID), REPEATING_FILENAME],
    telemetry: { start_time: "2026-09-19T15:01:00-07:00", end_time: "2026-09-19T16:17:00-07:00", duration_seconds: 4563, active_calories: 329 },
    names: ["Cable Pushdowns", "Incline Dumbbell Press", "Plated Chest Fly Machine", "Straight Bar Cable Pushdown"],
  });
  return [original, contaminated, sep17, sep19];
}

describe("Training false-supersession correction", () => {
  it("plans one immutable correction revision from the ORIGINAL record and changes nothing else", () => {
    const canonicalObjects = fixture();
    const before = structuredClone(canonicalObjects);
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects, userId: USER });

    expect(plan.status).toBe("ready");
    expect(plan.correctedCanonicalId).toBe(getTrainingFalseSupersessionCorrectedCanonicalId());
    expect(plan.predicted.createdCanonicalIds).toEqual([plan.correctedCanonicalId]);
    expect(plan.predicted.changedCanonicalIds).toEqual([plan.correctedCanonicalId]);
    expect(plan.predicted.supersededCanonicalIds).toEqual([]);
    // Planning is pure: the superseded chain and the active workouts are untouched.
    expect(canonicalObjects).toEqual(before);

    const revision = plan.createdRecord;
    expect(revision.quality.status).toBe("active");
    expect(revision.payload.id).toBe(TARGET.sessionId);
    expect(String(revision.payload.observed_at).slice(0, 10)).toBe("2026-09-13");
    expect(revision.payload.exercises.map((exercise) => exercise.name)).toEqual(
      canonicalObjects[0].payload.exercises.map((exercise) => exercise.name)
    );
    expect(revision.payload.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)).toBe(20);
    // Every exercise identity and every set (reps, load, unit, load type) is the original's.
    const essentials = (list) => list.map((exercise) => ({
      canonicalExerciseId: exercise.canonicalExerciseId,
      sets: exercise.sets.map((set) => [set.reps, set.weight, set.weight_unit, set.load_type]),
    }));
    expect(essentials(revision.payload.exercises)).toEqual(essentials(canonicalObjects[0].payload.exercises));
  });

  it("preserves the original Sep 13 telemetry, not the Sep 15 telemetry absorbed by the contaminated record", () => {
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects: fixture(), userId: USER });
    expect(plan.createdRecord.payload.metadata).toMatchObject(sep13Telemetry);
    expect(plan.createdRecord.payload.metadata.start_time).not.toBe(sep15Telemetry.start_time);
  });

  it("carries no bare filename authority and keeps audit lineage to the original and contaminated records", () => {
    const { createdRecord, correctionPackage } = planTrainingFalseSupersessionCorrection({ canonicalObjects: fixture(), userId: USER });
    expect(JSON.stringify(createdRecord.payload.provenance.source_artifact_refs)).not.toContain(REPEATING_FILENAME);
    expect(JSON.stringify(createdRecord.payload.source.source_artifact_refs)).not.toContain(REPEATING_FILENAME);
    expect(createdRecord.payload.provenance.source_artifact_refs).toEqual([draftOf(TARGET.sessionId)]);
    expect(createdRecord.payload.reconciliation).toMatchObject({
      corrects_canonical_ids: [TARGET.originalCanonicalId, ...TARGET.contaminatedCanonicalIds],
    });
    expect(createdRecord.payload.correction).toMatchObject({
      type: TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE,
      original_canonical_id: TARGET.originalCanonicalId,
      preserves_session_identity: TARGET.sessionId,
    });
    expect(correctionPackage.provenance.original_package_ids).toEqual(["training_logger_submission_ABB72390"]);
  });

  it("does not supersede, merge into or duplicate-match the active Sep 17 and Sep 19 workouts", () => {
    const canonicalObjects = fixture();
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects, userId: USER });
    const result = canonicalObjects.concat(plan.createdRecord);
    const status = (sessionId) => result.filter((object) => object.payload.id === sessionId).map((object) => object.quality.status);
    expect(status(SEP_17_ID)).toEqual(["active"]);
    expect(status(SEP_19_ID)).toEqual(["active"]);
    expect(status(TARGET.sessionId).sort()).toEqual(["active", "superseded", "superseded"]);
    for (const other of [canonicalObjects[2], canonicalObjects[3]]) {
      expect(assessWorkoutDuplicatePair(plan.createdRecord.payload, other.payload).outcome).toBe("not_duplicate");
    }
  });

  it("is deterministic and idempotent", async () => {
    const canonicalObjects = fixture();
    const scrub = (record) => JSON.parse(JSON.stringify(record, (key, value) => ["createdAt", "updatedAt"].includes(key) ? undefined : value));
    const first = planTrainingFalseSupersessionCorrection({ canonicalObjects, userId: USER });
    const second = planTrainingFalseSupersessionCorrection({ canonicalObjects, userId: USER });
    expect(scrub(first.createdRecord)).toEqual(scrub(second.createdRecord));
    expect(first.correctionPackage).toEqual(second.correctionPackage);

    const persist = vi.fn();
    const authorization = {
      correctionType: TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE, founderApproved: true,
      correctedCanonicalId: first.correctedCanonicalId, originalCanonicalId: TARGET.originalCanonicalId,
    };
    const applied = await applyTrainingFalseSupersessionCorrection({ plan: first, authorization, persist });
    expect(applied).toMatchObject({ applied: true, idempotent: false });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].records.map((record) => record.canonicalId)).toEqual([first.correctedCanonicalId]);

    // Replaying against the resulting state finds it already applied and writes nothing.
    const replay = planTrainingFalseSupersessionCorrection({ canonicalObjects: canonicalObjects.concat(first.createdRecord), userId: USER });
    expect(replay.status).toBe("already_applied");
    expect(replay.predicted.createdCanonicalIds).toEqual([]);
    expect(await applyTrainingFalseSupersessionCorrection({ plan: replay, authorization, persist })).toEqual({ applied: false, idempotent: true, records: [] });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("refuses to write without an explicit authorization bound to the exact target", async () => {
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects: fixture(), userId: USER });
    const persist = vi.fn();
    await expect(applyTrainingFalseSupersessionCorrection({ plan, authorization: null, persist })).rejects.toThrow(/explicit Founder authorization/);
    await expect(applyTrainingFalseSupersessionCorrection({
      plan, persist,
      authorization: { correctionType: TRAINING_FALSE_SUPERSESSION_CORRECTION_TYPE, founderApproved: true, correctedCanonicalId: "other", originalCanonicalId: TARGET.originalCanonicalId },
    })).rejects.toThrow(/explicit Founder authorization/);
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    ["the original is missing", (objects) => objects.filter((object) => object.canonicalId !== TARGET.originalCanonicalId), /unavailable/],
    ["the original is not superseded", (objects) => objects.map((object) => object.canonicalId === TARGET.originalCanonicalId ? { ...object, quality: { status: "active" } } : object), /not superseded/],
    ["an active session already represents the workout", (objects) => objects.concat(canonical({
      canonicalId: "training|authoritative|other-sep13", sessionId: "other-sep13", date: "2026-09-13", refs: ["other"], telemetry: {}, names: ["Bench Press"],
    })), /already represents/],
    ["the Sep 17 workout is no longer active", (objects) => objects.filter((object) => object.payload.id !== SEP_17_ID), /must remain active/],
    ["the original roster is incomplete", (objects) => objects.map((object) => object.canonicalId === TARGET.originalCanonicalId
      ? { ...object, payload: { ...object.payload, exercises: object.payload.exercises.slice(0, 4) } } : object), /5 exercises and 20 sets/],
  ])("refuses when %s", (_label, mutate, reason) => {
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects: mutate(fixture()), userId: USER });
    expect(plan.status).toBe("refused");
    expect(plan.reasons.join(" ")).toMatch(reason);
    expect(plan.createdRecord).toBeUndefined();
  });

  it("makes the Sep 13 achievements live again through the correction revision, not through the false chain", () => {
    const canonicalObjects = fixture();
    const events = [{
      id: "event-1", sourceCanonicalTrainingId: TARGET.originalCanonicalId, sourceSessionId: TARGET.sessionId,
      workoutDate: "2026-09-13", canonicalExerciseId: "pull_up",
    }];
    expect(resolveTrainingPerformanceEventLiveness({ events, canonicalObjects }).get("event-1").state)
      .toBe(TrainingPerformanceEventLiveness.SUPERSEDED);
    const plan = planTrainingFalseSupersessionCorrection({ canonicalObjects, userId: USER });
    expect(resolveTrainingPerformanceEventLiveness({ events, canonicalObjects: canonicalObjects.concat(plan.createdRecord) }).get("event-1"))
      .toEqual({ state: TrainingPerformanceEventLiveness.LIVE, activeCanonicalId: plan.correctedCanonicalId });
  });
});
