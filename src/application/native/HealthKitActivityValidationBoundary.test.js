import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createHealthKitCanaryDiagnosticReadService } from "./HealthKitCanaryDiagnosticReadService.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createCanonicalEvidenceObservationsV3 } from "../../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { selectStrategicallyEligibleEvidenceV3 } from "../../domain/intelligence/v3/EvidenceEligibilityV3.js";

const OWNER = "user_founder_001";
const POLICY_ID = "healthkit_canonical_daily_activation_policy";

describe("HealthKit Activity validation-only boundary", () => {
  it("persists validation-only Activity permanently raw without canonical or strategic mutation", async () => {
    const records = store();
    const before = records.snapshot();
    const result = await ingest(records, activity({ ingestionPurpose: "validation_only" }));
    const after = records.snapshot();

    expect(result.result).toMatchObject({ activityDayCanonicalizedCount: 0, createdCount: 1 });
    expect(after.healthKitObservations[0]).toMatchObject({
      ingestionPurpose: "validation_only",
      evidenceEligibility: { state: "not_assessed" },
      reconciliation: {
        state: "activity_validation_only",
        canonicalizationPermitted: false,
        canonicalizationPermanentBar: true,
      },
    });
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    for (const collection of strategicCollections()) expect(after[collection]).toEqual(before[collection]);
    const calibration = createPairedCalibrationFixtures().dexa;
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: calibration.goalContract,
      goal: { id: calibration.goalContract.goalId },
      phase: { id: calibration.goalContract.phase.phaseId },
      store: { healthKitObservations: after.healthKitObservations },
      evidenceCutoff: calibration.evaluationContext.evidenceCutoff,
    });
    expect(observations).toEqual([]);
    expect(selectStrategicallyEligibleEvidenceV3({
      goalContract: calibration.goalContract,
      observations,
      evidenceCutoff: calibration.evaluationContext.evidenceCutoff,
    }).eligibleObservations).toEqual([]);
  });

  it("replays validation-only input idempotently and rejects operational purpose promotion", async () => {
    const records = store();
    await ingest(records, activity({ ingestionPurpose: "validation_only" }));
    const replay = await ingest(records, activity({ ingestionPurpose: "validation_only" }), "batch-replay");
    expect(replay.result).toMatchObject({ createdCount: 0, matchedCount: 1, activityDayCanonicalizedCount: 0 });
    await expect(ingest(records, activity(), "batch-purpose-collision")).rejects.toMatchObject({
      status: 409,
      code: "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE",
    });
    expect(records.snapshot().healthKitObservations).toHaveLength(1);
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });

  it("fails closed without activation and never retroactively promotes the stored raw observation", async () => {
    const records = store();
    const first = await ingest(records, activity());
    expect(first.result.activityDayCanonicalizedCount).toBe(0);
    expect(records.snapshot().healthKitObservations[0].reconciliation.reason).toBe("canonicalization_not_activated");
    await enable(records, "2026-09-10");
    const replay = await ingest(records, activity(), "batch-after-activation");
    expect(replay.result.activityDayCanonicalizedCount).toBe(0);
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });

  it("canonicalizes operational Activity only on or after explicit activation", async () => {
    const before = store();
    await enable(before, "2026-09-13");
    expect((await ingest(before, activity())).result.activityDayCanonicalizedCount).toBe(0);

    const on = store();
    await enable(on, "2026-09-12");
    expect((await ingest(on, activity())).result.activityDayCanonicalizedCount).toBe(1);

    const after = store();
    await enable(after, "2026-09-11");
    expect((await ingest(after, activity())).result.activityDayCanonicalizedCount).toBe(1);
  });

  it("never canonicalizes validation-only Activity even when activation covers its date", async () => {
    const records = store();
    await enable(records, "2026-09-01");
    await ingest(records, activity({ ingestionPurpose: "validation_only" }));
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });

  it("never lets a validation-only revision participate in later canonical precedence", async () => {
    const records = store();
    await ingest(records, activity({ ingestionPurpose: "validation_only", sourceRevision: 2 }));
    await enable(records, "2026-09-10");
    const operational = await ingest(records, activity({ sourceRevision: 1 }), "batch-operational-revision-one");
    expect(operational.result.activityDayCanonicalizedCount).toBe(1);
    expect(records.snapshot().healthKitCanonicalDays).toHaveLength(1);
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
    expect(records.snapshot().healthKitObservations).toHaveLength(2);
  });

  it("returns only bounded validation observations with normalized provenance and no strategic fields", async () => {
    const records = store();
    await ingest(records, activity({ ingestionPurpose: "validation_only", localDate: "2026-09-11", externalId: "activity-11" }));
    await ingest(records, activity({ ingestionPurpose: "validation_only", localDate: "2026-09-12", externalId: "activity-12" }), "batch-12");
    await ingest(records, activity({ ingestionPurpose: "validation_only", localDate: "2026-09-13", externalId: "activity-13" }), "batch-13");
    const diagnostics = createHealthKitCanaryDiagnosticReadService({ records, ownerUserId: OWNER });
    const read = await diagnostics.getActivityValidation({ startDate: "2026-09-12", endDate: "2026-09-12" });
    expect(read.items).toHaveLength(1);
    expect(read.items[0]).toMatchObject({
      sourceObservationId: expect.stringMatching(/^healthkit_observation_/),
      ingestionPurpose: "validation_only",
      frozenLocalDate: "2026-09-12",
      activity: {
        metrics: {
          move_calories: { value: 700, unit: "kcal" },
          steps: { value: 10000, unit: "count" },
        },
        coverage: "complete_day",
        aggregationScope: "daily_total_including_workouts",
        workoutActiveCaloriesAdditive: false,
      },
      source: { bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: "17.6" },
      reconciliation: { canonicalized: false, canonicalizationPermanentBar: true },
      evidenceEligibility: "not_assessed",
    });
    expect(JSON.stringify(read)).not.toMatch(/anchor|goal|confidence|narrative|evidence_type/i);
    await expect(diagnostics.getActivityValidation({ startDate: "2026-09-12" }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });

});

