import { describe, expect, it } from "vitest";
import { createTrainingNavigationReadService } from "./TrainingNavigationReadService.js";
import { projectPresentedHealthKitCardioTrainingRecords } from "../../domain/services/HealthKitCardioTrainingPresentation.js";
import { createLoggedTodayService } from "../../domain/services/LoggedTodayService.js";
import { createProviderActivityEvidenceReport } from "../../domain/services/ProgressReportingService.js";
import {
  OCT2_DATE,
  OCT2_OWNER,
  oct2ActivityDayEvidence,
  oct2CanonicalWorkout,
  oct2CooldownInput,
  oct2StairStepperInput,
  oct2WalkInput,
} from "../../fixtures/healthKitOct2StairStepperCooldownFixture.js";

// History inclusion (D1/D2): a canonical Stair Stepper and Cooldown appear in
// Log, Training Day, Training history and Activity exactly like the existing
// canonical walks, through row shapes every installed Native build (82 and 83)
// already decodes. Native decodes Training Day's `kind` as the closed enum
// strength | walking | cardio | other (no unknown fallback), so the Server
// must never emit anything else; every other field used here is a String.
const NATIVE_TRAINING_SESSION_KINDS = ["strength", "walking", "cardio", "other"];
const COEXISTENCE = { state: "no_other_source", unverifiableCount: 0, candidates: [] };
const withCoexistence = (record) => ({ ...record, coexistence: COEXISTENCE });
const walk = () => withCoexistence(oct2CanonicalWorkout(oct2WalkInput()));
const stair = () => withCoexistence(oct2CanonicalWorkout(oct2StairStepperInput()));
const cooldown = () => withCoexistence(oct2CanonicalWorkout(oct2CooldownInput()));

function fakeStore({ workouts = [], evidence = [] } = {}) {
  return {
    run: (_name, callback) => callback(),
    getUser: async () => ({ id: OCT2_OWNER, timezone: "America/Los_Angeles" }),
    listCanonicalTrainingEvidenceForDate: async (date) => evidence.filter((record) => record.payload?.observed_at === date),
    listHealthKitCanonicalWorkoutsForDate: async (date) => workouts.filter((workout) => workout.localDate === date),
    listHealthKitCanonicalWorkouts: async () => workouts,
    getHealthKitCanonicalWorkout: async (id) => workouts.find((workout) => workout.id === id) ?? null,
    getCanonicalEvidenceObject: async () => null,
    listCanonicalTrainingEvidenceObjects: async () => evidence,
    listHealthKitWorkoutLinks: async () => [],
    listHealthKitWorkoutLinkClaims: async () => [],
    listEvidencePackages: async () => [],
  };
}
const training = (store) => createTrainingNavigationReadService({ store, readCanonicalExerciseRegistry: async () => [] });

describe("Training Day presents Stair Stepper and Cooldown through Native-supported row shapes", () => {
  it("shows the Oct 2 workouts in order with their own labels and only Native-decodable kinds", async () => {
    const day = JSON.parse(JSON.stringify(await training(fakeStore({ workouts: [cooldown(), stair(), walk()] })).getDay({ date: OCT2_DATE })));
    expect(day.sessions.map((session) => [session.title, session.kind])).toEqual([
      ["Outdoor Walk", "walking"],
      ["Stair Stepper", "cardio"],
      ["Cooldown", "other"],
    ]);
    for (const session of day.sessions) {
      expect(NATIVE_TRAINING_SESSION_KINDS).toContain(session.kind);
      for (const key of ["id", "activityType", "title", "kind", "exerciseCount", "bodyAreas", "durationSeconds", "distance", "distanceUnit", "activeCalories", "detail", "href"]) {
        expect(session).toHaveProperty(key);
      }
      expect(decodeURIComponent(session.href.split("/").pop())).toBe(session.id);
    }
    expect(day.sessions[1]).toMatchObject({ activityType: "Stair Stepper", durationSeconds: 679, activeCalories: 121, detail: "11 min · 121 active cal" });
    expect(day.sessions[2]).toMatchObject({ activityType: "Cooldown", durationSeconds: 282, activeCalories: 19, detail: "5 min · 19 active cal" });
    expect(day.summary).toMatchObject({ sessionCount: 3, strengthSessions: 0, hasWalking: true, hasCardio: true });
  });

  it("a Cooldown-only day is an ordinary workout day that does not claim Cardio in the header", async () => {
    const day = await training(fakeStore({ workouts: [cooldown()] })).getDay({ date: OCT2_DATE });
    expect(day.sessions.map((session) => session.kind)).toEqual(["other"]);
    expect(day.summary).toMatchObject({ sessionCount: 1, hasWalking: false, hasCardio: false });
  });

  it("opens both workouts in session detail through the existing HealthKit Cardio session path", async () => {
    const service = training(fakeStore({ workouts: [stair(), cooldown()] }));
    for (const workout of [stair(), cooldown()]) {
      const session = await service.getSession({ sessionId: workout.id });
      expect(session?.id ?? session?.session?.id).toBeDefined();
      expect(JSON.stringify(session)).toContain(workout.id);
    }
  });

  it("includes both workouts in the aggregate Training history universe (landing / history / library)", () => {
    const records = projectPresentedHealthKitCardioTrainingRecords({ canonicalWorkouts: [cooldown(), stair(), walk()], timeZone: "America/Los_Angeles" });
    expect(records.map((record) => record.payload.metadata.activity_type)).toEqual(["Outdoor Walk", "Stair Stepper", "Cooldown"]);
    expect(records.every((record) => record.payload.evidenceEligibility === undefined)).toBe(true);
  });
});

