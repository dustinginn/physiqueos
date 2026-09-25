import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { Phase3Command } from "../../application/commands/Phase3CommandService.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import {
  HEALTHKIT_OBSERVATION_WIRE_FIELDS,
  computeHealthKitIngestMaximumRequestBytes,
  nativeCommandRequestMaximumBytes,
  resolveNativeCommandMaximumRequestBytes,
} from "../../application/native/nativeCommandRequestBounds.js";
import { createTrainingNavigationReadService } from "../../application/training/TrainingNavigationReadService.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createHealthKitGraduationReader } from "../../platform/database/HealthKitGraduationReader.js";
import { runHealthKitDeferredWorkoutReconciliation } from "../../platform/operations/HealthKitDeferredWorkoutReconciliationRunner.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose,
  assessHealthKitGraduation,
  isHealthKitGraduationInScope,
  resolveHealthKitGraduationPolicy,
} from "./HealthKitGraduation.js";
import {
  HealthKitReconciliationState,
  assessHealthKitWorkoutCanonicalization,
  normalizeHealthKitObservationBatch,
  resolveHealthKitWorkoutActivationPolicy,
} from "./HealthKitObservationService.js";
import { classifyHealthKitWorkoutType } from "./HealthKitWorkoutService.js";
import { projectHealthKitStrengthWorkoutPresentationBySession } from "./HealthKitWorkoutPresentationService.js";
import { createProviderActivityEvidenceReport } from "./ProgressReportingService.js";
import { DEFAULT_SETTLEMENT_POLICY } from "./BriefingEvidenceSettlementPolicy.js";
import { createSep23StrengthPresentationFixture } from "../../fixtures/healthKitSep23StrengthPresentationFixture.js";
import { createSep24StrengthPresentationFixture } from "../../fixtures/healthKitSep24StrengthPresentationFixture.js";
import { createCardioWholeDayAttributionFixture } from "../../fixtures/healthKitCardioWholeDayAttributionFixture.js";

// Part F (HealthKit half): integrated, production-shaped acceptance for the
// combined Server candidate. Real ingestion command port, real in-memory
// canonical store, real classifier/reader/presentation modules; nothing that is
// the unit under test is mocked. The Native decode/render halves of items 13
// and 14 are NOT provable server-side and are marked NATIVE-SIDE in the report.

const OWNER = "user_founder_001";
const TZ = "America/Los_Angeles";
const PRODUCTION_BASE = "01d1900b";
const WORKOUT_POLICY_ID = "healthkit_workout_canonical_activation_policy";
const DAILY_POLICY_ID = "healthkit_canonical_daily_activation_policy";
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const source = () => ({ bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", productType: "iPhone17,1" });

function activity(date, { coverage = "complete_day", calories = 780, revision = 1 } = {}) {
  return {
    observationType: "activity_summary", externalId: `activity-summary:${date}`, source: source(),
    occurrence: { localDate: date, timeZone: TZ, utcOffsetSeconds: -25200 },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts", coverage, sourceRevision: revision,
      dailyActivity: { move_calories: calories, exercise_minutes: 52, stand_hours: 11, steps: 9800 },
    },
  };
}

function nutrition(date, { coverage = "complete_day", calories = 2400, revision = 1 } = {}) {
  return {
    observationType: "nutrition_daily_total", externalId: `nutrition-daily-total:${date}`, source: source(),
    occurrence: { localDate: date, timeZone: TZ, utcOffsetSeconds: -25200 },
    nutritionDailyTotal: {
      aggregationScope: "daily_total_all_sources", coverage, sourceRevision: revision,
      dailyNutrition: { calories, protein_g: 210, carbs_g: 240, fat_g: 70 },
    },
  };
}

// Native's wire shape for a workout observation (what nativeCommandRequestBounds
// sizes and HealthKitObservationService normalizes).
function walk({ externalId, date = "2026-09-24", start = "10:00", end = "10:20", isIndoorWorkout, activityType = "52" }) {
  return {
    observationType: "workout", externalId,
    source: { bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch", productType: "Watch7,5" },
    occurrence: { localDate: date, timeZone: TZ, startedAt: `${date}T${start}:00-07:00`, endedAt: `${date}T${end}:00-07:00` },
    workout: {
      activityType, durationSeconds: 1200, activeCalories: 150, averageHeartRate: 118,
      distance: 1500, distanceUnit: "m",
      ...(isIndoorWorkout === undefined ? {} : { isIndoorWorkout }),
    },
  };
}

function workoutPolicy(overrides = {}) {
  return {
    id: WORKOUT_POLICY_ID, schemaVersion: "healthkit-workout-activation-policy-v1", status: "enabled",
    domains: ["workout"], effectiveLocalDate: "2026-09-23", openEnded: true,
    strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false, version: 1,
    ...overrides,
  };
}

function dailyPolicy() {
  return {
    id: DAILY_POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled",
    domains: ["activity", "nutrition"], effectiveLocalDate: "2026-09-22", openEnded: true,
    strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1,
  };
}

function graduationPolicy(overrides = {}) {
  return {
    id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
    projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: "2026-09-22", endLocalDate: null },
    evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: "2026-09-22", endLocalDate: null },
    historicalBackfill: false,
    ...overrides,
  };
}

