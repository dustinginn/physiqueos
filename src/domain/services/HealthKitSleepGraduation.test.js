import { describe, expect, it } from "vitest";
import {
  HEALTHKIT_SLEEP_NIGHT_EVIDENCE_TYPE,
  assessHealthKitSleepNightEvidence,
  overlayGraduatedHealthKitSleepNights,
  resolveHealthKitSleepStrategicPolicy,
} from "./HealthKitSleepGraduation.js";
import {
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
  overlayGraduatedHealthKitCardioWorkouts,
  overlayGraduatedHealthKitDays,
  resolveHealthKitGraduationPolicy,
} from "./HealthKitGraduation.js";
import { resolveHealthKitSleepActivationPolicy, HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION } from "./HealthKitSleepPolicies.js";
import { canonicalizeHealthKitSleepV3 } from "./HealthKitSleepCanonicalizer.js";
import { buildHealthKitSleepDayPayload } from "../../application/commands/HealthKitSleepIngestPort.js";
import { assertNotQuarantinedHealthKitEvidence } from "./HealthKitEvidenceEligibilityPolicy.js";
import { createBriefingDependencyManifest } from "./BriefingDependencyManifestService.js";
import { createEnergyPIObservations } from "./EnergyPIObservationService.js";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayService.js";
import { selectActiveCanonicalNutritionDays } from "./CanonicalNutritionDayService.js";
import { OWNER, stored, uuid } from "../../testSupport/healthKitSleepSynthetic.js";
import { oct2CanonicalWorkout, oct2StairStepperInput, oct2WalkInput } from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";

// Prospective Sleep -> V3 graduation: eligibility, completion, boundary,
// duplicate and stage handling, and isolation from every other graduated
// domain. Synthetic only; no Founder data.

const D0 = "2026-10-02";
const graduation = (domains, startLocalDate = "2026-09-22") => resolveHealthKitGraduationPolicy({
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  historicalBriefingRegeneration: false,
  projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: "2026-09-22", endLocalDate: null },
  evidenceEligibility: { enabled: true, domains, startLocalDate, endLocalDate: null },
});
const V3_POLICY = graduation(["activity", "cardio_training", "nutrition"]);
const V4_POLICY = graduation(["activity", "cardio_training", "nutrition", "sleep"]);
const activation = (overrides = {}) => resolveHealthKitSleepActivationPolicy({
  status: "enabled", schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION, mode: "validation_only",
  effectiveSleepDay: D0, timeZone: "America/Los_Angeles", openEnded: true,
  strategicEvidenceEligibility: "quarantined", historicalBackfill: false, ...overrides,
});
const ACTIVE = activation();

