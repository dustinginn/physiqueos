import { describe, expect, it } from "vitest";
import { normalizeHealthKitObservationBatch } from "./HealthKitObservationService.js";
import { reconcileHealthKitCanonicalWorkout } from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_STRENGTH_MATCH_THRESHOLDS,
  HEALTHKIT_STRENGTH_TIE_MARGIN,
  HealthKitStrengthMatchOutcome as Outcome,
  assessHealthKitStrengthLinkCandidates,
  createHealthKitWorkoutLinkCandidate,
  findPossibleDuplicateCanonicalWorkouts,
} from "./HealthKitWorkoutLinkService.js";

const DAY = "2026-09-25";

describe("back-to-back and boundary handling", () => {
  it("derives the tie margin from the existing thresholds, not a new number", () => {
    expect(HEALTHKIT_STRENGTH_MATCH_THRESHOLDS).toEqual({ confident: 80, possible: 50, temporalToleranceMinutes: 5 });
    expect(HEALTHKIT_STRENGTH_TIE_MARGIN).toBe(30);
  });

  it("Logger A ends exactly when B begins; the Apple workout overlaps only A clearly", () => {
    const hk = apple("09:02", "10:00");
    const result = assess(hk, [session("A", "09:00", "10:00"), session("B", "10:00", "11:00")]);
    expect(result).toMatchObject({ outcome: Outcome.CONFIDENT });
    expect(result.candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["A"]);
  });

  it("the Apple workout overlaps only B clearly", () => {
    const hk = apple("10:00", "11:00");
    const result = assess(hk, [session("A", "09:00", "10:00"), session("B", "10:00", "11:00")]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["B"]);
  });

  it("never treats a sequential session that only touches the Apple window as the same workout", () => {
    const hk = apple("10:00", "11:00");
    expect(assess(hk, [session("A", "09:00", "10:00")])).toMatchObject({ outcome: Outcome.NONE, reason: "no_plausible_logger_session" });
    expect(assess(hk, [session("A", "11:00", "12:00")]).outcome).toBe(Outcome.NONE);
  });

  it("the Apple workout straddles the A/B boundary: ambiguous, never a confident link", () => {
    const hk = apple("09:45", "10:45");
    const result = assess(hk, [session("A", "09:00", "10:00"), session("B", "10:00", "11:00")]);
    expect(result.outcome).toBe(Outcome.AMBIGUOUS);
    expect(result.candidates).toHaveLength(2);
    expect(() => createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hk, assessment: result, ownerUserId: "u", now: "2026-09-25T20:00:00Z" })).toThrow();
  });

  it("the Apple workout overlaps both sessions for real: ambiguous", () => {
    const hk = apple("10:00", "11:00");
    const result = assess(hk, [session("A", "09:30", "10:30"), session("B", "10:30", "11:30")]);
    expect(result.outcome).toBe(Outcome.AMBIGUOUS);
  });

  it("treats small clock skew at a shared boundary as skew, not overlap", () => {
    // Apple starts 30 seconds before A ends; B is the real match.
    const hk = apple("09:59:30", "10:59:30");
    const result = assess(hk, [session("A", "09:00", "10:00"), session("B", "10:00", "11:00")]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["B"]);
    // Apple starts one minute after A ended.
    expect(assess(apple("10:01", "11:00"), [session("A", "09:00", "10:00"), session("B", "10:01", "11:00")]).candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["B"]);
  });

  it("two Logger sessions separated by a small gap: only the overlapping one is a candidate", () => {
    const result = assess(apple("10:00", "11:00"), [session("A", "09:00", "09:55"), session("B", "10:00", "11:00")]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["B"]);
  });

  it("identical, equally scoring sessions are ambiguous and never a tie-broken winner", () => {
    const result = assess(apple("10:00", "11:00"), [session("A", "10:01", "10:59"), session("B", "10:01", "10:59")]);
    expect(result.outcome).toBe(Outcome.AMBIGUOUS);
    expect(result.candidates.map((c) => c.confidence)).toEqual([result.candidates[0].confidence, result.candidates[0].confidence]);
  });

  it("a materially stronger candidate wins over a plausible runner-up, and the runner-up is still mentioned", () => {
    const strong = session("A", "10:01", "10:59");
    const weak = session("X", "10:30", "11:30", { calories: 100, hr: 90 });
    const result = assess(apple("10:00", "11:00"), [strong, weak]);
    expect(result.candidates.map((c) => c.loggerSessionCanonicalId)).toEqual(["A", "X"]);
    expect(result.candidates[0].confidence - result.candidates[1].confidence).toBeGreaterThanOrEqual(30);
    expect(result).toMatchObject({ outcome: Outcome.CONFIDENT, reason: "single_clearly_dominant_session" });
  });

  it("a runner-up within the margin keeps the result ambiguous", () => {
    const strong = session("A", "10:01", "10:59");
    const close = session("X", "10:30", "11:30");
    const result = assess(apple("10:00", "11:00"), [strong, close]);
    expect(result.candidates[0].confidence - result.candidates[1].confidence).toBeLessThan(30);
    expect(result.outcome).toBe(Outcome.AMBIGUOUS);
  });

  it("unverifiable or missing Logger times never confirm a match by default", () => {
    const hk = apple("10:00", "11:00");
    const blind = session("blind", "10:01", "10:59");
    blind.payload.metadata.start_time = undefined;
    blind.payload.metadata.end_time = undefined;
    expect(assess(hk, [blind])).toMatchObject({ outcome: Outcome.NONE, reason: "logger_session_times_unverifiable" });
    expect(assess(hk, [session("A", "10:01", "10:59"), blind])).toMatchObject({ outcome: Outcome.POSSIBLE, reason: "unverifiable_same_day_session_present" });
  });

  it("does not let an overlap short of the tolerance qualify a match", () => {
    // Session overlaps the Apple window by only four minutes at its tail.
    expect(assess(apple("10:00", "11:00"), [session("A", "10:56", "11:40")]).outcome).toBe(Outcome.NONE);
  });

  it("a session that overlaps but agrees on neither boundary is only a possible match", () => {
    const result = assess(apple("10:00", "11:00"), [session("A", "10:20", "11:40", { calories: 400 })]);
    expect([Outcome.POSSIBLE, Outcome.NONE]).toContain(result.outcome);
    expect(result.outcome).not.toBe(Outcome.CONFIDENT);
  });

  it("gives the same semantic result for every ordering of the same sessions (tie order independence)", () => {
    const sessions = [session("A", "10:01", "10:59"), session("B", "10:01", "10:59"), session("C", "10:30", "11:30", { calories: 100, hr: 90 })];
    const outcomes = new Set();
    const lists = new Set();
    const perms = (list) => list.length <= 1 ? [list] : list.flatMap((item, index) => perms([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [item, ...rest]));
    for (const order of perms(sessions)) {
      const result = assess(apple("10:00", "11:00"), order);
      outcomes.add(result.outcome);
      lists.add(JSON.stringify(result.candidates.map((c) => [c.loggerSessionCanonicalId, c.confidence])));
    }
    expect(outcomes).toEqual(new Set([Outcome.AMBIGUOUS]));
    expect(lists.size).toBe(1);
    const clear = [session("A", "10:01", "10:59"), session("X", "10:30", "11:30", { calories: 100, hr: 90 })];
    expect(new Set([clear, [...clear].reverse()].map((order) => assess(apple("10:00", "11:00"), order).outcome))).toEqual(new Set([Outcome.CONFIDENT]));
  });

  it("does not treat back-to-back workouts of the same type as duplicates of each other", () => {
    const first = appleCanonical("u1", "17:00", "17:30");
    const second = appleCanonical("u2", "17:30", "18:00");
    expect(findPossibleDuplicateCanonicalWorkouts(first, [first, second])).toEqual([]);
    const skewed = appleCanonical("u3", "17:29", "17:59");
    expect(findPossibleDuplicateCanonicalWorkouts(first, [first, skewed])).toEqual([]);
    const recreated = appleCanonical("u4", "17:00", "17:30");
    expect(findPossibleDuplicateCanonicalWorkouts(first, [first, recreated])).toEqual([recreated.id]);
  });
});

