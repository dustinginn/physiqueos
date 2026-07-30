import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");

describe("Briefing History safety", () => {
  it("remains read-only and wraps deterministic artifact identities on mobile", () => {
    expect(source).not.toMatch(
      /generateForCurrentWindow|createDailyBriefing|claimScheduledBriefing|\.publish\(/
    );
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
  });
});
