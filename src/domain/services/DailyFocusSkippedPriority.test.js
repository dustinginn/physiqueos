import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";
import { createPriorityReconciliationEntry } from "./PriorityOccurrenceReconciliation.js";

// 08:00 on 2026-09-16 in America/Los_Angeles.
const NOW = new Date("2026-09-16T15:00:00.000Z");
const TIME_ZONE = "America/Los_Angeles";
const TODAY = "2026-09-16";

function reminder(id, overrides = {}) {
  return {
    id,
    userId: "user",
    title: `Priority ${id}`,
    type: "other",
    active: true,
    persistenceMode: "always_visible",
    schedule: { type: "daily", timeOfDay: "18:00" },
    completionHistory: [],
    version: 3,
    ...overrides,
  };
}

function checkIn(date, entries) {
  return {
    id: `daily_check_in_${date.replaceAll("-", "_")}`,
    userId: "user",
    date,
    reconciliation: entries.map(([priorityId, disposition, occurrenceDate = date]) =>
      createPriorityReconciliationEntry({
        priorityId, occurrenceDate, disposition, recordedAt: `${date}T16:00:00.000Z`,
      })
    ),
  };
}

function inputs(checkIns = []) {
  return {
    checkIns,
    reminders: [reminder("stretch"), reminder("read")],
    now: NOW,
    timeZone: TIME_ZONE,
  };
}

const ids = (items) => items.map((item) => item.executionContract?.priorityId ?? item.id);

describe("Daily Focus honors today's canonical skip", () => {
  it("drops a priority skipped today from Home and keeps the others", () => {
    const service = createDailyFocusService();
    expect(ids(service.getDailyFocus(inputs()))).toEqual(expect.arrayContaining(["stretch", "read"]));

    const focus = service.getDailyFocus(inputs([checkIn(TODAY, [["stretch", "skipped"]])]));
    expect(ids(focus)).not.toContain("stretch");
    expect(ids(focus)).toContain("read");
  });

  it("drops only today's occurrence from the notification horizon", () => {
    const service = createDailyFocusService();
    const occurrences = service.getNotificationOccurrences(inputs([checkIn(TODAY, [["stretch", "skipped"]])]));
    const stretchDates = occurrences
      .filter((item) => item.executionContract?.priorityId === "stretch")
      .map((item) => item.occurrenceDate);
    expect(stretchDates).not.toContain(TODAY);
    expect(stretchDates).toContain("2026-09-17");
    expect(occurrences.some((item) =>
      item.executionContract?.priorityId === "read" && item.occurrenceDate === TODAY
    )).toBe(true);
  });

  it("ignores a skip recorded for a different day (historical skips are unchanged)", () => {
    const service = createDailyFocusService();
    const focus = service.getDailyFocus(inputs([checkIn("2026-09-15", [["stretch", "skipped"]])]));
    expect(ids(focus)).toContain("stretch");
  });
});

// Execution-backed recovery Support (Foam Rolling): `recovery_reminder` →
// protocol category `recovery` → manual-completion `recovery` Execution item.
// Its Home row is keyed on `executionContract.priorityId` (the reminder id),
// so today's canonical skip removes it exactly like a plain reminder's.
function recoveryInputs(checkIns = []) {
  return {
    checkIns,
    protocols: [{ id: "protocol_foam", userId: "user", category: "recovery", name: "Foam Rolling", status: "active" }],
    executionItems: [{
      id: "execution_foam", userId: "user", type: "recovery", title: "Foam Rolling", active: true,
      linkedProtocolId: "protocol_foam", cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "17:00", startDate: "2026-07-23" },
      completionMethod: "manual",
    }],
    reminders: [
      reminder("reminder_foam", {
        title: "Foam Rolling", type: "recovery_reminder",
        linkedEntityType: "protocol", linkedEntityId: "protocol_foam",
        schedule: { type: "daily", timeOfDay: "17:00" },
      }),
      reminder("read"),
    ],
    now: NOW,
    timeZone: TIME_ZONE,
  };
}

describe("Daily Focus honors today's canonical skip for an execution-backed recovery Support reminder", () => {
  it("drops Foam Rolling skipped today from Home and keeps the others", () => {
    const service = createDailyFocusService();
    const before = service.getDailyFocus(recoveryInputs());
    expect(ids(before)).toEqual(expect.arrayContaining(["reminder_foam", "read"]));
    expect(before.find((item) => item.executionContract?.priorityId === "reminder_foam")).toMatchObject({
      label: "Foam Rolling", completable: true, completionId: "reminder_foam", executionId: "execution_foam",
    });

    const focus = service.getDailyFocus(recoveryInputs([checkIn(TODAY, [["reminder_foam", "skipped"]])]));
    expect(ids(focus)).not.toContain("reminder_foam");
    expect(ids(focus)).toContain("read");
  });

  it("drops only today's Foam Rolling occurrence from the notification horizon", () => {
    const service = createDailyFocusService();
    const occurrences = service.getNotificationOccurrences(recoveryInputs([checkIn(TODAY, [["reminder_foam", "skipped"]])]));
    const foamDates = occurrences
      .filter((item) => item.executionContract?.priorityId === "reminder_foam")
      .map((item) => item.occurrenceDate);
    expect(foamDates).not.toContain(TODAY);
    expect(foamDates).toContain("2026-09-17");
    expect(occurrences.some((item) =>
      item.executionContract?.priorityId === "read" && item.occurrenceDate === TODAY
    )).toBe(true);
  });

  it("ignores a Foam Rolling skip recorded for yesterday (today's row remains)", () => {
    const service = createDailyFocusService();
    const focus = service.getDailyFocus(recoveryInputs([checkIn("2026-09-15", [["reminder_foam", "skipped"]])]));
    expect(ids(focus)).toContain("reminder_foam");
  });
});
