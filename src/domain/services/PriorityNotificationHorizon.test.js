import { describe, expect, it } from "vitest";
import {
  createDailyFocusService,
  PRIORITY_NOTIFICATION_HORIZON_DAYS,
  PRIORITY_NOTIFICATION_HORIZON_LIMIT,
} from "./DailyFocusService";

describe("canonical priority notification occurrence horizon", () => {
  it("projects tomorrow's 05:30 Morning Weigh-In and eligible 05:45 every-other-day Fadogia before midnight", () => {
    const occurrences = horizon();

    expect(find(occurrences, "reminder_morning_weight", "2026-09-17"))
      .toMatchObject({
        label: "Morning Weigh-In",
        occurrenceDate: "2026-09-17",
        notificationAction: { scheduledTime: "05:30" },
      });
    expect(find(occurrences, "reminder_fadogia", "2026-09-17"))
      .toMatchObject({
        label: "Fadogia Agrestis",
        occurrenceDate: "2026-09-17",
        notificationAction: { scheduledTime: "05:45" },
      });
    expect(find(occurrences, "reminder_fadogia", "2026-09-18")).toBeUndefined();
    expect(find(occurrences, "reminder_fadogia", "2026-09-19")).toBeDefined();
  });

  it("keeps tomorrow while today's exact occurrence is complete", () => {
    const data = fixture();
    data.reminders[0].completionHistory = [
      { occurrenceDate: "2026-09-16", status: "completed" },
    ];
    const occurrences = service().getNotificationOccurrences(data);

    expect(find(occurrences, "reminder_morning_weight", "2026-09-17")).toBeDefined();
  });

  it("removes disabled future reminders and restores only canonically eligible dates when re-enabled", () => {
    const data = fixture();
    data.reminders[1].active = false;
    expect(service().getNotificationOccurrences(data)
      .some((item) => priorityId(item) === "reminder_fadogia")).toBe(false);

    data.reminders[1].active = true;
    const restored = service().getNotificationOccurrences(data)
      .filter((item) => priorityId(item) === "reminder_fadogia");
    expect(restored.map((item) => item.occurrenceDate))
      .toEqual(["2026-09-17", "2026-09-19", "2026-09-21"]);
  });

  it("reprojects edited future times without changing occurrence identity", () => {
    const data = fixture();
    const before = service().getNotificationOccurrences(data);
    data.executionItems[1].preferredSchedule.timeOfDay = "06:15";
    data.reminders[1].schedule.timeOfDay = "06:15";
    const after = service().getNotificationOccurrences(data);

    const original = find(before, "reminder_fadogia", "2026-09-17");
    const replacement = find(after, "reminder_fadogia", "2026-09-17");
    expect(priorityId(replacement)).toBe(priorityId(original));
    expect(replacement.notificationAction.scheduledTime).toBe("06:15");
  });

  it("is date-key based across the DST boundary and bounded below iOS's pending-request limit", () => {
    const data = fixture({ now: new Date("2026-10-31T01:00:00.000Z") });
    data.executionItems[0].preferredSchedule.startDate = "2026-01-01";
    data.reminders[0].schedule.startDate = "2026-01-01";
    const occurrences = service().getNotificationOccurrences(data);

    expect(occurrences.some((item) =>
      priorityId(item) === "reminder_morning_weight" && item.occurrenceDate === "2026-11-01"
    )).toBe(true);
    expect(PRIORITY_NOTIFICATION_HORIZON_DAYS).toBe(7);
    expect(PRIORITY_NOTIFICATION_HORIZON_LIMIT).toBeLessThan(64);
    expect(occurrences.length).toBeLessThanOrEqual(PRIORITY_NOTIFICATION_HORIZON_LIMIT);
  });
});

function horizon() {
  return service().getNotificationOccurrences(fixture());
}

function service() {
  return createDailyFocusService();
}

function fixture({ now = new Date("2026-09-17T01:00:00.000Z") } = {}) {
  const weightProtocol = {
    id: "protocol_weight", userId: "founder", category: "weight",
    protocolType: "weight", status: "active", activatedAt: "2026-07-23T16:54:00.550Z",
    name: "Morning Weigh-In",
  };
  const fadogiaProtocol = {
    id: "protocol_fadogia", userId: "founder", category: "supplement",
    status: "active", name: "Fadogia Agrestis",
  };
  return {
    checkIns: [],
    executionItems: [
      {
        id: "execution_morning_weigh_in", userId: "founder", type: "evidence",
        title: "Morning Weigh-In", active: true, linkedProtocolId: weightProtocol.id,
        cadence: { type: "daily" },
        preferredSchedule: {
          daysOfWeek: [], timeOfDay: "05:30", startDate: "2026-07-23", endDate: null,
        },
      },
      {
        id: "execution_fadogia", userId: "founder", type: "supplement",
        title: "Fadogia Agrestis", active: true, protocolRootId: fadogiaProtocol.id,
        cadence: { type: "every_x_days", interval: 2 },
        preferredSchedule: {
          daysOfWeek: [], timeOfDay: "05:45", startDate: "2026-09-15",
          anchorDate: "2026-09-15", intervalDays: 2, endDate: null,
        },
        reminderPreference: "remind",
      },
    ],
    latestWeight: null,
    now,
    progressPhotos: [],
    protocols: [weightProtocol, fadogiaProtocol],
    reminders: [
      {
        id: "reminder_morning_weight", userId: "founder", type: "evidence_reminder",
        title: "Morning Weigh-In", linkedEntityId: weightProtocol.id,
        linkedEvidenceType: "weight", active: true,
        schedule: { type: "daily", timeOfDay: "05:30", startDate: "2026-07-23" },
        completionHistory: [],
      },
      {
        id: "reminder_fadogia", userId: "founder", type: "supplement_reminder",
        title: "Fadogia Agrestis", linkedEntityId: fadogiaProtocol.id,
        linkedEvidenceType: "supplement", active: true,
        schedule: {
          type: "every_x_days", cadence: "every_x_days", interval: 2,
          intervalDays: 2, anchorDate: "2026-09-15", startDate: "2026-09-15",
          timeOfDay: "05:45",
        },
        completionHistory: [],
      },
    ],
    timeZone: "America/Los_Angeles",
    weightEntries: [],
  };
}

function priorityId(item) {
  return item.executionContract?.priorityId ?? item.completionId ?? item.id;
}

function find(items, id, date) {
  return items.find((item) => priorityId(item) === id && item.occurrenceDate === date);
}
