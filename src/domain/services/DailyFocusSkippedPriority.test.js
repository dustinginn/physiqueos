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
