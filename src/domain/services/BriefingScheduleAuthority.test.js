import { describe, expect, it } from "vitest";
import {
  BRIEFING_DEFAULT_TIME_ZONE,
  BRIEFING_GENERATION_LOCAL_TIME,
  hasReachedBriefingGenerationTime,
  resolveBriefingDueInstant,
  resolveBriefingTimeZone,
  resolveNextBriefingDueTimes,
} from "./BriefingScheduleAuthority";

const LA = "America/Los_Angeles";

describe("briefing schedule authority", () => {
  it("is one 03:00 local generation time", () => {
    expect(BRIEFING_GENERATION_LOCAL_TIME).toBe("03:00");
    expect(hasReachedBriefingGenerationTime("02:59")).toBe(false);
    expect(hasReachedBriefingGenerationTime("03:00")).toBe(true);
    expect(hasReachedBriefingGenerationTime("23:59")).toBe(true);
    expect(hasReachedBriefingGenerationTime("00:00")).toBe(false);
    expect(hasReachedBriefingGenerationTime(null)).toBe(false);
  });

  it("resolves the briefing timezone from configuration, then profile, then the product default", () => {
    expect(resolveBriefingTimeZone({
      coachingUpdates: { timeZone: "America/New_York" },
      user: { timeZone: LA },
    })).toBe("America/New_York");
    expect(resolveBriefingTimeZone({ user: { timeZone: "America/Denver" } }))
      .toBe("America/Denver");
    expect(resolveBriefingTimeZone()).toBe(BRIEFING_DEFAULT_TIME_ZONE);
    // Never the server's own timezone.
    expect(resolveBriefingTimeZone({ coachingUpdates: {}, user: {} })).toBe(LA);
  });

  describe("due instant", () => {
    it.each([
      ["daylight time", "2026-09-23", "2026-09-23T10:00:00.000Z"],
      ["standard time", "2026-12-02", "2026-12-02T11:00:00.000Z"],
      // Spring forward: the skipped hour is 02:00-02:59, so 03:00 PDT is 10:00Z.
      ["spring-forward day", "2027-03-14", "2027-03-14T10:00:00.000Z"],
      // Fall back: 01:00-01:59 repeats, 03:00 PST occurs once at 11:00Z.
      ["fall-back day", "2026-11-01", "2026-11-01T11:00:00.000Z"],
      ["the following fall-back day", "2027-11-07", "2027-11-07T11:00:00.000Z"],
    ])("resolves 03:00 local on %s", (_label, localDate, expected) => {
      expect(resolveBriefingDueInstant({ localDate, timeZone: LA }).toISOString())
        .toBe(expected);
    });

    it("resolves the same wall-clock time in other zones, including a positive UTC offset", () => {
      expect(resolveBriefingDueInstant({
        localDate: "2026-09-23", timeZone: "Europe/London",
      }).toISOString()).toBe("2026-09-23T02:00:00.000Z");
      expect(resolveBriefingDueInstant({
        localDate: "2026-09-23", timeZone: "Pacific/Auckland",
      }).toISOString()).toBe("2026-09-22T15:00:00.000Z");
    });

    it("is the first instant at or after 03:00 on its own local date", () => {
      for (const localDate of ["2026-11-01", "2027-03-14", "2026-09-23"]) {
        const due = resolveBriefingDueInstant({ localDate, timeZone: LA });
        expect(localClock(due)).toEqual({ date: localDate, time: "03:00" });
        expect(localClock(new Date(due.valueOf() - 60_000)).time < "03:00" ||
          localClock(new Date(due.valueOf() - 60_000)).date < localDate).toBe(true);
      }
    });
  });

  describe("next due times", () => {
    const founderSchedule = {
      midweek: { enabled: true, day: "wednesday", localTime: "05:30" },
      weekly: { enabled: true, day: "sunday", localTime: "05:30" },
      monthly: { enabled: true, dayOfMonth: 1, localTime: "05:30" },
    };

    it("resolves Midweek, Weekly, and Monthly to 03:00 local regardless of a stored localTime", () => {
      const next = resolveNextBriefingDueTimes({
        now: new Date("2026-09-21T17:00:00.000Z"),
        timeZone: LA,
        coachingUpdates: founderSchedule,
      });
      expect(next).toEqual({
        midweek: { localDate: "2026-09-23", localTime: "03:00", timeZone: LA, dueAt: "2026-09-23T10:00:00.000Z" },
        weekly: { localDate: "2026-09-27", localTime: "03:00", timeZone: LA, dueAt: "2026-09-27T10:00:00.000Z" },
        monthly: { localDate: "2026-10-01", localTime: "03:00", timeZone: LA, dueAt: "2026-10-01T10:00:00.000Z" },
      });
    });

    it("keeps today's cadence until its 03:00 due instant passes, then rolls a full period", () => {
      const before = resolveNextBriefingDueTimes({
        now: new Date("2026-09-27T09:59:59.999Z"), timeZone: LA, coachingUpdates: founderSchedule,
      });
      expect(before.weekly.localDate).toBe("2026-09-27");
      const at = resolveNextBriefingDueTimes({
        now: new Date("2026-09-27T10:00:00.000Z"), timeZone: LA, coachingUpdates: founderSchedule,
      });
      expect(at.weekly.localDate).toBe("2026-10-04");
      expect(at.midweek.localDate).toBe("2026-09-30");
    });

    it("rolls Monthly across the year and preserves the 1st", () => {
      const next = resolveNextBriefingDueTimes({
        now: new Date("2026-12-15T20:00:00.000Z"), timeZone: LA, coachingUpdates: founderSchedule,
      });
      expect(next.monthly).toMatchObject({
        localDate: "2027-01-01", dueAt: "2027-01-01T11:00:00.000Z",
      });
    });

    it("resolves through the daylight-saving transitions without shifting the cadence date", () => {
      const spring = resolveNextBriefingDueTimes({
        now: new Date("2027-03-10T20:00:00.000Z"), timeZone: LA, coachingUpdates: founderSchedule,
      });
      expect(spring.weekly).toMatchObject({ localDate: "2027-03-14", dueAt: "2027-03-14T10:00:00.000Z" });
      const fall = resolveNextBriefingDueTimes({
        now: new Date("2026-10-28T20:00:00.000Z"), timeZone: LA, coachingUpdates: founderSchedule,
      });
      expect(fall.weekly).toMatchObject({ localDate: "2026-11-01", dueAt: "2026-11-01T11:00:00.000Z" });
      expect(fall.monthly).toMatchObject({ localDate: "2026-11-01", dueAt: "2026-11-01T11:00:00.000Z" });
    });

    it("omits a disabled cadence", () => {
      const next = resolveNextBriefingDueTimes({
        now: new Date("2026-09-21T17:00:00.000Z"),
        timeZone: LA,
        coachingUpdates: { ...founderSchedule, midweek: { enabled: false, day: "wednesday" } },
      });
      expect(next.midweek).toBeNull();
      expect(next.weekly).not.toBeNull();
    });
  });
});

function localClock(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LA,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}