function assess(canonicalWorkout, canonicalObjects) {
  return assessHealthKitStrengthLinkCandidates({ canonicalWorkout, canonicalObjects, existingLinks: [] });
}

function apple(start, end) {
  return appleCanonical("hk-main", start, end);
}

function appleCanonical(uuid, start, end) {
  const time = (value) => (value.length === 5 ? `${value}:00` : value);
  const seconds = (Date.parse(`${DAY}T${time(end)}Z`) - Date.parse(`${DAY}T${time(start)}Z`)) / 1000;
  return reconcileHealthKitCanonicalWorkout({
    observation: normalizeHealthKitObservationBatch({
      batchId: "b", principalDeviceId: "founder-iphone",
      observations: [{
        observationType: "workout", externalId: uuid, source: { bundleIdentifier: "com.apple.health.watch" },
        occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt: `${DAY}T${time(start)}-07:00`, endedAt: `${DAY}T${time(end)}-07:00` },
        workout: { activityType: "50", durationSeconds: seconds, activeCalories: 400, averageHeartRate: 120 },
      }],
    }).observations[0],
    ownerUserId: "user_founder_001", now: "2026-09-25T20:00:00.000Z",
  }).record;
}

function session(id, start, end, { calories = 400, hr = 120 } = {}) {
  const time = (value) => (value.length === 5 ? `${value}:00` : value);
  const seconds = (Date.parse(`${DAY}T${time(end)}Z`) - Date.parse(`${DAY}T${time(start)}Z`)) / 1000;
  return {
    canonicalId: id, version: 1, quality: { status: "active" },
    payload: {
      id, evidence_type: "training", observed_at: DAY,
      source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
      metadata: {
        activity_type: "Traditional Strength Training",
        logger_origin: "training_logger", logger_mode: "live",
        start_time: `${DAY}T${time(start)}-07:00`, end_time: `${DAY}T${time(end)}-07:00`,
        duration_seconds: seconds, active_calories: calories, average_heart_rate: hr,
      },
      exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }],
    },
  };
}
