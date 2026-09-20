import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import {
  createCommittedTrainingPerformanceAnalysis,
  reconcileTrainingPerformanceEvents,
} from "../training/TrainingPerformanceEventReconciliation.js";
import { createTrainingPerformanceEventPersistenceService } from "../../domain/services/TrainingPerformanceEventPersistenceService.js";
import { produceTrainingPerformanceEvents } from "../../domain/services/TrainingPerformanceEventProducer.js";
import { createTrainingPerformanceIntelligenceReport } from "../../domain/services/TrainingPerformanceIntelligenceService.js";
import {
  resolveTrainingPerformanceEventLiveness,
  selectLiveTrainingPerformanceEvents,
  TrainingPerformanceEventLiveness,
} from "../../domain/services/TrainingPerformanceEventLiveness.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
let clock = Date.parse("2026-09-20T18:00:00.000Z");
const now = () => new Date(clock);

function store() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" },
      phases: [{ id: "phase-one", goalId: "goal-one", name: "Build", purpose: "Build", order: 0, status: "active",
        startDate: "2026-08-01", startedAt: "2026-08-01", plannedReviewAt: "2026-12-01", reviewState: "scheduled", completionDecisionRequired: true, revision: 1 }] }],
    protocols: [], executionItems: [], reminders: [], evidenceReviews: [],
    trainingPerformanceEvents: [], trainingPerformanceEventBatches: [],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [], canonicalExerciseLibrary: [],
    piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}

let sequence = 0;
function logSession(ports, { localDate, exerciseId = "pull_up", sets, sessionId = `session-${localDate}-${sequence}` }) {
  sequence += 1;
  clock += 60_000;
  return ports.commitTrainingSession({
    ownerUserId,
    principal,
    metadata: { commandId: `command-${sessionId}-${sequence}`, expectedVersion: null },
    payload: { sessionId, localDate, exercises: [{ canonicalExerciseId: exerciseId, sets }] },
  });
}

