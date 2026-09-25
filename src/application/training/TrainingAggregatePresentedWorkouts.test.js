import { describe, expect, it, vi } from "vitest";
import { createTrainingNavigationReadService } from "./TrainingNavigationReadService.js";
import {
  projectHealthKitCardioWorkoutAsTrainingRecord,
  projectPresentedHealthKitCardioTrainingRecords,
} from "../../domain/services/HealthKitCardioTrainingPresentation.js";
import { getWorkoutDuplicateIdentityKey } from "../../domain/services/WorkoutDuplicateIdentityService.js";
import { projectNativeTrainingLandingRead } from "../native/NativeReadProjectionService.js";
import { createPostgresTrainingNavigationReadStore } from "../../platform/database/PostgresTrainingNavigationReadStore.js";

// Training aggregate consistency: Recent Training History (landing), reporting
// history and the Cardio library history present the SAME workout universe as
// Training Day (the accepted unified workout contract):
//   structured Strength Logger session  = 1 presented workout
//   screenshot-derived Cardio evidence  = 1 presented workout
//   canonical HealthKit Cardio workout  = 1 presented workout, unless it is an
//                                         unambiguous duplicate of active evidence
//                                         on its own day (then it counts once)
//   canonical HealthKit Strength        = never a row (telemetry of the Logger session)
// Production-shaped controls mirror Sep 21-24 (sanitized ids).

const HK_ID = (n) => `healthkit_canonical_workout_${String(n).padStart(40, "0")}`;

function walkEvidence({ id, date, capturedAt, activityType = "Outdoor Walk", seconds = 1000, miles = 0.9, kcal = 90, start = null, end = null, quality = { status: "active" } }) {
  return {
    canonicalId: id, id,
    payload: {
      id, evidence_type: "training", observed_at: date, captured_at: capturedAt, exercises: [],
      metadata: { activity_type: activityType, duration_seconds: seconds, distance: miles, distance_unit: "mi", active_calories: kcal, average_heart_rate: 100, start_time: start, end_time: end },
      source: { application: "screenshot", integration: "apple_health", modality: "image", source_artifact_refs: [`${id}.jpg`.replace(/\|/g, "_")] },
      provenance: {}, quality, removed: false, values: {},
    },
  };
}

function strengthEvidence({ id, date }) {
  return {
    canonicalId: id, id,
    payload: {
      id, evidence_type: "training", observed_at: date, captured_at: `${date}T12:00:00.000Z`,
      exercises: [
        { id: "e1", name: "Leg Press", canonicalExerciseId: "leg_press", canonicalExerciseName: "Leg Press" },
        { id: "e2", name: "Hack Squat", canonicalExerciseId: "hack_squat", canonicalExerciseName: "Hack Squat" },
      ],
      metadata: { activity_type: "Traditional Strength Training", duration_seconds: 3853, active_calories: 403 },
      source: { application: "workout_logger", modality: "structured", source_artifact_refs: [`training_logger_${id}`] },
      provenance: {}, quality: { status: "active" }, values: {},
    },
  };
}

function canonicalWorkout({ n, family = "cardio", canonicalType = "walking", localDate, startedAt, endedAt, timeZone = "America/Los_Angeles",
  seconds = 1000, meters = 1500, kcal = 90, coexistence = { candidates: [], state: "no_other_source", unverifiableCount: 0 }, extra = {} }) {
  return {
    id: HK_ID(n), schemaVersion: "healthkit-canonical-workout-v1", userId: "user_founder_001", version: 2, revision: 1, localDate,
    semanticFingerprint: `sha256_${String(n).padStart(64, "0")}`, revisionHistory: [],
    createdAt: "2026-09-25T16:05:24.036Z", updatedAt: "2026-09-25T16:05:24.036Z",
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: { policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false },
    current: { family, canonicalType, appleActivityType: family === "cardio" ? "52" : "50", localDate, localDateBasis: "workout_start_in_workout_time_zone", timeZone, startedAt, endedAt, sourceRevision: 1,
      sourceObservationId: `obs_${n}`, source: { bundleIdentifier: "com.apple.health.fixture", sourceName: "Apple Watch" },
      telemetry: { durationSeconds: seconds, activeCalories: kcal, totalCalories: null, distance: meters, distanceUnit: "m", averageHeartRate: 110 } },
    coexistence, evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
    linkAssessment: null,
    provenance: { application: "Apple Health", integration: "HealthKit", modality: "direct", basis: "healthkit_workout_observation", bundleIdentifier: "com.apple.health.fixture",
      currentSourceObservationId: `obs_${n}`, sourceObservationIds: [`obs_${n}`] },
    ...extra,
  };
}

