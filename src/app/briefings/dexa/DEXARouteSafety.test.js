import fs from "node:fs";
import { describe, expect, it } from "vitest";
const direct = fs.readFileSync(new URL("./[scanId]/page.js", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("./preview/[scanId]/page.js", import.meta.url), "utf8");
const historical = fs.readFileSync(new URL("../review/[artifactId]/page.js", import.meta.url), "utf8");
describe("DEXA briefing routes", () => {
  it("direct route reads a persisted final without generating", () => { expect(direct).toContain("getByScanId"); expect(direct).not.toMatch(/\.generate\(|\.preview\(/); });
  it("preview composes production narrative without persistence", () => { expect(preview).toContain(".preview("); expect(preview).toContain("DEXAEventBriefingScreen"); expect(preview).not.toMatch(/\.generate\(/); });
  it("passes a validated Preview-only baseline query into composition", () => { expect(preview).toContain("searchParams"); expect(preview).toContain("baselineScanId: baseline"); expect(preview).not.toMatch(/createDailyBriefing|\.generate\(/); });
  it("Historical Review renders the persisted DEXA Event object", () => { expect(historical).toContain("artifact.briefing?.dexaEventNarrative"); expect(historical).toContain("DEXAEventBriefingScreen"); });
});
