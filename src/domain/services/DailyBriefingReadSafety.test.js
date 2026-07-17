import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Daily briefing route read safety", () => {
  it("keeps Home and Daily GET routes free of generation", () => {
    const dailyPage = fs.readFileSync("src/app/briefing/daily/page.js", "utf8");
    const homePage = fs.readFileSync("src/app/page.js", "utf8");
    expect(dailyPage).toContain("getPersistedDailyBriefing");
    expect(dailyPage).not.toMatch(/\.getDailyBriefing\(/);
    expect(homePage).not.toMatch(/generateScheduledDailyBriefing|\.getDailyBriefing\(/);
  });

  it("keeps Narrative Lab reads on a persisted-only accessor", () => {
    const page = fs.readFileSync("src/app/lab/narrative-engine/page.js", "utf8");
    const route = fs.readFileSync("src/app/api/lab/narrative-engine/route.js", "utf8");
    expect(page).toContain("getLatestPersistedDailyBriefing");
    expect(route).toContain("getLatestPersistedDailyBriefing");
    expect(`${page}\n${route}`).not.toMatch(/\.getDailyBriefing\(/);
  });
});
