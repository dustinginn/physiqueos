import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("Weekly direct route contract", () => {
  it("reads the latest persisted Weekly without generation or cadence gating", () => {
    expect(source).toContain(".getLatest({userId:user.id})");
    expect(source).not.toMatch(/getOrCreate|\.generate\(|\.regenerate\(/);
    expect(source).not.toMatch(/selectScheduledBriefingCadence|HomeBriefing|Sunday|weekday/i);
  });

  it("renders only a persisted Weekly artifact and has a clean unavailable state", () => {
    expect(source).toContain("WeeklyBriefingScreen");
    expect(source).toContain("PersistedLegacyWeeklyScreen");
    expect(source).toContain("No persisted Weekly Briefing is available yet.");
    expect(source).not.toMatch(/getLatestDailyBriefing|getLatestScheduledDailyBriefing/);
  });
});
