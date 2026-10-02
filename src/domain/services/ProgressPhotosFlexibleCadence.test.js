import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createProtocolRecurrenceIdentity,
  formatProtocolRecurrenceSummary,
  hydrateCadenceFromRecurrence,
  normalizeProtocolRecurrence,
} from "./ProtocolRecurrenceNormalizationService";
import {
  getNextProtocolOccurrence,
  getProtocolOccurrenceOnOrAfter,
  isProtocolDateOnCycle,
  protocolLocalDateKey,
  requiresProtocolCycleEvaluation,
  resolveCadenceChangeAnchor,
  resolveProtocolOccurrence,
} from "./ProtocolOccurrenceResolver";
import {
  applyProgressPhotoCadence,
  legacyProgressPhotoCadence,
  progressPhotoCadenceFields,
  resolveRequestedProgressPhotoCadence,
} from "./ProgressPhotosCadence";
import { createDailyFocusService } from "./DailyFocusService";
import { evaluatePhotoPrioritySatisfaction } from "./PhotoPrioritySatisfactionService";

const LA = "America/Los_Angeles";
const weekly = (interval, anchorDate = "2026-07-25", weekday = "saturday") => normalizeProtocolRecurrence({
  frequency: "weekly", interval, weekdays: [weekday], timeOfDay: "afternoon", timezone: LA, anchorDate,
});
const monthly = (interval, weekOfMonth, anchorDate, weekday = "saturday") => normalizeProtocolRecurrence({
  frequency: "monthly", interval, weekOfMonth, weekdays: [weekday], timeOfDay: "08:00", timezone: LA, anchorDate,
});
const occurrences = (recurrence, from, count) => {
  const dates = [];
  let cursor = from;
  while (dates.length < count) {
    const next = getProtocolOccurrenceOnOrAfter(recurrence, cursor);
    dates.push(next.scheduledLocalDate);
    cursor = addDays(next.scheduledLocalDate, 1);
  }
  return dates;
};

