import { describe, expect, it } from "vitest";
import { normalizeHealthKitObservationBatch } from "./HealthKitObservationService.js";
import { reconcileHealthKitCanonicalWorkout } from "./HealthKitWorkoutService.js";
import {
  HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM,
  HEALTHKIT_STRENGTH_MATCH_THRESHOLDS,
  HealthKitCardioCoexistenceState,
  HealthKitStrengthMatchOutcome as Outcome,
  HealthKitWorkoutLinkError,
  assessHealthKitCardioCoexistence,
  assessHealthKitStrengthLinkCandidates,
  confirmHealthKitWorkoutLink,
  createHealthKitWorkoutLinkCandidate,
  findPossibleDuplicateCanonicalWorkouts,
  refreshHealthKitWorkoutLinkCandidate,
  unlinkHealthKitWorkoutLink,
} from "./HealthKitWorkoutLinkService.js";

const OWNER = "user_founder_001";
const NOW = "2026-09-23T20:00:00.000Z";
const HK_UUID = "9f3c2a10-1111-4222-8333-444455556666";

describe("strength link matcher", () => {
  it("reuses the existing product thresholds rather than inventing new ones", () => {
    expect(HEALTHKIT_STRENGTH_MATCH_THRESHOLDS).toEqual({ confident: 80, possible: 50, temporalToleranceMinutes: 5 });
    expect(HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM).toBe(false);
  });

  it("finds a confident match for one same-day session that overlaps and agrees on timing and duration", () => {
    const result = assess(hkStrength(), [logger("session-a", "10:01", "10:59")]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ loggerSessionCanonicalId: "session-a", basis: "temporal_and_telemetry" });
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it("returns a possible match when timing overlaps but does not agree closely", () => {
    const result = assess(hkStrength(), [logger("session-a", "10:04", "11:20", 4560)]);
    expect(result.outcome).toBe(Outcome.POSSIBLE);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(50);
    expect(result.candidates[0].confidence).toBeLessThan(80);
  });

  it("returns no match for a different time of day, a different date, or no strength session at all", () => {
    expect(assess(hkStrength(), [logger("late", "16:00", "17:00")]).outcome).toBe(Outcome.NONE);
    expect(assess(hkStrength(), [logger("other-day", "10:00", "11:00", 3600, "2026-09-22")]).outcome).toBe(Outcome.NONE);
    expect(assess(hkStrength(), []).outcome).toBe(Outcome.NONE);
    expect(assess(hkStrength(), [logger("tiny", "10:00", "11:00", 3600, "2026-09-23", [])]).outcome).toBe(Outcome.NONE);
  });

  it("is ambiguous, and never links, when two plausible sessions exist", () => {
    const result = assess(hkStrength(), [logger("session-a", "10:01", "10:59"), logger("session-b", "10:02", "11:01")]);
    expect(result.outcome).toBe(Outcome.AMBIGUOUS);
    expect(result.candidates).toHaveLength(2);
    expect(() => createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hkStrength(), assessment: result, ownerUserId: OWNER, now: NOW }))
      .toThrowError(HealthKitWorkoutLinkError);
  });

  it("treats an explicit source identity as a confident match without any timing", () => {
    const explicit = logger("session-x", "18:00", "19:00");
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const result = assess(hkStrength(), [explicit]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates[0]).toMatchObject({ confidence: 100, basis: "explicit_source_identity" });
  });

  it("does not use a bare display filename to identify a workout", () => {
    const session = logger("session-f", "10:01", "10:59");
    session.payload.provenance = { source_artifact_refs: ["IMG_1688.png"] };
    const hk = hkStrength();
    expect(assess(hk, [session]).outcome).toBe(Outcome.CONFIDENT);
    const wrongTime = logger("session-g", "16:00", "17:00");
    wrongTime.payload.provenance = { source_artifact_refs: ["IMG_1688.png"] };
    expect(assess(hk, [wrongTime]).outcome).toBe(Outcome.NONE);
  });

  it("excludes a session already confirmed against a different Apple workout", () => {
    const hk = hkStrength();
    const session = logger("session-a", "10:01", "10:59");
    const links = [{ id: "l", canonicalWorkoutId: "healthkit_canonical_workout_other", loggerSessionCanonicalId: "session-a", status: "confirmed" }];
    const result = assessHealthKitStrengthLinkCandidates({ canonicalWorkout: hk, canonicalObjects: [session], existingLinks: links });
    expect(result).toMatchObject({ outcome: Outcome.NONE, reason: "only_candidates_already_linked_elsewhere" });
  });

  it("does not link cardio, and is deterministic", () => {
    const walk = canonical({ activityType: "52" });
    expect(assess(walk, [logger("session-a", "10:01", "10:59")]).outcome).toBe(Outcome.NONE);
    const a = assess(hkStrength(), [logger("s1", "10:01", "10:59")]);
    const b = assess(hkStrength(), [logger("s1", "10:01", "10:59")]);
    expect(a).toEqual(b);
  });

  it("never mutates the Logger session or the canonical workout it reads", () => {
    const sessions = [logger("session-a", "10:01", "10:59")];
    const hk = hkStrength();
    const sessionsBefore = structuredClone(sessions);
    const hkBefore = structuredClone(hk);
    assess(hk, sessions);
    expect(sessions).toEqual(sessionsBefore);
    expect(hk).toEqual(hkBefore);
  });
});

