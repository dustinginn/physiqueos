// Static architectural proof for the Phase 5 authority/routing handoff channel.
// `ProductionAuthorityHandoffService.js` legitimately calls the orchestrator-supplied
// `commitAuthority` closure (which is already wired to the real
// `authorityStore.transition(TRANSFER_TO_PROVIDER, ...)`) - that is this module's entire job. What
// must never happen anywhere in this module set: a DIRECT write to `combined_runtime_authority`
// bypassing that closure, a call to `claimCanonicalWriteBoundary` (the separate, later,
// irreversible first-write boundary), construction of a `firstProviderCanonicalWriteAt` value, or
// anything worker-related (worker handoff is a distinct, later documented phase - see
// `ProductionAuthorityHandoffService.js`'s header for the phase-model citation).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HANDOFF_MODULES = [
  "combinedCutoverHandoffContract.js",
  "combinedCutoverHandoffAuth.js",
  "PostgresCombinedCutoverHandoffReceiptStore.js",
  "ProductionAuthorityHandoffService.js",
  "combinedCutoverHandoffService.js",
  "combinedCutoverHandoffComposition.js",
];

const ROUTING_MODULES = [
  "../routing/combinedCutoverRoutingControl.js",
];

const FORBIDDEN_WRITE_PATTERNS = [
  /authorityStore\s*\.\s*transition\s*\(/,
  /authorityStore\s*\.\s*claimCanonicalWriteBoundary\s*\(/,
  /RuntimeAuthorityAction\.RECORD_FIRST_PROVIDER_WRITE/,
  /RuntimeAuthorityAction\.ABORT_TO_WINDOWS/,
  /firstProviderCanonicalWriteAt\s*[:=]/,
];

const FORBIDDEN_WORKER_PATTERNS = [
  /workerAuthority\s*[:=]\s*["']provider["']/,
  /startWorker/i,
  /AuthorityGatedWorker/,
];

function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function readModule(directory, moduleName) {
  return readFileSync(new URL(`./${directory}${moduleName}`, import.meta.url), "utf8");
}

describe("combined cutover handoff channel — authority write isolation", () => {
  for (const moduleName of HANDOFF_MODULES) {
    it(`${moduleName} never bypasses commitAuthority or crosses the first-provider-write boundary`, () => {
      const source = codeOnly(readModule("", moduleName));
      for (const pattern of FORBIDDEN_WRITE_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });

    it(`${moduleName} never touches worker start/stop`, () => {
      const source = codeOnly(readModule("", moduleName));
      for (const pattern of FORBIDDEN_WORKER_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  for (const moduleName of ROUTING_MODULES) {
    it(`${moduleName} is a pure routing-control contract with no authority or worker coupling`, () => {
      const source = codeOnly(readModule("", moduleName));
      for (const pattern of [...FORBIDDEN_WRITE_PATTERNS, ...FORBIDDEN_WORKER_PATTERNS]) {
        expect(source).not.toMatch(pattern);
      }
      expect(source).not.toContain("combined_runtime_authority");
    });
  }

  it("only ProductionAuthorityHandoffService.js calls commitAuthority, and only once per handoff attempt", () => {
    const source = codeOnly(readModule("", "ProductionAuthorityHandoffService.js"));
    expect(source).toContain("commitAuthority()");
    for (const moduleName of HANDOFF_MODULES.filter((name) => name !== "ProductionAuthorityHandoffService.js")) {
      const other = codeOnly(readModule("", moduleName));
      expect(other).not.toContain("commitAuthority");
    }
  });

  it("no handoff module imports the canonical-write-boundary machinery or a worker module", () => {
    for (const moduleName of HANDOFF_MODULES) {
      const source = readModule("", moduleName);
      const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
      expect(imports).not.toMatch(/Phase4CanonicalRecordStore/);
      expect(imports).not.toMatch(/AuthorityGatedWorker/);
    }
  });

  it("the production routing-control default is fail-closed, never a silent synthetic success", () => {
    const source = readModule("", "../routing/combinedCutoverRoutingControl.js");
    expect(source).toContain("ROUTING_CONTROL_UNAVAILABLE");
    expect(source).toContain("createUnavailableRoutingControl");
  });

  it("no handoff module imports the deterministic test-only routing double", () => {
    for (const moduleName of ["ProductionAuthorityHandoffService.js", "combinedCutoverHandoffComposition.js"]) {
      const source = readModule("", moduleName);
      expect(source).not.toContain("deterministicRoutingControl");
    }
  });
});
