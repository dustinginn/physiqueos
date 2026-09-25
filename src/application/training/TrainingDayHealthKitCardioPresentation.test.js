import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createTrainingNavigationReadService } from "./TrainingNavigationReadService.js";
import { createTrainingDayReadModel } from "./TrainingReadService.js";
import {
  healthKitCardioActivityLabel,
  projectHealthKitCardioTrainingRecords,
  projectHealthKitCardioWorkoutAsTrainingRecord,
} from "../../domain/services/HealthKitCardioTrainingPresentation.js";

// Production-shaped fixtures (sanitized) mirroring the real Sep 21-24 forensic:
// Sep 20-22 walking rows are SCREENSHOT-derived training evidence objects
// ("Outdoor Walk"); Sep 23/24 walks exist only as canonical HealthKit workouts.

const WALK_ID = (n) => `healthkit_canonical_workout_${String(n).padStart(40, "0")}`;

function walkEvidence({ id, date, capturedAt, activityType = "Outdoor Walk", seconds, miles, kcal, start = null, end = null, quality = { status: "active" } }) {
  return {
    canonicalId: id, id,
    payload: {
      id, evidence_type: "training", observed_at: date, captured_at: capturedAt, exercises: [],
      metadata: { activity_type: activityType, duration_seconds: seconds, distance: miles, distance_unit: "mi", active_calories: kcal, average_heart_rate: 100, average_pace: null, effort_level: null, location: null, start_time: start, end_time: end, total_calories: null },
      source: { application: "screenshot", integration: "apple_health", modality: "image", source_artifact_refs: ["Apple Health Screenshot 1.jpg"] },
      provenance: {}, quality, removed: false, values: {},
    },
  };
}

function strengthEvidence({ id, date, capturedAt }) {
  return {
    canonicalId: id, id,
    payload: {
      id, evidence_type: "training", observed_at: date, captured_at: capturedAt,
      exercises: [{ id: "e1", name: "Leg Press", canonicalExerciseName: "Leg Press" }, { id: "e2", name: "Hack Squat", canonicalExerciseName: "Hack Squat" }],
      metadata: { activity_type: "Traditional Strength Training", duration_seconds: 3853, active_calories: 403 },
      source: { application: "workout_logger", integration: null, modality: "structured", source_artifact_refs: [] },
      provenance: {}, quality: { status: "active" }, values: {},
    },
  };
}

function canonicalWorkout({ n, family = "cardio", canonicalType = "walking", localDate, startedAt, endedAt, timeZone = "America/Los_Angeles",
  seconds, meters, kcal, hr, coexistence = { candidates: [], state: "no_other_source", unverifiableCount: 0 }, extra = {} }) {
  // Exact production record shape (the same structural gate Activity's whole-day accounting applies).
  return {
    id: WALK_ID(n), schemaVersion: "healthkit-canonical-workout-v1", userId: "user_founder_001", version: 2, revision: 1, localDate,
    semanticFingerprint: `sha256_${String(n).padStart(64, "0")}`, priorSemanticFingerprint: null, revisionHistory: [],
    createdAt: "2026-09-25T16:05:24.036Z", updatedAt: "2026-09-25T16:05:24.036Z",
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: { policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false },
    current: { family, canonicalType, appleActivityType: "52", localDate, localDateBasis: "workout_start_in_workout_time_zone", timeZone, startedAt, endedAt, sourceRevision: 1,
      sourceObservationId: `obs_${n}`,
      source: { bundleIdentifier: "com.apple.health.fixture", sourceName: "Apple Watch", productType: "Watch7,12" },
      telemetry: { durationSeconds: seconds, activeCalories: kcal, totalCalories: null, distance: meters, distanceUnit: "m", averageHeartRate: hr } },
    coexistence, evidenceEligibility: { state: "quarantined", strategic: false, decidedBy: "healthkit-strategic-evidence-quarantine-v1" },
    linkAssessment: null,
    provenance: { application: "Apple Health", integration: "HealthKit", modality: "direct", basis: "healthkit_workout_observation",
      bundleIdentifier: "com.apple.health.fixture", currentSourceObservationId: `obs_${n}`, sourceObservationIds: [`obs_${n}`] },
    ...extra,
  };
}