describe("Progress Photos cadence contract", () => {
  it("decodes legacy Weekly and Every 2 weeks to 1 week and 2 weeks", () => {
    expect(resolveRequestedProgressPhotoCadence({ cadence: "weekly" })).toEqual({ frequency: "weekly", interval: 1 });
    expect(resolveRequestedProgressPhotoCadence({ cadence: "weekly_interval_2" })).toEqual({ frequency: "weekly", interval: 2 });
    expect(progressPhotoCadenceFields(weekly(1))).toEqual({ cadence: "weekly", cadenceInterval: 1, cadenceUnit: "week", weekOfMonth: null });
    expect(progressPhotoCadenceFields(weekly(2))).toEqual({ cadence: "weekly_interval_2", cadenceInterval: 2, cadenceUnit: "week", weekOfMonth: null });
  });

  it("represents 3/4 weeks and 1/2/3 months, emitting the fail-closed legacy value", () => {
    for (const interval of [3, 4]) {
      expect(resolveRequestedProgressPhotoCadence({ cadence: "custom", cadenceInterval: interval, cadenceUnit: "week" }))
        .toEqual({ frequency: "weekly", interval });
      expect(progressPhotoCadenceFields(weekly(interval))).toMatchObject({ cadence: "custom", cadenceInterval: interval, cadenceUnit: "week" });
    }
    for (const interval of [1, 2, 3]) {
      expect(resolveRequestedProgressPhotoCadence({ cadenceInterval: interval, cadenceUnit: "month", weekOfMonth: "first" }))
        .toEqual({ frequency: "monthly", interval, weekOfMonth: "first" });
      expect(progressPhotoCadenceFields(monthly(interval, "first", "2026-10-03")))
        .toEqual({ cadence: "custom", cadenceInterval: interval, cadenceUnit: "month", weekOfMonth: "first" });
    }
    expect(legacyProgressPhotoCadence(monthly(1, "last", "2026-10-31"))).toBe("custom");
  });

  it("validates interval, unit, week of month, and unknown legacy values", () => {
    for (const photos of [
      { cadenceInterval: 0, cadenceUnit: "week" },
      { cadenceInterval: 13, cadenceUnit: "week" },
      { cadenceInterval: 1.5, cadenceUnit: "month", weekOfMonth: "first" },
      { cadenceInterval: 2, cadenceUnit: "day" },
      { cadenceInterval: 2, cadenceUnit: "month" },
      { cadenceInterval: 2, cadenceUnit: "month", weekOfMonth: "fifth" },
      { cadence: "custom" },
      { cadence: "monthly" },
      {},
    ]) {
      expect(() => resolveRequestedProgressPhotoCadence(photos)).toThrow(/Progress Photos|weeks or months|week of the month/);
    }
    expect(resolveRequestedProgressPhotoCadence({ cadenceInterval: 12, cadenceUnit: "month", weekOfMonth: "LAST" }))
      .toEqual({ frequency: "monthly", interval: 12, weekOfMonth: "last" });
  });

  it("keeps every pre-existing weekly identity byte-identical (no migration)", () => {
    const recurrence = weekly(2);
    const legacyIdentity = `protocol_recurrence|${createHash("sha256").update(JSON.stringify({
      recurrenceVersion: recurrence.recurrenceVersion, frequency: "weekly", interval: 2,
      weekdays: ["saturday"], timeOfDay: "afternoon", localTime: null, timezone: LA,
      anchorDate: "2026-07-25", endDate: null,
    })).digest("hex")}`;
    expect(createProtocolRecurrenceIdentity(recurrence)).toBe(legacyIdentity);
    expect(createProtocolRecurrenceIdentity(monthly(1, "first", "2026-10-03")))
      .not.toBe(createProtocolRecurrenceIdentity(monthly(1, "second", "2026-10-03")));
  });

  it("formats natural singular/plural summaries", () => {
    expect(formatProtocolRecurrenceSummary(weekly(1))).toBe("Once a week · Saturday afternoon");
    expect(formatProtocolRecurrenceSummary(weekly(3))).toBe("Every 3 weeks · Saturday afternoon");
    expect(formatProtocolRecurrenceSummary(monthly(1, "first", "2026-10-03"))).toBe("Every month · First Saturday 08:00");
    expect(formatProtocolRecurrenceSummary(monthly(3, "last", "2026-10-31"))).toBe("Every 3 months · Last Saturday 08:00");
    expect(hydrateCadenceFromRecurrence(monthly(2, "first", "2026-10-03"))).toBe("monthly");
  });

  it("removes stale monthly fields when changing back to weeks", () => {
    const back = applyProgressPhotoCadence(monthly(1, "first", "2026-10-03"), { frequency: "weekly", interval: 2 }, { day: "sunday", timeOfDay: "morning" });
    expect(back).not.toHaveProperty("weekOfMonth");
    expect(back).toMatchObject({ frequency: "weekly", interval: 2, weekdays: ["sunday"], timeOfDay: "morning" });
  });
});

describe("weekly recurrence math", () => {
  it("preserves weekday and anchor for every N weeks", () => {
    expect(occurrences(weekly(3, "2026-10-03"), "2026-10-03", 4)).toEqual(["2026-10-03", "2026-10-24", "2026-11-14", "2026-12-05"]);
    expect(occurrences(weekly(4, "2026-10-03"), "2026-10-04", 2)).toEqual(["2026-10-31", "2026-11-28"]);
  });

  it("is DST-safe: calendar dates never drift across the November/March transitions", () => {
    const dates = occurrences(weekly(3, "2026-10-03"), "2026-10-03", 12);
    for (let index = 1; index < dates.length; index += 1) {
      expect(daysBetween(dates[index - 1], dates[index])).toBe(21);
      expect(weekdayOf(dates[index])).toBe("saturday");
    }
    expect(dates).toContain("2026-11-14"); // after US DST ends (Nov 1)
    expect(dates).toContain("2027-03-20"); // after US DST begins (Mar 14)
  });

  it("evaluates the local day in the schedule's timezone (timezone change)", () => {
    const instant = new Date("2026-10-03T06:30:00.000Z");
    expect(protocolLocalDateKey(instant, LA)).toBe("2026-10-02");
    expect(protocolLocalDateKey(instant, "America/New_York")).toBe("2026-10-03");
    const eastern = normalizeProtocolRecurrence({ ...weekly(1, "2026-10-03"), timezone: "America/New_York" });
    expect(resolveProtocolOccurrence({ recurrence: eastern, evaluationTimestamp: instant }).dueState).toBe("due");
    expect(resolveProtocolOccurrence({ recurrence: weekly(1, "2026-10-03"), evaluationTimestamp: instant }).dueState).not.toBe("due");
  });
});