describe("Log (Logged Today) shows the day's Stair Stepper and Cooldown lines", () => {
  it("summarizes each type on its own line with the server-formatted summary Native renders verbatim", async () => {
    const repositories = {
      users: { getUserById: async () => ({ id: OCT2_OWNER, timeZone: "America/Los_Angeles" }), getCurrentUser: async () => null },
      canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
    };
    const summary = await createLoggedTodayService({ repositories, now: () => new Date("2026-10-03T01:00:00.000Z") }).getSummary({
      userId: OCT2_OWNER,
      timeZone: "America/Los_Angeles",
      healthKitRelationshipState: { canonicalWorkouts: [walk(), stair(), cooldown()], workoutLinks: [], workoutLinkClaims: [] },
    });
    const row = summary.rows.find((item) => item.id === "training");
    expect(row.lines.map((line) => line.summary)).toEqual(["Outdoor Walk · 30 min", "Stair Stepper · 11 min", "Cooldown · 5 min"]);
    expect(row.summary).toBe("Outdoor Walk · 30 min, Stair Stepper · 11 min, Cooldown · 5 min");
    expect(row.lines.every((line) => typeof line.kind === "string" && line.href === "/progress/training")).toBe(true);
  });
});

describe("Activity: workout energy is descriptive, never added to the daily Activity Summary", () => {
  const report = (canonicalWorkouts) => createProviderActivityEvidenceReport({
    canonicalEvidenceObjects: [oct2ActivityDayEvidence({ moveCalories: 905, exerciseMinutes: 52 })],
    canonicalWorkouts,
  }).latestActivityDay;

  it("leaves displayed daily active calories and exercise minutes unchanged by a canonical Stair Stepper and Cooldown", () => {
    const before = report([]);
    const after = report([stair(), cooldown()]);
    expect(before).toMatchObject({ activeCalories: 905, exerciseMinutes: 52 });
    expect(after).toMatchObject({ activeCalories: 905, exerciseMinutes: 52 });
    expect(after.value).toBe(before.value);
    expect(after.totalCalories).toEqual(before.totalCalories);
    // The workouts are broken out of the SAME whole-day total, never added to it.
    expect(after.workoutActiveCalories).toBeCloseTo(121.37 + 18.6, 5);
    expect(after.nonWorkoutActiveCalories).toBeCloseTo(905 - (121.37 + 18.6), 5);
    expect(after.workoutEnergyAttribution.policy).toBe("workout_energy_is_descriptive_never_additive");
    expect(after.linkedWorkoutCount).toBe(2);
  });

  it("each canonical record says so explicitly", () => {
    for (const workout of [stair(), cooldown()]) {
      expect(workout.activityInteraction).toEqual({ policy: "workout_energy_is_descriptive_never_additive", additiveToDailyActivity: false });
    }
  });
});