const weighted = (reps, load = 25) => ({ reps, load, loadType: "external_load", unit: "lb" });
const bodyweight = (reps) => ({ reps, load: null, loadType: "bodyweight", unit: "bodyweight" });
const four = (make, ...reps) => reps.map((value) => make(value));
const eventsOf = (records) => records.snapshot().trainingPerformanceEvents;
const summary = (events) => events.map((event) => [
  event.workoutDate, event.canonicalExerciseId, event.eventType, event.previousBaselineValue, event.currentValue,
]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

async function founderPullUpHistory(ports, { includeSep13 = true } = {}) {
  await logSession(ports, { localDate: "2026-08-16", sets: four(weighted, 6, 6, 6, 6) });
  await logSession(ports, { localDate: "2026-08-23", sets: four(weighted, 6, 6, 6, 6) });
  await logSession(ports, { localDate: "2026-08-30", sets: four(weighted, 6, 6, 6, 6) });
  if (includeSep13) await logSession(ports, { localDate: "2026-09-13", sets: four(weighted, 6, 7, 7, 7) });
}

describe("Logger command performance events", () => {
  it("derives durable events from the Logger command, the same ones review confirmation derives", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await founderPullUpHistory(ports);
    // Sep 13 beat Aug 30 (6 reps at 25 lb, 600 lb) with 7 reps at 25 lb and 675 lb.
    expect(summary(eventsOf(records))).toEqual([
      ["2026-09-13", "pull_up", "reps_at_load_pr", 6, 7],
      ["2026-09-13", "pull_up", "session_volume_pr", 600, 675],
    ]);
    const commandEvents = eventsOf(records);

    // The review path's derivation over the same canonical authority, with its
    // own analysis id and review id, must produce the identical event ids.
    const canonicalObjects = records.snapshot().canonicalEvidenceObjects;
    const sep13 = canonicalObjects.find((object) => object.payload.observed_at.startsWith("2026-09-13"));
    const reviewAnalysis = {
      id: "analysis_training_evidence_submission_REVIEW_PATH",
      createdAt: "2026-09-14T03:12:00.155Z",
      metadata: { trainingPerformance: createTrainingPerformanceIntelligenceReport({ canonicalObjects, now: "2026-09-14T03:11:57.000Z" }) },
    };
    const reviewPathEvents = produceTrainingPerformanceEvents({
      canonicalTrainingSession: sep13,
      trainingAnalysis: reviewAnalysis,
      sourceReviewId: "evidence_review_REVIEW_PATH",
      sourceEvidencePackageId: "training_logger_submission_REVIEW_PATH",
      now: () => new Date("2026-09-14T03:12:00.155Z"),
    });
    expect(reviewPathEvents.map((event) => event.id).sort()).toEqual(commandEvents.map((event) => event.id).sort());
  });

  it("does not duplicate events when the same session is reconciled again through another path", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await founderPullUpHistory(ports);
    const before = eventsOf(records).map((event) => event.id).sort();
    expect(before).toHaveLength(2);

    // Replay through the review-path shape: a different analysis id and review id.
    const canonicalObjects = records.snapshot().canonicalEvidenceObjects;
    const sep13 = canonicalObjects.find((object) => object.payload.observed_at.startsWith("2026-09-13"));
    const bindings = {
      mutateCanonicalRuntime: async ({ mutate }) => {
        const candidate = { ...records.snapshot() };
        const result = await mutate(candidate, { commandId: "review-path-replay" });
        return { result, revision: 1, commitId: "review-path-replay", changedCollections: [], memoryProfile: null };
      },
    };
    const outcome = await reconcileTrainingPerformanceEvents({
      canonicalSessions: [sep13],
      trainingAnalysis: createCommittedTrainingPerformanceAnalysis({
        canonicalObjects, packageId: "evidence_submission_REPLAY_images", capturedAt: "2026-09-14T03:12:00.155Z",
      }),
      sourceReviewId: "evidence_review_REPLAY",
      sourceEvidencePackageId: "evidence_submission_REPLAY_images",
      persistence: createTrainingPerformanceEventPersistenceService(bindings),
      lowerLevelEnabled: false,
    });
    expect(outcome.failed).toBe(false);
    expect(outcome.persistence.newEvents).toEqual([]);
    expect(outcome.persistence.existingEvents.map((event) => event.id).sort()).toEqual(before);
    expect(eventsOf(records).map((event) => event.id).sort()).toEqual(before);
  });

  it("is safe to replay a lost acknowledgement: the same commands leave one event per identity", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await founderPullUpHistory(ports);
    const first = eventsOf(records).map((event) => event.id).sort();
    // The same Logger session id submitted again (a client retry after a lost ack).
    await logSession(ports, { localDate: "2026-09-13", sessionId: "session-2026-09-13-3", sets: four(weighted, 6, 7, 7, 7) }).catch(() => undefined);
    expect(eventsOf(records).map((event) => event.id).sort()).toEqual(first);
    expect(new Set(eventsOf(records).map((event) => event.id)).size).toBe(eventsOf(records).length);
  });

  it("evaluates only the latest exposure: a backdated session earns no events and rewrites no baseline", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await logSession(ports, { localDate: "2026-08-16", sets: four(weighted, 6, 6, 6, 6) });
    await logSession(ports, { localDate: "2026-09-13", sets: four(weighted, 6, 7, 7, 7) });
    const beforeBackdated = eventsOf(records).map((event) => event.id).sort();
    // Logged later but performed on Aug 30, before Sep 13: it is not the latest exposure.
    await logSession(ports, { localDate: "2026-08-30", sets: four(weighted, 9, 9, 9, 9) });
    expect(eventsOf(records).map((event) => event.id).sort()).toEqual(beforeBackdated);
  });

  it("reproduces the Sep 20 weighted Pull-Up case: events follow the active baseline, not the false one", async () => {
    // With the Sep 13 workout authoritative, Sep 20 (7 reps at 25 lb, 700 lb)
    // ties the best reps at load and beats the best volume: exactly one event.
    const correct = store();
    const correctPorts = createCanonicalPersistenceCommandPorts({ records: correct, now });
    await founderPullUpHistory(correctPorts);
    await logSession(correctPorts, { localDate: "2026-09-20", sets: four(weighted, 7, 7, 7, 7) });
    expect(summary(eventsOf(correct)).filter(([date]) => date === "2026-09-20")).toEqual([
      ["2026-09-20", "pull_up", "session_volume_pr", 675, 700],
    ]);

    // Without Sep 13 (the false-supersession state) the same workout would claim two
    // PRs against the Aug 30 baseline. Derived events depend on the active authority.
    const stale = store();
    const stalePorts = createCanonicalPersistenceCommandPorts({ records: stale, now });
    await founderPullUpHistory(stalePorts, { includeSep13: false });
    await logSession(stalePorts, { localDate: "2026-09-20", sets: four(weighted, 7, 7, 7, 7) });
    expect(summary(eventsOf(stale))).toEqual([
      ["2026-09-20", "pull_up", "reps_at_load_pr", 6, 7],
      ["2026-09-20", "pull_up", "session_volume_pr", 600, 700],
    ]);
  });

  it("compares bodyweight performance at one zero baseline whatever its stored encoding", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const numericZero = (reps) => ({ reps, load: 0, loadType: "external_load", unit: "lb" });
    await logSession(ports, { localDate: "2026-08-16", exerciseId: "hanging_leg_raise", sets: four(bodyweight, 18, 18, 18, 18) });
    // Sep 13 arrived with a numeric `0 lb external_load` (the Founder's Native encoding).
    await logSession(ports, { localDate: "2026-09-13", exerciseId: "hanging_leg_raise", sets: four(numericZero, 20, 20, 20, 20) });
    // Sep 20 arrives unweighted with no external load (the corrected encoding).
    await logSession(ports, { localDate: "2026-09-20", exerciseId: "hanging_leg_raise", sets: four(bodyweight, 22, 22, 22, 22) });
    expect(summary(eventsOf(records))).toEqual([
      ["2026-09-13", "hanging_leg_raise", "reps_at_load_pr", 18, 20],
      ["2026-09-20", "hanging_leg_raise", "reps_at_load_pr", 20, 22],
    ]);
  });

  it("does not claim a bodyweight PR when the same exercise is first performed with added load", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await logSession(ports, { localDate: "2026-08-02", sets: four(bodyweight, 13, 13, 13, 13) });
    await logSession(ports, { localDate: "2026-08-16", sets: four(weighted, 6, 6, 6, 6) });
    // 6 reps at +25 lb has no prior +25 lb exposure and is not a bodyweight rep record;
    // only the first weighted volume (there is no earlier weighted volume) is undefined too.
    expect(summary(eventsOf(records)).filter(([, , type]) => type === "reps_at_load_pr")).toEqual([]);
  });

  it("keeps a session that is no longer authoritative from producing events", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await founderPullUpHistory(ports);
    const canonicalObjects = records.snapshot().canonicalEvidenceObjects;
    const sep13 = canonicalObjects.find((object) => object.payload.observed_at.startsWith("2026-09-13"));
    const superseded = { ...sep13, quality: { ...(sep13.quality ?? {}), status: "superseded", supersededBy: "training|authoritative|other" } };
    expect(produceTrainingPerformanceEvents({
      canonicalTrainingSession: superseded,
      trainingAnalysis: createCommittedTrainingPerformanceAnalysis({
        canonicalObjects, packageId: "evidence_submission_X_images", capturedAt: "2026-09-14T03:12:00.155Z",
      }),
      sourceReviewId: "review",
      sourceEvidencePackageId: "package",
    })).toEqual([]);
  });
});