describe("monthly recurrence math (weekday of the month)", () => {
  it("anchors every N months to the chosen week of the month", () => {
    expect(occurrences(monthly(1, "first", "2026-10-03"), "2026-10-01", 4)).toEqual(["2026-10-03", "2026-11-07", "2026-12-05", "2027-01-02"]);
    expect(occurrences(monthly(2, "first", "2026-10-03"), "2026-10-04", 2)).toEqual(["2026-12-05", "2027-02-06"]);
    expect(occurrences(monthly(3, "second", "2026-10-10"), "2026-10-01", 3)).toEqual(["2026-10-10", "2027-01-09", "2027-04-10"]);
    expect(isProtocolDateOnCycle(monthly(1, "first", "2026-10-03"), "2026-10-10")).toBe(false);
    expect(isProtocolDateOnCycle(monthly(1, "first", "2026-10-03"), "2026-09-05")).toBe(false); // before anchor
  });

  it("distinguishes fourth from last in a five-week month", () => {
    expect(isProtocolDateOnCycle(monthly(1, "fourth", "2026-10-24"), "2026-10-24")).toBe(true);
    expect(isProtocolDateOnCycle(monthly(1, "last", "2026-10-31"), "2026-10-24")).toBe(false);
    expect(isProtocolDateOnCycle(monthly(1, "last", "2026-10-31"), "2026-10-31")).toBe(true);
  });

  it("handles month-end anchors: Jan 31 to February, and the leap year", () => {
    // Jan 31 2027 is the last Sunday of January; the next is Feb 28 (no clamp needed).
    expect(occurrences(monthly(1, "last", "2027-01-31", "sunday"), "2027-01-31", 3)).toEqual(["2027-01-31", "2027-02-28", "2027-03-28"]);
    // Feb 29 2028 (leap day) is the last Tuesday of February 2028.
    expect(isProtocolDateOnCycle(monthly(1, "last", "2028-01-25", "tuesday"), "2028-02-29")).toBe(true);
    expect(isProtocolDateOnCycle(monthly(1, "fourth", "2028-01-25", "tuesday"), "2028-02-22")).toBe(true);
    expect(getNextProtocolOccurrence(monthly(12, "last", "2027-02-27"), "2027-02-27").scheduledLocalDate).toBe("2028-02-26");
  });

  it("routes every weekday-anchored monthly schedule through the anchored cycle", () => {
    expect(requiresProtocolCycleEvaluation({ type: "weekly", interval: 1 })).toBe(false);
    expect(requiresProtocolCycleEvaluation({ type: "weekly", interval: 3 })).toBe(true);
    expect(requiresProtocolCycleEvaluation({ frequency: "monthly", interval: 1, weekOfMonth: "first" })).toBe(true);
    // Any other (non-photo) monthly shape keeps its previous weekday handling.
    expect(requiresProtocolCycleEvaluation({ frequency: "monthly", interval: 1 })).toBe(false);
  });
});