async function ingest(records, observation, batchId = "batch-one") {
  return createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-14T12:00:00.000Z") })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: "2026-09-14T12:00:00.000Z" },
      payload: { batchId, observations: [observation] },
    });
}

async function enable(records, effectiveLocalDate, endLocalDate = addDays(effectiveLocalDate, 6)) {
  await records.put({
    ownerUserId: OWNER,
    collection: "healthKitConfiguration",
    recordId: POLICY_ID,
    payload: {
      id: POLICY_ID,
      schemaVersion: "healthkit-canonical-activation-policy-v1",
      status: "enabled",
      domains: ["activity", "nutrition"],
      effectiveLocalDate,
      endLocalDate,
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
      version: 1,
    },
  });
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);
}

function activity({ ingestionPurpose, localDate = "2026-09-12", externalId = "activity-summary-2026-09-12", sourceRevision = 1 } = {}) {
  return {
    ...(ingestionPurpose ? { ingestionPurpose } : {}),
    observationType: "activity_summary",
    externalId,
    source: {
      bundleIdentifier: "com.apple.Health",
      sourceName: "Apple Health",
      sourceRevision: "17.6",
      productType: "Watch7,5",
      privacySafeDeviceProvenance: "apple-watch",
    },
    occurrence: { localDate, timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200 },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts",
      coverage: "complete_day",
      sourceRevision,
      dailyActivity: {
        move_calories: 700,
        exercise_minutes: 60,
        stand_hours: 12,
        steps: 10000,
        walking_running_distance: 7500,
        flights_climbed: 8,
      },
    },
  };
}

function strategicCollections() {
  return ["goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses", "dailyBriefings", "briefingReconciliationWorkItems", "phaseReviewDecisions", "phaseLifecycleReadModels", "operatingPlan", "protocols"];
}

function store() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, version: 1 }],
    healthKitObservations: [],
    healthKitConfiguration: [],
    healthKitCanonicalDays: [],
    canonicalEvidenceObjects: [],
    ...Object.fromEntries(strategicCollections().map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
}
