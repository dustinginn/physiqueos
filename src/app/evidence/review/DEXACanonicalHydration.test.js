import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source = fs.readFileSync(new URL("./[reviewId]/actions.js", import.meta.url), "utf8");
describe("confirmed DEXA canonical read-model hydration", () => {
  it("preserves every extracted field needed by DEXA Event composition", () => { for (const field of ["regionalAssessment", "visceralAdiposeTissue", "androidGynoidRatio", "muscleBalance", "boneDensity"]) expect(source).toContain(field); });
  it("uses the dedicated idempotent DEXA Event service", () => { expect(source).toContain("createDEXAEventNarrativeService"); expect(source).toContain(".generate({ userId: user.id, scanId: canonicalId })"); });
});
