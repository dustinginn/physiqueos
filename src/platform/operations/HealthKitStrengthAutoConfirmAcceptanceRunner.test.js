import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { runHealthKitStrengthAutoConfirmAcceptance } from "./HealthKitStrengthAutoConfirmAcceptanceRunner.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";

const OWNER = "user_founder_001";
const DAY = "2026-09-23";
const NOW = "2026-09-23T23:30:00.000Z";
const AUTHORIZATION = {
  ownerUserId: OWNER,
  startLocalDate: DAY,
  endLocalDate: DAY,
  authorizationReference: "founder-approved-sep23-auto-confirm",
};
const SHA = "1".repeat(40);

describe("bounded Strength deterministic auto-confirm acceptance", () => {
  it("dry-runs without writes, then applies once with claims, audit, and inert history", async () => {
    const records = await productionShapedWorld();
    const before = records.snapshot();
    const beforeWrites = records.getMutationCount();
    const dry = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    expect(dry).toMatchObject({
      outcome: "dry_run",
      confidence: 95,
      matchBasis: "logger_session_window",
      autoConfirmFacts: { eligible: true, reasons: [], ruleVersion: "healthkit-strength-auto-confirm-v1" },
      predictedMutations: expect.arrayContaining([
        expect.objectContaining({ collection: "healthKitWorkoutLinks", operation: "update", to: "confirmed" }),
        expect.objectContaining({ collection: "evidenceReviews", operation: "create_resolved_history", to: "resolved_confirmed" }),
      ]),
    });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(beforeWrites);

    const applied = await runHealthKitStrengthAutoConfirmAcceptance({
      records,
      authorization: AUTHORIZATION,
      apply: true,
      expected: dry.facts,
      now: () => new Date(NOW),
    });
    expect(applied).toMatchObject({
      outcome: "applied",
      invariants: {
        reconciliationHistoryResolvedExactlyOnce: true,
        historyStrategicallyInert: true,
        evidenceUnchanged: true,
        canonicalWorkoutsUnchanged: true,
      },
    });
    const after = records.snapshot();
    expect(after.healthKitWorkoutLinks).toHaveLength(1);
    expect(after.healthKitWorkoutLinks[0].status).toBe("confirmed");
    expect(after.healthKitWorkoutLinkClaims.filter((claim) => claim.status === "held")).toHaveLength(2);
    expect(after.evidenceReviews).toHaveLength(1);
    expect(after.evidenceReviews[0]).toMatchObject({
      status: "resolved_confirmed",
      strategicEvidenceEligibility: "quarantined",
      evidenceEligibility: { strategic: false },
    });
    expect(after.evidenceReviews[0].resolutionHistory).toHaveLength(1);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    expect(after.trainingPerformanceEvents).toEqual(before.trainingPerformanceEvents);

    const replay = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, apply: true, expected: dry.facts, now: () => new Date(NOW) });
    expect(replay).toMatchObject({ outcome: "already_confirmed", reasons: [] });
    expect(records.snapshot().evidenceReviews[0].resolutionHistory).toHaveLength(1);
  });

  it("excludes an untrusted session before acceptance candidate selection", async () => {
    const records = await productionShapedWorld({ liveLogger: false });
    const before = records.snapshot();
    const result = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    expect(result).toMatchObject({
      outcome: "refused",
      reasons: ["acceptance_case_not_unique"],
    });
    expect(records.snapshot()).toEqual(before);
  });

  it("drift-fences the deterministic facts before any confirmation write", async () => {
    const records = await productionShapedWorld();
    const dry = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    const result = await runHealthKitStrengthAutoConfirmAcceptance({
      records,
      authorization: AUTHORIZATION,
      apply: true,
      expected: { ...dry.facts, autoConfirm: { ...dry.facts.autoConfirm, assessmentDigest: "changed" } },
      now: () => new Date(NOW),
    });
    expect(result).toMatchObject({ outcome: "drifted", drift: ["autoConfirm"] });
    expect(records.snapshot().healthKitWorkoutLinks[0].status).toBe("candidate");
    expect(records.snapshot().healthKitWorkoutLinkClaims).toEqual([]);
    expect(records.snapshot().evidenceReviews ?? []).toEqual([]);
  });

  it.each([
    ["2026-09-22", "2026-09-22"],
    ["2026-09-23", "2026-09-24"],
    ["2026-09-24", "2026-09-24"],
  ])("refuses every acceptance window outside the exact September 23 day: %s to %s", async (startLocalDate, endLocalDate) => {
    const records = await productionShapedWorld();
    const before = records.snapshot();
    await expect(buildHealthKitPayload({
      kind: "strength-auto-confirm",
      sha: SHA,
      start: startLocalDate,
      end: endLocalDate,
      mode: "dry-run",
    })).rejects.toThrow("bounded to --start 2026-09-23 --end 2026-09-23");
    expect(await runHealthKitStrengthAutoConfirmAcceptance({
      records,
      authorization: { ...AUTHORIZATION, startLocalDate, endLocalDate },
      now: () => new Date(NOW),
    })).toEqual({ outcome: "refused", reasons: ["acceptance_window_not_september_23"] });
    expect(records.snapshot()).toEqual(before);
  });

  it.each(["missing", "foreign"])("refuses an already-confirmed replay with %s exact claims", async (corruption) => {
    const records = await productionShapedWorld();
    const dry = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, apply: true, expected: dry.facts, now: () => new Date(NOW) });
    const snapshot = records.snapshot();
    snapshot.healthKitWorkoutLinkClaims = corruption === "missing"
      ? []
      : snapshot.healthKitWorkoutLinkClaims.map((claim) => ({ ...claim, holderLinkId: "foreign-link" }));
    const corrupt = createInMemoryCanonicalRecordStore(snapshot);
    const result = await runHealthKitStrengthAutoConfirmAcceptance({ records: corrupt, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    expect(result).toMatchObject({ outcome: "refused", reasons: ["stored_relationship_violations"] });
  });

  it("refuses an already-confirmed acceptance replay after live Logger provenance is removed", async () => {
    const records = await productionShapedWorld();
    const dry = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, apply: true, expected: dry.facts, now: () => new Date(NOW) });
    const snapshot = records.snapshot();
    delete snapshot.canonicalEvidenceObjects[0].payload.metadata.logger_origin;
    delete snapshot.canonicalEvidenceObjects[0].payload.metadata.logger_mode;
    const corrupt = createInMemoryCanonicalRecordStore(snapshot);
    expect(await runHealthKitStrengthAutoConfirmAcceptance({ records: corrupt, authorization: AUTHORIZATION, now: () => new Date(NOW) }))
      .toMatchObject({ outcome: "refused", reasons: ["LINK_SESSION_UNAVAILABLE"] });
  });

  it.each([
    ["wrong action", (review) => { review.resolution.action = "no_match"; }],
    ["wrong selected session", (review) => { review.resolution.selectedLoggerSessionCanonicalId = "other-session"; }],
    ["empty resolution history", (review) => { review.resolutionHistory = []; }],
    ["missing terminal lifecycle", (review) => { review.lifecycleHistory = review.lifecycleHistory.filter((entry) => entry.status !== "resolved_confirmed"); }],
  ])("refuses an already-confirmed replay with %s", async (_label, corruptReview) => {
    const records = await productionShapedWorld();
    const dry = await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    await runHealthKitStrengthAutoConfirmAcceptance({ records, authorization: AUTHORIZATION, apply: true, expected: dry.facts, now: () => new Date(NOW) });
    const snapshot = records.snapshot();
    corruptReview(snapshot.evidenceReviews[0]);
    const corrupt = createInMemoryCanonicalRecordStore(snapshot);
    const result = await runHealthKitStrengthAutoConfirmAcceptance({ records: corrupt, authorization: AUTHORIZATION, now: () => new Date(NOW) });
    expect(result).toMatchObject({ outcome: "refused", reasons: ["confirmed_link_missing_reconciliation_history"] });
  });
});

