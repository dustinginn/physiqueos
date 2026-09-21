import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { digest, runTrainingAuthorityRepair } from "./TrainingAuthorityRepairRunner.js";
import { TRAINING_AUTHORITY_REPAIR_AUTHORIZATION as AUTH } from "./trainingAuthorityRepairAuthorization.js";
import { planRetroactiveTrainingPerformanceEvents } from "../../domain/services/TrainingRetroactiveEventPlanner.js";
import { getTrainingFalseSupersessionCorrectedCanonicalId as getCorrectedId, SEP_13_FALSE_SUPERSESSION_TARGET as TARGET } from "../../domain/services/TrainingFalseSupersessionCorrectionService.js";

const USER = AUTH.ownerUserId;
const draftOf = (sessionId) => sessionId.replace("training_logger_session_", "training_logger_draft_");
const IDS = { "Pull-Ups": "pull_up", "Hanging Leg Raises": "hanging_leg_raise", "Iso-Lateral High Rows": "iso_lateral_high_row", "Cable Crunches": "cable_crunch", "Wide Grip Seated Cable Rows": "wide_grip_seated_cable_row" };
const exercises = (names) => names.map((name, index) => ({
  id: `occ-${index}`, name, canonicalExerciseId: IDS[name] ?? name.toLowerCase().replace(/\W+/g, "_"),
  sets: Array.from({ length: 4 }, (_, i) => ({ set_number: i + 1, reps: 10 + index, weight: 100, weight_unit: "lb", load_type: "external_load", set_type: "weighted_reps" })),
}));
function canonical({ canonicalId, sessionId, date, status = "active", supersededBy = null, refs, telemetry, names }) {
  return {
    canonicalId, evidence_type: "training", userId: USER, lastObservedAt: date, firstObservedAt: date,
    quality: status === "active" ? { status } : { status, supersededBy, supersededAt: "2026-09-16T22:49:40.840Z" },
    provenance: { evidence_package_ids: ["p"], source_artifact_refs: refs, contributing_evidence_object_ids: [sessionId] },
    payload: {
      id: sessionId, evidence_type: "training", observed_at: date, captured_at: `${date}T12:00:00.000Z`,
      source: { modality: "mixed", application: "Apple Fitness + Training Logger", source_artifact_refs: refs },
      provenance: { source_artifact_refs: refs }, metadata: { activity_type: "Traditional Strength Training", ...telemetry },
      reconciliation: { source_workout_id: `apple_workout_${date}` }, exercises: exercises(names),
    },
  };
}
const FILE = "Apple Health Screenshot 2.jpg";
function state() {
  const sep17 = TARGET.mustRemainActiveSessionIds[0], sep19 = TARGET.mustRemainActiveSessionIds[1];
  return {
    user: [{ id: USER, timeZone: "America/Los_Angeles" }],
    goals: [{ id: "goal-one", userId: USER, primary: true, status: "active", operatingState: { value: "build_lean_mass" }, phases: [{ id: "phase-one", goalId: "goal-one", status: "active", startDate: "2026-08-01", plannedReviewAt: "2026-12-01" }] }],
    evidencePackages: [], trainingPerformanceEvents: [], migrationMarkers: [],
    canonicalEvidenceObjects: [
      canonical({ canonicalId: TARGET.originalCanonicalId, sessionId: TARGET.sessionId, date: "2026-09-13", status: "superseded", supersededBy: TARGET.contaminatedCanonicalIds[0], refs: [draftOf(TARGET.sessionId), FILE], telemetry: { start_time: "15:44:00", end_time: "17:21:00", duration_seconds: 5825, active_calories: 578 }, names: Object.keys(IDS) }),
      canonical({ canonicalId: TARGET.contaminatedCanonicalIds[0], sessionId: TARGET.sessionId, date: "2026-09-13", status: "superseded", supersededBy: `training|authoritative|${draftOf(sep17)}`, refs: [draftOf(TARGET.sessionId), FILE], telemetry: { start_time: "2026-09-15T07:58:00-07:00", end_time: "2026-09-15T08:55:00-07:00", duration_seconds: 3457, active_calories: 288 }, names: Object.keys(IDS) }),
      canonical({ canonicalId: `training|authoritative|${draftOf(sep17)}`, sessionId: sep17, date: "2026-09-17", refs: [draftOf(sep17), FILE], telemetry: { start_time: "07:38:00", end_time: "08:37:00", duration_seconds: 3533, active_calories: 373 }, names: ["Hip Thrusts", "Glute Squats"] }),
      canonical({ canonicalId: `training|authoritative|${draftOf(sep19)}`, sessionId: sep19, date: "2026-09-19", refs: [draftOf(sep19), FILE], telemetry: { start_time: "2026-09-19T15:01:00-07:00", end_time: "2026-09-19T16:17:00-07:00", duration_seconds: 4563, active_calories: 329 }, names: ["Cable Pushdowns", "Incline Dumbbell Press"] }),
    ],
  };
}
const NOW = () => new Date("2026-09-21T02:00:00.000Z");
const run = (records, extra) => runTrainingAuthorityRepair({ records, authorization: AUTH, now: NOW, ...extra });

