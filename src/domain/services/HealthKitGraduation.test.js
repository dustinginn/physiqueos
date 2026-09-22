import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
  assessHealthKitGraduation,
  isHealthKitGraduationProjection,
  overlayGraduatedHealthKitDays,
  projectHealthKitCanonicalDay,
  resolveHealthKitGraduationPolicy,
} from "./HealthKitGraduation.js";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayService.js";
import { selectActiveCanonicalNutritionDays } from "./CanonicalNutritionDayService.js";
import { resolveNutritionDayAuthority } from "../models/nutritionDayAuthority.js";
import { reconcileEnergyDays } from "./EnergyDailyReconciliationService.js";
import { composeLoggedTodaySummary } from "./LoggedTodayService.js";
import {
  assertNotQuarantinedHealthKitEvidence,
  isHealthKitDerivedRecord,
} from "./HealthKitEvidenceEligibilityPolicy.js";

const DATE = "2026-09-21";
const OWNER = "founder";

const policyRecord = (overrides = {}) => ({
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  id: "healthkit_canonical_graduation_policy",
  projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null },
  evidenceEligibility: { enabled: false },
  historicalBriefingRegeneration: false,
  ...overrides,
});
const bothOn = () => policyRecord({ evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null } });

function activityDay({ date = DATE, coverage = "complete_day", moveCalories = 612, exercise = 41, stand = 11, revision = 2 } = {}) {
  return {
    id: `healthkit_canonical_day_activity_${date}`,
    domain: "activity",
    localDate: date,
    userId: OWNER,
    revision,
    semanticFingerprint: "sha256_activity",
    createdAt: `${date}T15:00:00.000Z`,
    updatedAt: `${date}T23:00:00.000Z`,
    current: {
      coverage, sourceRevision: 4, deliveryDeviceId: "device-a", basis: "healthkit_activity_summary_daily_total",
      values: { dailyActivity: { move_calories: moveCalories, exercise_minutes: exercise, stand_hours: stand, steps: 9000 } },
    },
    provenance: { sourceObservationIds: ["healthkit_observation_abc"] },
  };
}

function nutritionDay({ date = DATE, coverage = "complete_day", totals = { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 } } = {}) {
  return {
    id: `healthkit_canonical_day_nutrition_${date}`,
    domain: "nutrition",
    localDate: date,
    userId: OWNER,
    revision: 1,
    semanticFingerprint: "sha256_nutrition",
    createdAt: `${date}T15:00:00.000Z`,
    updatedAt: `${date}T23:00:00.000Z`,
    current: {
      coverage, sourceRevision: 4, deliveryDeviceId: "device-a", basis: "healthkit_dietary_daily_statistics",
      values: {
        dailyTotals: totals,
        dailyTotalsScope: coverage === "complete_day" ? "full_day_summary" : "partial_meal_subtotal",
        mealObjects: 0,
      },
    },
    provenance: { sourceObservationIds: ["healthkit_observation_def"] },
  };
}

const screenshotActivity = (overrides = {}) => ({
  canonicalId: `activity_day|${DATE}`,
  evidence_type: "activity_day",
  quality: { status: "active" },
  activityRevision: { revision: 1 },
  updatedAt: `${DATE}T22:00:00.000Z`,
  userId: OWNER,
  payload: {
    id: "activity-shot",
    evidence_type: "activity_day",
    observed_at: DATE,
    source: { application: "Apple Fitness", modality: "screenshot" },
    daily_activity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11, move_goal: 700, ring_completion: { move: 87 } },
    provenance: { source_artifact_refs: ["move.png"] },
    ...overrides,
  },
});

