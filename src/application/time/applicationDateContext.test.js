import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createApplicationDateContext } from "./applicationDateContext.js";

const principal = createAuthenticationPrincipal({ userId: "user-one", deviceId: "device-one", sessionId: "session-one" });

describe("shared application date context", () => {
  it("uses the owner time zone and a half-open local calendar day", () => {
    const context = createApplicationDateContext({ principal, userTimeZone: "America/Los_Angeles", now: new Date("2026-08-11T06:30:00Z") });
    expect(context).toMatchObject({ localDate: "2026-08-10", dayStartInclusive: "2026-08-10T07:00:00.000Z", dayEndExclusive: "2026-08-11T07:00:00.000Z" });
  });

  it("preserves 23-hour spring and 25-hour fall DST days", () => {
    const spring = createApplicationDateContext({ principal, userTimeZone: "America/Los_Angeles", localDate: "2026-03-08" });
    const fall = createApplicationDateContext({ principal, userTimeZone: "America/Los_Angeles", localDate: "2026-11-01" });
    expect(Date.parse(spring.dayEndExclusive) - Date.parse(spring.dayStartInclusive)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(fall.dayEndExclusive) - Date.parse(fall.dayStartInclusive)).toBe(25 * 60 * 60 * 1000);
  });

  it("rejects unauthenticated, invalid client-zone, and impossible-date inputs", () => {
    expect(() => createApplicationDateContext({ userTimeZone: "UTC" })).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    expect(() => createApplicationDateContext({ principal, clientTimeZone: "Mars/Olympus" })).toThrowError(expect.objectContaining({ code: "INVALID_TIME_ZONE" }));
    expect(() => createApplicationDateContext({ principal, localDate: "2026-02-31" })).toThrow("valid local calendar date");
  });
});
