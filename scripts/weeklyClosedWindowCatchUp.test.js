import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/weeklyClosedWindowCatchUp.js"), "utf8");

describe("controlled Weekly catch-up command", () => {
  it("requires exact bounded parameters and defaults to dry-run", () => {
    expect(source).toContain('const REQUIRED = ["start", "end", "briefing-date", "time-zone", "expected-artifact-id"]');
    expect(source).toContain('mode: args.execute === true ? "execute" : "dry_run"');
  });
  it("requires the explicit execute flag and exposes no retry or public route", () => {
    expect(source).toContain('item === "--execute"');
    expect(source).not.toMatch(/retry|fetch\(|route\.js|setTimeout/);
  });
  it("uses the canonical application service and structured typed output", () => {
    expect(source).toMatch(/createFounderWeeklyNarrativeService/);
    expect(source).toMatch(/JSON\.stringify/);
    expect(source).toMatch(/process\.exitCode = 1/);
  });
});
