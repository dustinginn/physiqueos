import fs from "node:fs";
import { describe, expect, it } from "vitest";
const direct = fs.readFileSync(new URL("./[scanId]/page.js", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("./preview/[scanId]/page.js", import.meta.url), "utf8");
const historical = fs.readFileSync(new URL("../review/[artifactId]/page.js", import.meta.url), "utf8");
describe("DEXA briefing routes", () => {
  it("direct route reads only the persisted scan identity and 404s unknown scans", () => { expect(direct).toContain("getProductionBriefingNavigationReadService"); expect(direct).toContain("getDexaArtifact({ scanId })"); expect(direct).toContain("if (!artifact) notFound()"); expect(direct).not.toMatch(/\.generate\(|\.preview\(|loadApplicationCanonicalRuntime/); });
  it("wires only an artifact-backed canonical Phase Review into production", () => {
    expect(direct).toContain("resolvePhaseReviewArtifactRead");
    expect(direct).toContain("phaseReviewRead.readOnly");
    expect(direct).toContain("submitProductionPhaseReviewDecision");
    expect(direct).toContain("PhaseReviewCard");
    expect(direct).not.toContain("PhaseReviewPreviewService");
  });
  it("preview composes production narrative without persistence", () => { expect(preview).toContain(".preview("); expect(preview).toContain("DEXAEventBriefingScreen"); expect(preview).not.toMatch(/\.generate\(/); });
  it("passes a validated Preview-only baseline query into composition", () => { expect(preview).toContain("searchParams"); expect(preview).toContain("baselineScanId: baseline"); expect(preview).not.toMatch(/createDailyBriefing|\.generate\(/); });
  it("Historical Review renders the persisted DEXA Event object", () => { expect(historical).toContain("artifact.briefing?.dexaEventNarrative"); expect(historical).toContain("DEXAEventBriefingScreen"); });
});
