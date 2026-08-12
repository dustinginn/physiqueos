import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync(path.join(process.cwd(), "scripts", "deployPhysiqueOS.ps1"), "utf8");

describe("canonical deployment lifecycle", () => {
  it("builds and stages isolated source before stopping production", () => {
    const branch = between(
      'if ($UsesIsolatedSource) {',
      "\n    else {\n        Write-Step \"1. Stopping the current production runtime\"",
    );
    expect(branch.indexOf("Invoke-SourceBuild")).toBeGreaterThan(-1);
    expect(branch.indexOf("Stage-IsolatedBuild")).toBeGreaterThan(branch.indexOf("Invoke-SourceBuild"));
    expect(branch.indexOf("Invoke-ProductionStop")).toBeGreaterThan(branch.indexOf("Stage-IsolatedBuild"));
    expect(branch.indexOf("Promote-IsolatedBuild")).toBeGreaterThan(branch.indexOf("Invoke-ProductionStop"));
  });

  it("can promote the exact preflighted artifact only from clean matching isolated source", () => {
    expect(script).toContain("-UsePrebuiltArtifact requires an explicitly supplied isolated source root.");
    expect(script).toContain("Deployment source contains tracked working-tree changes.");
    expect(script).toContain("Canonical repository contains tracked working-tree changes.");
    expect(script).toContain("Using the explicitly supplied preflighted artifact.");
    expect(script).toContain("does not contain an immutable source identity");
    expect(script).toContain("does not match deployment source");
  });

  it("stops production before a canonical-source build", () => {
    const branch = between(
      "    else {\n        Write-Step \"1. Stopping the current production runtime\"",
      "    Write-Step \"3. Starting the canonical production runtime\"",
    );
    expect(branch.indexOf("Invoke-ProductionStop")).toBeGreaterThan(-1);
    expect(branch.indexOf("Invoke-SourceBuild")).toBeGreaterThan(branch.indexOf("Invoke-ProductionStop"));
  });

  it("fails closed on source, promoted build, and health identity mismatch", () => {
    expect(script).toContain("does not match canonical repository HEAD");
    expect(script).toContain("does not match promoted build");
    expect(script).toContain("does not match deployment source");
  });

  it("requires successful CSS and JavaScript responses with correct content types", () => {
    expect(script).toContain("^text/css(?:;|$)");
    expect(script).toContain("^(?:application|text)/javascript(?:;|$)");
    expect(script).toContain("failed status or content-type validation");
  });

  it("retains automatic rollback after artifact promotion", () => {
    expect(script).toContain("Attempting automatic rollback to the previous production build.");
    expect(script).toContain("Previous production build restored successfully.");
  });
});

function between(start, end) {
  const startIndex = script.indexOf(start);
  const endIndex = script.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return script.slice(startIndex, endIndex);
}
