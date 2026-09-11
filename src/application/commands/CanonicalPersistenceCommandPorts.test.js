import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
const now = () => new Date("2026-08-11T12:00:00.000Z");

describe("Phase 4 canonical command persistence ports", () => {
  it("preserves command outcomes across independent legacy-copy adapters", async () => {
    const left = fixture(); const right = fixture();
    const commands = [
      ["submitWeight", { localDate: "2026-08-11", value: 180 }, null],
      ["submitCheckIn", { localDate: "2026-08-11", value: 180, estimatedCalories: 2100 }, null],
      ["completePriority", { priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1"],
      ["editProtocol", { protocolId: "protocol-one", patch: { title: "Updated" } }, "1"],
      ["editGoal", { goalId: "goal-one", patch: { title: "Updated Goal" } }, "1"],
      ["confirmEvidenceReview", { reviewId: "review-one" }, "1"],
      ["correctTrainingSession", { sessionId: "training-one", corrections: [{ field: "load" }] }, "1"],
    ];
    for (const [name, payload, expectedVersion] of commands) {
      const context = commandContext(payload, expectedVersion, `command-${name}`);
      const a = await createCanonicalPersistenceCommandPorts({ records: left, now })[name](context);
      const b = await createCanonicalPersistenceCommandPorts({ records: right, now })[name](context);
      expect(a).toEqual(b);
    }
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it("rejects stale writes and suppresses a duplicate occurrence completion", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const first = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "first"));
    expect(first.result.revision).toBe(2);
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "second"));
    expect(repeated.result.status).toBe("already_completed");
    await expect(ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "first" } }, "9", "stale"))).rejects.toMatchObject({ code: "EXPECTED_VERSION_CONFLICT" });
  });

  it("keeps independent aggregate writes independent", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const [goal, protocol] = await Promise.all([
      ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal B" } }, "1", "goal")),
      ports.editProtocol(commandContext({ protocolId: "protocol-one", patch: { title: "Protocol B" } }, "1", "protocol")),
    ]);
    expect(goal.result.record.title).toBe("Goal B");
    expect(protocol.result.record.title).toBe("Protocol B");
  });

  it("enqueues no durable outbox work for any committed canonical write", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const committed = await ports.editGoal(commandContext({ goalId: "goal-one", patch: { title: "Goal C" } }, "1", "no-outbox"));
    expect(committed.status).toBe("committed");
    expect(committed.outbox).toEqual([]);
    const duplicate = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup"));
    const repeated = await ports.completePriority(commandContext({ priorityId: "priority-one", occurrenceDate: "2026-08-11" }, "1", "dup-2"));
    expect(duplicate.outbox).toEqual([]);
    expect(repeated.outbox).toEqual([]);
  });

  it("commits Native Nutrition and manual Activity canonically and stages Training for the exact review lifecycle", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const nutrition = await ports.upsertNutritionDay(commandContext({
      localDate: "2026-08-11", dailyTotals: { calories: 2400, protein_g: 190 }, meals: [],
    }, null, "nutrition"));
    const activity = await ports.upsertActivityDay(commandContext({
      localDate: "2026-08-11", dailyActivity: { move_calories: 720, exercise_minutes: 60 },
      sourceIdentity: "activity-screen-1", source: { application: "Apple Fitness", modality: "screenshot" },
    }, null, "activity"));
    const training = await ports.commitTrainingSession(commandContext({
      sessionId: "native-session-one", localDate: "2026-08-11",
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    }, null, "training"));
    expect(nutrition.result).toMatchObject({ canonicalId: "nutrition|2026-08-11|nutrition-day", revision: 1, goalId: "goal-one", phaseId: "phase-one" });
    expect(activity.result).toMatchObject({ canonicalId: "activity_day|2026-08-11", revision: 1, goalId: "goal-one", phaseId: "phase-one" });
    expect(training.result).toMatchObject({ status: "confirmation_requested", intendedDate: "2026-08-11", sessionId: "native-session-one" });
    expect(training.result.exerciseIds).toEqual(["bench_press"]);
    const snapshot = records.snapshot();
    expect(snapshot.canonicalEvidenceObjects.map((item) => item.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    expect(snapshot.evidenceReviews.find((item) => item.id === training.result.reviewId)).toMatchObject({
      source: "training_logger", status: "pending", evidenceTypes: ["training"],
    });
    expect(snapshot.piEnergyConfidenceWorkItems.length).toBeGreaterThan(0);
  });

  it("rejects direct device-health Activity and version-safely edits a staged DEXA review", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.upsertActivityDay(commandContext({
      localDate: "2026-08-11", dailyActivity: { move_calories: 700 }, sourceIdentity: "health-1",
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
    }, null, "health"))).rejects.toMatchObject({ code: "ACTIVITY_HEALTHKIT_FORBIDDEN" });
    const edited = await ports.editDexaReview(commandContext({
      reviewId: "review-dexa", evidenceObjectId: "dexa-one",
      measurements: { measuredAt: "2026-08-10", totalMass: 180, bodyFatPercentage: 12, fatMass: 21.6, leanMass: 151, boneMineralContent: 7.4 },
    }, "1", "dexa-edit"));
    expect(edited.result).toMatchObject({ status: "updated", reviewId: "review-dexa", revision: 2 });
    await expect(ports.editDexaReview(commandContext({
      reviewId: "review-dexa", evidenceObjectId: "dexa-one",
      measurements: { measuredAt: "2026-08-10", totalMass: 181 },
    }, "1", "dexa-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
  });
});

function fixture() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" },
      phases: [{ id: "phase-one", goalId: "goal-one", name: "Build", purpose: "Build", order: 0, status: "active",
        startDate: "2026-08-01", startedAt: "2026-08-01", plannedReviewAt: "2026-09-01", reviewState: "scheduled", completionDecisionRequired: true, revision: 1 }] }],
    protocols: [{ id: "protocol-one", userId: ownerUserId, title: "Protocol", version: 1 }],
    executionItems: [{ id: "priority-one", userId: ownerUserId, completionHistory: [], version: 1 }],
    reminders: [{ id: "priority-one", userId: ownerUserId, title: "Priority", active: true, completionHistory: [], version: 1 }],
    evidenceReviews: [
      { id: "review-one", userId: ownerUserId, status: "pending", version: 1 },
      { id: "review-dexa", userId: ownerUserId, status: "pending", version: 1, interpretedEvidence: { package_id: "dexa-package", evidence_objects: [{
        id: "dexa-one", userId: ownerUserId, evidence_type: "dexa_scan", provider: "BodySpec", measuredAt: "2026-08-10", observed_at: "2026-08-10",
        totalMass: { value: 179, unit: "lb" }, bodyFatPercentage: 12, fatMass: { value: 21.5, unit: "lb" }, leanMass: { value: 150, unit: "lb" },
        boneMineralContent: { value: 7.5, unit: "lb" }, source: { type: "dexa", name: "BodySpec" }, provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["pdf-one"] },
      }] } },
    ],
    trainingPerformanceEvents: [{ id: "training-one", userId: ownerUserId, version: 1 }],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [],
    canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [], piTrainingConfidenceWorkItems: [],
  });
}
function commandContext(payload, expectedVersion, commandId) {
  return { ownerUserId, principal, metadata: { commandId, expectedVersion }, payload };
}