// Sep 23 / Sep 24: two reconciled generic walks + one Strength Logger session each.
const SEP23_WALKS = [
  canonicalWorkout({ n: 1, localDate: "2026-09-23", startedAt: "2026-09-23T13:29:52.000Z", endedAt: "2026-09-23T13:47:51.000Z", seconds: 1079.5, meters: 1515.98, kcal: 78.65, hr: 90.85 }),
  canonicalWorkout({ n: 2, localDate: "2026-09-23", startedAt: "2026-09-23T14:57:14.000Z", endedAt: "2026-09-23T15:12:58.000Z", seconds: 943.7, meters: 1548.02, kcal: 107.14, hr: 111.33 }),
];
const SEP24_WALKS = [
  canonicalWorkout({ n: 3, localDate: "2026-09-24", timeZone: "America/Chicago", startedAt: "2026-09-24T16:04:20.000Z", endedAt: "2026-09-24T16:22:07.000Z", seconds: 1067.0, meters: 1624.58, kcal: 157.58, hr: 121.07 }),
  canonicalWorkout({ n: 4, localDate: "2026-09-24", timeZone: "America/Chicago", startedAt: "2026-09-24T16:50:11.000Z", endedAt: "2026-09-24T17:06:39.000Z", seconds: 987.9, meters: 1626.56, kcal: 188.13, hr: 142.68 }),
];

function fakeStore({ evidence = {}, workouts = [], failWorkouts = false, spy = {} } = {}) {
  return {
    run: (_name, callback) => callback(),
    getUser: async () => ({ id: "user_founder_001", timezone: null }),
    listCanonicalTrainingEvidenceForDate: async (date) => evidence[date] ?? [],
    listHealthKitCanonicalWorkoutsForDate: async (date) => {
      spy.dateCalls = (spy.dateCalls ?? 0) + 1;
      if (failWorkouts) throw new Error("store down");
      return workouts.filter((w) => w.localDate === date);
    },
    listHealthKitCanonicalWorkouts: async () => { spy.fullListCalls = (spy.fullListCalls ?? 0) + 1; return workouts; },
    getHealthKitCanonicalWorkout: async (id) => workouts.find((w) => w.id === id) ?? null,
    getCanonicalEvidenceObject: async (id) => Object.values(evidence).flat().find((r) => r.canonicalId === id) ?? null,
    listCanonicalTrainingEvidenceObjects: async () => Object.values(evidence).flat(),
    listHealthKitWorkoutLinks: async () => [], listHealthKitWorkoutLinkClaims: async () => [], listEvidencePackages: async () => [],
  };
}
const service = (store) => createTrainingNavigationReadService({ store, readCanonicalExerciseRegistry: async () => [] });
const titles = (day) => day.sessions.map((s) => s.title);

