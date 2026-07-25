import fs from "node:fs";
import {describe,expect,it} from "vitest";
const page=fs.readFileSync(new URL("./page.js",import.meta.url),"utf8");
describe("Weekly V4 preview route",()=>{it("uses the canonical production screen with only the preview adapter",()=>{expect(page).toContain("createWeeklyBriefingV4PreviewService");expect(page).toContain("WeeklyBriefingScreen");expect(page).toContain('query?.date??"2026-07-19"');expect(page).toContain(".preview(");expect(page).not.toMatch(/\.generate\(|createWeeklyNarrativeService|createDailyBriefing|WeeklyBriefingV4PreviewScreen/);});});