const dup = (evidenceId) => ({ candidates: [{ canonicalId: evidenceId, confidence: 99, outcome: "duplicate" }], state: "matches_existing_evidence_workout", unverifiableCount: 0 });

// --- Production-shaped controls ---------------------------------------------
const SEP21 = [
  walkEvidence({ id: "training|filename|2026-09-21|Apple Health Screenshot 1", date: "2026-09-21", capturedAt: "2026-09-21T07:35:00-07:00" }),
  walkEvidence({ id: "training|authoritative|evidence_submission_A_images_file_3", date: "2026-09-21", capturedAt: "2026-09-21T08:57:00-07:00" }),
  strengthEvidence({ id: "training|authoritative|training_logger_draft_21", date: "2026-09-21" }),
];
const SEP22_SHOT1 = walkEvidence({ id: "training|authoritative|evidence_submission_B_images_file_1", date: "2026-09-22", capturedAt: "2026-09-22T06:44:00-07:00" });
const SEP22_SHOT3 = walkEvidence({ id: "training|authoritative|evidence_submission_B_images_file_3", date: "2026-09-22", capturedAt: "2026-09-22T08:20:00-07:00" });
const SEP22 = [SEP22_SHOT1, SEP22_SHOT3, strengthEvidence({ id: "training|authoritative|training_logger_draft_22", date: "2026-09-22" })];
const SEP22_HK_DUPLICATES = [
  canonicalWorkout({ n: 5, localDate: "2026-09-22", startedAt: "2026-09-22T13:44:00.000Z", endedAt: "2026-09-22T14:08:00.000Z", coexistence: dup(SEP22_SHOT1.canonicalId) }),
  canonicalWorkout({ n: 6, localDate: "2026-09-22", startedAt: "2026-09-22T15:20:00.000Z", endedAt: "2026-09-22T15:36:00.000Z", coexistence: dup(SEP22_SHOT3.canonicalId) }),
];
const SEP23 = [strengthEvidence({ id: "training|authoritative|training_logger_draft_23", date: "2026-09-23" })];
const SEP24 = [strengthEvidence({ id: "training|authoritative|training_logger_draft_24", date: "2026-09-24" })];
const SEP23_WALKS = [
  canonicalWorkout({ n: 1, localDate: "2026-09-23", startedAt: "2026-09-23T13:29:52.000Z", endedAt: "2026-09-23T13:47:51.000Z", seconds: 1079.5, meters: 1515.98, kcal: 78.65 }),
  canonicalWorkout({ n: 2, localDate: "2026-09-23", startedAt: "2026-09-23T14:57:14.000Z", endedAt: "2026-09-23T15:12:58.000Z", seconds: 943.7, meters: 1548.02, kcal: 107.14 }),
];
const SEP24_WALKS = [
  canonicalWorkout({ n: 3, localDate: "2026-09-24", timeZone: "America/Chicago", startedAt: "2026-09-24T16:04:20.000Z", endedAt: "2026-09-24T16:22:07.000Z", seconds: 1067, meters: 1624.58, kcal: 157.58 }),
  canonicalWorkout({ n: 4, localDate: "2026-09-24", timeZone: "America/Chicago", startedAt: "2026-09-24T16:50:11.000Z", endedAt: "2026-09-24T17:06:39.000Z", seconds: 987.9, meters: 1626.56, kcal: 188.13 }),
];
// HealthKit Strength telemetry of the Sep 23/24 Logger sessions (candidate/confirmed links).
const HK_STRENGTH = [
  canonicalWorkout({ n: 7, family: "strength", canonicalType: "traditional_strength_training", localDate: "2026-09-23", startedAt: "2026-09-23T17:00:00.000Z", endedAt: "2026-09-23T18:04:00.000Z",
    extra: { linkAssessment: { state: "candidate", loggerSessionCanonicalId: SEP23[0].canonicalId } } }),
  canonicalWorkout({ n: 8, family: "strength", canonicalType: "traditional_strength_training", localDate: "2026-09-24", startedAt: "2026-09-24T17:30:00.000Z", endedAt: "2026-09-24T18:31:00.000Z",
    extra: { linkAssessment: { state: "confirmed", loggerSessionCanonicalId: SEP24[0].canonicalId } } }),
];