// The production configuration shape: Activity+Nutrition graduated open-ended,
// Workout canonicalization prospective and STRENGTH-ONLY (Cardio out of scope).
function productionShapedStore({ workoutOverrides = {}, graduation = graduationPolicy() } = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: TZ, version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitWorkoutLinkClaims: [],
    healthKitConfiguration: [dailyPolicy(), workoutPolicy({ families: ["strength"], ...workoutOverrides }), graduation],
    canonicalEvidenceObjects: [],
    evidencePackages: [],
  });
}

let counter = 0;
async function ingest(records, observations, receivedAt = "2026-09-25T18:00:00.000Z") {
  counter += 1;
  return createCanonicalPersistenceCommandPorts({ records, now: () => new Date(receivedAt) })
    .ingestHealthKitObservations({
      ownerUserId: OWNER,
      principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" },
      metadata: { clientOccurredAt: receivedAt, clientTimeZone: TZ, idempotencyKey: `part-f-hk-key-${counter}` },
      payload: { batchId: `part-f-hk-batch-${counter}`, observations },
    });
}

const ordinaryActivityDay = (date) => ({
  canonicalId: `activity_day|${date}`, userId: OWNER, version: 1, quality: { status: "active" },
  payload: {
    id: `shot-${date}`, evidence_type: "activity_day", observed_at: date,
    source: { application: "Apple Fitness", modality: "screenshot" },
    daily_activity: { move_calories: 500, exercise_minutes: 30, stand_hours: 10 },
  },
});

// ---------------------------------------------------------------------------
// Item 11: current-day Activity/Nutrition ingestion is still healthy
// ---------------------------------------------------------------------------

