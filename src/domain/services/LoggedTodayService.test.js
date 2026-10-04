import { describe, expect, it, vi } from "vitest";
import {
  composeLoggedTodaySummary,
  createLoggedTodayService,
} from "./LoggedTodayService";
import { createSep24StrengthPresentationFixture } from "../../fixtures/healthKitSep24StrengthPresentationFixture.js";

const dateKey = "2026-07-25";

describe("LoggedTodayService", () => {
  it("returns three neutral rows in the required order when today is empty", () => {
    const result = composeLoggedTodaySummary({ canonicalObjects: [], dateKey });

    expect(result.rows.map((row) => row.label)).toEqual([
      "Training",
      "Nutrition",
      "Activity",
    ]);
    expect(result.rows.every((row) => row.summary === "Nothing logged yet")).toBe(true);
    expect(result.rows.every((row) => row.href === null)).toBe(true);
  });

  it("summarizes one canonical meal without a completion judgment", () => {
    const result = composeLoggedTodaySummary({
      canonicalObjects: [
        canonical("nutrition-day", {
          id: "nutrition-25",
          evidence_type: "nutrition",
          observed_at: dateKey,
          metadata: { meal_count: 1 },
          daily_totals: { calories: 440 },
          meals: [{ id: "breakfast" }],
        }),
      ],
      dateKey,
    });
    const nutrition = result.rows[1];

    expect(nutrition).toMatchObject({
      summary: "1 meal · 440 calories",
      href: "/progress/nutrition/day/nutrition-25",
      recordId: "nutrition-25",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /complete|incomplete|remaining|required|behind|progress percentage/i
    );
  });

  it("does not sum duplicate active same-date Nutrition revisions", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = composeLoggedTodaySummary({
      canonicalObjects: [
        { ...canonical("nutrition-old", {
          id: "nutrition-old", evidence_type: "nutrition", observed_at: dateKey,
          metadata: { meal_count: 4 }, daily_totals: { calories: 2200 },
          meals: [{}, {}, {}, {}],
        }), nutritionRevision: { revision: 1 } },
        { ...canonical("nutrition-current", {
          id: "nutrition-current", evidence_type: "nutrition", observed_at: dateKey,
          metadata: { meal_count: 4 }, daily_totals: { calories: 2450 },
          meals: [{}, {}, {}, {}],
        }), nutritionRevision: { revision: 2 } },
      ],
      dateKey,
    });

    expect(result.rows[1]).toMatchObject({
      summary: "4 meals \u00B7 2,450 calories",
      recordId: "nutrition-current",
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("summarizes one or multiple training types without creating a session", () => {
    const one = composeLoggedTodaySummary({
      canonicalObjects: [
        training("strength-1", "Traditional Strength Training"),
      ],
      dateKey,
    }).rows[0];
    const multiple = composeLoggedTodaySummary({
      canonicalObjects: [
        training("walk-1", "Outdoor Walk"),
        training("strength-1", "Traditional Strength Training"),
      ],
      dateKey,
    }).rows[0];

    expect(one).toMatchObject({
      summary: "Strength Training logged",
      href: "/progress/training/session/strength-1",
      recordId: "strength-1",
    });
    expect(multiple).toMatchObject({
      summary: "Outdoor Walk · Strength Training",
      href: "/progress/training",
      recordId: null,
    });
  });

  it("keeps an imported strength session stable when movements are absent", () => {
    const row = composeLoggedTodaySummary({
      canonicalObjects: [
        training("apple-strength-1", "Traditional Strength Training", {
          duration_seconds: 3120,
        }),
      ],
      dateKey,
    }).rows[0];

    expect(row).toMatchObject({
      summary: "Strength Training · 52 min",
      context: "Movements not added",
      href: "/progress/training/session/apple-strength-1",
      recordId: "apple-strength-1",
    });
  });

  it("uses a resolved HK candidate's real duration over the Logger session's own frozen/synthetic one", () => {
    const row = composeLoggedTodaySummary({
      canonicalObjects: [
        training("logger-1", "Traditional Strength Training", { duration_seconds: 5647 }),
      ],
      dateKey,
      healthKitStrengthPresentationBySession: new Map([
        ["logger-1", { session: { durationSeconds: 1679 } }],
      ]),
    }).rows[0];

    expect(row).toMatchObject({
      summary: "Strength Training · 28 min",
      href: "/progress/training/session/logger-1",
      recordId: "logger-1",
    });
  });

  it("falls back to the Logger session's own duration when no presentation map is supplied at all (backward compatible)", () => {
    const row = composeLoggedTodaySummary({
      canonicalObjects: [
        training("logger-1", "Traditional Strength Training", { duration_seconds: 5647 }),
      ],
      dateKey,
    }).rows[0];

    expect(row.summary).toBe("Strength Training · 94 min");
  });

  it("falls back to the Logger session's own duration when the map has no entry for this session (no plausible HK candidate)", () => {
    const row = composeLoggedTodaySummary({
      canonicalObjects: [
        training("logger-1", "Traditional Strength Training", { duration_seconds: 5647 }),
      ],
      dateKey,
      healthKitStrengthPresentationBySession: new Map(),
    }).rows[0];

    expect(row.summary).toBe("Strength Training · 94 min");
  });

  it("end to end: an unconfirmed September 24 Apple candidate never overrides the Logger's own Log row (real resolver, not a stub)", async () => {
    const fixture = createSep24StrengthPresentationFixture();
    const list = vi.fn(async () => fixture.canonicalEvidenceObjects);
    const repositories = {
      users: { getUserById: vi.fn(async () => ({ id: fixture.ownerUserId, timeZone: "America/Los_Angeles" })) },
      canonicalEvidence: { listCanonicalEvidenceObjects: list },
    };
    const result = await createLoggedTodayService({
      repositories,
      now: () => new Date("2026-09-24T20:30:00.000Z"),
    }).getSummary({
      userId: fixture.ownerUserId,
      healthKitRelationshipState: {
        canonicalWorkouts: fixture.canonicalWorkouts,
        workoutLinks: fixture.workoutLinks,
        workoutLinkClaims: fixture.workoutLinkClaims,
      },
    });

    // Strength and the day's two canonical walks, one line per modality.
    expect(result.rows[0]).toMatchObject({
      summary: "Strength Training · 94 min, 2 Walks · 33 min",
      recordId: fixture.ids.session,
      lines: [
        { kind: "logger", summary: "Strength Training · 94 min", recordId: fixture.ids.session },
        { kind: "cardio", summary: "2 Walks · 33 min", recordId: null },
      ],
    });
  });

  it("uses canonical activity evidence without inferring target status", () => {
    const row = composeLoggedTodaySummary({
      canonicalObjects: [
        canonical("activity-25", {
          id: "activity-25",
          evidence_type: "activity_day",
          observed_at: dateKey,
          daily_activity: { move_calories: 842 },
        }),
      ],
      dateKey,
    }).rows[2];

    expect(row).toMatchObject({
      summary: "842 active calories",
      href: "/progress/activity",
      recordId: "activity-25",
    });
  });

  it("uses the canonical local calendar boundary and performs no writes", async () => {
    const list = vi.fn(async () => [
      training("late-24", "Outdoor Walk", {}, "2026-07-24"),
      training("local-25", "Traditional Strength Training"),
    ]);
    const repositories = {
      users: {
        getCurrentUser: vi.fn(async () => ({
          id: "user",
          timeZone: "America/Los_Angeles",
        })),
      },
      canonicalEvidence: {
        listCanonicalEvidenceObjects: list,
        upsertCanonicalEvidenceObjects: vi.fn(),
      },
    };
    const result = await createLoggedTodayService({
      repositories,
      now: () => new Date("2026-07-26T06:30:00.000Z"),
    }).getSummary();

    expect(result.dateKey).toBe("2026-07-25");
    expect(result.rows[0].recordId).toBe("local-25");
    expect(list).toHaveBeenCalledOnce();
    expect(repositories.canonicalEvidence.upsertCanonicalEvidenceObjects).not.toHaveBeenCalled();
  });
});

describe("Logged Today: Strength and Cardio together (Sep 28)", () => {
  const strength = () => training("strength-28", "Traditional Strength Training", { duration_seconds: 3000 });
  const cardio = (id, type, minutes, start) => ({
    id, _canonicalId: id, evidence_type: "training", observed_at: dateKey,
    captured_at: `${dateKey}T${start}:00-07:00`,
    metadata: { activity_type: type, duration_seconds: minutes * 60 },
  });
  const trainingRow = (canonicalObjects, cardioWorkouts) =>
    composeLoggedTodaySummary({ canonicalObjects, dateKey, cardioWorkouts }).rows[0];

  it("one Strength session and two same-type walks: one line each, walks grouped", () => {
    const row = trainingRow([strength()], [cardio("walk-1", "Outdoor Walk", 17, "08:05"), cardio("walk-2", "Outdoor Walk", 15, "09:12")]);
    expect(row.lines.map((line) => line.summary)).toEqual(["Strength Training · 50 min", "2 Outdoor Walks · 32 min"]);
    expect(row.summary).toBe("Strength Training · 50 min, 2 Outdoor Walks · 32 min");
    // The Strength session keeps its own link for single-line clients (Build 68).
    expect(row).toMatchObject({ href: "/progress/training/session/strength-28", recordId: "strength-28", context: "Movements not added" });
    expect(row.lines[0]).toMatchObject({ kind: "logger", href: "/progress/training/session/strength-28", recordId: "strength-28" });
    expect(row.lines[1]).toMatchObject({ kind: "cardio", recordId: null });
  });

  it("one Strength and one Cardio", () => {
    const row = trainingRow([strength()], [cardio("run-1", "Outdoor Run", 25, "07:00")]);
    expect(row.lines.map((line) => line.summary)).toEqual(["Strength Training · 50 min", "Outdoor Run · 25 min"]);
    expect(row.lines[1].recordId).toBe("run-1");
  });

  it("several Cardio types: one line per type, ordered by first start", () => {
    const row = trainingRow([], [
      cardio("cycle-1", "Indoor Cycle", 30, "18:00"),
      cardio("walk-1", "Outdoor Walk", 20, "07:30"),
      cardio("walk-2", "Outdoor Walk", 10, "12:00"),
    ]);
    expect(row.lines.map((line) => line.summary)).toEqual(["2 Outdoor Walks · 30 min", "Indoor Cycle · 30 min"]);
    expect(row.context).toBe("Apple Health");
  });

  it("Cardio only: the row exists, credits Apple Health, and opens Training Day", () => {
    const row = trainingRow([], [cardio("walk-1", "Outdoor Walk", 17, "08:05")]);
    expect(row).toMatchObject({ summary: "Outdoor Walk · 17 min", context: "Apple Health", href: "/progress/training", recordId: null });
  });

  it("Strength only is unchanged: its own summary, context, destination and record", () => {
    const row = trainingRow([strength()], []);
    expect(row).toMatchObject({ summary: "Strength Training · 50 min", context: "Movements not added",
      href: "/progress/training/session/strength-28", recordId: "strength-28" });
    expect(row.lines).toHaveLength(1);
  });

  it("no training: the neutral empty row, no lines", () => {
    const row = trainingRow([], []);
    expect(row.summary).toBe("Nothing logged yet");
    expect(row.lines).toBeUndefined();
  });

  it("a partial Apple Health day reads 'so far'; a complete one does not", () => {
    const activity = (coverage) => composeLoggedTodaySummary({ dateKey, canonicalObjects: [canonical("activity-28", {
      id: "activity-28", evidence_type: "activity_day", observed_at: dateKey,
      daily_activity: { move_calories: 171.405 }, metadata: { coverage } })] }).rows[2];
    expect(activity("partial_day").summary).toBe("171 active calories so far");
    expect(activity("complete_day").summary).toBe("171 active calories");
  });
});

function canonical(canonicalId, payload) {
  return {
    canonicalId,
    evidence_type: payload.evidence_type,
    lastObservedAt: payload.observed_at,
    payload,
    quality: { status: "active" },
  };
}

function training(id, activityType, metadata = {}, date = dateKey) {
  return canonical(id, {
    id: `${id}-payload`,
    evidence_type: "training",
    observed_at: date,
    metadata: { activity_type: activityType, ...metadata },
    exercises: [],
  });
}