const mfpNutrition = ({ source = { application: "MyFitnessPal", modality: "screenshot" }, totals = { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 }, meals = [], scope = "full_day_summary" } = {}) => ({
  canonicalId: `nutrition|${DATE}|nutrition-day`,
  evidence_type: "nutrition",
  quality: { status: "active" },
  updatedAt: `${DATE}T22:00:00.000Z`,
  userId: OWNER,
  payload: {
    id: "nutrition-shot",
    evidence_type: "nutrition",
    observed_at: DATE,
    source,
    daily_totals: totals,
    meals,
    metadata: { date: DATE, daily_totals_scope: scope, completeness: "complete", meal_count: meals.length, confidence: "high" },
  },
});

const overlay = (canonicalObjects, days, policy, purpose = Purpose.PROJECTION) =>
  overlayGraduatedHealthKitDays({ canonicalObjects, healthKitDays: days, policy, purpose });

describe("graduation policy", () => {
  it("is off for a missing record and never throws on a malformed one", () => {
    expect(resolveHealthKitGraduationPolicy(null).projection.enabled).toBe(false);
    for (const bad of [
      { schemaVersion: "other" },
      policyRecord({ historicalBriefingRegeneration: true }),
      policyRecord({ projection: { enabled: true, domains: [], startLocalDate: DATE } }),
      policyRecord({ projection: { enabled: true, domains: ["workout"], startLocalDate: DATE } }),
      policyRecord({ projection: { enabled: true, domains: ["activity"], startLocalDate: "yesterday" } }),
      policyRecord({ projection: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: "2026-09-01" } }),
      policyRecord({ evidenceEligibility: "yes" }),
      "garbage",
    ]) {
      const resolved = resolveHealthKitGraduationPolicy(bad);
      expect(resolved.projection.enabled).toBe(false);
      expect(resolved.evidenceEligibility.enabled).toBe(false);
    }
  });

  it("switches projection and evidence eligibility independently", () => {
    const projectionOnly = resolveHealthKitGraduationPolicy(policyRecord());
    expect(projectionOnly.projection.enabled).toBe(true);
    expect(projectionOnly.evidenceEligibility.enabled).toBe(false);
    const eligibilityOnly = resolveHealthKitGraduationPolicy(policyRecord({
      projection: { enabled: false },
      evidenceEligibility: { enabled: true, domains: ["nutrition"], startLocalDate: DATE, endLocalDate: null },
    }));
    expect(eligibilityOnly.projection.enabled).toBe(false);
    expect(eligibilityOnly.evidenceEligibility.enabled).toBe(true);

    const day = nutritionDay();
    expect(overlay([], [day], projectionOnly, Purpose.PROJECTION).objects).toHaveLength(1);
    expect(overlay([], [day], projectionOnly, Purpose.EVIDENCE).objects).toHaveLength(0);
    expect(overlay([], [day], eligibilityOnly, Purpose.PROJECTION).objects).toHaveLength(0);
    expect(overlay([], [day], eligibilityOnly, Purpose.EVIDENCE).objects).toHaveLength(1);
  });

  it("scopes by domain and date and only lets a complete day be strategic", () => {
    const policy = resolveHealthKitGraduationPolicy(policyRecord({
      projection: { enabled: true, domains: ["nutrition"], startLocalDate: "2026-09-22", endLocalDate: "2026-09-23" },
      evidenceEligibility: { enabled: true, domains: ["nutrition"], startLocalDate: "2026-09-22", endLocalDate: null },
    }));
    expect(assessHealthKitGraduation({ policy, day: nutritionDay({ date: "2026-09-21" }), purpose: Purpose.PROJECTION }).graduated).toBe(false);
    expect(assessHealthKitGraduation({ policy, day: nutritionDay({ date: "2026-09-22" }), purpose: Purpose.PROJECTION }).graduated).toBe(true);
    expect(assessHealthKitGraduation({ policy, day: nutritionDay({ date: "2026-09-24" }), purpose: Purpose.PROJECTION }).graduated).toBe(false);
    expect(assessHealthKitGraduation({ policy, day: activityDay({ date: "2026-09-22" }), purpose: Purpose.PROJECTION }).graduated).toBe(false);
    const partial = nutritionDay({ date: "2026-09-22", coverage: "partial_day" });
    expect(assessHealthKitGraduation({ policy, day: partial, purpose: Purpose.PROJECTION }).graduated).toBe(true);
    expect(assessHealthKitGraduation({ policy, day: partial, purpose: Purpose.EVIDENCE })).toMatchObject({ graduated: false, reason: "strategic_use_requires_complete_day" });
  });

  it("is a no-op when OFF: the same array comes back", () => {
    const objects = [screenshotActivity()];
    expect(overlay(objects, [activityDay()], null).objects).toBe(objects);
    expect(overlay(objects, [activityDay()], policyRecord({ projection: { enabled: false } })).objects).toBe(objects);
  });

  it("rolls back prospectively: switching a scope off removes the day and deletes nothing", () => {
    const days = [activityDay()];
    expect(overlay([], days, policyRecord()).objects).toHaveLength(1);
    expect(overlay([], days, policyRecord({ projection: { enabled: false } })).objects).toHaveLength(0);
    expect(days).toHaveLength(1);
  });
});