const EVIDENCE = [...SEP21, ...SEP22, ...SEP23, ...SEP24];
const WORKOUTS = [...SEP22_HK_DUPLICATES, ...SEP23_WALKS, ...SEP24_WALKS, ...HK_STRENGTH];

function fakeStore({ evidence = EVIDENCE, workouts = WORKOUTS, failWorkouts = false, spy = {}, timezone = null } = {}) {
  const byDate = (date) => evidence.filter((r) => r.payload.observed_at.slice(0, 10) === date);
  return {
    run: (_name, callback) => callback(),
    getUser: async () => ({ id: "user_founder_001", timezone }),
    listGoals: async () => [],
    listCanonicalTrainingAndActivityEvidenceObjects: async () => evidence,
    listCanonicalTrainingEvidenceObjects: async () => evidence,
    listCanonicalTrainingEvidenceForDate: async (date) => byDate(date),
    listHealthKitCanonicalCardioWorkouts: async () => {
      spy.cardioListCalls = (spy.cardioListCalls ?? 0) + 1;
      if (failWorkouts) throw Object.assign(new Error("store down"), { code: "ECONNRESET" });
      return workouts.filter((w) => w.current?.family === "cardio");
    },
    listHealthKitCanonicalWorkoutsForDate: async (date) => workouts.filter((w) => w.localDate === date),
    listHealthKitCanonicalWorkouts: async () => workouts,
    getHealthKitCanonicalWorkout: async (id) => workouts.find((w) => w.id === id) ?? null,
    getCanonicalEvidenceObject: async (id) => evidence.find((r) => r.canonicalId === id) ?? null,
    listHealthKitWorkoutLinks: async () => [], listHealthKitWorkoutLinkClaims: async () => [], listEvidencePackages: async () => [],
  };
}
const service = (store, logger = null) => createTrainingNavigationReadService({ store, logger, readCanonicalExerciseRegistry: async () => [] });
const dayOf = (report, date) => report.trainingDays.find((day) => day.date === date);
const labelsOf = (day) => day.sessions.map((s) => s.label);

