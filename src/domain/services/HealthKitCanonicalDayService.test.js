import { describe, expect, it } from "vitest";
import {
  HealthKitCoexistenceState,
  assessHealthKitCoexistence,
  compareHealthKitDailySnapshotPrecedence,
  getHealthKitCanonicalDayLogicalKey,
  getHealthKitCanonicalDayRecordId,
  reconcileHealthKitCanonicalDay,
} from "./HealthKitCanonicalDayService.js";
import { normalizeHealthKitObservationBatch } from "./HealthKitObservationService.js";
import {
  HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE,
  HealthKitEvidenceQuarantineError,
  assertNotQuarantinedHealthKitEvidence,
  assessHealthKitStrategicEvidenceEligibility,
  isHealthKitDerivedRecord,
  selectStrategicallyEligibleRecords,
} from "./HealthKitEvidenceEligibilityPolicy.js";

const OWNER = "user_founder_001";
const NOW = "2026-09-24T09:30:00.000Z";

describe("HealthKit canonical Activity days", () => {
  it("creates one deterministic canonical day per local date with HealthKit provenance", () => {
    const observation = activity({ moveCalories: 812 });
    const result = reconcile({ observation });
    expect(result.action).toBe("create");
    expect(result.record).toMatchObject({
      id: "healthkit_canonical_day_activity_2026-09-23",
      domain: "activity",
      localDate: "2026-09-23",
      logicalDayKey: "activity_day|2026-09-23",
      revision: 1,
      current: {
        coverage: "complete_day",
        sourceRevision: 1,
        values: { dailyActivity: { move_calories: 812, exercise_minutes: 45, stand_hours: 12 } },
        workoutActiveCaloriesAdditive: false,
      },
      provenance: {
        application: "Apple Health",
        integration: "HealthKit",
        modality: "direct",
        bundleIdentifier: "com.apple.Health",
        sourceObservationIds: [expect.stringMatching(/^healthkit_observation_[0-9a-f]{64}$/)],
        basis: "healthkit_activity_summary_daily_total",
      },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(getHealthKitCanonicalDayRecordId("activity", "2026-09-23")).toBe(result.record.id);
    expect(getHealthKitCanonicalDayLogicalKey("nutrition", "2026-09-23")).toBe("nutrition|2026-09-23");
  });

  it("is idempotent for the same source observation and never bumps the revision", () => {
    const observation = activity();
    const first = reconcile({ observation });
    const replay = reconcile({ observation, existing: first.record });
    expect(replay.action).toBe("replay");
    expect(replay.record).toBe(first.record);
  });

  it("updates the same day for a newer device revision and keeps prior values in history", () => {
    const first = reconcile({ observation: activity({ moveCalories: 400, sourceRevision: 1, coverage: "partial_day" }) });
    const second = reconcile({
      observation: activity({ moveCalories: 620, sourceRevision: 2, coverage: "partial_day" }),
      existing: first.record,
    });
    expect(second.action).toBe("update");
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.revision).toBe(2);
    expect(second.record.current.values.dailyActivity.move_calories).toBe(620);
    expect(second.record.revisionHistory).toHaveLength(1);
    expect(second.record.revisionHistory[0]).toMatchObject({ revision: 1, coverage: "partial_day", values: { dailyActivity: { move_calories: 400 } } });
    expect(second.record.priorSemanticFingerprint).toBe(first.record.semanticFingerprint);
    expect(second.record.provenance.sourceObservationIds).toHaveLength(2);
  });

  it("lets complete_day outrank a numerically newer partial_day and never lets partial displace complete", () => {
    const complete = reconcile({ observation: activity({ coverage: "complete_day", sourceRevision: 1, moveCalories: 900 }) });
    const newerPartial = reconcile({
      observation: activity({ coverage: "partial_day", sourceRevision: 5, moveCalories: 950 }),
      existing: complete.record,
    });
    expect(newerPartial).toMatchObject({ action: "superseded", reason: "complete_day_summary_already_received" });
    const partial = reconcile({ observation: activity({ coverage: "partial_day", sourceRevision: 5, moveCalories: 950 }) });
    const promoted = reconcile({
      observation: activity({ coverage: "complete_day", sourceRevision: 1, moveCalories: 900 }),
      existing: partial.record,
    });
    expect(promoted).toMatchObject({ action: "update", reason: "higher_coverage_snapshot" });
    expect(promoted.record.current.values.dailyActivity.move_calories).toBe(900);
  });

  it("treats an older same-coverage revision as superseded", () => {
    const newer = reconcile({ observation: activity({ sourceRevision: 3, moveCalories: 900 }) });
    const older = reconcile({ observation: activity({ sourceRevision: 2, moveCalories: 800 }), existing: newer.record });
    expect(older).toMatchObject({ action: "superseded", reason: "newer_device_revision_already_received" });
  });

  it("keeps the existing day when an equal-coverage snapshot comes from another device", () => {
    const first = reconcile({ observation: activity({ sourceRevision: 1 }), device: "device-a" });
    const other = reconcile({ observation: activity({ sourceRevision: 9, moveCalories: 999 }), device: "device-b", existing: first.record });
    expect(other).toMatchObject({ action: "superseded", reason: "cross_device_equal_coverage_kept_existing" });
  });

  it("does not bump the revision when a coverage-changing snapshot leaves values identical and coverage equal", () => {
    const first = reconcile({ observation: activity({ sourceRevision: 1, moveCalories: 700 }) });
    const identical = reconcile({ observation: activity({ sourceRevision: 2, moveCalories: 700 }), existing: first.record });
    expect(identical.action).toBe("update");
    expect(identical.record.revision).toBe(1);
    expect(identical.record.revisionHistory).toHaveLength(0);
    expect(identical.record.provenance.sourceObservationIds).toHaveLength(2);
  });

  it("counts a partial-to-complete change with identical numbers as a material revision", () => {
    const partial = reconcile({ observation: activity({ coverage: "partial_day", moveCalories: 700 }) });
    const complete = reconcile({ observation: activity({ coverage: "complete_day", sourceRevision: 2, moveCalories: 700 }), existing: partial.record });
    expect(complete.record.revision).toBe(2);
    expect(complete.record.revisionHistory).toHaveLength(1);
  });

  it("canonicalizes only approved Activity metrics and reports the rest instead of dropping silently", () => {
    const observation = activity({ extra: { heart_rate_variability: 41, steps: 12034 } });
    const { record } = reconcile({ observation });
    expect(record.current.values.dailyActivity).toEqual({ move_calories: 700, exercise_minutes: 45, stand_hours: 12, steps: 12034 });
    expect(record.current.unrecognizedMetricKeys).toEqual(["heart_rate_variability"]);
  });

  it("orders snapshots by coverage first, then device-scoped revision", () => {
    const a = { coverage: "partial_day", sourceRevision: 9, deliveryDeviceId: "d" };
    const b = { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d" };
    expect(compareHealthKitDailySnapshotPrecedence(a, b)).toBeGreaterThan(0);
    expect(compareHealthKitDailySnapshotPrecedence(b, a)).toBeLessThan(0);
  });
});

describe("HealthKit canonical Nutrition days", () => {
  it("canonicalizes source-neutral daily totals without fabricating meals", () => {
    const observation = nutrition();
    const { record } = reconcile({ observation });
    expect(record).toMatchObject({
      id: "healthkit_canonical_day_nutrition_2026-09-23",
      domain: "nutrition",
      logicalDayKey: "nutrition|2026-09-23",
      current: {
        coverage: "complete_day",
        values: {
          dailyTotals: { calories: 2400, protein_g: 210, carbs_g: 240, fat_g: 70 },
          dailyTotalsScope: "full_day_summary",
          assertion: {
            tier: "full_day_asserted",
            origin: "device_aggregate",
            reliability: "high",
            energyUsable: true,
            energyCompleteness: "complete",
          },
          mealObjects: 0,
        },
        basis: "healthkit_dietary_daily_statistics",
      },
      evidenceEligibility: { state: "quarantined" },
    });
    expect(JSON.stringify(record)).not.toMatch(/"meals"/);
  });

  it("marks a partial-day snapshot as a low-reliability partial subtotal, not a full-day assertion", () => {
    const { record } = reconcile({ observation: nutrition({ coverage: "partial_day", calories: 900 }) });
    expect(record.current.values.dailyTotalsScope).toBe("partial_meal_subtotal");
    expect(record.current.values.assertion).toMatchObject({ tier: "partial_subtotal", reliability: "low", energyCompleteness: "partial" });
  });

  it("reconciles revisions into the same day: partial then complete then a corrected complete", () => {
    const partial = reconcile({ observation: nutrition({ coverage: "partial_day", calories: 900, sourceRevision: 1 }) });
    const complete = reconcile({ observation: nutrition({ coverage: "complete_day", calories: 2400, sourceRevision: 2 }), existing: partial.record });
    const corrected = reconcile({ observation: nutrition({ coverage: "complete_day", calories: 2350, sourceRevision: 3 }), existing: complete.record });
    expect(corrected.record.id).toBe(partial.record.id);
    expect(corrected.record.revision).toBe(3);
    expect(corrected.record.current.values.dailyTotals.calories).toBe(2350);
    expect(corrected.record.revisionHistory.map((entry) => entry.values.dailyTotals.calories)).toEqual([900, 2400]);
    const staleReplay = reconcile({ observation: nutrition({ coverage: "complete_day", calories: 2400, sourceRevision: 2 }), existing: corrected.record });
    expect(staleReplay.action).toBe("replay");
  });
});

describe("coexistence with screenshot and manual sources", () => {
  const screenshotActivity = (moveCalories) => ({
    canonicalId: "activity_day|2026-09-23",
    quality: { status: "active" },
    payload: {
      evidence_type: "activity_day",
      observed_at: "2026-09-23",
      daily_activity: { move_calories: moveCalories, exercise_minutes: 45, stand_hours: 12 },
      source: { application: "Apple Fitness", modality: "screenshot" },
    },
  });
  const mfpNutrition = (calories, protein = 210) => ({
    canonicalId: "nutrition|2026-09-23|nutrition-day",
    quality: { status: "active" },
    payload: {
      evidence_type: "nutrition",
      observed_at: "2026-09-23",
      daily_totals: { calories, protein_g: protein, carbs_g: 240, fat_g: 70 },
      metadata: { date: "2026-09-23", daily_totals_scope: "full_day_summary" },
      source: { application: "MyFitnessPal", modality: "screenshot" },
    },
  });

  it("reports no other source when only HealthKit exists", () => {
    const { record } = reconcile({ observation: activity() });
    expect(record.coexistence).toMatchObject({ state: HealthKitCoexistenceState.NO_OTHER_SOURCE, resolutionApplied: "none" });
  });

  it("agrees within rounding-level Activity tolerance and does not touch the screenshot day", () => {
    const evidence = [screenshotActivity(700)];
    const before = structuredClone(evidence);
    const { record } = reconcile({ observation: activity({ moveCalories: 700.4 }), canonicalEvidenceObjects: evidence });
    expect(record.coexistence).toMatchObject({
      state: HealthKitCoexistenceState.CONSISTENT,
      provingPeriodAuthority: "evidence_store_remains_strategic_authority",
      otherSource: { application: "Apple Fitness", modality: "screenshot" },
    });
    expect(evidence).toEqual(before);
  });

  it("surfaces an Activity conflict beyond tolerance without choosing a winner", () => {
    const evidence = [screenshotActivity(700)];
    const { record } = reconcile({ observation: activity({ moveCalories: 760 }), canonicalEvidenceObjects: evidence });
    expect(record.coexistence).toMatchObject({
      state: HealthKitCoexistenceState.CONFLICT_SURFACED,
      conflictingFields: ["move_calories"],
      resolutionApplied: "none",
    });
    expect(record.coexistence.fields.find((field) => field.field === "move_calories")).toMatchObject({ healthKit: 760, other: 700, delta: 60 });
    expect(record.current.values.dailyActivity.move_calories).toBe(760);
    expect(evidence[0].payload.daily_activity.move_calories).toBe(700);
  });

  it("uses the established Nutrition reconciliation tolerance against a MyFitnessPal total", () => {
    const within = reconcile({ observation: nutrition({ calories: 2420 }), canonicalEvidenceObjects: [mfpNutrition(2410)] });
    expect(within.record.coexistence.state).toBe(HealthKitCoexistenceState.CONSISTENT);
    const beyond = reconcile({ observation: nutrition({ calories: 2500 }), canonicalEvidenceObjects: [mfpNutrition(2410)] });
    expect(beyond.record.coexistence).toMatchObject({ state: HealthKitCoexistenceState.CONFLICT_SURFACED, conflictingFields: ["calories"] });
  });

  it("does not call a partial HealthKit snapshot that trails a full-day source a conflict", () => {
    const { record } = reconcile({ observation: nutrition({ coverage: "partial_day", calories: 1200 }), canonicalEvidenceObjects: [mfpNutrition(2410)] });
    expect(record.coexistence.state).toBe(HealthKitCoexistenceState.CONSISTENT);
    expect(record.coexistence.fields.find((field) => field.field === "calories")).toMatchObject({ partialSnapshotShortfall: true });
  });

  it("can be reassessed later when the other source arrives after HealthKit, deterministically", () => {
    const { record } = reconcile({ observation: activity({ moveCalories: 700 }) });
    const later = assessHealthKitCoexistence({
      domain: "activity",
      localDate: "2026-09-23",
      healthKitDay: record,
      canonicalEvidenceObjects: [screenshotActivity(700)],
    });
    expect(later.state).toBe(HealthKitCoexistenceState.CONSISTENT);
    expect(assessHealthKitCoexistence({
      domain: "activity", localDate: "2026-09-23", healthKitDay: record, canonicalEvidenceObjects: [screenshotActivity(700)],
    })).toEqual(later);
  });

  it("ignores Evidence days for other dates", () => {
    const other = screenshotActivity(500);
    other.payload.observed_at = "2026-09-22";
    other.canonicalId = "activity_day|2026-09-22";
    const { record } = reconcile({ observation: activity(), canonicalEvidenceObjects: [other] });
    expect(record.coexistence.state).toBe(HealthKitCoexistenceState.NO_OTHER_SOURCE);
  });
});

describe("strategic Evidence eligibility policy", () => {
  it("is a fail-closed constant with no runtime switch", () => {
    expect(HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE).toBe(false);
  });

  it("quarantines every HealthKit-derived canonical day and observation", () => {
    const day = reconcile({ observation: activity() }).record;
    const nutritionDay = reconcile({ observation: nutrition() }).record;
    for (const record of [day, nutritionDay]) {
      expect(isHealthKitDerivedRecord(record)).toBe(true);
      expect(assessHealthKitStrategicEvidenceEligibility(record)).toMatchObject({
        applicable: true, eligible: false, state: "quarantined", reason: "healthkit_proving_period_quarantine",
      });
    }
    expect(selectStrategicallyEligibleRecords([day, nutritionDay])).toEqual([]);
  });

  it("detects HealthKit ancestry structurally, not by display name", () => {
    expect(isHealthKitDerivedRecord({ payload: { source: { integration: "HealthKit" } } })).toBe(true);
    expect(isHealthKitDerivedRecord({ payload: { provenance: { source_observation_ids: ["healthkit_observation_abc"] } } })).toBe(true);
    expect(isHealthKitDerivedRecord({ payload: { source: { application: "Apple Health", modality: "screenshot" } } })).toBe(false);
    expect(isHealthKitDerivedRecord({ payload: { source: { application: "MyFitnessPal", modality: "screenshot" } } })).toBe(false);
  });

  it("leaves non-HealthKit Evidence exactly as it was", () => {
    const evidence = [
      { canonicalId: "a", payload: { evidence_type: "activity_day", source: { application: "Apple Fitness", modality: "screenshot" } } },
      { canonicalId: "b", payload: { evidence_type: "nutrition", source: { application: "MyFitnessPal", modality: "screenshot" } } },
      { canonicalId: "c", payload: { evidence_type: "training", exercises: [{ name: "Squat" }] } },
    ];
    expect(selectStrategicallyEligibleRecords(evidence)).toEqual(evidence);
    expect(assessHealthKitStrategicEvidenceEligibility(evidence[0])).toMatchObject({ applicable: false, state: "not_applicable" });
  });

  it("refuses HealthKit-derived records at the Evidence write boundary", () => {
    expect(() => assertNotQuarantinedHealthKitEvidence({
      evidence_type: "activity_day", source: { integration: "HealthKit", modality: "direct" },
    })).toThrow(HealthKitEvidenceQuarantineError);
    expect(() => assertNotQuarantinedHealthKitEvidence({
      evidence_type: "activity_day", source: { application: "Apple Fitness", modality: "screenshot" },
    })).not.toThrow();
  });
});

function reconcile({ observation, existing = null, device = "founder-iphone", canonicalEvidenceObjects = [] } = {}) {
  const normalized = normalizeHealthKitObservationBatch({
    batchId: `batch-${Math.abs(hash(JSON.stringify(observation)))}`,
    observations: [observation],
    principalDeviceId: device,
  }).observations[0];
  return reconcileHealthKitCanonicalDay({
    observation: normalized,
    existing,
    ownerUserId: OWNER,
    now: NOW,
    canonicalEvidenceObjects,
  });
}

function hash(value) {
  let result = 0;
  for (const char of value) result = ((result << 5) - result + char.charCodeAt(0)) | 0;
  return result;
}

function source() {
  return { bundleIdentifier: "com.apple.Health", productType: "iPhone17,1" };
}

function activity({ coverage = "complete_day", moveCalories = 700, sourceRevision = 1, extra = {} } = {}) {
  return {
    observationType: "activity_summary",
    externalId: "activity-summary:2026-09-23",
    source: source(),
    occurrence: { localDate: "2026-09-23", timeZone: "America/Los_Angeles" },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts",
      coverage,
      sourceRevision,
      dailyActivity: { move_calories: moveCalories, exercise_minutes: 45, stand_hours: 12, ...extra },
    },
  };
}

function nutrition({ coverage = "complete_day", calories = 2400, sourceRevision = 1 } = {}) {
  return {
    observationType: "nutrition_daily_total",
    externalId: "nutrition-daily-total:2026-09-23",
    source: source(),
    occurrence: { localDate: "2026-09-23", timeZone: "America/Los_Angeles" },
    nutritionDailyTotal: {
      aggregationScope: "daily_total_all_sources",
      coverage,
      sourceRevision,
      dailyNutrition: { calories, protein_g: 210, carbs_g: 240, fat_g: 70 },
    },
  };
}
