import { describe, expect, it, vi } from "vitest";
import {
  composeLoggedTodaySummary,
  createLoggedTodayService,
} from "./LoggedTodayService";

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