describe("Training Day presents canonical HealthKit Cardio workouts (Founder acceptance defect)", () => {
  const sep21Evidence = [
    walkEvidence({ id: "training|filename|2026-09-21|Apple Health Screenshot 1.jpg", date: "2026-09-21", capturedAt: "2026-09-21T07:35:00-07:00", seconds: 1056, miles: 0.96, kcal: 83 }),
    walkEvidence({ id: "training|authoritative|evidence_submission_A_images_file_3", date: "2026-09-21", capturedAt: "2026-09-21T08:57:00-07:00", seconds: 985, miles: 0.9, kcal: 104 }),
    strengthEvidence({ id: "training|authoritative|training_logger_draft_1", date: "2026-09-21", capturedAt: "2026-09-21T12:00:00.000Z" }),
  ];

  it("known-good Sep 21 control is unchanged: two Outdoor Walk rows + one Strength row, Walking · Cardio summary", async () => {
    const day = await service(fakeStore({ evidence: { "2026-09-21": sep21Evidence }, workouts: [...SEP23_WALKS] })).getDay({ date: "2026-09-21" });
    expect(titles(day)).toEqual(["Outdoor Walk", "Outdoor Walk", "Traditional Strength Training"]);
    expect(day.summary).toMatchObject({ sessionCount: 3, strengthSessions: 1, hasWalking: true, hasCardio: true });
  });

  it("Sep 23 now presents two generic Walking rows plus Strength (previously Strength only)", async () => {
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_2", date: "2026-09-23", capturedAt: "2026-09-23T12:00:00.000Z" });
    const before = createTrainingDayReadModel({ canonicalEvidenceObjects: [strength], date: "2026-09-23" });
    expect(titles(before)).toEqual(["Traditional Strength Training"]); // the reproduced defect (pre-fix behaviour)
    const day = await service(fakeStore({ evidence: { "2026-09-23": [strength] }, workouts: [...SEP23_WALKS, ...SEP24_WALKS] })).getDay({ date: "2026-09-23" });
    expect(titles(day)).toEqual(["Walking", "Walking", "Traditional Strength Training"]);
    expect(day.summary).toMatchObject({ sessionCount: 3, strengthSessions: 1, hasWalking: true, hasCardio: true });
  });

  it("Sep 24 presents two generic Walking rows plus Strength", async () => {
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_3", date: "2026-09-24", capturedAt: "2026-09-24T12:00:00.000Z" });
    const day = await service(fakeStore({ evidence: { "2026-09-24": [strength] }, workouts: [...SEP23_WALKS, ...SEP24_WALKS] })).getDay({ date: "2026-09-24" });
    expect(titles(day)).toEqual(["Walking", "Walking", "Traditional Strength Training"]);
    expect(day.summary).toMatchObject({ sessionCount: 3, strengthSessions: 1, exerciseCount: 2, hasWalking: true, hasCardio: true });
  });

  it("rows carry established telemetry formatting (rounded, miles) and the Cardio detail line", async () => {
    const day = await service(fakeStore({ workouts: [...SEP23_WALKS] })).getDay({ date: "2026-09-23" });
    expect(day.sessions[0]).toMatchObject({ kind: "walking", title: "Walking", activityType: "Walking", exerciseCount: 0, bodyAreas: [], durationSeconds: 1080, distance: 0.94, distanceUnit: "mi", activeCalories: 79 });
    expect(day.sessions[0].detail).toBe("18 min · 0.94 mi · 79 active cal");
    expect(day.sessions[0].href).toMatch(/^\/progress\/training\/session\/healthkit_canonical_workout_/);
  });

  it("generic historical walking stays generic: no Indoor/Outdoor is fabricated", () => {
    for (const workout of [...SEP23_WALKS, ...SEP24_WALKS]) {
      const record = projectHealthKitCardioWorkoutAsTrainingRecord(workout);
      expect(record.payload.metadata.activity_type).toBe("Walking");
      expect(record.payload.metadata.activity_type).not.toMatch(/indoor|outdoor/i);
    }
  });

  it("prospective workouts with Apple's explicit signal show the specific type (Indoor Walk / Outdoor Walk / run / cycle)", () => {
    expect(healthKitCardioActivityLabel("indoor_walking")).toBe("Indoor Walk");
    expect(healthKitCardioActivityLabel("outdoor_walking")).toBe("Outdoor Walk");
    expect(healthKitCardioActivityLabel("indoor_running")).toBe("Indoor Run");
    expect(healthKitCardioActivityLabel("outdoor_cycling")).toBe("Outdoor Cycle");
    expect(healthKitCardioActivityLabel("some_future_type")).toBe("Some Future Type");
    const indoor = canonicalWorkout({ n: 9, canonicalType: "indoor_walking", localDate: "2026-09-26", startedAt: "2026-09-26T15:00:00.000Z", endedAt: "2026-09-26T15:20:00.000Z", seconds: 1200, meters: 1600, kcal: 90, hr: 100 });
    const outdoor = canonicalWorkout({ n: 10, canonicalType: "outdoor_walking", localDate: "2026-09-26", startedAt: "2026-09-26T16:00:00.000Z", endedAt: "2026-09-26T16:20:00.000Z", seconds: 1200, meters: 1600, kcal: 90, hr: 100 });
    const day = createTrainingDayReadModel({ canonicalEvidenceObjects: projectHealthKitCardioTrainingRecords({ canonicalWorkouts: [outdoor, indoor], date: "2026-09-26" }), date: "2026-09-26" });
    expect(titles(day)).toEqual(["Indoor Walk", "Outdoor Walk"]); // chronological by start, kind walking for both
    expect(day.sessions.map((s) => s.kind)).toEqual(["walking", "walking"]);
  });

  it("a Cardio row needs no Logger session/link/claim and never becomes a Logger session", async () => {
    const record = projectHealthKitCardioWorkoutAsTrainingRecord(SEP23_WALKS[0]);
    expect(record.payload.exercises).toEqual([]);
    expect(JSON.stringify(record)).not.toMatch(/logger_session|link_id|claim|confirmed|auto_confirm|strategic/i);
    const detail = await service(fakeStore({ workouts: SEP23_WALKS })).getSession({ sessionId: SEP23_WALKS[0].id });
    expect(detail).toMatchObject({ id: SEP23_WALKS[0].id, label: "Walking", exercises: [] });
    expect(detail.healthKitAttachment).toBeUndefined();
    expect(detail.sourceEvidence).toEqual(["Apple Health"]);
    const day = await service(fakeStore({ workouts: SEP23_WALKS })).getDay({ date: "2026-09-23" });
    expect(day.summary.strengthSessions).toBe(0); // Cardio never counts as a Strength/Logger session
  });

  it("Strength detail semantics are unchanged: a Strength session id still resolves through the evidence path", async () => {
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_4", date: "2026-09-23", capturedAt: "2026-09-23T12:00:00.000Z" });
    const detail = await service(fakeStore({ evidence: { "2026-09-23": [strength] }, workouts: SEP23_WALKS })).getSession({ sessionId: strength.canonicalId });
    expect(detail.label).toBe("Traditional Strength Training");
    expect(detail.exercises.length).toBe(2);
  });

  it("captured_at is the workout's own local time with offset (the form screenshot walks store), so morning walks precede the day's noon-UTC Strength placeholder like Sep 21", () => {
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(SEP23_WALKS[0]).payload.captured_at).toBe("2026-09-23T06:29:52-07:00");
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(SEP24_WALKS[0]).payload.captured_at).toBe("2026-09-24T11:04:20-05:00"); // Chicago (CDT)
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(canonicalWorkout({ n: 11, localDate: "2026-12-05", timeZone: "America/Los_Angeles", startedAt: "2026-12-05T16:00:00.000Z", endedAt: "2026-12-05T16:20:00.000Z", seconds: 1200, meters: 1500, kcal: 90, hr: 100 })).payload.captured_at).toBe("2026-12-05T08:00:00-08:00"); // PST
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(canonicalWorkout({ n: 12, localDate: "2026-09-23", timeZone: "Not/AZone", startedAt: "2026-09-23T13:00:00.000Z", endedAt: "2026-09-23T13:20:00.000Z", seconds: 1200, meters: 1500, kcal: 90, hr: 100 })).payload.captured_at).toBe("2026-09-23T13:00:00.000Z"); // invalid zone falls back safely
  });

  it("ordering is deterministic and chronological regardless of input order", async () => {
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_5", date: "2026-09-24", capturedAt: "2026-09-24T12:00:00.000Z" });
    const a = await service(fakeStore({ evidence: { "2026-09-24": [strength] }, workouts: [SEP24_WALKS[1], SEP24_WALKS[0]] })).getDay({ date: "2026-09-24" });
    const b = await service(fakeStore({ evidence: { "2026-09-24": [strength] }, workouts: [SEP24_WALKS[0], SEP24_WALKS[1]] })).getDay({ date: "2026-09-24" });
    expect(a.sessions.map((s) => s.id)).toEqual(b.sessions.map((s) => s.id));
    expect(a.sessions.map((s) => s.title)).toEqual(["Walking", "Walking", "Traditional Strength Training"]);
    expect(a.sessions[0].id).toBe(SEP24_WALKS[0].id); // 11:04 before 11:50 local
  });

  it("Sep 22 canary: HealthKit walks that duplicate present screenshot walks are suppressed (no double rows)", async () => {
    const shot1 = walkEvidence({ id: "training|authoritative|evidence_submission_B_images_file_1", date: "2026-09-22", capturedAt: "2026-09-22T06:44-07:08", seconds: 1475, miles: 0.97, kcal: 90 });
    const shot3 = walkEvidence({ id: "training|authoritative|evidence_submission_B_images_file_3", date: "2026-09-22", capturedAt: "2026-09-22T08:20:00-07:00", seconds: 947, miles: 0.94, kcal: 103 });
    const dupOf = (n, evidenceId, extra) => canonicalWorkout({ n, localDate: "2026-09-22", startedAt: `2026-09-22T1${n}:00:00.000Z`, endedAt: `2026-09-22T1${n}:20:00.000Z`, seconds: 1200, meters: 1500, kcal: 90, hr: 100,
      coexistence: { candidates: [{ canonicalId: evidenceId, confidence: 99, outcome: "duplicate" }], state: "matches_existing_evidence_workout", unverifiableCount: 0 }, ...extra });
    const workouts = [dupOf(5, shot1.canonicalId), dupOf(6, shot3.canonicalId)];
    const day = await service(fakeStore({ evidence: { "2026-09-22": [shot1, shot3] }, workouts })).getDay({ date: "2026-09-22" });
    expect(titles(day)).toEqual(["Outdoor Walk", "Outdoor Walk"]); // the screenshot rows only
    // If the matching evidence workout is NOT on the page (retired/removed), the HealthKit row must show instead of vanishing.
    const orphan = await service(fakeStore({ evidence: { "2026-09-22": [] }, workouts })).getDay({ date: "2026-09-22" });
    expect(titles(orphan)).toEqual(["Walking", "Walking"]);
  });

  it("a duplicate canonical identity is presented once", () => {
    const records = projectHealthKitCardioTrainingRecords({ canonicalWorkouts: [SEP23_WALKS[0], SEP23_WALKS[0], SEP23_WALKS[1]], date: "2026-09-23" });
    expect(records.map((r) => r.id)).toEqual([SEP23_WALKS[0].id, SEP23_WALKS[1].id]);
  });

  it("only Cardio is adapted: Strength/unsupported canonical workouts never become Training rows here", () => {
    const strengthWorkout = canonicalWorkout({ n: 7, family: "strength", canonicalType: "traditional_strength_training", localDate: "2026-09-23", startedAt: "2026-09-23T13:47:54.000Z", endedAt: "2026-09-23T14:57:12.000Z", seconds: 4157, meters: null, kcal: 320, hr: 100, coexistence: null });
    expect(projectHealthKitCardioTrainingRecords({ canonicalWorkouts: [strengthWorkout], date: "2026-09-23" })).toEqual([]);
    expect(projectHealthKitCardioWorkoutAsTrainingRecord({ ...SEP23_WALKS[0], retiredAt: "2026-09-26T00:00:00Z" })).toBeNull();
  });

  it("HealthKit read failure never takes Training Day down (evidence rows still present)", async () => {
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_6", date: "2026-09-23", capturedAt: "2026-09-23T12:00:00.000Z" });
    const day = await service(fakeStore({ evidence: { "2026-09-23": [strength] }, workouts: SEP23_WALKS, failWorkouts: true })).getDay({ date: "2026-09-23" });
    expect(titles(day)).toEqual(["Traditional Strength Training"]);
  });

  it("the read is date-bounded (no full-collection list) and opens only real Cardio ids in detail", async () => {
    const spy = {};
    const svc = service(fakeStore({ workouts: [...SEP23_WALKS, ...SEP24_WALKS], spy }));
    await svc.getDay({ date: "2026-09-24" });
    expect(spy.dateCalls).toBe(1);
    expect(spy.fullListCalls).toBeUndefined();
    expect(await svc.getSession({ sessionId: WALK_ID(999) })).toBeNull(); // unknown HealthKit-shaped id falls through to the existing path
  });

  it("real JSON contract for Native: every field the Native TrainingDaySessionSummary/TrainingDaySummaryDetail decoders require is present", async () => {
    const day = JSON.parse(JSON.stringify(await service(fakeStore({ workouts: SEP23_WALKS })).getDay({ date: "2026-09-23" })));
    for (const key of ["date", "label", "summary", "sessions"]) expect(day).toHaveProperty(key);
    for (const key of ["bodyAreas", "sessionCount", "strengthSessions", "exerciseCount", "hasWalking", "hasCardio"]) expect(day.summary).toHaveProperty(key);
    for (const key of ["id", "activityType", "title", "kind", "exerciseCount", "bodyAreas", "durationSeconds", "distance", "distanceUnit", "activeCalories", "detail", "href"]) expect(day.sessions[0]).toHaveProperty(key);
    expect(["strength", "walking", "cardio", "other"]).toContain(day.sessions[0].kind);
    expect(decodeURIComponent(day.sessions[0].href.split("/").pop())).toBe(day.sessions[0].id);
  });

  it("Activity Day accounting contract is untouched by this presentation module", () => {
    const source = fs.readFileSync(new URL("../../domain/services/HealthKitCardioTrainingPresentation.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/ProgressReportingService|composeDailyActiveEnergyWithWorkouts|non_workout|move_calories|workoutEnergy/);
  });
});

