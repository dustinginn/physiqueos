import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("validation build isolation", () => {
  it.each([
    ["validateFoundationPhase1.mjs", ".next-phase1-validation"],
    ["validatePhase2Foundation.mjs", ".next-phase2-validation"],
    ["validatePhase3ApplicationBoundary.mjs", ".next-phase3-validation"],
    ["validatePhase4Foundation.mjs", ".next-phase4-validation"],
    ["validatePhase5Foundation.mjs", ".next-phase5-validation"],
    ["validatePhase6Compatibility.mjs", ".next-phase6-validation"],
  ])("keeps %s away from the canonical .next artifact", (scriptName, isolatedDirectory) => {
    const source = fs.readFileSync(path.join(process.cwd(), "scripts", scriptName), "utf8");
    expect(source).toContain(`PHYSIQUEOS_BUILD_DIST_DIR: "${isolatedDirectory}"`);
    expect(source).toContain("fs.rmSync(isolatedDist, { recursive: true, force: true })");
  });

  it("uses the isolated Next build path for Phase 6", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "scripts", "validatePhase6Compatibility.mjs"), "utf8");
    expect(source).toContain('[next, "build"]');
  });
});
