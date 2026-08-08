import { describe, expect, it } from "vitest";
import {
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