describe("Recent Training History presents Training Day's workout universe", () => {
  it("Sep 21 control stays 3 presented workouts (2 screenshot walks + Strength)", async () => {
    const { report } = await service(fakeStore()).getLanding({ context: "all" });
    expect(dayOf(report, "2026-09-21").summary).toBe("3 sessions");
    expect(labelsOf(dayOf(report, "2026-09-21")).sort()).toEqual(["Outdoor Walk", "Outdoor Walk", "Traditional Strength Training"]);
  });

  it("Sep 22 stays 3, not 5: canonical HealthKit walks that duplicate the screenshots count once", async () => {
    const { report } = await service(fakeStore()).getLanding({ context: "all" });
    expect(dayOf(report, "2026-09-22").summary).toBe("3 sessions");
    expect(labelsOf(dayOf(report, "2026-09-22")).sort()).toEqual(["Outdoor Walk", "Outdoor Walk", "Traditional Strength Training"]);
  });

  it("Sep 23 and Sep 24 become 3 (two generic Walking rows + Strength), previously 1", async () => {
    const before = await service(fakeStore({ workouts: [] })).getLanding({ context: "all" });
    expect(dayOf(before.report, "2026-09-23").summary).toBe("1 session"); // the Founder-observed defect
    const { report } = await service(fakeStore()).getLanding({ context: "all" });
    for (const date of ["2026-09-23", "2026-09-24"]) {
      expect(dayOf(report, date).summary).toBe("3 sessions");
      expect(labelsOf(dayOf(report, date)).sort()).toEqual(["Traditional Strength Training", "Walking", "Walking"]);
    }
  });

  it("every aggregate day count equals its Training Day sessionCount (same universe, same dedupe)", async () => {
    const svc = service(fakeStore());
    const { report } = await svc.getLanding({ context: "all" });
    for (const day of report.trainingDays) {
      const trainingDay = await svc.getDay({ date: day.date });
      expect(day.sessions.length, day.date).toBe(trainingDay.summary.sessionCount);
    }
    expect(report.trainingDays.map((d) => d.date)).toEqual(["2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21"]);
  });

  it("a Cardio-only day appears in history with its own count", async () => {
    const walk = canonicalWorkout({ n: 30, canonicalType: "outdoor_walking", localDate: "2026-09-26", startedAt: "2026-09-26T14:00:00.000Z", endedAt: "2026-09-26T14:20:00.000Z" });
    const { report } = await service(fakeStore({ workouts: [...WORKOUTS, walk] })).getLanding({ context: "all" });
    expect(dayOf(report, "2026-09-26")).toMatchObject({ summary: "1 session", href: "/progress/training/day/2026-09-26" });
    expect(labelsOf(dayOf(report, "2026-09-26"))).toEqual(["Outdoor Walk"]);
    expect(report.latestTrainingDay.date).toBe("2026-09-26");
  });

  it("a Strength-only day is unchanged", async () => {
    const strengthOnly = strengthEvidence({ id: "training|authoritative|training_logger_draft_19", date: "2026-09-19" });
    const withHk = await service(fakeStore({ evidence: [...EVIDENCE, strengthOnly] })).getLanding({ context: "all" });
    const withoutHk = await service(fakeStore({ evidence: [...EVIDENCE, strengthOnly], workouts: [] })).getLanding({ context: "all" });
    expect(dayOf(withHk.report, "2026-09-19")).toEqual(dayOf(withoutHk.report, "2026-09-19"));
    expect(dayOf(withHk.report, "2026-09-19").summary).toBe("1 session");
  });

  it("HealthKit Strength telemetry (candidate or confirmed) never becomes a second Strength session", async () => {
    const { report } = await service(fakeStore()).getLanding({ context: "all" });
    for (const date of ["2026-09-23", "2026-09-24"]) {
      expect(labelsOf(dayOf(report, date)).filter((label) => /strength/i.test(label))).toHaveLength(1);
    }
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(HK_STRENGTH[0])).toBeNull();
    const projected = projectPresentedHealthKitCardioTrainingRecords({ canonicalWorkouts: HK_STRENGTH, existingEvidenceObjects: EVIDENCE });
    expect(projected).toEqual([]);
  });

  it("a screenshot uploaded after canonicalization (stale no_other_source) is reassessed and counts once", async () => {
    const lateShot = walkEvidence({ id: "training|authoritative|evidence_submission_LATE_images_file_1", date: "2026-09-23", capturedAt: "2026-09-23T06:29:00-07:00",
      activityType: "Outdoor Walk", seconds: 1080, miles: 0.94, kcal: 79, start: "2026-09-23T06:29:52-07:00", end: "2026-09-23T06:47:51-07:00" });
    const svc = service(fakeStore({ evidence: [...EVIDENCE, lateShot] }));
    const { report } = await svc.getLanding({ context: "all" });
    const trainingDay = await svc.getDay({ date: "2026-09-23" });
    expect(dayOf(report, "2026-09-23").sessions).toHaveLength(trainingDay.summary.sessionCount);
    expect(dayOf(report, "2026-09-23").summary).toBe("3 sessions");
  });

  it("a superseded screenshot never makes its HealthKit duplicate vanish from history", async () => {
    const supersededShot = { ...SEP22_SHOT1, payload: { ...SEP22_SHOT1.payload, quality: { status: "superseded" } } };
    const evidence = [supersededShot, SEP22_SHOT3, SEP22[2]];
    const { report } = await service(fakeStore({ evidence, workouts: SEP22_HK_DUPLICATES })).getLanding({ context: "all" });
    expect(labelsOf(dayOf(report, "2026-09-22")).sort()).toEqual(["Outdoor Walk", "Traditional Strength Training", "Walking"]);
  });

  it("generic historical walking stays generic; prospective Indoor/Outdoor types come from canonicalType", async () => {
    const indoor = canonicalWorkout({ n: 40, canonicalType: "indoor_walking", localDate: "2026-09-27", startedAt: "2026-09-27T14:00:00.000Z", endedAt: "2026-09-27T14:20:00.000Z" });
    const outdoor = canonicalWorkout({ n: 41, canonicalType: "outdoor_walking", localDate: "2026-09-27", startedAt: "2026-09-27T16:00:00.000Z", endedAt: "2026-09-27T16:20:00.000Z" });
    const { report } = await service(fakeStore({ workouts: [...WORKOUTS, indoor, outdoor] })).getLanding({ context: "all" });
    expect(labelsOf(dayOf(report, "2026-09-27")).sort()).toEqual(["Indoor Walk", "Outdoor Walk"]);
    expect(labelsOf(dayOf(report, "2026-09-23")).filter((l) => /walk/i.test(l))).toEqual(["Walking", "Walking"]);
  });

  it("ordering is deterministic regardless of store/workout input order", async () => {
    const a = await service(fakeStore()).getLanding({ context: "all" });
    const b = await service(fakeStore({ workouts: WORKOUTS.slice().reverse() })).getLanding({ context: "all" });
    expect(JSON.stringify(b.report.trainingDays)).toBe(JSON.stringify(a.report.trainingDays));
  });

  it("each projected workout keeps its own duplicate identity (no collapse into one 'Apple Health' record)", () => {
    const keys = [...SEP23_WALKS, ...SEP24_WALKS].map((w) => getWorkoutDuplicateIdentityKey(projectHealthKitCardioWorkoutAsTrainingRecord(w).payload));
    expect(new Set(keys).size).toBe(4);
  });

  it("history Cardio rows carry no Logger/link/claim semantics and open the existing Cardio detail", async () => {
    const svc = service(fakeStore());
    const { report } = await svc.getLanding({ context: "all" });
    const walkRows = dayOf(report, "2026-09-23").sessions.filter((s) => s.label === "Walking");
    for (const row of walkRows) {
      expect(row.exercises).toEqual([]);
      expect(row.href).toMatch(/^\/progress\/training\/session\/healthkit_canonical_workout_/);
      const session = await svc.getSession({ sessionId: decodeURIComponent(row.href.split("/").pop()) });
      expect(session).toBeTruthy();
      expect(session.exercises ?? []).toEqual([]);
    }
  });

  it("a HealthKit read failure degrades to the evidence-only history, observably", async () => {
    const warn = vi.fn();
    const { report } = await service(fakeStore({ failWorkouts: true }), { warn }).getLanding({ context: "all" });
    expect(dayOf(report, "2026-09-23").summary).toBe("1 session");
    expect(warn).toHaveBeenCalledWith("training.landing.healthkit_cardio_unavailable", { errorName: "Error", errorCode: "ECONNRESET" });
  });

  it("the Native landing projection stays decoder-compatible and small", async () => {
    const landing = await service(fakeStore()).getLanding({ context: "all" });
    const projected = projectNativeTrainingLandingRead(landing);
    const day = projected.report.trainingDays.find((d) => d.date === "2026-09-23");
    expect(Object.keys(day).sort()).toEqual(expect.arrayContaining(["date", "href", "label", "sessions", "summary"]));
    for (const session of day.sessions) {
      expect(Object.keys(session).every((key) => ["id", "label", "value", "detail", "date", "sourceEvidence", "href", "destination"].includes(key))).toBe(true);
    }
    expect(day.summary).toBe("3 sessions");
    // Four extra Cardio rows (latest-day + history previews) add ~0.7 KB each.
    const baseline = projectNativeTrainingLandingRead(await service(fakeStore({ workouts: [] })).getLanding({ context: "all" }));
    expect(JSON.stringify(projected).length - JSON.stringify(baseline).length).toBeLessThan(4 * 800);
  });
});

