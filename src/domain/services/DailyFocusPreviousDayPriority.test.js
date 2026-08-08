import { describe, expect, it } from "vitest";
import {
  createPriorityOccurrenceKey,
  getPreviousDayIncompletePrioritySelection,
} from "./DailyFocusService";

const NOW = new Date("2026-07-29T15:00:00.000Z");
const TIME_ZONE = "America/Los_Angeles";

function reminder(id, overrides = {}) {
  return {
    id,
    userId: "user",
    title: id,
    type: "protocol_reminder",
    active: true,
    schedule: {
      cadence: "daily",
      type: "daily",
      timeOfDay: "morning",
    },
    ...overrides,
  };
}

function selection(overrides = {}) {
  return getPreviousDayIncompletePrioritySelection({
    now: NOW,
    timeZone: TIME_ZONE,
    reminders: [],
    checkIns: [],
    dexaScans: [],
    progressPhotos: [],
    weightEntries: [],
    ...overrides,
  });
}

function reconciliation(priorityId, status, occurrenceDate = "2026-07-28") {
  return {
    userId: "user",
    date: occurrenceDate,
    reconciliation: [
      {
        key: createPriorityOccurrenceKey(priorityId, occurrenceDate),
        reminderId: priorityId,
        occurrenceDate,
        status,
      },
    ],
  };
}