describe("link record lifecycle", () => {
  const candidateFor = (sessions = [logger("session-a", "10:01", "10:59")]) => {
    const hk = hkStrength();
    return { hk, link: createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hk, assessment: assess(hk, sessions), ownerUserId: OWNER, now: NOW }) };
  };

  it("creates only a CANDIDATE with Logger content authority preserved and provenance recorded", () => {
    const { hk, link } = candidateFor();
    expect(link).toMatchObject({
      status: "candidate",
      matchOutcome: "confident_match",
      canonicalWorkoutId: hk.id,
      loggerSessionCanonicalId: "session-a",
      contentAuthority: { trainingContent: "workout_logger", telemetry: "healthkit" },
      createdBy: { kind: "system_matcher" },
      evidenceEligibility: { state: "quarantined", strategic: false },
    });
    expect(link.statusHistory).toHaveLength(1);
    expect(link.id).toMatch(/^healthkit_workout_link_[0-9a-f]{40}$/);
  });

  it("creates an already confirmed link only for an explicit source identity", () => {
    const explicit = logger("session-x", "18:00", "19:00");
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const { link } = candidateFor([explicit]);
    expect(link).toMatchObject({ status: "confirmed", createdBy: { kind: "explicit_source_identity" } });
  });

  it("confirms, unlinks, and relinks without deleting or rewriting either record", () => {
    const { link } = candidateFor();
    const confirmed = confirmHealthKitWorkoutLink(link, { by: { kind: "founder", ref: "confirm-1" }, now: "2026-09-23T21:00:00.000Z" });
    expect(confirmed.status).toBe("confirmed");
    const unlinked = unlinkHealthKitWorkoutLink(confirmed, { by: { kind: "founder", ref: "unlink-1" }, now: "2026-09-23T22:00:00.000Z", reason: "wrong workout" });
    expect(unlinked).toMatchObject({ status: "unlinked", canonicalWorkoutId: link.canonicalWorkoutId, loggerSessionCanonicalId: link.loggerSessionCanonicalId });
    const relinked = confirmHealthKitWorkoutLink(unlinked, { by: { kind: "founder", ref: "relink-1" }, now: "2026-09-23T23:00:00.000Z" });
    expect(relinked.status).toBe("confirmed");
    expect(relinked.statusHistory.map((entry) => entry.status)).toEqual(["candidate", "confirmed", "unlinked", "confirmed"]);
    expect(link.status).toBe("candidate");
  });

  it("enforces one confirmed link per Apple workout and per Logger session", () => {
    const { link } = candidateFor();
    const rival = { ...link, id: "healthkit_workout_link_rival", canonicalWorkoutId: "healthkit_canonical_workout_other", status: "confirmed" };
    expect(() => confirmHealthKitWorkoutLink(link, { by: { kind: "founder" }, now: NOW, existingLinks: [rival] })).toThrowError(expect.objectContaining({ code: "LINK_ONE_TO_ONE_VIOLATION" }));
    const rivalWorkout = { ...link, id: "healthkit_workout_link_rival2", loggerSessionCanonicalId: "session-b", status: "confirmed" };
    expect(() => confirmHealthKitWorkoutLink(link, { by: { kind: "founder" }, now: NOW, existingLinks: [rivalWorkout] })).toThrowError(expect.objectContaining({ code: "LINK_ONE_TO_ONE_VIOLATION" }));
  });
});