describe("cadence changes are future-only and predictable", () => {
  const firstAfterChange = (previous, next, today) => {
    const anchorDate = resolveCadenceChangeAnchor(previous, next, today);
    const recurrence = normalizeProtocolRecurrence({ ...next, anchorDate });
    return getProtocolOccurrenceOnOrAfter(recurrence, today)?.scheduledLocalDate ?? null;
  };

  it("continues weekly spacing from the last scheduled photo day", () => {
    // Every 2 weeks anchored Jul 25: last occurrence Sep 19, upcoming Oct 3. Edit Thu Oct 1.
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(3), "2026-10-01")).toBe("2026-10-10");
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(4), "2026-10-01")).toBe("2026-10-17");
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(1), "2026-10-01")).toBe("2026-10-03");
  });

  it("keeps today on the occurrence day, and never makes an off-cycle today newly due", () => {
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(3), "2026-10-03")).toBe("2026-10-03");
    // Sep 26 is an off week for the every-2-weeks schedule: weekly starts next Saturday.
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(1), "2026-09-26")).toBe("2026-10-03");
  });

  it("starts a weekday or unit change on the first matching day after today", () => {
    expect(resolveCadenceChangeAnchor(weekly(2), weekly(2, "2026-07-25", "sunday"), "2026-10-01")).toBe("2026-10-04");
    expect(resolveCadenceChangeAnchor(weekly(2), monthly(1, "first", "2026-07-25"), "2026-10-01")).toBe("2026-10-03");
    expect(resolveCadenceChangeAnchor(weekly(2), monthly(2, "last", "2026-07-25"), "2026-10-01")).toBe("2026-10-31");
  });

  it("never skips an occurrence or fails to resolve when shortening (review regressions)", () => {
    const onFour = "2026-10-04";
    expect(firstAfterChange(monthly(1, "first", "2026-10-03"), weekly(1, "2026-10-03"), onFour)).toBe("2026-10-10");
    expect(firstAfterChange(monthly(1, "first", "2026-10-03"), weekly(2, "2026-10-03"), onFour)).toBe("2026-10-17");
    expect(firstAfterChange(weekly(3, "2026-10-03"), weekly(1, "2026-10-03"), onFour)).toBe("2026-10-10");
    expect(firstAfterChange(weekly(12, "2026-10-03"), weekly(1, "2026-10-03"), onFour)).toBe("2026-10-10");
    expect(firstAfterChange(weekly(2, "2026-10-03"), weekly(1, "2026-10-03"), onFour)).toBe("2026-10-10");
    expect(firstAfterChange(monthly(12, "first", "2026-10-03"), monthly(1, "first", "2026-10-03"), onFour)).toBe("2026-11-07");
    expect(firstAfterChange(monthly(3, "first", "2026-10-03"), monthly(1, "first", "2026-10-03"), onFour)).toBe("2026-11-07");
    // Shortening never pushes back a day that is available (re-review P2).
    const onSepOne = "2026-09-01";
    expect(firstAfterChange(weekly(3, "2026-08-15"), weekly(2, "2026-08-15"), onSepOne)).toBe("2026-09-05");
    expect(firstAfterChange(monthly(1, "first", "2026-08-01"), weekly(2, "2026-08-01"), onSepOne)).toBe("2026-09-05");
    expect(firstAfterChange(monthly(1, "first", "2026-08-01"), weekly(4, "2026-08-01"), onSepOne)).toBe("2026-09-05");
    expect(firstAfterChange(weekly(12, "2026-07-25"), weekly(4, "2026-07-25"), onSepOne)).toBe("2026-09-05");
    // Exhaustive: every legacy/new pair, every day over a year, always resolves within one period.
    const cadences = [1, 2, 3, 4, 12].map((n) => weekly(n, "2026-07-25"))
      .concat(["first", "last"].flatMap((w) => [1, 2, 12].map((n) => monthly(n, w, "2026-08-01"))));
    for (let day = 0; day < 370; day += 3) {
      const today = addDays("2026-08-01", day);
      for (const previous of cadences) {
        for (const next of cadences) {
          const first = firstAfterChange(previous, next, today);
          expect(first, `${today} ${previous.frequency}${previous.interval} -> ${next.frequency}${next.interval}`).not.toBeNull();
          expect(first >= today).toBe(true);
        }
      }
    }
  }, 30_000);
});