describe("Morning Check-In previous-day priority selection", () => {
  it("Case A selects one incomplete yesterday occurrence", () => {
    const result = selection({ reminders: [reminder("one")] });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "one",
        occurrenceDate: "2026-07-28",
        occurrenceKey: "one:2026-07-28",
      }),
    ]);
  });

  it("Case B selects two incomplete priorities independently", () => {
    const result = selection({
      reminders: [reminder("one"), reminder("two")],
    });

    expect(result.items.map((item) => item.occurrenceKey)).toEqual([
      "one:2026-07-28",
      "two:2026-07-28",
    ]);
  });

  it("Case C excludes a priority completed during yesterday", () => {
    const result = selection({
      reminders: [
        reminder("done", {
          completedAt: "2026-07-29T03:00:00.000Z",
        }),
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.diagnostics.exclusions).toContainEqual({
      priorityId: "done",
      reason: "dated_completion",
    });
  });

  it("Case D conservatively keeps a yesterday occurrence when latest completion is this morning", () => {
    const result = selection({
      reminders: [
        reminder("ambiguous", {
          completedAt: "2026-07-29T14:00:00.000Z",
        }),
      ],
    });

    expect(result.items.map((item) => item.id)).toEqual(["ambiguous"]);
  });

  it.each(["skipped", "dismissed"])(
    "Case E excludes an explicitly %s yesterday occurrence",
    (status) => {
      expect(
        selection({
          reminders: [reminder("resolved")],
          checkIns: [reconciliation("resolved", status)],
        }).items
      ).toEqual([]);
    }
  );

  it.each(["moved", "rescheduled"])(
    "Case F excludes an explicitly %s original occurrence",
    (status) => {
      expect(
        selection({
          reminders: [reminder("resolved")],
          checkIns: [reconciliation("resolved", status)],
        }).items
      ).toEqual([]);
    }
  );

  it("Cases G, H, P, and Q do not widen beyond yesterday", () => {
    const result = selection({
      reminders: [
        reminder("two-days-ago", {
          schedule: {
            type: "weekly",
            cadence: "weekly",
            dayOfWeek: "sunday",
            daysOfWeek: ["sunday"],
          },
        }),
        reminder("today-only", {
          schedule: {
            type: "weekly",
            cadence: "weekly",
            dayOfWeek: "wednesday",
            daysOfWeek: ["wednesday"],
          },
        }),
        reminder("prior-week-thursday", {
          schedule: {
            type: "weekly",
            cadence: "weekly",
            dayOfWeek: "thursday",
            daysOfWeek: ["thursday"],
          },
        }),
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.window.previousLocalDate).toBe("2026-07-28");
  });

  it("Cases I and J use exact local-day boundaries rather than the UTC date", () => {
    const justAfterMidnight = selection({
      now: new Date("2026-07-29T07:00:01.000Z"),
      reminders: [reminder("boundary")],
    });
    const justBeforeMidnight = selection({
      now: new Date("2026-07-30T06:59:59.999Z"),
      reminders: [reminder("boundary")],
    });

    expect(justAfterMidnight.window.previousLocalDate).toBe("2026-07-28");
    expect(justBeforeMidnight.window.previousLocalDate).toBe("2026-07-28");
    expect(justAfterMidnight.items[0].occurrenceDate).toBe("2026-07-28");
  });

  it("Case J assigns timestamped completion evidence by the user timezone", () => {
    const result = selection({
      reminders: [
        reminder("reminder_morning_weight", {
          title: "Morning Weight",
          linkedEvidenceType: "weight",
          linkedEntityType: "weight_entry",
          type: "evidence_reminder",
        }),
      ],
      weightEntries: [
        {
          userId: "user",
          measuredAt: "2026-07-29T03:00:00.000Z",
        },
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.diagnostics.exclusions).toContainEqual({
      priorityId: "reminder_morning_weight",
      reason: "completion_evidence",
    });
  });

  it("Cases K, L, and M preserve unresolved prompts and suppress only explicitly resolved occurrences", () => {
    const reminders = [reminder("one"), reminder("two")];
    const firstView = selection({ reminders });
    const repeatedView = selection({ reminders });
    const afterResolution = selection({
      reminders,
      checkIns: [reconciliation("one", "completed")],
    });

    expect(repeatedView.items).toEqual(firstView.items);
    expect(afterResolution.items.map((item) => item.id)).toEqual(["two"]);
  });

  it("Case O excludes titleless, internal, hidden, and unsupported records", () => {
    const result = selection({
      reminders: [
        reminder("titleless", { title: "" }),
        reminder("intent_reminder_intent", { title: "Internal" }),
        reminder("internal", { internalOnly: true }),
        reminder("hidden", { userFacing: false }),
        reminder("unsupported", { type: "scheduler_intent" }),
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.diagnostics.exclusions).toHaveLength(5);
  });

  it("Case R keys each recurring occurrence by priority ID and local date", () => {
    const recurring = reminder("recurring");
    const result = selection({
      reminders: [recurring],
      checkIns: [
        reconciliation("recurring", "completed", "2026-07-27"),
        {
          userId: "user",
          date: "2026-07-30",
          reconciliation: [
            {
              reminderId: "recurring",
              occurrenceDate: "2026-07-30",
              status: "completed",
            },
          ],
        },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        occurrenceKey: "recurring:2026-07-28",
      }),
    ]);
  });

  it("Case Z selects exactly the two visible July 28 incident priorities", () => {
    const result = selection({
      reminders: [
        reminder("reminder_tesamorelin", { title: "Tesamorelin" }),
        reminder("reminder_foam_roll_daily", {
          title: "Foam Roll",
          type: "recovery_reminder",
        }),
        reminder("nutrition_reminder_intent", {
          title: null,
          type: null,
        }),
        reminder("reminder_retatrutide", {
          title: "Retatrutide",
          schedule: {
            type: "weekly",
            cadence: "weekly",
            dayOfWeek: "thursday",
            daysOfWeek: ["thursday"],
          },
        }),
      ],
    });

    expect(result.items.map((item) => item.title)).toEqual([
      "Tesamorelin",
      "Foam Roll",
    ]);
    expect(result.diagnostics).toMatchObject({
      checkInLocalDate: "2026-07-29",
      previousLocalDate: "2026-07-28",
      timeZone: TIME_ZONE,
      inputPriorityCount: 4,
      eligiblePriorityCount: 2,
      promptPriorityIds: [
        "reminder_tesamorelin",
        "reminder_foam_roll_daily",
      ],
    });
  });
});