describe("cardio coexistence (no double counting against existing Evidence workouts)", () => {
  const appleFitnessWalk = (start, end, duration) => ({
    canonicalId: "training|screenshot|walk-1",
    quality: { status: "active" },
    payload: {
      id: "walk-1", evidence_type: "training", observed_at: "2026-09-23",
      source: { application: "Apple Fitness", modality: "screenshot" },
      metadata: { activity_type: "Outdoor Walk", start_time: `2026-09-23T${start}:00-07:00`, end_time: `2026-09-23T${end}:00-07:00`, duration_seconds: duration, active_calories: 150 },
      exercises: [],
    },
  });

  it("recognizes a HealthKit walk as the same workout as an existing Apple Fitness walk", () => {
    const walk = canonical({ externalId: "walk-uuid", activityType: "52", startedAt: "2026-09-23T07:00:00-07:00", endedAt: "2026-09-23T07:40:00-07:00", durationSeconds: 2400, activeCalories: 150 });
    const result = assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: [appleFitnessWalk("07:01", "07:41", 2400)] });
    expect(result.state).toBe(HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT);
  });

  it("reports no other source when nothing matches and is ambiguous when several do", () => {
    const walk = canonical({ externalId: "walk-uuid", activityType: "52", startedAt: "2026-09-23T07:00:00-07:00", endedAt: "2026-09-23T07:40:00-07:00", durationSeconds: 2400, activeCalories: 150 });
    expect(assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: [appleFitnessWalk("15:00", "15:40", 2400)] }).state).toBe("no_other_source");
    const two = [appleFitnessWalk("07:01", "07:41", 2400), { ...appleFitnessWalk("07:02", "07:42", 2400), canonicalId: "training|screenshot|walk-2" }];
    expect(assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: two }).state).toBe("ambiguous_existing_evidence_workouts");
  });
});

function assess(canonicalWorkout, canonicalObjects) {
  return assessHealthKitStrengthLinkCandidates({ canonicalWorkout, canonicalObjects, existingLinks: [] });
}

function hkStrength() {
  return canonical({ activityType: "50" });
}

function canonical({
  activityType = "50", externalId = HK_UUID, startedAt = "2026-09-23T10:00:00-07:00", endedAt = "2026-09-23T11:00:00-07:00",
  durationSeconds = 3600, activeCalories = 400,
} = {}) {
  const observation = normalizeHealthKitObservationBatch({
    batchId: "b",
    principalDeviceId: "founder-iphone",
    observations: [{
      observationType: "workout",
      externalId,
      source: { bundleIdentifier: "com.apple.health.watch" },
      occurrence: { localDate: "2026-09-23", timeZone: "America/Los_Angeles", startedAt, endedAt },
      workout: { activityType, durationSeconds, activeCalories },
    }],
  }).observations[0];
  return reconcileHealthKitCanonicalWorkout({ observation, ownerUserId: OWNER, now: NOW }).record;
}

