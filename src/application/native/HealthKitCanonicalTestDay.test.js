import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createV3EvidenceUniverse } from "../../domain/intelligence/V3EvidenceUniverse.js";
import { createCanonicalEvidenceObservationsV3 } from "../../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { selectStrategicallyEligibleEvidenceV3 } from "../../domain/intelligence/v3/EvidenceEligibilityV3.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import {
  assessHealthKitStrategicEvidenceEligibility,
  selectStrategicallyEligibleRecords,
} from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";

const OWNER = "user_founder_001";
const POLICY_ID = "healthkit_canonical_daily_activation_policy";
const TEST_DAY = "2026-09-23";
const STRATEGIC = [
  "goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses",
  "dailyBriefings", "briefingReconciliationWorkItems", "phaseReviewDecisions",
  "phaseLifecycleReadModels", "operatingPlan", "protocols", "trainingPerformanceEvents",
];

describe("HealthKit controlled canonical test day (Activity + Nutrition)", () => {
  describe("before activation", () => {
    it("keeps both domains raw and creates no canonical day", async () => {
      const records = store({ policy: null });
      const result = await ingest(records, [activity(), nutrition()]);
      expect(result.result).toMatchObject({ activityDayCanonicalizedCount: 0, nutritionDayCanonicalizedCount: 0 });
      const snapshot = records.snapshot();
      expect(snapshot.healthKitCanonicalDays).toEqual([]);
      expect(snapshot.healthKitObservations.map((item) => item.reconciliation.reason))
        .toEqual(["canonicalization_not_activated", "canonicalization_not_activated"]);
    });
  });

  describe("Activity", () => {
    it("has one canonical day per date, idempotent replay, and revisions reconcile in place", async () => {
      const records = store();
      await ingest(records, [activity({ coverage: "partial_day", moveCalories: 320, sourceRevision: 1 })], "b1");
      // exact HTTP-level retry under a new delivery key and batch id
      const replay = await ingest(records, [activity({ coverage: "partial_day", moveCalories: 320, sourceRevision: 1 })], "b2");
      expect(replay.result).toMatchObject({ status: "matched", createdCount: 0, matchedCount: 1 });
      await ingest(records, [activity({ coverage: "partial_day", moveCalories: 610, sourceRevision: 2 })], "b3");
      await ingest(records, [activity({ coverage: "complete_day", moveCalories: 780, sourceRevision: 3 })], "b4");
      const days = records.snapshot().healthKitCanonicalDays;
      expect(days).toHaveLength(1);
      expect(days[0]).toMatchObject({
        id: `healthkit_canonical_day_activity_${TEST_DAY}`,
        revision: 3,
        current: { coverage: "complete_day", values: { dailyActivity: { move_calories: 780 } } },
      });
      expect(days[0].revisionHistory.map((entry) => entry.values.dailyActivity.move_calories)).toEqual([320, 610]);
      expect(days[0].provenance.sourceObservationIds).toHaveLength(3);
    });

    it("never lets a late partial delivery displace the complete day", async () => {
      const records = store();
      await ingest(records, [activity({ coverage: "complete_day", moveCalories: 780, sourceRevision: 3 })], "b1");
      const late = await ingest(records, [activity({ coverage: "partial_day", moveCalories: 900, sourceRevision: 9 })], "b2");
      expect(late.result.observations[0].reconciliation).toMatchObject({
        state: "activity_summary_superseded", reason: "complete_day_summary_already_received",
      });
      expect(records.snapshot().healthKitCanonicalDays[0].current.values.dailyActivity.move_calories).toBe(780);
    });

    it("does not add workout calories to the daily total and does not touch Training authority", async () => {
      const records = store();
      const before = records.snapshot();
      await ingest(records, [activity({ moveCalories: 780 }), workout()]);
      const after = records.snapshot();
      const day = after.healthKitCanonicalDays[0];
      expect(day.current.values.dailyActivity.move_calories).toBe(780);
      expect(day.current.workoutActiveCaloriesAdditive).toBe(false);
      expect(JSON.stringify(day)).not.toMatch(/exercises|sets|reps|training_session/i);
      expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
      expect(after.trainingPerformanceEvents).toEqual(before.trainingPerformanceEvents);
      // A strength workout with no Workout Logger match stays source-only: no
      // link, no session mutation. Workout Logger remains the only authority.
      expect(after.healthKitObservations.find((item) => item.observationType === "workout").reconciliation)
        .toMatchObject({ state: "source_only", reason: "no_trustworthy_training_session_match" });
    });
  });

  describe("Nutrition", () => {
    it("canonicalizes daily totals without meals, keeps basis/reliability/provenance, and reconciles revisions", async () => {
      const records = store();
      await ingest(records, [nutrition({ coverage: "partial_day", calories: 900, sourceRevision: 1 })], "b1");
      await ingest(records, [nutrition({ coverage: "complete_day", calories: 2400, sourceRevision: 2 })], "b2");
      const replay = await ingest(records, [nutrition({ coverage: "complete_day", calories: 2400, sourceRevision: 2 })], "b3");
      expect(replay.result.matchedCount).toBe(1);
      await ingest(records, [nutrition({ coverage: "complete_day", calories: 2350, sourceRevision: 3 })], "b4");
      const days = records.snapshot().healthKitCanonicalDays;
      expect(days).toHaveLength(1);
      expect(days[0]).toMatchObject({
        id: `healthkit_canonical_day_nutrition_${TEST_DAY}`,
        revision: 3,
        current: {
          values: {
            dailyTotals: { calories: 2350, protein_g: 210, carbs_g: 240, fat_g: 70 },
            assertion: { tier: "full_day_asserted", origin: "device_aggregate", reliability: "high" },
            mealObjects: 0,
          },
          basis: "healthkit_dietary_daily_statistics",
        },
        provenance: { integration: "HealthKit", bundleIdentifier: "com.apple.Health" },
      });
      expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
    });

    it("keeps Activity and Nutrition as separate canonical days for the same date", async () => {
      const records = store();
      await ingest(records, [activity(), nutrition()]);
      expect(records.snapshot().healthKitCanonicalDays.map((day) => day.id).sort()).toEqual([
        `healthkit_canonical_day_activity_${TEST_DAY}`,
        `healthkit_canonical_day_nutrition_${TEST_DAY}`,
      ]);
    });
  });

  describe("day attribution, 3 AM late delivery, and the activation window", () => {
    it("owns the day by observed local date, not receipt time (00:00-02:59 delivery lands on the prior day)", async () => {
      const records = store();
      // 02:30 PDT on Sep 24 is 09:30Z. The observation belongs to Sep 23.
      await ingest(records, [activity({ coverage: "complete_day", moveCalories: 800, sourceRevision: 4 }), nutrition({ coverage: "complete_day", calories: 2450, sourceRevision: 4 })], "late", {
        receivedAt: "2026-09-24T09:30:00.000Z",
      });
      const days = records.snapshot().healthKitCanonicalDays;
      expect(days.map((day) => day.localDate)).toEqual([TEST_DAY, TEST_DAY]);
      const observation = records.snapshot().healthKitObservations[0];
      expect(observation.occurrenceDate).toBe(TEST_DAY);
      expect(observation.ingestion.firstReceivedAt).toBe("2026-09-24T09:30:00.000Z");
    });

    it("keeps new-day observations out of the prior-day canonical record", async () => {
      const records = store();
      await ingest(records, [activity({ coverage: "complete_day", moveCalories: 800, sourceRevision: 4 })], "b1", { receivedAt: "2026-09-24T09:30:00.000Z" });
      const nextDay = await ingest(records, [
        activity({ localDate: "2026-09-24", coverage: "partial_day", moveCalories: 35, sourceRevision: 1 }),
        nutrition({ localDate: "2026-09-24", coverage: "partial_day", calories: 120, sourceRevision: 1 }),
      ], "b2", { receivedAt: "2026-09-24T09:31:00.000Z" });
      expect(nextDay.result).toMatchObject({ activityDayCanonicalizedCount: 0, nutritionDayCanonicalizedCount: 0 });
      expect(nextDay.result.observations.map((item) => item.reconciliation)).toEqual([
        expect.objectContaining({ reason: "after_activation_window", canonicalizationPermanentBar: true }),
        expect.objectContaining({ reason: "after_activation_window", canonicalizationPermanentBar: true }),
      ]);
      const days = records.snapshot().healthKitCanonicalDays;
      expect(days).toHaveLength(1);
      expect(days[0].current.values.dailyActivity.move_calories).toBe(800);
    });

    it("does not backfill the previous date, even if it is delivered later", async () => {
      const records = store();
      const prior = await ingest(records, [activity({ localDate: "2026-09-22", moveCalories: 500 })]);
      expect(prior.result.observations[0].reconciliation).toMatchObject({
        reason: "before_activation_date", canonicalizationPermanentBar: true,
      });
      expect(records.snapshot().healthKitCanonicalDays).toEqual([]);
    });

    it("only canonicalizes domains named by the policy", async () => {
      const records = store({ domains: ["activity"] });
      const result = await ingest(records, [activity(), nutrition()]);
      expect(result.result).toMatchObject({ activityDayCanonicalizedCount: 1, nutritionDayCanonicalizedCount: 0 });
      expect(records.snapshot().healthKitObservations.find((item) => item.observationType === "nutrition_daily_total").reconciliation)
        .toMatchObject({ reason: "domain_not_in_activation_scope" });
    });

    it("does not reconsider a raw observation when activation appears later (no retroactive backfill)", async () => {
      const records = store({ policy: null });
      await ingest(records, [activity()], "b1");
      await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID, payload: policy() });
      const replay = await ingest(records, [activity()], "b2");
      expect(replay.result.activityDayCanonicalizedCount).toBe(0);
      expect(records.snapshot().healthKitCanonicalDays).toEqual([]);
    });
  });

  describe("coexistence with screenshot / manual sources", () => {
    it("records agreement or a surfaced conflict and never overwrites the Evidence day", async () => {
      const activityDay = screenshotActivityDay(700);
      const nutritionDay = mfpNutritionDay(2410);
      const records = store({ evidence: [activityDay, nutritionDay] });
      const before = structuredClone(records.snapshot().canonicalEvidenceObjects);
      const result = await ingest(records, [activity({ moveCalories: 760 }), nutrition({ calories: 2415 })]);
      const days = Object.fromEntries(records.snapshot().healthKitCanonicalDays.map((day) => [day.domain, day]));
      expect(days.activity.coexistence).toMatchObject({ state: "conflict_surfaced", conflictingFields: ["move_calories"], resolutionApplied: "none" });
      expect(days.nutrition.coexistence).toMatchObject({ state: "consistent", resolutionApplied: "none" });
      expect(result.result.observations.map((item) => item.canonicalDay.coexistenceState)).toEqual(["conflict_surfaced", "consistent"]);
      expect(records.snapshot().canonicalEvidenceObjects).toEqual(before);
    });

    it("is deterministic: a later screenshot upload does not change the canonical HealthKit day", async () => {
      const records = store();
      await ingest(records, [activity({ moveCalories: 760 })]);
      const canonicalBefore = structuredClone(records.snapshot().healthKitCanonicalDays);
      await records.put({
        ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "activity_day|2026-09-23", payload: screenshotActivityDay(700),
      });
      expect(records.snapshot().healthKitCanonicalDays).toEqual(canonicalBefore);
    });
  });

  describe("strategic quarantine (V3, Confidence, briefings, Evidence)", () => {
    it("writes nothing to strategic collections or Evidence", async () => {
      const records = store({ evidence: [screenshotActivityDay(700), mfpNutritionDay(2410)] });
      const before = records.snapshot();
      await ingest(records, [activity(), nutrition(), workout()]);
      const after = records.snapshot();
      for (const collection of [...STRATEGIC, "canonicalEvidenceObjects", "evidencePackages", "dailyBriefings"]) {
        expect(after[collection]).toEqual(before[collection]);
      }
      expect(after.healthKitCanonicalDays).toHaveLength(2);
    });

    it("gives V3 zero HealthKit Activity or Nutrition evidence", async () => {
      const records = store();
      await ingest(records, [activity(), nutrition()]);
      const snapshot = records.snapshot();
      const universe = createV3EvidenceUniverse({
        store: snapshot,
        goal: { id: "goal-one" },
        phase: { id: "phase-one", startedAt: "2026-09-01" },
        evidenceCutoff: "2026-09-27T06:59:59.999Z",
      });
      expect(JSON.stringify(universe)).not.toMatch(/healthkit/i);
      expect(universe.canonicalEvidenceObjects).toEqual([]);
      const calibration = createPairedCalibrationFixtures().dexa;
      const observations = createCanonicalEvidenceObservationsV3({
        goalContract: calibration.goalContract,
        goal: { id: calibration.goalContract.goalId },
        phase: { id: calibration.goalContract.phase.phaseId },
        store: { healthKitObservations: snapshot.healthKitObservations, healthKitCanonicalDays: snapshot.healthKitCanonicalDays },
        evidenceCutoff: calibration.evaluationContext.evidenceCutoff,
      });
      expect(observations).toEqual([]);
      expect(selectStrategicallyEligibleEvidenceV3({
        goalContract: calibration.goalContract,
        observations,
        evidenceCutoff: calibration.evaluationContext.evidenceCutoff,
      }).eligibleObservations).toEqual([]);
    });

    it("reports zero V3-eligible HealthKit canonical days through the explicit policy gate", async () => {
      const records = store();
      await ingest(records, [activity(), nutrition()]);
      const days = records.snapshot().healthKitCanonicalDays;
      expect(days.map((day) => assessHealthKitStrategicEvidenceEligibility(day).eligible)).toEqual([false, false]);
      expect(selectStrategicallyEligibleRecords(days)).toEqual([]);
      expect(days.every((day) => day.evidenceEligibility.state === "quarantined" && day.evidenceEligibility.strategic === false)).toBe(true);
      // The source observations stay not_assessed; the eligibility decision lives on the canonical day.
      expect(records.snapshot().healthKitObservations.every((item) => item.evidenceEligibility.state === "not_assessed")).toBe(true);
    });

    it("cannot be promoted by a policy record: eligibility is not configurable", async () => {
      const records = store({ policyOverrides: { strategicEvidenceEligibility: "eligible" } });
      const result = await ingest(records, [activity()]);
      expect(result.result.activityDayCanonicalizedCount).toBe(0);
      expect(records.snapshot().healthKitCanonicalDays).toEqual([]);
      expect(result.result.strategicEvidenceEligibility).toBe("quarantined");
    });
  });

  describe("rollback", () => {
    it("deactivation stops new canonicalization and preserves canonical history", async () => {
      const records = store();
      await ingest(records, [activity({ moveCalories: 780 })], "b1");
      const kept = structuredClone(records.snapshot().healthKitCanonicalDays);
      const current = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID });
      await records.put({
        ownerUserId: OWNER,
        collection: "healthKitConfiguration",
        recordId: POLICY_ID,
        expectedVersion: current.version,
        payload: { ...current, status: "disabled" },
      });
      const after = await ingest(records, [activity({ moveCalories: 900, sourceRevision: 2 })], "b2");
      expect(after.result.activityDayCanonicalizedCount).toBe(0);
      expect(after.result.observations[0].reconciliation.reason).toBe("canonicalization_not_activated");
      expect(records.snapshot().healthKitCanonicalDays).toEqual(kept);
    });

    it("a malformed policy neither throws nor canonicalizes, so Native never sees a permanent rejection", async () => {
      const records = store({ policyOverrides: { domains: "activity" } });
      const result = await ingest(records, [activity()]);
      expect(result.status).toBe("committed");
      expect(result.result.activityDayCanonicalizedCount).toBe(0);
    });
  });
});