describe("performance event liveness", () => {
  it("resolves events against active canonical sessions without deleting anything", async () => {
    const records = store();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await founderPullUpHistory(ports);
    const events = eventsOf(records);
    const canonicalObjects = records.snapshot().canonicalEvidenceObjects;
    expect(selectLiveTrainingPerformanceEvents(events, canonicalObjects)).toHaveLength(2);

    // The source session becomes superseded: the events remain stored but stop being current.
    const superseded = canonicalObjects.map((object) => object.payload.observed_at.startsWith("2026-09-13")
      ? { ...object, quality: { ...(object.quality ?? {}), status: "superseded", supersededBy: "training|authoritative|elsewhere" } }
      : object);
    const resolutions = resolveTrainingPerformanceEventLiveness({ events, canonicalObjects: superseded });
    expect([...resolutions.values()].map((entry) => entry.state)).toEqual([
      TrainingPerformanceEventLiveness.SUPERSEDED, TrainingPerformanceEventLiveness.SUPERSEDED,
    ]);
    expect(selectLiveTrainingPerformanceEvents(events, superseded)).toEqual([]);
    expect(events).toHaveLength(2);
  });

  it("resolves through a correction revision that keeps the session identity and date, never through a false chain", () => {
    const event = {
      id: "event-1", sourceCanonicalTrainingId: "training|authoritative|original", sourceSessionId: "session-A",
      workoutDate: "2026-09-13", canonicalExerciseId: "pull_up",
    };
    const session = (canonicalId, date, status, id = "session-A") => ({
      canonicalId, quality: { status },
      payload: { id, evidence_type: "training", observed_at: date, exercises: [{ canonicalExerciseId: "pull_up", name: "Pull-Ups", sets: [] }] },
    });
    const original = session("training|authoritative|original", "2026-09-13", "superseded");
    // A supersession chain that ends on a different workout date must not resurrect the event.
    const falseWinner = session("training|authoritative|sep17", "2026-09-17", "active", "session-B");
    expect(resolveTrainingPerformanceEventLiveness({ events: [event], canonicalObjects: [original, falseWinner] })
      .get("event-1").state).toBe(TrainingPerformanceEventLiveness.SUPERSEDED);
    // A correction revision of the same session and date makes it live again.
    const correction = session("training|authoritative|original|repair", "2026-09-13", "active");
    expect(resolveTrainingPerformanceEventLiveness({ events: [event], canonicalObjects: [original, falseWinner, correction] })
      .get("event-1")).toEqual({ state: TrainingPerformanceEventLiveness.LIVE, activeCanonicalId: "training|authoritative|original|repair" });
    // No matching canonical object at all is orphaned, not live.
    expect(resolveTrainingPerformanceEventLiveness({ events: [{ ...event, id: "event-2", sourceCanonicalTrainingId: "missing", sourceSessionId: "none" }], canonicalObjects: [falseWinner] })
      .get("event-2").state).toBe(TrainingPerformanceEventLiveness.ORPHANED);
  });
});