function logger(id, start, end, duration = 3540, date = "2026-09-23", exercises = [{ name: "Bench Press", sets: [{ reps: 8, weight: 185 }] }]) {
  return {
    canonicalId: id,
    version: 1,
    quality: { status: "active" },
    payload: {
      id,
      evidence_type: "training",
      observed_at: date,
      source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
      metadata: {
        activity_type: "Traditional Strength Training",
        start_time: `${date}T${start}:00-07:00`,
        end_time: `${date}T${end}:00-07:00`,
        duration_seconds: duration,
      },
      exercises,
    },
  };
}

describe("real Evidence time shapes (review MAJOR-1)", () => {
  const withTimes = (id, start, end, date = "2026-09-23") => {
    const session = logger(id, "10:01", "10:59", 3540, date);
    session.payload.metadata.start_time = start;
    session.payload.metadata.end_time = end;
    return session;
  };
  it.each([
    ["offset ISO", "2026-09-23T10:01:00-07:00", "2026-09-23T10:59:00-07:00"],
    ["timezone-naive ISO", "2026-09-23T10:01:00", "2026-09-23T10:59:00"],
    ["bare wall time with seconds", "10:01:00", "10:59:00"],
    ["bare wall time", "10:01", "10:59"],
    ["meridiem time", "10:01 AM", "10:59 AM"],
  ])("matches a Logger session whose times are %s, in the Apple workout's own time zone", (_label, start, end) => {
    const result = assess(hkStrength(), [withTimes("session-a", start, end)]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.unverifiableSessionCount).toBe(0);
  });

  it("gives the same answer regardless of the server's own time zone", () => {
    const previous = process.env.TZ;
    try {
      const results = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((zone) => {
        process.env.TZ = zone;
        return assess(hkStrength(), [withTimes("session-a", "2026-09-23T10:01:00", "2026-09-23T10:59:00")]).outcome;
      });
      expect(new Set(results)).toEqual(new Set([Outcome.CONFIDENT]));
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });

  it("handles a PM session across the time zone boundary and back-to-back sessions", () => {
    const evening = canonical({ startedAt: "2026-09-23T18:00:00-07:00", endedAt: "2026-09-23T19:00:00-07:00" });
    expect(assess(evening, [withTimes("pm", "6:01 PM", "6:58 PM")]).outcome).toBe(Outcome.CONFIDENT);
    const morning = withTimes("morning", "09:00", "09:50");
    const target = withTimes("target", "10:01", "10:59");
    const result = assess(hkStrength(), [morning, target]);
    expect(result.outcome).toBe(Outcome.CONFIDENT);
    expect(result.candidates[0].loggerSessionCanonicalId).toBe("target");
  });

  it("never silently ignores a same-day session whose time cannot be verified", () => {
    expect(assess(hkStrength(), [withTimes("garbled", "sometime in the morning", "later")])).toMatchObject({
      outcome: Outcome.NONE, reason: "logger_session_times_unverifiable", unverifiableSessionCount: 1,
    });
    const both = assess(hkStrength(), [logger("good", "10:01", "10:59"), withTimes("garbled", "unknown", "unknown")]);
    expect(both).toMatchObject({ outcome: Outcome.POSSIBLE, reason: "unverifiable_same_day_session_present", unverifiableSessionCount: 1 });
  });

  it("does not count an unverifiable session from a different day", () => {
    const other = withTimes("other-day", "unknown", "unknown", "2026-09-22");
    expect(assess(hkStrength(), [other, logger("good", "10:01", "10:59")]).outcome).toBe(Outcome.CONFIDENT);
  });

  it("recognizes an Apple Fitness walk with bare times, and reports unverifiable ones instead of no other source", () => {
    const walk = canonical({ externalId: "walk-uuid", activityType: "52", startedAt: "2026-09-23T07:00:00-07:00", endedAt: "2026-09-23T07:40:00-07:00", durationSeconds: 2400, activeCalories: 150 });
    const shot = (start, end) => ({ canonicalId: "training|screenshot|walk-1", quality: { status: "active" }, payload: {
      id: "walk-1", evidence_type: "training", observed_at: "2026-09-23", source: { application: "Apple Fitness", modality: "screenshot" },
      metadata: { activity_type: "Outdoor Walk", start_time: start, end_time: end, duration_seconds: 2400, active_calories: 150 }, exercises: [] } });
    expect(assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: [shot("07:01:00", "07:41:00")] }).state)
      .toBe(HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT);
    expect(assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: [shot("7:01 AM", "7:41 AM")] }).state)
      .toBe(HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT);
    expect(assessHealthKitCardioCoexistence({ canonicalWorkout: walk, canonicalObjects: [shot("in the morning", "")] }).state)
      .toBe(HealthKitCardioCoexistenceState.UNVERIFIABLE);
  });
});