// A stored canonical night in the exact shape the ingest port persists.
function night(sleepDay, { asleepSeconds = 27000, staged = true, revision = 2, purpose = "validation_only",
  sourceBasis = "sensor", status = "asleep_recorded", algorithmVersion = "sleep-canon-v3", stages = null } = {}) {
  const core = stages?.core ?? Math.round(asleepSeconds * 0.55);
  const deep = stages?.deep ?? Math.round(asleepSeconds * 0.2);
  const rem = stages?.rem ?? asleepSeconds - core - deep;
  const previous = new Date(`${sleepDay}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
  const start = `${previous.toISOString().slice(0, 10)}T06:30:00.000Z`;
  const main = {
    kind: "main", start, end: new Date(Date.parse(start) + asleepSeconds * 1000 + 1800 * 1000).toISOString(),
    timeZone: "America/Los_Angeles", timeZoneSource: "device_at_ingest",
    primarySource: { sourceClass: "third_party", sourceFamily: "oura", bundleIdentifier: "com.ouraring.oura" },
    completeness: { asleepData: "present", stageDetail: staged ? "staged" : "stage_detail_absent", sourceBasis },
    timeline: [],
  };
  return {
    id: `healthkit_sleep_day_${sleepDay}`, userId: OWNER, sleepDay, occurrenceDate: sleepDay, revision,
    schemaVersion: "healthkit-sleep-day-v1", algorithmVersion, status, timeZone: "America/Los_Angeles", timeZoneShift: false,
    windowClosesAt: `${sleepDay}T01:00:00.000Z`.replace(sleepDay, nextDay(sleepDay)),
    ingestionPurpose: purpose, origin: purpose, inputDigest: `sha256_${sleepDay}_${revision}`, computedAt: `${sleepDay}T15:00:00.000Z`,
    mainEpisodeIndex: status === "asleep_recorded" ? 0 : null,
    mainSleep: status === "asleep_recorded" ? {
      asleepSeconds, awakeSeconds: 1800, inBedSeconds: asleepSeconds + 2400,
      coreSeconds: staged ? core : 0, deepSeconds: staged ? deep : 0, remSeconds: staged ? rem : 0,
      unspecifiedSeconds: staged ? 0 : asleepSeconds, stageCoverage: staged ? 1 : 0,
    } : null,
    episodes: status === "asleep_recorded" ? [main] : [],
    strategicEligible: false,
    evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
  };
}
function nextDay(date) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
const AFTER_ALL = new Date("2026-10-06T03:00:00.000Z");
const overlay = (sleepDays, { graduationPolicy = V4_POLICY, activationPolicy = ACTIVE, asOf = AFTER_ALL, canonicalObjects = [] } = {}) =>
  overlayGraduatedHealthKitSleepNights({ canonicalObjects, sleepDays, graduationPolicy, activationPolicy, asOf });

describe("Sleep strategic policy resolution", () => {
  it("is ON only when the evidence scope names sleep AND Sleep ingestion is enabled; boundary = later of scope start and D0", () => {
    expect(resolveHealthKitSleepStrategicPolicy({ graduationPolicy: V3_POLICY, activationPolicy: ACTIVE }))
      .toMatchObject({ enabled: false, reason: "sleep_not_in_evidence_scope" });
    expect(resolveHealthKitSleepStrategicPolicy({ graduationPolicy: V4_POLICY, activationPolicy: activation({ status: "disabled" }) }))
      .toMatchObject({ enabled: false, reason: "sleep_ingestion_not_enabled" });
    // The shared scope starts 2026-09-22; the Founder-approved Sleep D0 is later and wins (never widened).
    expect(resolveHealthKitSleepStrategicPolicy({ graduationPolicy: V4_POLICY, activationPolicy: ACTIVE }))
      .toMatchObject({ enabled: true, strategicEffectiveAt: D0, endSleepDay: null });
    expect(resolveHealthKitSleepStrategicPolicy({ graduationPolicy: graduation(["sleep"], "2026-10-09"), activationPolicy: ACTIVE }))
      .toMatchObject({ enabled: true, strategicEffectiveAt: "2026-10-09" });
  });
});

describe("Sleep -> V3 evidence eligibility (prospective)", () => {
  it("lets a completed canonical night enter V3 evidence as one read-only sleep_night object the write guard still refuses", () => {
    const result = overlay([night("2026-10-02"), night("2026-10-03"), night("2026-10-04")]);
    expect(result.applied.map((entry) => entry.localDate)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    const [first] = result.objects;
    expect(first).toMatchObject({
      evidence_type: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_TYPE, canonicalId: "healthkit_sleep_day_2026-10-02", quality: { status: "active" },
      healthKitProjection: { readOnly: true, purpose: "evidence", revision: 2 },
    });
    expect(first.payload).toMatchObject({
      evidence_type: "sleep_night", sleep_day: "2026-10-02", observed_at: "2026-10-02",
      main_sleep: { asleep_seconds: 27000, stage_detail: "staged" },
      source: { integration: "HealthKit", source_family: "oura" },
      canonical: { revision: 2, algorithm_version: "sleep-canon-v3", ingestion_purpose: "validation_only" },
      evidenceEligibility: { state: "eligible", strategic: true },
    });
    // Never persistable: the strategic write guard recognizes the HealthKit Sleep lineage.
    expect(() => assertNotQuarantinedHealthKitEvidence(first)).toThrow(expect.objectContaining({ code: "HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED" }));
  });

  it("works on the exact stored-row shape the ingest port writes from real canonicalization", () => {
    const samples = [
      stored({ id: uuid(9001), source: "oura", stage: "core", start: "2026-10-04T23:30:00-07:00", end: "2026-10-05T02:00:00-07:00" }, { purpose: "validation_only" }),
      stored({ id: uuid(9002), source: "oura", stage: "deep", start: "2026-10-05T02:00:00-07:00", end: "2026-10-05T03:30:00-07:00" }, { purpose: "validation_only" }),
      stored({ id: uuid(9003), source: "oura", stage: "rem", start: "2026-10-05T03:30:00-07:00", end: "2026-10-05T06:45:00-07:00" }, { purpose: "validation_only" }),
    ];
    const content = canonicalizeHealthKitSleepV3({ samples }).get("2026-10-05");
    const row = buildHealthKitSleepDayPayload({ content, existing: null, ownerUserId: OWNER, sleepDay: "2026-10-05", computedAt: "2026-10-05T14:00:00.000Z" });
    const early = overlay([row], { asOf: new Date("2026-10-05T20:00:00.000Z") });
    expect(early.applied).toEqual([]);
    expect(early.decisions[0]).toMatchObject({ eligible: false, reason: "sleep_day_window_open" });
    const late = overlay([row], { asOf: new Date("2026-10-06T01:00:00.000Z") });
    expect(late.objects).toHaveLength(1);
    expect(late.objects[0].payload.main_sleep).toMatchObject({ asleep_seconds: 26100, stage_detail: "staged",
      stages: { core_seconds: 9000, deep_seconds: 5400, rem_seconds: 11700, unspecified_seconds: 0 } });
  });

  it("keeps the current (still-updating) night out until its 18:00 sleep-day window closes", () => {
    const current = night("2026-10-04");
    // 2026-10-04 18:00 PDT == 2026-10-05T01:00Z.
    expect(assessHealthKitSleepNightEvidence(current, { strategicPolicy: resolveHealthKitSleepStrategicPolicy({ graduationPolicy: V4_POLICY, activationPolicy: ACTIVE }), asOf: new Date("2026-10-05T00:59:59.999Z") }))
      .toMatchObject({ eligible: false, reason: "sleep_day_window_open" });
    expect(overlay([current], { asOf: new Date("2026-10-05T00:59:59.999Z") }).objects).toEqual([]);
    expect(overlay([current], { asOf: new Date("2026-10-05T01:00:00.000Z") }).objects).toHaveLength(1);
    // Without a generator clock nothing is ever admitted.
    expect(overlay([current], { asOf: null }).decisions[0]).toMatchObject({ eligible: false, reason: "sleep_day_window_unknown" });
  });

  it("never admits pre-start or historical Sleep", () => {
    const result = overlay([
      night("2026-10-01"),
      night("2026-09-30", { purpose: "historical_evidence_import" }),
      night("2026-10-03", { purpose: "historical_evidence_import" }),
    ]);
    expect(result.objects).toEqual([]);
    expect(result.decisions.map((entry) => [entry.sleepDay, entry.reason])).toEqual([
      ["2026-09-30", "historical_evidence_import_permanently_display_only"],
      ["2026-10-01", "before_strategic_effective_boundary"],
      ["2026-10-03", "historical_evidence_import_permanently_display_only"],
    ]);
  });

  it("returns the SAME array untouched while Sleep is out of scope or Sleep ingestion is off", () => {
    const objects = [{ canonicalId: "x", evidence_type: "training", payload: {} }];
    expect(overlay([night("2026-10-03")], { graduationPolicy: V3_POLICY, canonicalObjects: objects }).objects).toBe(objects);
    expect(overlay([night("2026-10-03")], { activationPolicy: activation({ status: "disabled" }), canonicalObjects: objects }).objects).toBe(objects);
  });

  it("never duplicates a night: duplicated rows, replays and a re-applied overlay all give one object per sleep day", () => {
    const rows = [night("2026-10-03", { revision: 2 }), night("2026-10-03", { revision: 3, asleepSeconds: 26400 }), night("2026-10-03", { revision: 2 })];
    const once = overlay(rows);
    expect(once.objects).toHaveLength(1);
    expect(once.objects[0].payload.canonical.revision).toBe(3);
    expect(once.objects[0].payload.main_sleep.asleep_seconds).toBe(26400);
    const twice = overlay(rows, { canonicalObjects: once.objects });
    expect(twice.objects).toHaveLength(1);
    // A replayed batch canonicalizes to the identical day (same input digest) -> identical evidence.
    const samples = [stored({ id: uuid(9101), source: "oura", stage: "core", start: "2026-10-02T23:00:00-07:00", end: "2026-10-03T06:30:00-07:00" }, { purpose: "validation_only" })];
    const a = canonicalizeHealthKitSleepV3({ samples }).get("2026-10-03");
    const b = canonicalizeHealthKitSleepV3({ samples: [...samples, ...samples] }).get("2026-10-03");
    expect(b.inputDigest).toBe(a.inputDigest);
    expect(b.mainSleep).toEqual(a.mainSleep);
  });

  it("keeps a trustworthy total when stage detail is missing, and withholds incoherent stages without dropping the night", () => {
    const unstaged = overlay([night("2026-10-03", { staged: false })]).objects[0].payload.main_sleep;
    expect(unstaged).toMatchObject({ asleep_seconds: 27000, stage_detail: "stage_detail_absent", stages: null });
    const incoherent = overlay([night("2026-10-03", { stages: { core: 10000, deep: 5000, rem: 5000 } })]).objects[0].payload.main_sleep;
    expect(incoherent).toMatchObject({ asleep_seconds: 27000, stage_detail: "withheld_incoherent", stages: null });
  });

  it("refuses manual-only, in-bed-only, invalid or non-stage-trustworthy nights", () => {
    const result = overlay([
      night("2026-10-02", { sourceBasis: "manual_only" }),
      night("2026-10-03", { status: "in_bed_only" }),
      night("2026-10-04", { algorithmVersion: "sleep-canon-v1" }),
      { ...night("2026-10-05"), mainSleep: { ...night("2026-10-05").mainSleep, awakeSeconds: -60 } },
    ], { asOf: new Date("2026-10-07T00:00:00.000Z") });
    expect(result.objects).toEqual([]);
    expect(result.decisions.map((entry) => entry.reason)).toEqual([
      "manual_only_not_strategic", "no_main_sleep", "algorithm_not_strategic", "invalid_durations",
    ]);
  });
});

describe("Sleep graduation leaves every other graduated domain and historical artifact untouched", () => {
  const DATES = ["2026-10-02", "2026-10-03"];
  const hkDays = DATES.flatMap((date) => [
    { id: `healthkit_canonical_day_activity_${date}`, domain: "activity", localDate: date, userId: OWNER, revision: 1, semanticFingerprint: "a",
      createdAt: `${date}T15:00:00.000Z`, updatedAt: `${date}T23:00:00.000Z`,
      current: { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 600, exercise_minutes: 30, stand_hours: 10 } } },
      provenance: { sourceObservationIds: [`healthkit_observation_a_${date}`] } },
    { id: `healthkit_canonical_day_nutrition_${date}`, domain: "nutrition", localDate: date, userId: OWNER, revision: 1, semanticFingerprint: "n",
      createdAt: `${date}T15:00:00.000Z`, updatedAt: `${date}T23:00:00.000Z`,
      current: { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2200, protein_g: 180, carbs_g: 220, fat_g: 70 }, dailyTotalsScope: "full_day_summary", mealObjects: 0 } },
      provenance: { sourceObservationIds: [`healthkit_observation_n_${date}`] } },
  ]);

  it("Activity/Nutrition day graduation and Cardio workout graduation are byte-identical with and without the sleep domain", () => {
    for (const purpose of [Purpose.EVIDENCE, Purpose.PROJECTION]) {
      const before = overlayGraduatedHealthKitDays({ canonicalObjects: [], healthKitDays: hkDays, policy: V3_POLICY, purpose });
      const after = overlayGraduatedHealthKitDays({ canonicalObjects: [], healthKitDays: hkDays, policy: V4_POLICY, purpose });
      expect(after.objects).toEqual(before.objects);
      expect(after.objects.length).toBeGreaterThan(0);
    }
    const workouts = [oct2CanonicalWorkout(oct2WalkInput()), oct2CanonicalWorkout(oct2StairStepperInput())];
    const cardioBefore = overlayGraduatedHealthKitCardioWorkouts({ canonicalObjects: [], canonicalWorkouts: workouts, policy: V3_POLICY, purpose: Purpose.EVIDENCE });
    const cardioAfter = overlayGraduatedHealthKitCardioWorkouts({ canonicalObjects: [], canonicalWorkouts: workouts, policy: V4_POLICY, purpose: Purpose.EVIDENCE });
    expect(cardioAfter.objects).toEqual(cardioBefore.objects);
    expect(cardioAfter.objects.length).toBe(2);
  });

  it("Energy observations are identical when sleep_night objects join the evidence", () => {
    const days = overlayGraduatedHealthKitDays({ canonicalObjects: [], healthKitDays: hkDays, policy: V4_POLICY, purpose: Purpose.EVIDENCE }).objects;
    const withSleep = overlay([night("2026-10-02"), night("2026-10-03")], { canonicalObjects: days }).objects;
    expect(withSleep.length).toBe(days.length + 2);
    const energy = (objects) => createEnergyPIObservations({
      reconciliationInput: {
        activityDays: selectActiveCanonicalActivityDays(objects).records.map((record) => record.payload),
        nutritionDays: selectActiveCanonicalNutritionDays(objects).records.map((record) => record.payload),
        dexaScans: [{ id: "dexa-1", measuredAt: "2026-09-01", restingMetabolicRate: { value: 1800 } }],
      },
      observationWindow: { startDate: DATES[0], endDate: DATES.at(-1) },
      includeInsufficientData: true,
    });
    expect(energy(withSleep)).toEqual(energy(days));
  });

  it("does not change any published briefing's dependency fingerprint (no historical staleness, no regeneration trigger)", () => {
    const publication = { id: "weekly_briefing_2026-09-27_2026-10-03", cadence: "weekly",
      evidenceWindow: { id: "weekly|2026-09-27|2026-10-03", cadence: "weekly", startDate: "2026-09-27", endDate: "2026-10-03" } };
    const days = overlayGraduatedHealthKitDays({ canonicalObjects: [], healthKitDays: hkDays, policy: V4_POLICY, purpose: Purpose.EVIDENCE }).objects;
    const withSleep = overlay([night("2026-10-02"), night("2026-10-03")], { canonicalObjects: days }).objects;
    const before = createBriefingDependencyManifest({ publication, evidenceInputs: days });
    const after = createBriefingDependencyManifest({ publication, evidenceInputs: withSleep });
    expect(after.fingerprint).toBe(before.fingerprint);
  });
});