describe("Activity graduation", () => {
  it("projects a HealthKit day as an ordinary activity_day the existing selector and Log row understand", () => {
    const { objects } = overlay([], [activityDay()], policyRecord());
    const selected = selectActiveCanonicalActivityDays(objects, { date: DATE });
    expect(selected.records).toHaveLength(1);
    expect(selected.diagnostics).toEqual([]);
    const payload = selected.records[0].payload;
    expect(payload.daily_activity).toEqual({ move_calories: 612, exercise_minutes: 41, stand_hours: 11 });
    expect(payload.source).toMatchObject({ application: "Apple Health", integration: "HealthKit", modality: "direct" });
    expect(payload.observed_at).toBe(DATE);
    const row = composeLoggedTodaySummary({ canonicalObjects: objects, dateKey: DATE }).rows[2];
    expect(row.summary).toBe("612 active calories");
    expect(row.context).toBe("Apple Health");
  });

  it("never adds workout calories on top of the daily active-energy total", () => {
    const projected = projectHealthKitCanonicalDay(activityDay());
    expect(projected.payload.derived_metrics).toEqual({});
    expect(projected.payload.metadata.workout_active_calories_additive).toBe(false);
    expect(projected.payload.daily_activity.workout_active_calories).toBeUndefined();
  });

  it("retains supplemental metrics as provenance only", () => {
    const projected = projectHealthKitCanonicalDay(activityDay());
    expect(projected.payload.metadata.healthkit_supplemental).toEqual({ steps: 9000 });
    expect(projected.payload.daily_activity.steps).toBeUndefined();
  });

  it("does not stack a screenshot and HealthKit for the same wearable measurement (source invariance)", () => {
    const shot = screenshotActivity();
    const { objects, applied } = overlay([shot], [activityDay()], policyRecord());
    const selected = selectActiveCanonicalActivityDays(objects, { date: DATE });
    expect(selected.records).toHaveLength(1);
    expect(selected.diagnostics).toEqual([]);
    expect(applied[0]).toMatchObject({ mode: "merged_into_existing" });
    const merged = selected.records[0].payload;
    // Identical facts to the screenshot alone, one day, screenshot enrichment kept.
    expect(merged.daily_activity).toMatchObject({ move_calories: 612, exercise_minutes: 41, stand_hours: 11, move_goal: 700 });
    expect(objects.filter((object) => object.payload?.evidence_type === "activity_day")).toHaveLength(1);
    expect(merged.metadata.healthkit_reconciliation.state).toBe("consistent");
    expect(selected.records[0].canonicalId).toBe(shot.canonicalId);
  });

  it("gives the same factual Activity values from either transport", () => {
    const fromShot = selectActiveCanonicalActivityDays([screenshotActivity()], { date: DATE }).records[0].payload.daily_activity;
    const fromHealthKit = selectActiveCanonicalActivityDays(overlay([], [activityDay()], policyRecord()).objects, { date: DATE }).records[0].payload.daily_activity;
    for (const key of ["move_calories", "exercise_minutes", "stand_hours"]) expect(fromHealthKit[key]).toBe(fromShot[key]);
  });

  it("surfaces a conflict instead of silently overwriting", () => {
    const shot = screenshotActivity({ daily_activity: { move_calories: 300, exercise_minutes: 41, stand_hours: 11 } });
    const { objects } = overlay([shot], [activityDay()], policyRecord());
    const merged = selectActiveCanonicalActivityDays(objects, { date: DATE }).records[0].payload;
    expect(merged.metadata.healthkit_reconciliation).toMatchObject({ state: "conflict_surfaced", conflictingFields: ["move_calories"] });
    expect(merged.daily_activity.move_calories).toBe(612);
  });

  it("never lets a device silently override an existing explicit Founder correction", () => {
    const correction = screenshotActivity({
      source: { application: "PhysiqueOS", modality: "manual" },
      correction: true,
      daily_activity: { move_calories: 200, exercise_minutes: 41, stand_hours: 11 },
    });
    const { objects, applied } = overlay([correction], [activityDay()], policyRecord());
    expect(applied[0].mode).toBe("existing_kept");
    expect(objects).toEqual([correction]);
    const selected = selectActiveCanonicalActivityDays(objects, { date: DATE }).records[0].payload;
    expect(selected.daily_activity.move_calories).toBe(200);
    expect(selected.source.application).toBe("PhysiqueOS");
  });

  it("never lets a device silently override an existing manual-source Activity day (no explicit correction marker needed)", () => {
    const manual = screenshotActivity({ source: { application: "PhysiqueOS", modality: "manual" }, daily_activity: { move_calories: 500, exercise_minutes: 30, stand_hours: 9 } });
    const { objects, applied } = overlay([manual], [activityDay()], policyRecord());
    expect(applied[0].mode).toBe("existing_kept");
    expect(objects).toEqual([manual]);
  });

  it("never lets a partial so-far HealthKit day outrank an ordinary day", () => {
    const shot = screenshotActivity();
    const { objects, applied } = overlay([shot], [activityDay({ coverage: "partial_day", moveCalories: 90 })], policyRecord());
    expect(applied[0].mode).toBe("existing_kept");
    expect(objects).toEqual([shot]);
  });

  it("shows a partial day alone as partial, and it is not strategic", () => {
    const partial = activityDay({ coverage: "partial_day", moveCalories: 90 });
    const projected = overlay([], [partial], policyRecord()).objects;
    expect(projected[0].payload.quality.status).toBe("partial");
    expect(overlay([], [partial], bothOn(), Purpose.EVIDENCE).objects).toHaveLength(0);
  });

  it("lets the observed local date own the day, never the ingestion time", () => {
    const late = activityDay({ date: "2026-09-21" });
    late.createdAt = "2026-09-22T06:30:00.000Z";
    late.updatedAt = "2026-09-22T06:31:00.000Z";
    const objects = overlay([], [late], policyRecord()).objects;
    expect(selectActiveCanonicalActivityDays(objects, { date: "2026-09-21" }).records).toHaveLength(1);
    expect(selectActiveCanonicalActivityDays(objects, { date: "2026-09-22" }).records).toHaveLength(0);
  });
});

