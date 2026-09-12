import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "./Phase3CommandService.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";

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
    const correctedDexa = records.snapshot().evidenceReviews.find((item) => item.id === "review-dexa")
      .interpretedEvidence.evidence_objects[0];
    expect(correctedDexa).toMatchObject({
      measuredAt: "2026-08-10",
      totalMass: { value: 180, unit: "lb" },
      bodyFatPercentage: 12,
      fatMass: { value: 21.6, unit: "lb" },
      leanMass: { value: 151, unit: "lb" },
      boneMineralContent: { value: 7.4, unit: "lb" },
      restingMetabolicRate: { value: null, unit: "kcal/day" },
      visceralAdiposeTissue: {
        mass: { value: null, unit: "lb" },
        volume: { value: null, unit: "in3" },
      },
    });
    await expect(ports.editDexaReview(commandContext({
      reviewId: "review-dexa", evidenceObjectId: "dexa-one",
      measurements: { measuredAt: "2026-08-10", totalMass: 181 },
    }, "1", "dexa-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("dismisses only the owned current review without creating or changing canonical history", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const beforeCanonical = structuredClone(records.snapshot().canonicalEvidenceObjects);
    const dismissed = await ports.disposeEvidenceReview(commandContext({
      reviewId: "review-one", disposition: "discarded",
    }, "1", "dismiss-review"));
    expect(dismissed.result).toMatchObject({ status: "discarded", reviewId: "review-one", revision: 2 });
    const snapshot = records.snapshot();
    expect(snapshot.evidenceReviews.find((item) => item.id === "review-one")).toMatchObject({
      status: "discarded",
      disposition: { discardedAt: "2026-08-11T12:00:00.000Z", discardedBy: ownerUserId },
    });
    expect(snapshot.canonicalEvidenceObjects).toEqual(beforeCanonical);
    await expect(ports.disposeEvidenceReview(commandContext({
      reviewId: "review-dexa", disposition: "discarded",
    }, "9", "dismiss-stale"))).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(ports.disposeEvidenceReview({
      ...commandContext({ reviewId: "review-one", disposition: "discarded" }, "1", "wrong-owner"),
      ownerUserId: "other-owner",
      principal: { ...principal, userId: "other-owner" },
    })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("replays an identical Evidence Review dismissal without a second transition", async () => {
    const records = fixture();
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: createCanonicalPersistenceCommandPorts({ records, now }),
    });
    const input = {
      commandType: Phase3Command.DISPOSE_EVIDENCE_REVIEW,
      principal,
      metadata: { idempotencyKey: "dismiss-review-retry", expectedVersion: "1" },
      payload: { reviewId: "review-one", disposition: "discarded" },
    };
    expect((await service.execute(input)).outcome).toBe("committed");
    expect((await service.execute(input)).outcome).toBe("replayed");
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-one");
    expect(review).toMatchObject({ status: "discarded", version: 2 });
  });

  it("binds owned private screenshot evidence to exactly one Native Training session", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const payload = {
      sessionId: "native-session-media", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    };
    const result = await ports.commitTrainingSession(commandContext(payload, null, "training-media"));
    expect(result.result).toMatchObject({
      status: "confirmation_requested", reviewId: "review-training-support",
      reviewRevision: 2, sessionId: "native-session-media",
    });
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review).toMatchObject({
      status: "pending",
      interpretedEvidence: {
        review_metadata: {
          nativeTrainingSessionId: "native-session-media",
          supportingEvidenceReviewId: "review-training-support",
        },
        provenance: { source_artifacts: [
          expect.objectContaining({ id: "training-screen-1", storage_path: "media://01999999-9999-4999-8999-999999999999" }),
          expect.objectContaining({ kind: "structured_training_logger_draft" }),
        ] },
      },
    });
    const session = review.interpretedEvidence.evidence_objects.find((item) => item.evidence_type === "training");
    expect(session.provenance.source_artifact_refs).toEqual(expect.arrayContaining([
      "training-screen-1", "training_logger_draft_native-session-media",
    ]));
    expect(session.metadata.supporting_media).toEqual([
      { mediaReference: "media://01999999-9999-4999-8999-999999999999" },
    ]);
  });

  it("rejects stale, wrong-owner, wrong-date, and cross-session Training screenshot bindings", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const base = {
      sessionId: "native-session-media", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    };
    await expect(ports.commitTrainingSession(commandContext({ ...base, supportingEvidenceReviewVersion: 9 }, null, "stale-media")))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(ports.commitTrainingSession({
      ...commandContext(base, null, "wrong-owner-media"), ownerUserId: "other-owner",
      principal: { ...principal, userId: "other-owner" },
    })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(ports.commitTrainingSession(commandContext({ ...base, localDate: "2026-08-10" }, null, "wrong-date-media")))
      .rejects.toMatchObject({ code: "TRAINING_SUPPORTING_EVIDENCE_DATE_MISMATCH" });

    const bound = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    await records.put({
      ownerUserId, collection: "evidenceReviews", recordId: bound.id, expectedVersion: bound.version,
      payload: { ...bound, interpretedEvidence: { ...bound.interpretedEvidence, review_metadata: { nativeTrainingSessionId: "another-session" } } },
    });
    await expect(ports.commitTrainingSession(commandContext({ ...base, supportingEvidenceReviewVersion: 2 }, null, "wrong-session-media")))
      .rejects.toMatchObject({ code: "TRAINING_SUPPORTING_EVIDENCE_ALREADY_BOUND" });
  });

  it("replays a Training screenshot commit without duplicating its review or attachment", async () => {
    const records = fixture();
    const service = createPhase3CommandService({
      transactionRunner: createInMemoryFoundationTransactionStore(),
      ports: createCanonicalPersistenceCommandPorts({ records, now }),
    });
    const input = {
      commandType: Phase3Command.COMMIT_TRAINING_SESSION,
      principal,
      metadata: { idempotencyKey: "native-training-media-retry" },
      payload: {
        sessionId: "native-session-media", localDate: "2026-08-11",
        supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
        exercises: [{ canonicalExerciseId: "bench_press", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
      },
    };
    expect((await service.execute(input)).outcome).toBe("committed");
    expect((await service.execute(input)).outcome).toBe("replayed");
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review.version).toBe(2);
    expect(review.interpretedEvidence.provenance.source_artifacts.filter((item) => item.id === "training-screen-1")).toHaveLength(1);
  });

  it("does not bind supporting media when the Training commit fails validation", async () => {
    const records = fixture();
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.commitTrainingSession(commandContext({
      sessionId: "native-session-invalid", localDate: "2026-08-11",
      supportingEvidenceReviewId: "review-training-support", supportingEvidenceReviewVersion: 1,
      exercises: [{ canonicalExerciseId: "unknown-exercise", sets: [{ reps: 8, load: 185, unit: "lb" }] }],
    }, null, "training-media-invalid"))).rejects.toMatchObject({ code: "CANONICAL_EXERCISE_UNAVAILABLE" });
    const review = records.snapshot().evidenceReviews.find((item) => item.id === "review-training-support");
    expect(review.version).toBe(1);
    expect(review.interpretedEvidence.review_metadata?.nativeTrainingSessionId).toBeUndefined();
    expect(records.snapshot().evidencePackages).toEqual([]);
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
      { id: "review-one", userId: ownerUserId, status: "pending", version: 1, evidenceTypes: ["activity_day"] },
      { id: "review-training-support", userId: ownerUserId, status: "pending", version: 1,
        evidenceTypes: ["training"], interpretedEvidence: {
          package_id: "training-support-package", observed_date: "2026-08-11",
          provenance: { evidence_date: "2026-08-11", source_artifacts: [{
            id: "training-screen-1", storage_path: "media://01999999-9999-4999-8999-999999999999", mime_type: "image/png",
          }] },
          evidence_objects: [{
            id: "apple-training-1", evidence_type: "training", observed_at: "2026-08-11",
            source: { application: "Apple Fitness", source_artifact_refs: ["training-screen-1"] },
            provenance: { source_artifact_refs: ["training-screen-1"] },
            metadata: { activity_type: "Traditional Strength Training", duration_seconds: 3600 },
            exercises: [],
          }],
        } },
      { id: "review-dexa", userId: ownerUserId, status: "pending", version: 1, interpretedEvidence: { package_id: "dexa-package", evidence_objects: [{
        id: "dexa-one", userId: ownerUserId, evidence_type: "dexa_scan", provider: "BodySpec", measuredAt: "2026-08-10", observed_at: "2026-08-10",
        totalMass: { value: 179, unit: "lb" }, bodyFatPercentage: 12, fatMass: { value: 21.5, unit: "lb" }, leanMass: { value: 150, unit: "lb" },
        boneMineralContent: { value: 7.5, unit: "lb" }, restingMetabolicRate: { value: 1810, unit: "kcal/day" },
        visceralAdiposeTissue: { mass: { value: 0.7, unit: "lb" }, volume: { value: 19, unit: "in3" } },
        source: { type: "dexa", name: "BodySpec" }, provenance: { extraction_engine: "pdfjs-dist", fixture: false, source_artifact_refs: ["pdf-one"] },
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
