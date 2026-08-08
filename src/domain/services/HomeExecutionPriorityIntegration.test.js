import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Home Execution priority integration boundary", () => {
  it("passes canonical Execution, timezone, and one captured instant into Daily Focus", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/domain/services/HomeBriefingService.js"
      ),
      "utf8"
    );
    const call = source.slice(
      source.indexOf("const todaysFocus = DailyFocusService.getDailyFocus"),
      source.indexOf("const actionPlan")
    );

    expect(call).toContain("executionItems");
    expect(call).toContain("timeZone: homeTimeZone");
    expect(call).toContain("now: now()");
    expect(call).not.toContain("doseHistory");
  });

});
