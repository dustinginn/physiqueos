import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Midweek preview route boundary",()=>{
  it("uses only the preview service and has no production action or persistence import",()=>{
    const source=fs.readFileSync(path.resolve(process.cwd(),"src/app/briefings/midweek/preview/page.js"),"utf8");
    expect(source).toContain("createMidweekBriefingPreviewService");
    expect(source).not.toMatch(/actions|createDailyBriefing|persist|schedule|notification|HomeBriefing/i);
  });
});