async function ingest(records, observations, batchId = "batch-one", { receivedAt = "2026-09-23T23:30:00.000Z" } = {}) {
  return createCanonicalPersistenceCommandPorts({ records, now: () => new Date(receivedAt) })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: receivedAt, clientTimeZone: "America/Los_Angeles", idempotencyKey: `key-${batchId}` },
      payload: { batchId, observations },
    });
}

function policy(overrides = {}) {
  return {
    id: POLICY_ID,
    schemaVersion: "healthkit-canonical-activation-policy-v1",
    status: "enabled",
    domains: ["activity", "nutrition"],
    effectiveLocalDate: TEST_DAY,
    endLocalDate: TEST_DAY,
    strategicEvidenceEligibility: "quarantined",
    historicalBackfill: false,
    version: 1,
    ...overrides,
  };
}

function store({ policy: policyOverride = undefined, domains = undefined, policyOverrides = {}, evidence = [] } = {}) {
  const record = policyOverride === null
    ? []
    : [policy({ ...(domains ? { domains } : {}), ...policyOverrides })];
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitConfiguration: record,
    canonicalEvidenceObjects: evidence,
    evidencePackages: [],
    ...Object.fromEntries(STRATEGIC.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
}

function source() {
  return { bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", productType: "iPhone17,1" };
}

function activity({ localDate = TEST_DAY, coverage = "complete_day", moveCalories = 780, sourceRevision = 1 } = {}) {
  return {
    observationType: "activity_summary",
    externalId: `activity-summary:${localDate}`,
    source: source(),
    occurrence: { localDate, timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200 },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts",
      coverage,
      sourceRevision,
      dailyActivity: { move_calories: moveCalories, exercise_minutes: 52, stand_hours: 11, steps: 9800, walking_running_distance: 7200 },
    },
  };
}

function nutrition({ localDate = TEST_DAY, coverage = "complete_day", calories = 2400, sourceRevision = 1 } = {}) {
  return {
    observationType: "nutrition_daily_total",
    externalId: `nutrition-daily-total:${localDate}`,
    source: source(),
    occurrence: { localDate, timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200 },
    nutritionDailyTotal: {
      aggregationScope: "daily_total_all_sources",
      coverage,
      sourceRevision,
      dailyNutrition: { calories, protein_g: 210, carbs_g: 240, fat_g: 70 },
    },
  };
}

function workout() {
  return {
    observationType: "workout",
    externalId: "hk-workout-001",
    source: source(),
    occurrence: {
      localDate: TEST_DAY,
      timeZone: "America/Los_Angeles",
      startedAt: "2026-09-23T10:00:00-07:00",
      endedAt: "2026-09-23T11:00:00-07:00",
    },
    workout: { activityType: "Traditional Strength Training", durationSeconds: 3600, activeCalories: 400 },
  };
}

function screenshotActivityDay(moveCalories) {
  return {
    canonicalId: "activity_day|2026-09-23",
    version: 1,
    quality: { status: "active" },
    payload: {
      id: "shot-1",
      evidence_type: "activity_day",
      observed_at: TEST_DAY,
      daily_activity: { move_calories: moveCalories, exercise_minutes: 52, stand_hours: 11 },
      source: { application: "Apple Fitness", modality: "screenshot" },
    },
  };
}

function mfpNutritionDay(calories) {
  return {
    canonicalId: "nutrition|2026-09-23|nutrition-day",
    version: 1,
    quality: { status: "active" },
    payload: {
      id: "mfp-1",
      evidence_type: "nutrition",
      observed_at: TEST_DAY,
      daily_totals: { calories, protein_g: 210, carbs_g: 240, fat_g: 70 },
      metadata: { date: TEST_DAY, daily_totals_scope: "full_day_summary" },
      source: { application: "MyFitnessPal", modality: "screenshot" },
    },
  };
}