describe("Training authority repair runner: Sep 13 correction", () => {
  it("dry-run writes nothing and reports the exact prediction and facts", async () => {
    const records = createInMemoryCanonicalRecordStore(state());
    const before = records.snapshot();
    const result = await run(records, { phase: "sep13_correction" });
    expect(result.outcome).toBe("dry_run");
    expect(result.correction).toMatchObject({ status: "active", exercises: 5, sets: 20, sourceArtifactRefs: [draftOf(TARGET.sessionId)] });
    expect(result.predicted.supersededCanonicalIds).toEqual([]);
    expect(records.snapshot()).toEqual(before);
  });

  it("refuses to apply without expected facts and when production drifted, writing nothing", async () => {
    const records = createInMemoryCanonicalRecordStore(state());
    const before = records.snapshot();
    expect((await run(records, { phase: "sep13_correction", apply: true })).outcome).toBe("drifted");
    const dry = await run(records, { phase: "sep13_correction" });
    const drifted = { ...dry.facts, canonicalObjectCount: dry.facts.canonicalObjectCount + 1 };
    const refused = await run(records, { phase: "sep13_correction", apply: true, expected: drifted });
    expect(refused).toMatchObject({ outcome: "drifted", drift: ["canonicalObjectCount"] });
    expect(records.snapshot()).toEqual(before);
  });

  it("applies once: one new record and package, every existing record byte-identical, idempotent replay", async () => {
    const records = createInMemoryCanonicalRecordStore(state());
    const before = records.snapshot().canonicalEvidenceObjects;
    const dry = await run(records, { phase: "sep13_correction" });
    const applied = await run(records, { phase: "sep13_correction", apply: true, expected: dry.facts });
    expect(applied).toMatchObject({ outcome: "applied", invariants: { exactlyOneNewRecord: true, existingRecordsUnchanged: true, correctionActive: true, correctionRoster: true, originalAndContaminatedStillSuperseded: true, mustRemainActive: true } });
    const after = records.snapshot();
    expect(after.canonicalEvidenceObjects).toHaveLength(before.length + 1);
    expect(after.evidencePackages).toHaveLength(1);
    // The four pre-existing canonical records are untouched.
    for (const original of before) {
      expect(digest(after.canonicalEvidenceObjects.find((object) => object.canonicalId === original.canonicalId))).toBe(digest(original));
    }
    const replay = await run(records, { phase: "sep13_correction", apply: true, expected: dry.facts });
    expect(replay.outcome).toBe("already_applied");
    expect(records.snapshot().canonicalEvidenceObjects).toHaveLength(before.length + 1);
  });
});

