// Static architectural proof for the Phase 6C worker-handoff channel and its relationship to the
// Phase 6A recovery trio. Worker activation must never mutate combined_runtime_authority, must never
// fabricate the first-write boundary, and neither recovery service may reach into worker control -
// pre-boundary recovery never needs to (workers can only ever activate AFTER the boundary, by this
// module's own precondition), and post-boundary forward recovery must never revert worker posture to
// Windows.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function readModule(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("ProductionWorkerHandoffService — authority isolation", () => {
  const raw = readModule("./ProductionWorkerHandoffService.js");
  const source = codeOnly(raw);

  it("never mutates runtime authority", () => {
    expect(source).not.toContain("authorityStore.transition(");
    expect(source).not.toContain("authorityStore.claimCanonicalWriteBoundary(");
  });

  it("never references a runtime-authority action (no transition capability of any kind)", () => {
    expect(source).not.toContain("RuntimeAuthorityAction");
  });

  it("never fabricates a first-write timestamp", () => {
    expect(source).not.toMatch(/firstProviderCanonicalWriteAt\s*[:=]\s*(?:now\(\)|new Date|Date\.now)/);
  });

  it("never imports the routing-control contract or the canonical-record write machinery", () => {
    const imports = raw.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    expect(imports).not.toMatch(/combinedCutoverRoutingControl\.js/);
    expect(imports).not.toMatch(/Phase4CanonicalRecordStore/);
  });

  it("the production worker-control default is fail-closed, never a silent synthetic success", () => {
    const controlSource = readModule("./combinedCutoverWorkerControl.js");
    expect(controlSource).toContain("WORKER_CONTROL_UNAVAILABLE");
    expect(controlSource).toContain("createUnavailableWorkerControl");
  });

  it("does not import the deterministic test-only worker-control double", () => {
    expect(raw).not.toContain("deterministicWorkerControl");
  });
});

describe("pre-boundary Windows authority restoration never touches worker control", () => {
  it("ProductionWindowsAuthorityRestorationService.js imports no worker-control module - pre-boundary recovery never needs to restore worker posture, since workers can only ever activate AFTER the boundary", () => {
    const raw = readModule("../recovery/ProductionWindowsAuthorityRestorationService.js");
    expect(raw).not.toMatch(/combinedCutoverWorkerControl\.js/);
    expect(raw).not.toContain("workerControl");
  });
});

describe("post-boundary provider forward recovery never reverts worker authority to Windows", () => {
  it("ProductionProviderForwardRecoveryService.js imports no worker-control module and never references restoreWindowsWorkers", () => {
    const raw = readModule("../recovery/ProductionProviderForwardRecoveryService.js");
    expect(raw).not.toMatch(/combinedCutoverWorkerControl\.js/);
    expect(raw).not.toContain("workerControl");
    expect(raw).not.toContain("restoreWindowsWorkers");
  });
});