describe("Nutrition graduation", () => {
  it("treats a zero-meal HealthKit daily total as a complete, valid, high-reliability day", () => {
    const { objects } = overlay([], [nutritionDay()], policyRecord());
    const selected = selectActiveCanonicalNutritionDays(objects, { date: DATE });
    expect(selected.records).toHaveLength(1);
    const payload = selected.records[0].payload;
    expect(payload.meals).toEqual([]);
    const authority = resolveNutritionDayAuthority(payload);
    expect(authority.assertion.tier).toBe("full_day_asserted");
    expect(authority.assertion.origin).toBe("device_aggregate");
    expect(authority.reliability).toBe("high");
    expect(authority.energyUsable).toBe(true);
    expect(authority.energyCompleteness).toBe("complete");
    expect(authority.dailyTotals).toMatchObject({ calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 });
  });

  it("does not describe a zero-meal device total by a meal count and never fabricates meals", () => {
    const objects = overlay([], [nutritionDay()], policyRecord()).objects;
    const row = composeLoggedTodaySummary({ canonicalObjects: objects, dateKey: DATE }).rows[1];
    expect(row.summary).toBe("2,140 calories");
    expect(row.context).toBe("182P · 205C · 68F · Apple Health");
    expect(objects[0].payload.meals).toEqual([]);
    expect(row.summary).not.toMatch(/meal/i);
  });

  it("keeps the existing meal-based Log row unchanged for an ordinary day", () => {
    const meals = [{ name: "Breakfast", totals: { calories: 500 } }];
    const row = composeLoggedTodaySummary({ canonicalObjects: [mfpNutrition({ meals })], dateKey: DATE }).rows[1];
    expect(row.summary).toBe("1 meal · 2,140 calories");
    expect(row.context).toBeNull();
  });

  it("gives the same factual daily totals from a trustworthy full-day source and from HealthKit", () => {
    const fromShot = resolveNutritionDayAuthority(mfpNutrition().payload);
    const fromHealthKit = resolveNutritionDayAuthority(selectActiveCanonicalNutritionDays(overlay([], [nutritionDay()], policyRecord()).objects, { date: DATE }).records[0].payload);
    expect(fromHealthKit.dailyTotals).toEqual(fromShot.dailyTotals);
    expect(fromHealthKit.assertion.tier).toBe(fromShot.assertion.tier);
    expect(fromHealthKit.energyUsable).toBe(fromShot.energyUsable);
    // Only source and reliability metadata legitimately differ.
    expect(fromHealthKit.assertion.origin).toBe("device_aggregate");
    expect(fromShot.assertion.origin).toBe("source_summary");
  });

  it("stays one day and surfaces disagreement when a full-day source and HealthKit both exist", () => {
    const shot = mfpNutrition({ totals: { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 } });
    const { objects, applied } = overlay([shot], [nutritionDay()], policyRecord());
    expect(applied[0].mode).toBe("merged_into_existing");
    expect(selectActiveCanonicalNutritionDays(objects, { date: DATE }).records).toHaveLength(1);
    expect(objects.filter((object) => object.payload?.evidence_type === "nutrition")).toHaveLength(1);
    const merged = objects[0].payload;
    expect(merged.metadata.healthkit_reconciliation.state).toBe("consistent");
    expect(merged.metadata.daily_totals_reconciliation.competing_source.application).toBe("MyFitnessPal");
  });

  it("attributes the Log row to Apple Health when a device total is authoritative even with independent meal detail present", () => {
    const meals = [{ name: "Breakfast", totals: { calories: 700 } }, { name: "Lunch", totals: { calories: 650 } }];
    const shot = mfpNutrition({ meals, totals: { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 } });
    const { objects } = overlay([shot], [nutritionDay()], policyRecord());
    const row = composeLoggedTodaySummary({ canonicalObjects: objects, dateKey: DATE }).rows[1];
    expect(row.summary).toBe("2 meals · 2,140 calories");
    expect(row.context).toBe("Apple Health");
  });

  it("preserves independent meal detail as detail without letting it override the device total", () => {
    const meals = [{ name: "Breakfast", totals: { calories: 700, protein_g: 40, carbs_g: 60, fat_g: 20 } }, { name: "Lunch", totals: { calories: 650, protein_g: 45, carbs_g: 50, fat_g: 20 } }];
    const shot = mfpNutrition({ meals, totals: { calories: 1350, protein_g: 85, carbs_g: 110, fat_g: 40 }, scope: "partial_meal_subtotal" });
    const { objects } = overlay([shot], [nutritionDay()], policyRecord());
    const merged = objects[0].payload;
    expect(merged.meals).toHaveLength(2);
    const authority = resolveNutritionDayAuthority(merged);
    expect(authority.dailyTotals.calories).toBe(2140);
    expect(authority.assertion.tier).toBe("full_day_asserted");
    expect(authority.reconciliation.state).toBe("meal_detail_partial");
  });

  it("never lets a device override a Founder-typed full-day total, and never lets a partial day outrank", () => {
    const typed = mfpNutrition({ source: { application: "PhysiqueOS", modality: "manual" }, totals: { calories: 1900, protein_g: 170, carbs_g: 180, fat_g: 60 } });
    const manual = overlay([typed], [nutritionDay()], policyRecord());
    expect(manual.applied[0].mode).toBe("existing_kept");
    expect(manual.objects).toEqual([typed]);
    const shot = mfpNutrition();
    const partial = overlay([shot], [nutritionDay({ coverage: "partial_day", totals: { calories: 800 } })], policyRecord());
    expect(partial.applied[0].mode).toBe("existing_kept");
    expect(partial.objects).toEqual([shot]);
  });

  it("represents a partial HealthKit total as a low-reliability subtotal that is not strategic", () => {
    const partial = nutritionDay({ coverage: "partial_day", totals: { calories: 900, protein_g: 60, carbs_g: 80, fat_g: 30 } });
    const authority = resolveNutritionDayAuthority(overlay([], [partial], policyRecord()).objects[0].payload);
    expect(authority.assertion.tier).toBe("partial_subtotal");
    expect(authority.reliability).toBe("low");
    expect(overlay([], [partial], bothOn(), Purpose.EVIDENCE).objects).toHaveLength(0);
  });
});

