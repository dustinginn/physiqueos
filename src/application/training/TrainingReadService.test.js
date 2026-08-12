import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createTrainingReadService } from "./TrainingReadService.js";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });
const session = (id, observedAt, quality = {}) => ({ canonicalId: id, quality, payload: { evidence_type: "training", observed_at: observedAt, metadata: { activity_type: "Resistance Training" }, exercises: [{ name: "Curl" }] } });

describe("training shared-client boundary", () => {
  it("returns confirmed canonical history/detail in recency order and suppresses superseded records", async () => {
    const records = [session("older", "2026-08-09T17:00:00Z"), session("newer", "2026-08-10T17:00:00Z"), session("superseded", "2026-08-11T17:00:00Z", { status: "superseded" })];
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async (userId) => userId === "owner-one" ? records : [] } } });
    expect((await service.listHistory({ principal })).map((item) => item.id)).toEqual(["newer", "older"]);
    expect(await service.getSession({ principal, sessionId: "newer" })).toMatchObject({ id: "newer", exerciseCount: 1, exercises: [{ name: "Curl" }] });
    expect(await service.getSession({ principal, sessionId: "missing" })).toBeNull();
  });

  it("requires ownership context for history and exercise search", async () => {
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] } } });
    await expect(service.listHistory()).rejects.toMatchObject({ status: 401 });
    await expect(service.getExerciseLibrary({ query: "curl" })).rejects.toMatchObject({ status: 401 });
  });

  it("exposes categories, canonical exercise detail, search, and recent exercise identity", async () => {
    const records = [{ canonicalId: "session-one", payload: { evidence_type: "training", observed_at: "2026-08-10T17:00:00Z", exercises: [{ canonicalExerciseId: "ez_bar_curl", canonicalExerciseName: "EZ Bar Curls" }] } }];
    const service = createTrainingReadService({ repositories: { canonicalEvidence: { listCanonicalEvidenceObjects: async () => records } } });
    expect(await service.listCategories({ principal })).toContain("Arms");
    expect(await service.getExercise({ principal, exerciseId: "ez_bar_curl" })).toMatchObject({ name: "EZ Bar Curls", bodyRegion: "Arms", movementPattern: "Elbow Flexion" });
    expect((await service.getExerciseLibrary({ principal, query: "EZ Bar" }))[0]).toMatchObject({ id: "ez_bar_curl", bodyRegion: "Arms" });
    expect(await service.listRecentExercises({ principal })).toEqual([{ id: "ez_bar_curl", name: "EZ Bar Curls", observedAt: "2026-08-10T17:00:00Z" }]);
  });

  it("builds a platform-neutral day with distinct strength and walking sessions", async () => {
    const records = [
      {
        canonicalId: "strength",
        quality: { status: "active" },
        payload: {
          id: "strength-payload",
          evidence_type: "training",
          observed_at: "2026-08-10",
          captured_at: "2026-08-10T07:21:00-07:00",
          metadata: { activity_type: "Traditional Strength Training" },
          exercises: [
            { name: "Hack Squats", body_region: "Legs", primary_muscle_groups: ["Quads"] },
            { name: "Leg Press", body_region: "Legs", primary_muscle_groups: ["Quads"] },
          ],
        },
      },
      {
        canonicalId: "walk",
        quality: { status: "active" },
        payload: {
          evidence_type: "training",
          observed_at: "2026-08-10",
          captured_at: "2026-08-10T09:00:00-07:00",
          metadata: { activity_type: "Outdoor Walk", duration_seconds: 900, distance: 0.97, distance_unit: "mi" },
          exercises: [],
        },
      },
    ];
    const service = createTrainingReadService({ repositories: repositories(records) });
    const day = await service.getDay({ principal, date: "2026-08-10", timeZone: "America/Los_Angeles" });

    expect(day).toMatchObject({
      date: "2026-08-10",
      href: "/progress/training/day/2026-08-10",
      summary: { sessionCount: 2, strengthSessions: 1, exerciseCount: 2, hasWalking: true },
    });
    expect(day.sessions.map((item) => item.kind)).toEqual(["strength", "walking"]);
    expect(day.sessions[0]).toMatchObject({ title: "Traditional Strength Training", exerciseCount: 2 });
    expect(day.sessions[1].detail).toBe("15 min · 0.97 mi");
  });

  it("supports multiple strength sessions, one session, no sessions, and deterministic ordering", async () => {
    const records = [
      session("later-id", "2026-08-10", { status: "active" }),
      session("earlier-id", "2026-08-10", { status: "active" }),
      session("only-other-day", "2026-08-09", { status: "active" }),
    ];
    records[0].payload.captured_at = "2026-08-10T18:00:00Z";
    records[1].payload.captured_at = "2026-08-10T08:00:00Z";
    const service = createTrainingReadService({ repositories: repositories(records) });

    expect((await service.getDay({ principal, date: "2026-08-10" })).sessions.map((item) => item.id))
      .toEqual(["earlier-id", "later-id"]);
    expect((await service.getDay({ principal, date: "2026-08-09" })).sessions).toHaveLength(1);
    expect((await service.getDay({ principal, date: "2026-08-08" })).sessions).toHaveLength(0);
    expect(await service.getDay({ principal, date: "2026-02-30" })).toBeNull();
  });

  it("uses local calendar semantics and excludes inactive sessions from Training Day", async () => {
    const records = [
      session("late-local", "2026-08-11T06:30:00Z", { status: "active" }),
      session("retracted", "2026-08-10", { status: "superseded", disposition: "retracted_false_proving_evidence" }),
    ];
    const service = createTrainingReadService({ repositories: repositories(records) });

    const pacificDay = await service.getDay({ principal, date: "2026-08-10", timeZone: "America/Los_Angeles" });
    expect(pacificDay.sessions.map((item) => item.id)).toEqual(["late-local"]);
    expect((await service.getDay({ principal, date: "2026-08-11", timeZone: "UTC" })).sessions.map((item) => item.id))
      .toEqual(["late-local"]);
  });
});

function repositories(records) {
  return {
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => records },
    users: { getUserById: async () => ({ id: "owner-one", timezone: "America/Los_Angeles" }) },
  };
}
