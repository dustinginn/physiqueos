import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
  overlayGraduatedHealthKitDays,
} from "./HealthKitGraduation.js";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayService.js";
import { selectActiveCanonicalNutritionDays } from "./CanonicalNutritionDayService.js";
import { createEnergyPIObservations } from "./EnergyPIObservationService.js";

const OWNER = "founder";
const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const CALORIES = [2100, 2350, 1980, 2200, 2050, 2400, 2150];
const ACTIVE = [520, 610, 480, 700, 350, 800, 560];
const policy = {
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATES[0], endLocalDate: null },
  evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATES[0], endLocalDate: null },
  historicalBriefingRegeneration: false,
};
const dexaScans = [{ id: "dexa-1", measuredAt: "2026-09-01", restingMetabolicRate: { value: 1800 } }];

const shotActivity = () => DATES.map((date, index) => ({
  canonicalId: `activity_day|${date}`, evidence_type: "activity_day", quality: { status: "active" }, activityRevision: { revision: 1 }, userId: OWNER, updatedAt: `${date}T22:00:00.000Z`,
  payload: { id: `shot-${date}`, evidence_type: "activity_day", observed_at: date, source: { application: "Apple Fitness", modality: "screenshot" }, daily_activity: { move_calories: ACTIVE[index], exercise_minutes: 30, stand_hours: 10 } },
}));
const shotNutrition = () => DATES.map((date, index) => ({
  canonicalId: `nutrition|${date}|nutrition-day`, evidence_type: "nutrition", quality: { status: "active" }, userId: OWNER, updatedAt: `${date}T22:00:00.000Z`,
  payload: { id: `mfp-${date}`, evidence_type: "nutrition", observed_at: date, source: { application: "MyFitnessPal", modality: "screenshot" }, daily_totals: { calories: CALORIES[index], protein_g: 180, carbs_g: 200, fat_g: 70 }, meals: [], metadata: { date, daily_totals_scope: "full_day_summary", completeness: "complete", confidence: "high" } },
}));
const hkDays = () => DATES.flatMap((date, index) => [
  { id: `healthkit_canonical_day_activity_${date}`, domain: "activity", localDate: date, userId: OWNER, revision: 2, semanticFingerprint: "a", createdAt: `${date}T15:00:00.000Z`, updatedAt: `${date}T23:00:00.000Z`,
    current: { coverage: "complete_day", sourceRevision: 3, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: ACTIVE[index], exercise_minutes: 30, stand_hours: 10 } } }, provenance: { sourceObservationIds: [`healthkit_observation_a${index}`] } },
  { id: `healthkit_canonical_day_nutrition_${date}`, domain: "nutrition", localDate: date, userId: OWNER, revision: 1, semanticFingerprint: "n", createdAt: `${date}T15:00:00.000Z`, updatedAt: `${date}T23:00:00.000Z`,
    current: { coverage: "complete_day", sourceRevision: 3, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: CALORIES[index], protein_g: 180, carbs_g: 200, fat_g: 70 }, dailyTotalsScope: "full_day_summary", mealObjects: 0 } }, provenance: { sourceObservationIds: [`healthkit_observation_n${index}`] } },
]);

const observations = (objects) => createEnergyPIObservations({
  reconciliationInput: {
    activityDays: selectActiveCanonicalActivityDays(objects).records.map((record) => record.payload),
    nutritionDays: selectActiveCanonicalNutritionDays(objects).records.map((record) => record.payload),
    dexaScans,
  },
  observationWindow: { startDate: DATES[0], endDate: DATES.at(-1) },
  includeInsufficientData: true,
});
const facts = (list) => list.map((observation) => ({
  kind: observation.kind,
  status: observation.status,
  direction: observation.direction,
  value: observation.explanationData?.value ?? null,
  unit: observation.explanationData?.unit ?? null,
  window: observation.evidenceWindow,
}));
const graduated = (canonicalObjects) => overlayGraduatedHealthKitDays({ canonicalObjects, healthKitDays: hkDays(), policy, purpose: Purpose.EVIDENCE }).objects;

describe("V3 source invariance for graduated HealthKit Activity, Nutrition and Energy", () => {
  const fromOrdinary = observations([...shotActivity(), ...shotNutrition()]);

  it("produces real Energy observations to compare", () => {
    expect(fromOrdinary.length).toBeGreaterThan(2);
    expect(fromOrdinary.some((observation) => observation.status === "observed")).toBe(true);
  });

  it("gives the same factual Energy observations whether the days came from screenshots or HealthKit", () => {
    const fromHealthKit = observations(graduated([]));
    expect(facts(fromHealthKit)).toEqual(facts(fromOrdinary));
  });

  it("gives the same confidence and limitations for the same canonical inputs", () => {
    const fromHealthKit = observations(graduated([]));
    const confidence = (list) => list.map((observation) => ({ kind: observation.kind, level: observation.confidence?.level, limitations: observation.confidence?.limitations ?? [] }));
    expect(confidence(fromHealthKit)).toEqual(confidence(fromOrdinary));
  });

  it("never creates a second observation when both transports describe the same day", () => {
    const both = observations(graduated([...shotActivity(), ...shotNutrition()]));
    expect(both).toHaveLength(fromOrdinary.length);
    expect(facts(both)).toEqual(facts(fromOrdinary));
  });

  it("changes nothing about Energy when graduation is off", () => {
    const off = overlayGraduatedHealthKitDays({ canonicalObjects: [], healthKitDays: hkDays(), policy: null, purpose: Purpose.EVIDENCE }).objects;
    expect(off).toEqual([]);
    expect(observations(off).every((observation) => observation.status !== "observed")).toBe(true);
  });

  it("carries source and reliability as metadata without adding a HealthKit-specific factual field", () => {
    const projected = graduated([]);
    for (const object of projected) {
      expect(object.payload.source).toMatchObject({ application: "Apple Health", integration: "HealthKit" });
    }
    const keys = (objects) => Object.keys(objects[0].payload).filter((key) => !["id", "source", "provenance", "metadata", "evidenceEligibility", "quality"].includes(key)).sort();
    const activityKeys = keys(graduated([]).filter((o) => o.evidence_type === "activity_day"));
    const shotKeys = keys(shotActivity());
    expect(activityKeys.filter((key) => !shotKeys.includes(key))).toEqual(["derived_metrics"]);
  });
});