describe("Energy and duplicate suppression", () => {
  it("gives identical Energy facts from the same canonical inputs regardless of transport", () => {
    const shotObjects = [screenshotActivity(), mfpNutrition()];
    const healthKitObjects = overlay([], [activityDay(), nutritionDay()], policyRecord()).objects;
    const rows = (objects) => reconcileEnergyDays({
      activityDays: selectActiveCanonicalActivityDays(objects).records.map((record) => record.payload),
      nutritionDays: selectActiveCanonicalNutritionDays(objects).records.map((record) => record.payload),
      calendarDates: [DATE],
    }).find((row) => row.date === DATE);
    const pick = ({ date, calorieIntake, activeCalories }) => ({ date, calorieIntake, activeCalories });
    expect(pick(rows(healthKitObjects))).toEqual(pick(rows(shotObjects)));
    expect(rows(healthKitObjects).calorieIntake).toBe(2140);
    expect(rows(healthKitObjects).activeCalories).toBe(612);
  });

  it("yields at most one active representation per domain and date when several sources exist", () => {
    const base = [screenshotActivity(), mfpNutrition()];
    const { objects } = overlay(base, [activityDay(), nutritionDay()], bothOn(), Purpose.EVIDENCE);
    expect(selectActiveCanonicalActivityDays(objects, { date: DATE })).toMatchObject({ diagnostics: [], records: [expect.anything()] });
    expect(selectActiveCanonicalNutritionDays(objects, { date: DATE })).toMatchObject({ diagnostics: [], records: [expect.anything()] });
    expect(objects).toHaveLength(2);
  });

  it("is deterministic and does not depend on the order of the days it is given", () => {
    const days = [nutritionDay(), activityDay(), activityDay({ date: "2026-09-22", moveCalories: 700 })];
    const forward = overlay([], days, policyRecord()).objects.map((object) => object.canonicalId);
    const reversed = overlay([], [...days].reverse(), policyRecord()).objects.map((object) => object.canonicalId);
    expect(forward).toEqual(reversed);
  });

  it("does not mutate its inputs", () => {
    const shot = Object.freeze(screenshotActivity());
    const snapshot = JSON.stringify(shot);
    overlay([shot], [activityDay()], policyRecord());
    expect(JSON.stringify(shot)).toBe(snapshot);
  });
});