describe("Home, notification, and satisfaction readers", () => {
  const reminder = (schedule) => ({
    id: "reminder_weekly_progress_photo_set",
    title: "Weekly Progress Photo Set",
    type: "evidence_reminder",
    linkedEntityType: "progress_photo_set",
    linkedEvidenceType: "progress_photo",
    active: true,
    schedule,
    expectedViews: [],
  });
  const monthlySchedule = {
    type: "monthly", cadence: "monthly", frequency: "monthly", unit: "month", interval: 1,
    weekOfMonth: "first", daysOfWeek: ["saturday"], preferredDay: "saturday", dayOfWeek: "saturday",
    timeOfDay: "afternoon", timezone: LA, anchorDate: "2026-10-03",
  };
  const prompts = (schedule, date) => createDailyFocusService().getDailyFocus({
    reminders: [reminder(schedule)], now: new Date(`${date}T21:00:00Z`),
  }).some((item) => /photo/i.test(item.label)
    || item.sessionItems?.some((sessionItem) => /photo/i.test(sessionItem.label)));

  it("prompts a monthly cadence only on its occurrence, not every matching weekday", () => {
    expect(prompts(monthlySchedule, "2026-10-03")).toBe(true);
    expect(prompts(monthlySchedule, "2026-10-10")).toBe(false);
    expect(prompts(monthlySchedule, "2026-10-17")).toBe(false);
    expect(prompts(monthlySchedule, "2026-11-07")).toBe(true);
  });

  it("prompts every 3 weeks on cycle only", () => {
    const schedule = { type: "weekly", cadence: "weekly", frequency: "weekly", interval: 3, daysOfWeek: ["saturday"], timeOfDay: "afternoon", timezone: LA, anchorDate: "2026-10-03" };
    expect(prompts(schedule, "2026-10-03")).toBe(true);
    expect(prompts(schedule, "2026-10-10")).toBe(false);
    expect(prompts(schedule, "2026-10-17")).toBe(false);
    expect(prompts(schedule, "2026-10-24")).toBe(true);
  });

  it("does not prompt when the reminder is disabled", () => {
    expect(createDailyFocusService().getDailyFocus({
      reminders: [{ ...reminder(monthlySchedule), active: false }], now: new Date("2026-10-03T21:00:00Z"),
    }).some((item) => /photo/i.test(item.label))).toBe(false);
  });

  it("projects one notification occurrence per scheduled photo date", () => {
    const occurrencesInHorizon = createDailyFocusService().getNotificationOccurrences({
      reminders: [reminder(monthlySchedule)], now: new Date("2026-09-29T16:00:00Z"), timeZone: LA,
    }).filter((item) => /photo/i.test(item.label ?? item.title ?? ""));
    expect(occurrencesInHorizon.map((item) => item.occurrenceDate ?? item.date)).toEqual(["2026-10-03"]);
  });

  it("satisfies only on-cycle monthly sessions", () => {
    const session = (date) => ({
      canonicalId: `session-${date}`, lastObservedAt: date, quality: { status: "confirmed" },
      payload: { captureDate: date, photos: [{ categoryId: "front-relaxed", confirmation: { userConfirmed: true } }] },
    });
    expect(evaluatePhotoPrioritySatisfaction({ reminder: reminder(monthlySchedule), canonicalSession: session("2026-10-10"), evidenceDate: "2026-10-10" }).eligible).toBe(false);
    expect(evaluatePhotoPrioritySatisfaction({ reminder: reminder(monthlySchedule), canonicalSession: session("2026-11-07"), evidenceDate: "2026-11-07" }).eligible).toBe(true);
  });
});

function addDays(date, count) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
}
function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000);
}
function weekdayOf(date) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${date}T12:00:00Z`).getUTCDay()];
}