describe("Reporting and Library semantics are explicit", () => {
  it("reporting history matches the presented universe; resistance performance stays Strength-only", async () => {
    const withHk = await service(fakeStore()).getReporting({ context: "all" });
    const withoutHk = await service(fakeStore({ workouts: [] })).getReporting({ context: "all" });
    const historyDay = withHk.presentation.history.days.find((d) => (d.date ?? d.occurrenceDate) === "2026-09-23") ??
      withHk.presentation.history.days.find((d) => JSON.stringify(d).includes("2026-09-23"));
    expect(historyDay.sessions).toHaveLength(3);
    // Structured-strength semantics are untouched by Cardio.
    expect(withHk.presentation.resistance).toEqual(withoutHk.presentation.resistance);
    const stable = (value) => JSON.parse(JSON.stringify(value).replace(/"generated_at":"[^"]*"/g, '"generated_at":"-"'));
    expect(stable(withHk.report.resistancePerformance)).toEqual(stable(withoutHk.report.resistancePerformance));
    // Overview counts workouts; the resistance/cardio split keeps Strength fixed.
    const overview = (report) => Object.fromEntries((report.trainingOverview ?? []).map((item) => [item.label, item.value]));
    expect(overview(withHk.report).Sessions).not.toBe(overview(withoutHk.report).Sessions);
  });

  it("library exercise registry/PR inputs are unaffected; Cardio workout history includes canonical Cardio", async () => {
    const withHk = await service(fakeStore()).getLibrary({ context: "all" });
    const withoutHk = await service(fakeStore({ workouts: [] })).getLibrary({ context: "all" });
    expect(withHk.report.canonicalExercises).toEqual(withoutHk.report.canonicalExercises);
    expect(withHk.report.trainingBreakdowns.resistance).toEqual(withoutHk.report.trainingBreakdowns.resistance);
    const walking = (report) => (report.trainingBreakdowns.cardio ?? []).find((item) => /walking/i.test(item.label ?? item.name ?? ""));
    expect(walking(withHk.report)).toBeTruthy();
    const walkingHistory = await service(fakeStore()).getLibrary({ context: "all", path: ["cardio", "walking"] });
    expect(walkingHistory.report.trainingDays.map((d) => [d.date, d.summary])).toEqual([["2026-09-24", "2 sessions"], ["2026-09-23", "2 sessions"]]);
  });

  it("the Native Library read (exercise registry only) skips the Cardio read", async () => {
    const spy = {};
    await service(fakeStore({ spy })).getLibrary({ context: "all", includePresentedCardio: false });
    expect(spy.cardioListCalls ?? 0).toBe(0);
  });
});

describe("PostgreSQL store: bounded Cardio read", () => {
  it("reads only the owner's Cardio-family canonical workouts", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresTrainingNavigationReadStore({ pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 }, ownerUserId: "owner-one" });
    await store.run("training.landing", () => store.listHealthKitCanonicalCardioWorkouts());
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(values).toEqual(["owner-one"]);
    expect(sql).toContain("collection_name='healthKitCanonicalWorkouts'");
    expect(sql).toContain("payload#>>'{current,family}'='cardio'");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });
});
