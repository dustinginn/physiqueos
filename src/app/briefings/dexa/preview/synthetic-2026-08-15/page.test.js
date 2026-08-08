import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const diagnostics = fs.readFileSync(new URL("./diagnostics/route.js", import.meta.url), "utf8");

describe("synthetic DEXA V2 preview route", () => {
  it("uses only the isolated deterministic preview composition", () => {
    expect(source).toContain("createSyntheticDexaV2Preview");
    expect(source).toContain("DEXAEventBriefingScreen");
    expect(source).toContain("PhaseReviewCard");
    expect(source).toContain("preview.phaseReview");
    expect(`${source}\n${diagnostics}`).not.toMatch(/FounderRepositories|\.generate\(|\.persist\(|createDailyBriefing/);
  });
  it("has no production decision, Goal, Home, publication, or notification dependency", () => {
    expect(`${source}\n${diagnostics}`).not.toMatch(/GoalTransition|HomeBriefing|notification|protocol|server action|\.save\(|\.update\(|\.publish\(/i);
  });
  it("exposes canonical diagnostics without any mutation endpoint", () => {
    expect(diagnostics).toContain("preview.diagnostics");
    expect(diagnostics).toContain("export function GET");
    expect(diagnostics).not.toMatch(/POST|PUT|PATCH|DELETE/);
  });
});