describe("link safety refinements", () => {
  it("creates an explicit-identity link as a confirmed link only when it keeps the one-to-one rule", () => {
    const explicit = logger("session-y", "18:00", "19:00");
    explicit.payload.metadata.source_workout_id = HK_UUID;
    const hk = hkStrength();
    const assessment = assess(hk, [explicit]);
    const clash = [{ id: "healthkit_workout_link_x", canonicalWorkoutId: hk.id, loggerSessionCanonicalId: "session-x", status: "confirmed" }];
    const link = createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hk, assessment, ownerUserId: OWNER, now: NOW, existingLinks: clash });
    expect(link.status).toBe("candidate");
    expect(link.createdBy.kind).toBe("system_matcher");
    const clean = createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hk, assessment, ownerUserId: OWNER, now: NOW, existingLinks: [] });
    expect(clean.status).toBe("confirmed");
  });

  it("refreshes a system candidate when the assessment changes and restores one the system released", () => {
    const hk = hkStrength();
    const first = assess(hk, [logger("session-a", "10:04", "11:20", 4560)]);
    const link = createHealthKitWorkoutLinkCandidate({ canonicalWorkout: hk, assessment: first, ownerUserId: OWNER, now: NOW });
    expect(link.matchOutcome).toBe("possible_match");
    const better = assess(hk, [logger("session-a", "10:01", "10:59")]);
    const refreshed = refreshHealthKitWorkoutLinkCandidate(link, { assessment: better, now: NOW });
    expect(refreshed).toMatchObject({ status: "candidate", matchOutcome: "confident_match" });
    expect(refreshed.confidence).toBeGreaterThan(link.confidence);
    expect(refreshHealthKitWorkoutLinkCandidate(refreshed, { assessment: better, now: NOW })).toBe(refreshed);

    const released = unlinkHealthKitWorkoutLink(refreshed, { by: { kind: "system_matcher" }, now: NOW, reason: "assessment_changed" });
    const restored = refreshHealthKitWorkoutLinkCandidate(released, { assessment: better, now: NOW });
    expect(restored.status).toBe("candidate");
    expect(restored.statusHistory.at(-1)).toMatchObject({ reason: "assessment_restored" });
    // A Founder-owned unlink is never undone by the system.
    const founderUnlinked = unlinkHealthKitWorkoutLink(refreshed, { by: { kind: "founder" }, now: NOW, reason: "wrong workout" });
    expect(refreshHealthKitWorkoutLinkCandidate(founderUnlinked, { assessment: better, now: NOW }).status).toBe("unlinked");
  });

  it("finds a re-created or second-source workout as a possible duplicate, and nothing unrelated", () => {
    const original = canonical();
    const recreated = canonical({ externalId: "recreated-uuid" });
    const other = canonical({ externalId: "afternoon", startedAt: "2026-09-23T16:00:00-07:00", endedAt: "2026-09-23T17:00:00-07:00" });
    const walk = canonical({ externalId: "walk", activityType: "52" });
    expect(findPossibleDuplicateCanonicalWorkouts(original, [original, recreated, other, walk])).toEqual([recreated.id]);
    expect(findPossibleDuplicateCanonicalWorkouts(original, [original, other])).toEqual([]);
  });
});