describe("Training authority repair runner: retroactive events", () => {
  it("plans exactly what the Logger command path derives and never duplicates existing events", async () => {
    // Sessions logged through the command path derive their own events...
    const commandStore = createInMemoryCanonicalRecordStore({
      user: [{ id: USER, timeZone: "America/Los_Angeles", version: 1 }],
      goals: state().goals.map((goal) => ({ ...goal, version: 1 })),
      protocols: [], executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [], trainingPerformanceEventBatches: [],
      weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [], dexaScans: [], protocolVersions: [], progressPhotos: [],
      dailyBriefings: [], analyses: [], briefingReconciliationWorkItems: [], canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
    });
    let tick = Date.parse("2026-09-20T18:00:00.000Z");
    const ports = createCanonicalPersistenceCommandPorts({ records: commandStore, now: () => new Date(tick) });
    let n = 0;
    const log = (localDate, sets) => ports.commitTrainingSession({ ownerUserId: USER, principal: { userId: USER, deviceId: "d", sessionId: "s" }, metadata: { commandId: `c${++n}`, expectedVersion: null }, payload: { sessionId: `s-${localDate}`, localDate, exercises: [{ canonicalExerciseId: "pull_up", sets }] } }).finally(() => { tick += 60000; });
    const w = (reps) => ({ reps, load: 25, loadType: "external_load", unit: "lb" });
    await log("2026-08-16", [6, 6, 6, 6].map(w)); await log("2026-09-13", [6, 7, 7, 7].map(w)); await log("2026-09-20", [7, 7, 7, 7].map(w));
    const derived = commandStore.snapshot().trainingPerformanceEvents;
    expect(derived).toHaveLength(3);
    // ...so a planner run over the same authority with those events present proposes nothing.
    const canonicalObjects = commandStore.snapshot().canonicalEvidenceObjects;
    expect(planRetroactiveTrainingPerformanceEvents({ canonicalObjects, existingEvents: derived, fromDate: "2026-08-01" }).proposed).toEqual([]);
    // With the events absent it reproduces exactly those events (same deterministic ids).
    const replanned = planRetroactiveTrainingPerformanceEvents({ canonicalObjects, existingEvents: [], fromDate: "2026-08-01" }).proposed;
    expect(replanned.map((event) => event.id).sort()).toEqual(derived.map((event) => event.id).sort());
  });


  it("applies the approved events once, leaves existing events untouched, and replays as already applied", async () => {
    const commandStore = createInMemoryCanonicalRecordStore({
      user: [{ id: USER, timeZone: "America/Los_Angeles", version: 1 }],
      goals: state().goals.map((goal) => ({ ...goal, version: 1 })),
      protocols: [], executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [], trainingPerformanceEventBatches: [],
      weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [], dexaScans: [], protocolVersions: [], progressPhotos: [],
      dailyBriefings: [], analyses: [], briefingReconciliationWorkItems: [], canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
    });
    let tick = Date.parse("2026-09-20T18:00:00.000Z"); let n = 0;
    const ports = createCanonicalPersistenceCommandPorts({ records: commandStore, now: () => new Date(tick) });
    const log = (localDate, sets) => ports.commitTrainingSession({ ownerUserId: USER, principal: { userId: USER, deviceId: "d", sessionId: "s" }, metadata: { commandId: `c${++n}`, expectedVersion: null }, payload: { sessionId: `s-${localDate}`, localDate, exercises: [{ canonicalExerciseId: "pull_up", sets }] } }).finally(() => { tick += 60000; });
    const w = (reps) => ({ reps, load: 25, loadType: "external_load", unit: "lb" });
    await log("2026-08-16", [6, 6, 6, 6].map(w)); await log("2026-09-13", [6, 7, 7, 7].map(w)); await log("2026-09-20", [7, 7, 7, 7].map(w));
    const snapshot = commandStore.snapshot();
    const targetEvents = snapshot.trainingPerformanceEvents;
    // Keep only the Sep 13 event pair as "existing"; the Sep 20 event is the one to reconcile.
    const existing = targetEvents.filter((event) => event.workoutDate === "2026-09-13");
    const correction = { ...snapshot.canonicalEvidenceObjects[0], canonicalId: getCorrectedId(), payload: { ...snapshot.canonicalEvidenceObjects[0].payload, id: "dummy-correction", exercises: [] } };
    const memory = createInMemoryCanonicalRecordStore({
      user: snapshot.user, goals: snapshot.goals, trainingPerformanceEvents: existing, migrationMarkers: [],
      canonicalEvidenceObjects: [...snapshot.canonicalEvidenceObjects, correction],
    });
    // Production has a UNIQUE (owner, collection, source_identity) index; enforce it here too.
    const seenIdentities = new Set();
    const records = { ...memory, putIfAbsent: async (input) => {
      if (input.sourceIdentity) {
        const key = `${input.collection}|${input.sourceIdentity}`;
        if (seenIdentities.has(key)) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
        seenIdentities.add(key);
      }
      return memory.putIfAbsent(input);
    } };
    const approvedEvents = targetEvents.filter((event) => event.workoutDate === "2026-09-20").map((event) => ({ id: event.id, date: event.workoutDate, exercise: event.canonicalExerciseId, type: event.eventType, load: event.load ?? null, prior: event.previousBaselineValue, value: event.currentValue }));
    expect(approvedEvents).toHaveLength(1);
    const authorization = { ...AUTH, approvedEvents };
    const originals = existing.map((event) => digest(event));
    const dry = await runTrainingAuthorityRepair({ records, authorization, phase: "retroactive_events", now: NOW });
    expect(dry).toMatchObject({ outcome: "dry_run", eventCount: 1 });
    expect((await runTrainingAuthorityRepair({ records, authorization, phase: "retroactive_events", apply: true, now: NOW })).outcome).toBe("drifted");
    const applied = await runTrainingAuthorityRepair({ records, authorization, phase: "retroactive_events", apply: true, expected: dry.facts, now: NOW });
    expect(applied).toMatchObject({ outcome: "applied", createdCount: 1, invariants: { exactlyTwelveNew: true, existingEventsUnchanged: true, approvedEventsPresent: true, everyEventLive: true } });
    const after = memory.snapshot();
    expect(after.trainingPerformanceEvents).toHaveLength(existing.length + 1);
    expect(existing.map((event) => digest(after.trainingPerformanceEvents.find((candidate) => candidate.id === event.id)))).toEqual(originals);
    expect(after.migrationMarkers).toHaveLength(1);
    expect((await runTrainingAuthorityRepair({ records, authorization, phase: "retroactive_events", apply: true, expected: dry.facts, now: NOW })).outcome).toBe("already_applied");
    expect(memory.snapshot().trainingPerformanceEvents).toHaveLength(existing.length + 1);
  });

  it("refuses when the correction is not active, and refuses a recalculated set that differs from the approved set", async () => {
    const records = createInMemoryCanonicalRecordStore(state());
    expect((await run(records, { phase: "retroactive_events" })).outcome).toBe("refused");
    await run(records, { phase: "sep13_correction", apply: true, expected: (await run(records, { phase: "sep13_correction" })).facts });
    // The fixture has none of the approved sessions, so the recalculated set (empty) differs: nothing is written.
    const refused = await run(records, { phase: "retroactive_events" });
    expect(refused.outcome).toBe("refused");
    expect(refused.reasons.join(" ")).toMatch(/differs from the Founder-approved set/);
    expect(records.snapshot().trainingPerformanceEvents).toEqual([]);
  });
});