describe("Item 11: current-day HealthKit Activity/Nutrition ingestion is healthy end to end", () => {
  const TODAY = "2026-09-25";

  it("canonicalizes a partial current day, shows it on projection surfaces, and keeps it out of strategic evidence until complete", async () => {
    const records = productionShapedStore();
    const first = await ingest(records, [
      activity(TODAY, { coverage: "partial_day", calories: 320, revision: 1 }),
      nutrition(TODAY, { coverage: "partial_day", calories: 900, revision: 1 }),
    ]);
    expect(first.result).toMatchObject({ activityDayCanonicalizedCount: 1, nutritionDayCanonicalizedCount: 1 });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const projected = await reader.overlay([], { purpose: HealthKitGraduationPurpose.PROJECTION });
    expect(projected.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    // A partial "so far" day may be shown but never feeds strategic evidence.
    expect(await reader.overlay([], { purpose: HealthKitGraduationPurpose.EVIDENCE })).toEqual([]);

    await ingest(records, [
      activity(TODAY, { calories: 780, revision: 2 }),
      nutrition(TODAY, { calories: 2400, revision: 2 }),
    ], "2026-09-25T23:00:00.000Z");
    const days = records.snapshot().healthKitCanonicalDays;
    expect(days).toHaveLength(2);
    expect(days.map((day) => [day.domain, day.revision, day.current.coverage]).sort())
      .toEqual([["activity", 2, "complete_day"], ["nutrition", 2, "complete_day"]]);
    const evidence = await createHealthKitGraduationReader({ records, ownerUserId: OWNER })
      .overlay([], { purpose: HealthKitGraduationPurpose.EVIDENCE });
    expect(evidence.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
  });

  it("an identical replay under a fresh delivery key changes nothing, and a late partial can never displace the complete day", async () => {
    const records = productionShapedStore();
    await ingest(records, [activity(TODAY, { calories: 780, revision: 3 }), nutrition(TODAY, { calories: 2400, revision: 3 })]);
    const before = records.snapshot().healthKitCanonicalDays;
    const replay = await ingest(records, [activity(TODAY, { calories: 780, revision: 3 }), nutrition(TODAY, { calories: 2400, revision: 3 })]);
    expect(replay.result).toMatchObject({ status: "matched", createdCount: 0 });
    const late = await ingest(records, [activity(TODAY, { coverage: "partial_day", calories: 900, revision: 9 })]);
    expect(late.result.observations[0].reconciliation).toMatchObject({ reason: "complete_day_summary_already_received" });
    expect(records.snapshot().healthKitCanonicalDays).toEqual(before);
  });

  it("the current day never adds workout calories to the daily total and keeps every workout out of Cardio canonicalization", async () => {
    const records = productionShapedStore();
    await ingest(records, [activity(TODAY, { calories: 780 }), walk({ externalId: "current-day-walk", date: TODAY })]);
    const snapshot = records.snapshot();
    expect(snapshot.healthKitCanonicalDays[0].current.values.dailyActivity.move_calories).toBe(780);
    expect(snapshot.healthKitCanonicalDays[0].current.workoutActiveCaloriesAdditive).toBe(false);
    expect(snapshot.healthKitCanonicalWorkouts).toEqual([]);
  });

  it("(mapping) the existing suites that already prove this on the strategic-quarantine side are HealthKitCanonicalTestDay.test.js, HealthKitObservationService.test.js and HealthKitGraduation*.test.js", () => {
    for (const file of [
      "../../application/native/HealthKitCanonicalTestDay.test.js",
      "./HealthKitObservationService.test.js", "./HealthKitGraduation.test.js", "./HealthKitGraduationV3Invariance.test.js",
    ]) expect(fs.existsSync(new URL(file, import.meta.url))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Items 12 and 13: Sep 23 confirmed / Sep 24 candidate Strength detail (Server wire)
// ---------------------------------------------------------------------------

async function strengthDetail(fixture) {
  const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
  const service = createTrainingNavigationReadService({
    readCanonicalExerciseRegistry: async () => [],
    store: {
      run: (_name, callback) => callback(),
      getCanonicalEvidenceObject: async (id) => id === fixture.ids.session ? logger : null,
      listHealthKitCanonicalWorkouts: async () => fixture.canonicalWorkouts,
      listHealthKitWorkoutLinks: async () => fixture.workoutLinks,
      listHealthKitWorkoutLinkClaims: async () => fixture.workoutLinkClaims,
    },
  });
  return service.getSession({ sessionId: fixture.ids.session });
}

const ATTACHMENT_KEYS = ["canonicalType", "canonicalWorkoutId", "family", "loggerSessionCanonicalId", "relationship", "session", "source"];
const SESSION_KEYS = ["activeCalories", "averageHeartRate", "distance", "distanceUnit", "durationSeconds", "endedAt", "startedAt", "totalCalories"];

describe("Item 12: the Sep 23 confirmed Strength detail is healthy and unchanged from production", () => {
  it("serves the confirmed Apple telemetry on the Logger-owned detail, byte-identical to production 01d1900b", async () => {
    const fixture = createSep23StrengthPresentationFixture();
    const detail = await strengthDetail(fixture);
    const wire = JSON.stringify(detail);
    // Digests captured on the production commit and on this candidate: identical.
    expect(wire.length).toBe(3060);
    expect(sha256(wire)).toBe("e0530c8f96c07899fd8013eca6199da131dee397b554a2cc3d8d6dba036d0967");
    expect(sha256([...projectHealthKitStrengthWorkoutPresentationBySession(fixture).entries()]))
      .toBe("614493eae8b140c35ce52b855dc97719c48916e10fe82068ea45acd5d50fb18f");
    expect(Object.keys(detail.healthKitAttachment).sort()).toEqual(ATTACHMENT_KEYS);
    expect(Object.keys(detail.healthKitAttachment.session).sort()).toEqual(SESSION_KEYS);
    expect(detail.healthKitAttachment).toMatchObject({
      family: "strength", canonicalType: "traditional_strength_training",
      relationship: { status: "confirmed", contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" } },
      session: { durationSeconds: 3600, activeCalories: 410, averageHeartRate: 122 },
    });
    expect(detail.telemetry).toMatchObject({ durationSeconds: 3600, activeCalories: 410, averageHeartRate: 122 });
  });

  it("is JSON-safe on the wire (round-trips exactly) and leaks no raw HealthKit identity or internal state", async () => {
    const detail = await strengthDetail(createSep23StrengthPresentationFixture());
    expect(JSON.parse(JSON.stringify(detail))).toEqual(detail);
    const wire = JSON.stringify(detail);
    expect(wire).not.toMatch(/externalId|statusHistory|evidenceEligibility|semanticFingerprint/u);
  });
});

describe("Item 13: the Sep 24 candidate Strength detail (Server side of decode/render)", () => {
  it("serves the candidate relationship and the real ~28-minute Apple window, byte-identical to production 01d1900b", async () => {
    const fixture = createSep24StrengthPresentationFixture();
    const detail = await strengthDetail(fixture);
    const wire = JSON.stringify(detail);
    expect(wire.length).toBe(2464);
    expect(sha256(wire)).toBe("2fa149d44ca3991b12953fa554b4422619180036c81e7637fa0706297cc2ab61");
    expect(sha256([...projectHealthKitStrengthWorkoutPresentationBySession(fixture).entries()]))
      .toBe("4edb986f0b9ef35e958fd51d2dc35a5722099e2a04c5760e3edd47c4ab33c64a");
    expect(Object.keys(detail.healthKitAttachment).sort()).toEqual(ATTACHMENT_KEYS);
    expect(detail.healthKitAttachment.relationship).toEqual({
      status: "candidate", matchOutcome: "possible_match", confidence: 60,
      contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
    });
    expect(detail.healthKitAttachment.session).toMatchObject({ durationSeconds: 1679, activeCalories: 206.205, averageHeartRate: 120.14 });
    expect(detail.telemetry).toMatchObject({ startTime: "2026-09-24T18:22:10.000Z", endTime: "2026-09-24T18:50:09.000Z", durationSeconds: 1679 });
  });

  it("is JSON-safe on the wire: no undefined, NaN, Date or function survives, so a strict decoder sees only JSON values", async () => {
    const detail = await strengthDetail(createSep24StrengthPresentationFixture());
    expect(JSON.parse(JSON.stringify(detail))).toEqual(detail);
    const visit = (value, where) => {
      if (value === null) return;
      expect(["string", "number", "boolean", "object"], where).toContain(typeof value);
      if (typeof value === "number") expect(Number.isFinite(value), where).toBe(true);
      if (typeof value === "object") {
        expect(value instanceof Date, where).toBe(false);
        for (const [key, child] of Object.entries(value)) visit(child, `${where}.${key}`);
      }
    };
    visit(detail, "detail");
    // Optional nulls the decoder must tolerate are explicit nulls, never missing/undefined.
    expect(detail.healthKitAttachment.session.distance).toBeNull();
    expect(detail.healthKitAttachment.session.distanceUnit).toBeNull();
  });

  it("keeps the two Logger exercises attached and the Logger's own frozen 94-minute duration untouched", async () => {
    const fixture = createSep24StrengthPresentationFixture();
    const logger = fixture.canonicalEvidenceObjects.find((record) => record.canonicalId === fixture.ids.session);
    const exercisesBefore = structuredClone(logger.payload.exercises);
    const detail = await strengthDetail(fixture);
    expect(detail.exercises).toEqual(exercisesBefore);
    expect(detail.exercises).toHaveLength(2);
    expect(logger.payload.metadata.duration_seconds).toBe(5647);
    expect(fixture.workoutLinks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Item 14: Indoor/Outdoor metadata survives request bounds -> ingestion -> canonical classifier
// ---------------------------------------------------------------------------

describe("Item 14: isIndoorWorkout survives request bounds, ingestion and the canonical classifier", () => {
  const BASE_MEASUREMENT = { activityType: "52", durationSeconds: 1200, activeCalories: 150 };

  it("the request-bound wire table sizes the field and the ingest bound still covers the derived worst case", () => {
    expect(HEALTHKIT_OBSERVATION_WIRE_FIELDS.workout.isIndoorWorkout).toBe("boolean");
    const maximum = resolveNativeCommandMaximumRequestBytes(Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS);
    expect(nativeCommandRequestMaximumBytes({ commandType: Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS })).toBe(maximum);
    expect(computeHealthKitIngestMaximumRequestBytes()).toBeLessThanOrEqual(maximum);
    expect(maximum).toBeLessThanOrEqual(computeHealthKitIngestMaximumRequestBytes() * 1.15);
  });

  it("a Native-encoded body carrying Indoor and Outdoor walks fits the bound, decodes, canonicalizes to distinct specific types and keeps the family", async () => {
    const body = JSON.stringify({
      commandType: Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS,
      payload: { batchId: "wire-batch", observations: [
        walk({ externalId: "wire-indoor", isIndoorWorkout: true, start: "09:00", end: "09:20" }),
        walk({ externalId: "wire-outdoor", isIndoorWorkout: false, start: "11:00", end: "11:20" }),
        walk({ externalId: "wire-unknown", start: "13:00", end: "13:20" }),
      ] },
    });
    // request-bounds: the encoded body is within the command's bound (route parses once, then enforces).
    const parsed = JSON.parse(body);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(nativeCommandRequestMaximumBytes(parsed));

    // ingestion: the real command port (Cardio in scope in THIS test store only).
    const records = productionShapedStore({ workoutOverrides: { families: ["cardio", "strength"], effectiveLocalDate: "2026-09-24" } });
    const result = await ingest(records, parsed.payload.observations, "2026-09-24T21:00:00.000Z");
    expect(result.result.workoutCanonicalizedCount).toBe(3);
    const snapshot = records.snapshot();
    const byExternal = Object.fromEntries(snapshot.healthKitObservations.map((record) =>
      [record.externalId ?? record.identity?.externalId ?? record.id, record]));
    // ingestion persisted the explicit signal (and only where it was explicit).
    const stored = snapshot.healthKitObservations.map((record) => record.measurement.isIndoorWorkout);
    expect(stored.filter((value) => value === true)).toHaveLength(1);
    expect(stored.filter((value) => value === false)).toHaveLength(1);
    expect(stored.filter((value) => value === undefined)).toHaveLength(1);
    expect(Object.keys(byExternal)).toHaveLength(3);

    // canonical classifier: specific types, family untouched, unknown stays generic.
    const types = snapshot.healthKitCanonicalWorkouts.map((workout) => [workout.current.canonicalType, workout.current.family]).sort();
    expect(types).toEqual([["indoor_walking", "cardio"], ["outdoor_walking", "cardio"], ["walking", "cardio"]]);
  });

  it("only a literal boolean is honoured end to end: a string/number signal is dropped and never guessed toward indoor or outdoor", async () => {
    const records = productionShapedStore({ workoutOverrides: { families: ["cardio", "strength"], effectiveLocalDate: "2026-09-24" } });
    await ingest(records, [
      walk({ externalId: "string-true", isIndoorWorkout: "true", start: "09:00", end: "09:20" }),
      walk({ externalId: "number-one", isIndoorWorkout: 1, start: "11:00", end: "11:20" }),
    ], "2026-09-24T21:00:00.000Z");
    const snapshot = records.snapshot();
    for (const record of snapshot.healthKitObservations) expect(record.measurement).not.toHaveProperty("isIndoorWorkout");
    expect(snapshot.healthKitCanonicalWorkouts.map((workout) => workout.current.canonicalType)).toEqual(["walking", "walking"]);
  });

  it("the classifier never lets the signal change family or touch strength/unsupported types", () => {
    expect(classifyHealthKitWorkoutType("50", { isIndoorWorkout: true })).toMatchObject({ family: "strength", canonicalType: "traditional_strength_training" });
    expect(classifyHealthKitWorkoutType("52", { isIndoorWorkout: true })).toMatchObject({ family: "cardio", canonicalType: "indoor_walking", locationBasis: "explicit_indoor_workout_metadata" });
    expect(classifyHealthKitWorkoutType("16", { isIndoorWorkout: false }).family).toBe("unsupported");
    expect(normalizeHealthKitObservationBatch({
      batchId: "b", principalDeviceId: "d", observations: [{ ...walk({ externalId: "n", isIndoorWorkout: false }) }],
    }).observations[0].measurement).toMatchObject({ ...BASE_MEASUREMENT, isIndoorWorkout: false });
  });

  it("presentation forwards a canonical Indoor type unchanged (the Server half of the Native Indoor/Outdoor label)", () => {
    const fixture = createCardioWholeDayAttributionFixture({ canonicalType: "outdoor_walking" });
    const day = createProviderActivityEvidenceReport(fixture).latestActivityDay;
    expect(day.contributingWorkouts[0]).toMatchObject({ family: "cardio", canonicalType: "outdoor_walking" });
  });
});

// ---------------------------------------------------------------------------
// Item 15: Cardio is NOT activated
// ---------------------------------------------------------------------------

function gitAvailable() {
  try {
    execFileSync("git", ["cat-file", "-e", `${PRODUCTION_BASE}^{commit}`], { stdio: "ignore", cwd: path.resolve(new URL("../../..", import.meta.url).pathname) });
    return true;
  } catch {
    return false;
  }
}
const REPO_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const diffAvailable = gitAvailable();
const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
// Committed history only: excludes this acceptance suite itself, which is
// added on top of the candidate and is not part of the candidate under test.
// The command-ports file hosts the Workout/graduation write paths this guard protects. The
// daily-driver local-day lane (weigh-in future-date guard in the device zone) is the only reviewed
// change allowed there: every added line must be that time-zone pass-through or its comment.
const COMMAND_PORTS = "src/application/commands/CanonicalPersistenceCommandPorts.js";
const commandPortsChangeIsOnlyTheWeighInZone = () => git("diff", "-U0", PRODUCTION_BASE, "HEAD", "--", COMMAND_PORTS)
  .split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
  .every((line) => /^\+\s*(\/\/.*|import \{ getLocalDateKey, resolveLocalTimeZone, resolveRequestedTimeZone \} from "\.\.\/\.\.\/domain\/utils\/localDate\.js";|timeZone: reconcilePreviousDayPriorities === false|\? resolveRequestedTimeZone\(context\.payload\.timeZone\) \?\? undefined|: undefined,)$/u.test(line));
const candidateNames = () => git("diff", "--name-only", PRODUCTION_BASE, "HEAD")
  .split("\n").filter(Boolean).filter((name) => !/IntegratedProductionShapedAcceptance\.test\.js$|IntegratedHealthKitProductionShapedAcceptance\.test\.js$/u.test(name));

describe("Item 15: Cardio is NOT activated by the combined candidate", () => {
  it("the graduation policy cannot name Cardio/Workout at all: such a policy fails closed for BOTH purposes", () => {
    for (const domain of ["cardio", "workout", "walking"]) {
      const resolved = resolveHealthKitGraduationPolicy(graduationPolicy({
        evidenceEligibility: { enabled: true, domains: ["activity", domain], startLocalDate: "2026-09-22", endLocalDate: null },
      }));
      expect(resolved.valid, domain).toBe(false);
      expect(resolved.projection.enabled).toBe(false);
      expect(resolved.evidenceEligibility.enabled).toBe(false);
    }
    const valid = resolveHealthKitGraduationPolicy(graduationPolicy());
    expect(valid.evidenceEligibility.domains).toEqual(["activity", "nutrition"]);
    for (const domain of ["cardio", "workout"]) {
      expect(isHealthKitGraduationInScope(valid.evidenceEligibility, { domain, localDate: "2026-09-25" })).toBe(false);
      expect(assessHealthKitGraduation({ policy: valid, day: { domain, localDate: "2026-09-25", current: { coverage: "complete_day" } },
        purpose: HealthKitGraduationPurpose.EVIDENCE })).toMatchObject({ graduated: false, reason: "not_in_graduation_scope" });
    }
  });

  it("the settlement gate's reader treats Cardio as not HealthKit-backed even with evidence eligibility fully open", async () => {
    const records = productionShapedStore();
    await ingest(records, [activity("2026-09-24"), nutrition("2026-09-24")]);
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    expect(await reader.readSettlementCoverage({ localDate: "2026-09-24", domains: ["cardio", "workout"] }))
      .toEqual({ activeDomains: [], domainStates: {} });
    expect((await reader.readSettlementCoverage({ localDate: "2026-09-24" })).activeDomains).toEqual(["activity", "nutrition"]);
    expect(DEFAULT_SETTLEMENT_POLICY.readinessDomains).toEqual(["activity", "nutrition"]);
  });

  it("with the production-shaped Strength-only Workout policy, real Cardio walks stay deferred and never canonicalize; Strength still does", async () => {
    const records = productionShapedStore();
    const result = await ingest(records, [
      walk({ externalId: "walk-a", isIndoorWorkout: true, start: "09:00", end: "09:20" }),
      walk({ externalId: "walk-b", start: "11:00", end: "11:20" }),
      { ...walk({ externalId: "lift", activityType: "50", start: "15:00", end: "15:50" }) },
    ], "2026-09-24T23:00:00.000Z");
    const snapshot = records.snapshot();
    const deferred = snapshot.healthKitObservations.filter((record) => record.measurement.activityType === "52");
    expect(deferred).toHaveLength(2);
    for (const record of deferred) {
      expect(record.reconciliation).toMatchObject({
        state: HealthKitReconciliationState.WORKOUT_CANONICALIZATION_DEFERRED, reason: "family_not_in_activation_scope" });
    }
    expect(snapshot.healthKitCanonicalWorkouts.map((workout) => workout.current.family)).toEqual(["strength"]);
    expect(result.result.workoutCanonicalizedCount).toBe(1);
    const policy = resolveHealthKitWorkoutActivationPolicy(workoutPolicy({ families: ["strength"] }));
    expect(policy.families).toEqual(["strength"]);
    expect(assessHealthKitWorkoutCanonicalization({
      observation: normalizeHealthKitObservationBatch({ batchId: "x", principalDeviceId: "d", observations: [walk({ externalId: "w" })] }).observations[0],
      effectiveLocalDate: "2026-09-24", family: "cardio", activationPolicy: workoutPolicy({ families: ["strength"] }),
    })).toMatchObject({ eligible: false, reason: "family_not_in_activation_scope" });
  });

  it.skipIf(!diffAvailable)("git diff 01d1900b..HEAD touches no migration, schema or database-definition file", () => {
    const names = candidateNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => /(^|\/)(migrations?|schema)(\/|\.)|\.sql$|prisma|drizzle|knex|ddl|seed/iu.test(name))).toEqual([]);
    // The only files under a database path are the READ-ONLY graduation reader (and its test) and, for the
    // Training Day Cardio presentation fix, the READ-ONLY Training navigation read store (SELECT-only; asserted below).
    expect(names.filter((name) => /(^|\/)database\//u.test(name)).sort()).toEqual([
      "src/platform/database/HealthKitGraduationReader.js", "src/platform/database/HealthKitGraduationReader.test.js",
      "src/platform/database/PostgresTrainingNavigationReadStore.js"]);
    const storeAdded = git("diff", "-U0", PRODUCTION_BASE, "HEAD", "--", "src/platform/database/PostgresTrainingNavigationReadStore.js")
      .split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");
    expect(storeAdded).toMatch(/SELECT payload,version FROM/u);
    expect(storeAdded).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE)\b/iu);
  });

  it.skipIf(!diffAvailable)("git diff 01d1900b..HEAD adds no line that writes/creates/activates a Workout or graduation policy", () => {
    const untouched = ["src/domain/services/HealthKitGraduation.js",
      "src/platform/operations/HealthKitDeferredWorkoutReconciliationRunner.js", "src/domain/services/HealthKitEvidenceEligibilityPolicy.js"];
    const names = candidateNames();
    for (const file of untouched) expect(names, file).not.toContain(file);
    if (names.includes(COMMAND_PORTS)) expect(commandPortsChangeIsOnlyTheWeighInZone(), COMMAND_PORTS).toBe(true);
    const added = git("diff", "-U0", PRODUCTION_BASE, "HEAD", "--", "src", "scripts", ":(exclude)*.test.js")
      .split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    expect(added.length).toBeGreaterThan(0);
    const offenders = added.filter((line) =>
      /healthkit_workout_canonical_activation_policy|healthkit_canonical_graduation_policy|WORKOUT_ACTIVATION|\bfamilies\b|healthKitConfiguration|openEnded|records\.(?:put|create|update|upsert|write|delete)|\.(?:insert|upsert)\(/u.test(line));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Item 16: the four historical deferred walks are untouched
// ---------------------------------------------------------------------------

describe("Item 16: historical deferred Cardio walks are never auto-reconciled or mutated", () => {
  // Four deferred walks shaped exactly as production stores them: real ingestion
  // under the Strength-only prospective policy defers each with
  // reason family_not_in_activation_scope and no canonical workout.
  const WALKS = [
    walk({ externalId: "hist-walk-1", date: "2026-09-24", start: "07:00", end: "07:20" }),
    walk({ externalId: "hist-walk-2", date: "2026-09-24", start: "12:00", end: "12:20" }),
    walk({ externalId: "hist-walk-3", date: "2026-09-24", start: "14:00", end: "14:20", isIndoorWorkout: true }),
    walk({ externalId: "hist-walk-4", date: "2026-09-24", start: "18:00", end: "18:20" }),
  ];
  const observationsOf = (snapshot) => snapshot.healthKitObservations.filter((record) => record.measurement?.activityType === "52" && record.externalId !== "post-widening-walk");

  // Test-store-only stand-in for a later policy widening (the production store is never touched).
  async function widenWorkoutPolicy(records) {
    const current = await records.get({ collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID });
    await records.put({ collection: "healthKitConfiguration", recordId: WORKOUT_POLICY_ID,
      payload: { ...current, families: ["cardio", "strength"], version: 2 }, expectedVersion: current.version ?? null });
  }

  async function deferredWorld() {
    const records = productionShapedStore();
    await ingest(records, WALKS, "2026-09-24T21:00:00.000Z");
    return records;
  }

  it("(setup) all four are stored deferred with no canonical workout, link or claim", async () => {
    const snapshot = (await deferredWorld()).snapshot();
    expect(observationsOf(snapshot)).toHaveLength(4);
    for (const record of observationsOf(snapshot)) {
      expect(record.reconciliation).toMatchObject({ state: "workout_canonicalization_deferred", reason: "family_not_in_activation_scope" });
    }
    expect([snapshot.healthKitCanonicalWorkouts, snapshot.healthKitWorkoutLinks, snapshot.healthKitWorkoutLinkClaims]).toEqual([[], [], []]);
  });

  it("widening the policy to include Cardio and re-delivering the walks does NOT backfill them (only workouts first uploaded afterwards)", async () => {
    const records = await deferredWorld();
    const before = records.snapshot();
    const mutationsBefore = records.getMutationCount();
    // Later policy widening, in this test store only.
    await widenWorkoutPolicy(records);
    const widenedMutations = records.getMutationCount();
    const replay = await ingest(records, WALKS, "2026-09-25T09:00:00.000Z");
    expect(replay.result).toMatchObject({ createdCount: 0 });
    expect(replay.result.workoutCanonicalizedCount).toBe(0);
    const after = records.snapshot();
    expect(observationsOf(after)).toEqual(observationsOf(before));
    expect(after.healthKitCanonicalWorkouts).toEqual([]);
    expect(after.healthKitWorkoutLinks).toEqual([]);
    expect(after.healthKitWorkoutLinkClaims).toEqual([]);
    expect(widenedMutations).toBeGreaterThan(mutationsBefore);
    for (const record of observationsOf(after)) expect(record.reconciliation.reason).toBe("family_not_in_activation_scope");
    // Control: the widening IS effective for a walk first uploaded afterwards, so the four above were
    // deliberately left alone rather than the policy silently failing to apply.
    const fresh = await ingest(records, [walk({ externalId: "post-widening-walk", date: "2026-09-25", start: "08:00", end: "08:20" })],
      "2026-09-25T16:00:00.000Z");
    expect(fresh.result.workoutCanonicalizedCount).toBe(1);
    expect(records.snapshot().healthKitCanonicalWorkouts).toHaveLength(1);
    expect(observationsOf(records.snapshot()).filter((record) => record.reconciliation.reason === "family_not_in_activation_scope")).toHaveLength(4);
  });

  it("every read path the candidate adds (graduation reader, settlement coverage, overlay, whole-day presentation) writes nothing", async () => {
    const records = await deferredWorld();
    await ingest(records, [activity("2026-09-24"), nutrition("2026-09-24")], "2026-09-25T06:00:00.000Z");
    const before = records.snapshot();
    const mutations = records.getMutationCount();
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    reader.beginRun();
    await reader.readSettlementCoverage({ localDate: "2026-09-24" });
    await reader.overlay([ordinaryActivityDay("2026-09-24")], { purpose: HealthKitGraduationPurpose.EVIDENCE });
    await reader.overlay([], { purpose: HealthKitGraduationPurpose.PROJECTION });
    expect(records.getMutationCount()).toBe(mutations);
    expect(records.snapshot()).toEqual(before);
    // Presentation over the (empty) canonical workout set invents no Cardio workout.
    const report = createProviderActivityEvidenceReport({
      ownerUserId: OWNER, day: "2026-09-24",
      canonicalEvidenceObjects: [ordinaryActivityDay("2026-09-24")], canonicalWorkouts: before.healthKitCanonicalWorkouts,
      workoutLinks: [], workoutLinkClaims: [],
    });
    expect(report.latestActivityDay.contributingWorkouts ?? []).toEqual([]);
  });

  it("the only reconsideration path is the on-demand, single-identity, authorized operation: dry-run writes nothing and apply refuses without an explicit authorization", async () => {
    const records = await deferredWorld();
    // The operation only sees Cardio once the CURRENT policy includes it (test store).
    await widenWorkoutPolicy(records);
    const target = observationsOf(records.snapshot())[0];
    const mutations = records.getMutationCount();
    const now = () => new Date("2026-09-25T10:00:00.000Z");
    const dry = await runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: target.id, authorizationReference: "" }, now });
    expect(dry.outcome).toBe("dry_run");
    expect(records.getMutationCount()).toBe(mutations);
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationId: target.id, authorizationReference: "" }, apply: true, expected: dry.facts, now,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    await expect(runHealthKitDeferredWorkoutReconciliation({
      records, authorization: { ownerUserId: OWNER, observationIds: observationsOf(records.snapshot()).map((record) => record.id) }, now,
    })).rejects.toMatchObject({ code: "BULK_OR_RANGE_NOT_SUPPORTED" });
    expect(records.getMutationCount()).toBe(mutations);
    expect(observationsOf(records.snapshot())).toHaveLength(4);
    expect(records.snapshot().healthKitCanonicalWorkouts).toEqual([]);
  });

  it("no module outside scripts/operations invokes the reconciliation runner, and the candidate diff never touches it or the ingestion deferral logic", () => {
    const importers = [];
    for (const rootName of ["src", "scripts"]) {
      const walkDirectory = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) { walkDirectory(full); continue; }
          if (!/\.(?:js|mjs)$/u.test(entry.name) || /IntegratedHealthKitProductionShapedAcceptance/u.test(entry.name)) continue;
          if (fs.readFileSync(full, "utf8").includes("HealthKitDeferredWorkoutReconciliationRunner")) {
            importers.push(path.relative(REPO_ROOT, full));
          }
        }
      };
      walkDirectory(path.join(REPO_ROOT, rootName));
    }
    expect(importers.sort()).toEqual([
      "scripts/operations/healthKitDeferredWorkoutReconciliation.entry.mjs",
      "src/platform/operations/HealthKitDeferredWorkoutReconciliationRunner.test.js",
    ]);
    if (diffAvailable) {
      const names = candidateNames();
      expect(names).not.toContain("src/platform/operations/HealthKitDeferredWorkoutReconciliationRunner.js");
      if (names.includes(COMMAND_PORTS)) expect(commandPortsChangeIsOnlyTheWeighInZone(), COMMAND_PORTS).toBe(true);
      expect(names).not.toContain("scripts/operations/healthKitDeferredWorkoutReconciliation.entry.mjs");
    }
  });
});
