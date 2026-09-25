import { describe, expect, it } from "vitest";
import {
  formatShortMonthDay,
  getLocalDateKey,
  getLocalDayWindow,
  getPreviousLocalDayWindow,
  resolveLocalTimeZone,
} from "./localDate";

describe("previous local calendar day window", () => {
  it("uses a half-open Pacific calendar-day range immediately after midnight", () => {
    expect(
      getPreviousLocalDayWindow({
        now: new Date("2026-07-29T07:00:01.000Z"),
        timeZone: "America/Los_Angeles",
      })
    ).toEqual({
      timeZone: "America/Los_Angeles",
      currentLocalDate: "2026-07-29",
      previousLocalDate: "2026-07-28",
      startInclusive: "2026-07-28T07:00:00.000Z",
      endExclusive: "2026-07-29T07:00:00.000Z",
    });
  });

  it("keeps the same previous date immediately before the next Pacific midnight", () => {
    const window = getPreviousLocalDayWindow({
      now: new Date("2026-07-30T06:59:59.999Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(window.previousLocalDate).toBe("2026-07-28");
    expect(window.currentLocalDate).toBe("2026-07-29");
  });

  it("uses the user date when UTC and Pacific dates differ", () => {
    const pacific = getPreviousLocalDayWindow({
      now: new Date("2026-07-29T03:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });
    const utc = getPreviousLocalDayWindow({
      now: new Date("2026-07-29T03:00:00.000Z"),
      timeZone: "UTC",
    });

    expect(pacific.currentLocalDate).toBe("2026-07-28");
    expect(pacific.previousLocalDate).toBe("2026-07-27");
    expect(utc.currentLocalDate).toBe("2026-07-29");
    expect(utc.previousLocalDate).toBe("2026-07-28");
  });

  it("handles a 25-hour daylight-saving transition as calendar dates", () => {
    const window = getPreviousLocalDayWindow({
      now: new Date("2026-11-02T17:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(window).toMatchObject({
      previousLocalDate: "2026-11-01",
      startInclusive: "2026-11-01T07:00:00.000Z",
      endExclusive: "2026-11-02T08:00:00.000Z",
    });
  });

  it("falls back to the canonical Pacific timezone when absent or invalid", () => {
    expect(resolveLocalTimeZone()).toBe("America/Los_Angeles");
    expect(resolveLocalTimeZone("not/a-timezone")).toBe(
      "America/Los_Angeles"
    );
  });
});

describe("cached time-zone formatting (performance)", () => {
  // Reference: the pre-cache implementation, constructing a formatter per call.
  function referenceDateKey(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
  }
  function referenceResolve(value) {
    const candidate = String(value ?? "").trim() || "America/Los_Angeles";
    try { new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date()); return candidate; }
    catch { return "America/Los_Angeles"; }
  }
  const zones = ["America/Los_Angeles", "America/New_York", "UTC", "Europe/London", "Australia/Lord_Howe", "Asia/Kathmandu", "Pacific/Chatham", "America/St_Johns"];
  const instants = [];
  for (let hour = 0; hour < 24 * 400; hour += 7) instants.push(new Date(Date.UTC(2025, 9, 1) + hour * 3_600_000 + 59 * 60_000));
  instants.push(new Date("2026-03-08T09:59:59.999Z"), new Date("2026-03-08T10:00:00.000Z"), new Date("2026-11-01T08:59:59.999Z"), new Date("2026-11-01T09:00:00.000Z"));

  it("matches the per-call formatter for every zone and instant, interleaved", () => {
    for (const instant of instants) {
      for (const zone of zones) {
        expect(getLocalDateKey(instant, zone)).toBe(referenceDateKey(instant, zone));
        expect(getLocalDateKey(instant.toISOString(), zone)).toBe(referenceDateKey(instant, zone));
      }
    }
  });

  it("keeps rejecting an invalid zone on every call instead of caching the failure", () => {
    expect(() => getLocalDateKey(new Date("2026-09-25T12:00:00Z"), "Not/AZone")).toThrow(RangeError);
    expect(() => getLocalDateKey(new Date("2026-09-25T12:00:00Z"), "Not/AZone")).toThrow(RangeError);
    expect(getLocalDateKey(new Date("2026-09-25T12:00:00Z"), "UTC")).toBe("2026-09-25");
  });

  it("resolves zones exactly like the uncached implementation, including invalid and blank values", () => {
    for (const value of [...zones, "Not/AZone", "", "  ", null, undefined, " UTC ", "utc", "Invalid"]) {
      expect(resolveLocalTimeZone(value)).toBe(referenceResolve(value));
      expect(resolveLocalTimeZone(value)).toBe(referenceResolve(value));
    }
  });

  it("stays correct when more zones are used than the cache holds", () => {
    const many = Intl.supportedValuesOf("timeZone").slice(0, 150);
    const instant = new Date("2026-09-25T23:30:00Z");
    for (const zone of [...many, ...many]) expect(getLocalDateKey(instant, zone)).toBe(referenceDateKey(instant, zone));
    for (const zone of many) expect(resolveLocalTimeZone(zone)).toBe(zone);
  });

  it("keeps local-midnight windows identical across DST changes", () => {
    const window = getLocalDayWindow({ dateKey: "2026-11-01", timeZone: "America/Los_Angeles" });
    expect(window.startInclusive).toBe("2026-11-01T07:00:00.000Z");
    expect(window.endExclusive).toBe("2026-11-02T08:00:00.000Z");
    const spring = getLocalDayWindow({ dateKey: "2026-03-08", timeZone: "America/Los_Angeles" });
    expect(spring.startInclusive).toBe("2026-03-08T08:00:00.000Z");
    expect(spring.endExclusive).toBe("2026-03-09T07:00:00.000Z");
  });
});

describe("formatShortMonthDay (cached toLocaleDateString equivalent)", () => {
  const reference = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  it("matches toLocaleDateString for local calendar dates across two years", () => {
    for (let offset = 0; offset < 800; offset += 1) {
      const date = new Date(2025, 0, 1 + offset);
      expect(formatShortMonthDay(date)).toBe(reference(date));
    }
  });

  it("matches for instants near midnight and for invalid dates", () => {
    for (const iso of ["2026-03-08T09:59:59Z", "2026-11-01T08:30:00Z", "2026-12-31T23:59:59Z", "2026-01-01T00:00:00Z"]) {
      expect(formatShortMonthDay(new Date(iso))).toBe(reference(new Date(iso)));
    }
    expect(formatShortMonthDay(new Date(Number.NaN))).toBe(reference(new Date(Number.NaN)));
    expect(formatShortMonthDay(new Date(undefined, Number.NaN, 1))).toBe("Invalid Date");
  });

  it("follows a runtime host time-zone change exactly like toLocaleDateString", () => {
    const previous = process.env.TZ;
    try {
      const instant = new Date("2026-09-26T03:30:00Z");
      for (const zone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
        process.env.TZ = zone;
        expect(formatShortMonthDay(instant)).toBe(reference(instant));
      }
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});