describe("boundary with strategic storage", () => {
  it("marks projected objects read-only and HealthKit-derived so the write guard still refuses them", () => {
    const projected = overlay([], [activityDay()], bothOn(), Purpose.EVIDENCE).objects[0];
    expect(isHealthKitGraduationProjection(projected)).toBe(true);
    expect(isHealthKitDerivedRecord(projected)).toBe(true);
    expect(() => assertNotQuarantinedHealthKitEvidence(projected)).toThrow(/quarantined/);
  });

  it("marks eligible only under the evidence purpose", () => {
    expect(overlay([], [activityDay()], bothOn(), Purpose.PROJECTION).objects[0].payload.evidenceEligibility.state).toBe("quarantined");
    expect(overlay([], [activityDay()], bothOn(), Purpose.EVIDENCE).objects[0].payload.evidenceEligibility.state).toBe("eligible");
  });
});

describe("normal Progress reporting of a graduated day", () => {
  it("shows Apple Health as a connected source for Activity and Nutrition and never a meal count it does not have", async () => {
    const { createProviderActivityEvidenceReport, createProviderNutritionEvidenceReports } = await import("./ProgressReportingService.js");
    const objects = overlay([], [activityDay(), nutritionDay()], policyRecord()).objects;
    const activity = createProviderActivityEvidenceReport({ canonicalEvidenceObjects: objects });
    expect(activity.dataSources.find((source) => source.name === "Apple Health")).toEqual({ name: "Apple Health", status: "Connected" });
    expect(activity.latestActivityDay).toMatchObject({ activeCalories: 612, exerciseMinutes: 41, standHours: 11 });
    expect(activity.latestActivityDay.workoutActiveCalories).toBeNull();

    const { scopedReport } = createProviderNutritionEvidenceReports({ canonicalEvidenceObjects: objects });
    const day = scopedReport.latestNutritionDay ?? scopedReport.entries?.[0];
    expect(scopedReport.dataSources.find((source) => source.name === "Apple Health")).toEqual({ name: "Apple Health", status: "Connected" });
    expect(day).toBeTruthy();
    expect(day.value).toBe("2140 calories");
    expect(day.detail).toBe("182g protein · 205g carbs · 68g fat");
    expect(day.detail).not.toMatch(/meal/i);
    expect(day.sourceEvidence).toEqual(["Apple Health"]);
    expect(day.meals).toEqual([]);
  });

  it("leaves the static source list unchanged for ordinary days", async () => {
    const { createProviderActivityEvidenceReport } = await import("./ProgressReportingService.js");
    const activity = createProviderActivityEvidenceReport({ canonicalEvidenceObjects: [screenshotActivity()] });
    expect(activity.dataSources.find((source) => source.name === "Apple Health")).toEqual({ name: "Apple Health", status: "Suggested" });
  });
});

describe("Evidence Hub timeline", () => {
  it("shows a graduated Activity day as one ordinary Daily Activity item and never a second copy", async () => {
    const { createEvidenceTimelineItems } = await import("./EvidenceTimelineService.js");
    const alone = createEvidenceTimelineItems({ canonicalEvidenceObjects: overlay([], [activityDay()], policyRecord()).objects });
    expect(alone.filter((item) => item.type === "Daily Activity")).toEqual([
      expect.objectContaining({ date: DATE, title: "612 active cal / 41 exercise min", tone: "effort" }),
    ]);
    const withShot = createEvidenceTimelineItems({ canonicalEvidenceObjects: overlay([screenshotActivity()], [activityDay()], policyRecord()).objects });
    expect(withShot.filter((item) => item.type === "Daily Activity")).toHaveLength(1);
  });
});