async function productionShapedWorld({ liveLogger = true } = {}) {
  const records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitConfiguration: [policy()],
    canonicalEvidenceObjects: [logger(liveLogger)],
    evidenceReviews: [],
    evidencePackages: [],
    trainingPerformanceEvents: [{ id: "sentinel", version: 1 }],
    canonicalExerciseLibrary: [{ id: "sentinel", version: 1 }],
  });
  await createCanonicalPersistenceCommandPorts({ records, now: () => new Date(NOW) })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: NOW, clientTimeZone: "America/Los_Angeles", idempotencyKey: "sep23-fixture" },
      payload: { batchId: "sep23-fixture", observations: [workout()] },
    });
  return records;
}

function policy() {
  return {
    id: "healthkit_workout_canonical_activation_policy",
    schemaVersion: "healthkit-workout-activation-policy-v1",
    status: "enabled",
    domains: ["workout"],
    families: ["strength"],
    effectiveLocalDate: DAY,
    endLocalDate: DAY,
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    linkAutoConfirm: false,
    version: 1,
  };
}

function workout() {
  return {
    observationType: "workout",
    externalId: "sep23-workout-source",
    source: { bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch" },
    occurrence: {
      localDate: DAY,
      timeZone: "America/Los_Angeles",
      startedAt: `${DAY}T10:00:00-07:00`,
      endedAt: `${DAY}T11:00:00-07:00`,
    },
    workout: { activityType: "50", durationSeconds: 3600, activeCalories: 400, averageHeartRate: 122 },
  };
}

function logger(liveLogger) {
  return {
    canonicalId: "logger-sep23",
    version: 1,
    quality: { status: "active" },
    payload: {
      id: "logger-sep23",
      evidence_type: "training",
      observed_at: DAY,
      source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
      metadata: {
        activity_type: "Traditional Strength Training",
        start_time: `${DAY}T10:01:00-07:00`,
        end_time: `${DAY}T10:59:00-07:00`,
        duration_seconds: 3480,
        ...(liveLogger ? { logger_origin: "training_logger", logger_mode: "live" } : {}),
      },
      exercises: [{ name: "Bench Press", sets: [{ reps: 8, weight: 185 }] }],
    },
  };
}