describe("review hardening (N1-N5)", () => {
  const dupCoexistence = (id) => ({ candidates: [{ canonicalId: id, confidence: 99, outcome: "duplicate" }], state: "matches_existing_evidence_workout", unverifiableCount: 0 });

  it("N1: a SUPERSEDED matching screenshot workout must not suppress the HealthKit row (the workout can never vanish)", async () => {
    const superseded = walkEvidence({ id: "training|authoritative|evidence_submission_S_images_file_1", date: "2026-09-22", capturedAt: "2026-09-22T06:44:00-07:00", seconds: 1200, miles: 0.9, kcal: 90, quality: { status: "superseded" } });
    const wk = canonicalWorkout({ n: 20, localDate: "2026-09-22", startedAt: "2026-09-22T13:44:00.000Z", endedAt: "2026-09-22T14:04:00.000Z", seconds: 1200, meters: 1500, kcal: 90, hr: 100, coexistence: dupCoexistence(superseded.canonicalId) });
    const day = await service(fakeStore({ evidence: { "2026-09-22": [superseded] }, workouts: [wk] })).getDay({ date: "2026-09-22" });
    expect(titles(day)).toEqual(["Walking"]); // shown once; the superseded evidence is dropped by the day itself
  });

  it("N2: a screenshot uploaded AFTER canonicalization (stale no_other_source) is reassessed at read time and not double-shown", async () => {
    const shot = walkEvidence({ id: "training|authoritative|evidence_submission_LATE_images_file_1", date: "2026-09-23", capturedAt: "2026-09-23T06:29:00-07:00",
      seconds: 1080, miles: 0.94, kcal: 79, start: "2026-09-23T06:29:52-07:00", end: "2026-09-23T06:47:51-07:00" });
    const staleNoOtherSource = { ...SEP23_WALKS[0] }; // stored coexistence says no_other_source
    expect(staleNoOtherSource.coexistence.state).toBe("no_other_source");
    const day = await service(fakeStore({ evidence: { "2026-09-23": [shot] }, workouts: [staleNoOtherSource] })).getDay({ date: "2026-09-23" });
    expect(titles(day)).toEqual(["Outdoor Walk"]); // the screenshot row only, no duplicate HealthKit row
    // Unverifiable / non-matching evidence always fails open (both shown).
    const unrelated = walkEvidence({ id: "training|authoritative|evidence_submission_OTHER_images_file_1", date: "2026-09-23", capturedAt: "2026-09-23T17:00:00-07:00", seconds: 300, miles: 0.2, kcal: 20 });
    const both = await service(fakeStore({ evidence: { "2026-09-23": [unrelated] }, workouts: [staleNoOtherSource] })).getDay({ date: "2026-09-23" });
    expect(titles(both).sort()).toEqual(["Outdoor Walk", "Walking"]);
  });

  it("N3: Indoor/Outdoor Cycle (and running/walking variants) classify as Cardio rows and set the day's Cardio summary", () => {
    for (const [type, kind] of [["indoor_cycling", "cardio"], ["outdoor_cycling", "cardio"], ["cycling", "cardio"], ["indoor_running", "cardio"], ["outdoor_running", "cardio"], ["running", "cardio"], ["indoor_walking", "walking"], ["outdoor_walking", "walking"], ["walking", "walking"]]) {
      const wk = canonicalWorkout({ n: 30, canonicalType: type, localDate: "2026-09-26", startedAt: "2026-09-26T15:00:00.000Z", endedAt: "2026-09-26T15:20:00.000Z", seconds: 1200, meters: 5000, kcal: 200, hr: 130 });
      const day = createTrainingDayReadModel({ canonicalEvidenceObjects: projectHealthKitCardioTrainingRecords({ canonicalWorkouts: [wk], date: "2026-09-26" }), date: "2026-09-26" });
      expect(day.sessions[0].kind, type).toBe(kind);
      expect(day.summary.hasCardio, type).toBe(true);
    }
  });

  it("N4: a HealthKit read failure is isolated AND observable (class/code only, no message)", async () => {
    const events = [];
    const svc = createTrainingNavigationReadService({ store: fakeStore({ workouts: SEP23_WALKS, failWorkouts: true }), readCanonicalExerciseRegistry: async () => [], logger: { warn: (event, fields) => events.push({ event, fields }) } });
    await svc.getDay({ date: "2026-09-23" });
    expect(events).toEqual([{ event: "training.day.healthkit_cardio_unavailable", fields: { errorName: "Error", errorCode: "UNCLASSIFIED" } }]);
    expect(JSON.stringify(events)).not.toContain("store down");
    const failingDetail = fakeStore({ workouts: SEP23_WALKS }); failingDetail.getHealthKitCanonicalWorkout = async () => { throw Object.assign(new Error("secret host"), { code: "ECONNRESET" }); };
    const detailEvents = [];
    const svc2 = createTrainingNavigationReadService({ store: failingDetail, readCanonicalExerciseRegistry: async () => [], logger: { warn: (e, f) => detailEvents.push({ e, f }) } });
    expect(await svc2.getSession({ sessionId: SEP23_WALKS[0].id })).toBeNull(); // falls through to the existing path
    expect(detailEvents).toEqual([{ e: "training.session.healthkit_cardio_unavailable", f: { errorName: "Error", errorCode: "ECONNRESET" } }]);
  });

  it("N5: Training Day presents exactly the Cardio workouts Activity counts: a structurally malformed canonical record is not presented", () => {
    const malformed = { ...SEP23_WALKS[0], semanticFingerprint: "nope" };
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(malformed)).toBeNull();
    expect(projectHealthKitCardioWorkoutAsTrainingRecord({ ...SEP23_WALKS[0], evidenceEligibility: { state: "eligible", strategic: true } })).toBeNull();
    expect(projectHealthKitCardioWorkoutAsTrainingRecord(SEP23_WALKS[0])).not.toBeNull();
  });

  it("a Strength-family HealthKit id is never opened as a Cardio row (falls through to the existing path)", async () => {
    const strengthWk = canonicalWorkout({ n: 40, family: "strength", canonicalType: "traditional_strength_training", localDate: "2026-09-23", startedAt: "2026-09-23T13:47:54.000Z", endedAt: "2026-09-23T14:57:12.000Z", seconds: 4157, meters: null, kcal: 320, hr: 100, coexistence: null });
    expect(await service(fakeStore({ workouts: [strengthWk] })).getSession({ sessionId: strengthWk.id })).toBeNull();
  });

  it("a store without the HealthKit lookups still serves Training Day (legacy/repository stores)", async () => {
    const legacy = fakeStore({}); delete legacy.listHealthKitCanonicalWorkoutsForDate; delete legacy.listHealthKitCanonicalWorkouts; delete legacy.getHealthKitCanonicalWorkout;
    const strength = strengthEvidence({ id: "training|authoritative|training_logger_draft_9", date: "2026-09-23", capturedAt: "2026-09-23T12:00:00.000Z" });
    legacy.listCanonicalTrainingEvidenceForDate = async () => [strength];
    expect(titles(await service(legacy).getDay({ date: "2026-09-23" }))).toEqual(["Traditional Strength Training"]);
  });
});

