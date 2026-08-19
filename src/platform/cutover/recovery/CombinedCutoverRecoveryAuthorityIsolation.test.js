// Static architectural proof for the Phase 6A post-handoff recovery trio (verifyPostHandoff,
// restoreWindowsAuthority, enterProviderRecovery). Each module may only reach the exact authority
// transitions and routing operations its role legitimately requires - never more.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function readModule(moduleName) {
  return readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
}

const COMMON_FORBIDDEN_PATTERNS = [
  // Forbids FABRICATING a first-write timestamp. Reading/passing through the durable value in a
  // return object literal (e.g. `firstProviderCanonicalWriteAt: durable.firstProviderCanonicalWriteAt`
  // or `: null`) is legitimate and intentionally NOT matched here - only RECORD_FIRST_PROVIDER_WRITE
  // (which none of these modules call) may ever produce a non-null value.
  /firstProviderCanonicalWriteAt\s*[:=]\s*(?:now\(\)|new Date|Date\.now)/,
  /workerAuthority\s*[:=]\s*["']provider["']/,
  /startWorker/i,
  /AuthorityGatedWorker/,
  /combined_runtime_authority\b/, // must go through authorityStore, never raw SQL/table names
];

describe("combined cutover recovery trio — common isolation", () => {
  for (const moduleName of ["ProductionPostHandoffVerificationService.js", "ProductionWindowsAuthorityRestorationService.js", "ProductionProviderForwardRecoveryService.js"]) {
    it(`${moduleName} never constructs a first-write boundary, touches worker state, or writes raw SQL`, () => {
      const source = codeOnly(readModule(moduleName));
      for (const pattern of COMMON_FORBIDDEN_PATTERNS) expect(source).not.toMatch(pattern);
    });

    it(`${moduleName} never imports canonical-record write machinery`, () => {
      const source = readModule(moduleName);
      const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
      expect(imports).not.toMatch(/Phase4CanonicalRecordStore/);
    });
  }
});

describe("verifyPostHandoff — read-only isolation", () => {
  const source = codeOnly(readModule("ProductionPostHandoffVerificationService.js"));

  it("never mutates runtime authority", () => {
    expect(source).not.toContain("authorityStore.transition(");
    expect(source).not.toContain("authorityStore.claimCanonicalWriteBoundary(");
  });

  it("never references an authority action (purely diagnostic, no transition capability)", () => {
    expect(source).not.toContain("RuntimeAuthorityAction");
  });

  it("never imports or calls the routing-control contract", () => {
    const raw = readModule("ProductionPostHandoffVerificationService.js");
    expect(raw).not.toMatch(/from ["'].*combinedCutoverRoutingControl\.js["']/);
    expect(source).not.toContain("routingControl");
  });
});

describe("restoreWindowsAuthority — pre-boundary-only isolation", () => {
  const source = codeOnly(readModule("ProductionWindowsAuthorityRestorationService.js"));

  it("never drives TRANSFER_TO_PROVIDER, RECORD_FIRST_PROVIDER_WRITE, or REQUIRE_RECOVERY", () => {
    expect(source).not.toContain("RuntimeAuthorityAction.TRANSFER_TO_PROVIDER");
    expect(source).not.toContain("RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE");
    expect(source).not.toContain("RuntimeAuthorityAction.REQUIRE_RECOVERY");
  });

  it("only drives ABORT_TO_WINDOWS as its authority transition", () => {
    expect(source).toContain("RuntimeAuthorityAction.ABORT_TO_WINDOWS");
  });

  it("never activates provider routing - only inspects/restores toward Windows", () => {
    expect(source).not.toContain("routingControl.activateProviderRoute(");
    expect(source).not.toContain("routingControl.verifyProviderRoute(");
  });

  it("never bypasses the real state machine with a direct authority-row mutation", () => {
    expect(source).not.toContain("authorityStore.claimCanonicalWriteBoundary(");
  });
});

describe("enterProviderRecovery — post-boundary-only isolation", () => {
  const source = codeOnly(readModule("ProductionProviderForwardRecoveryService.js"));

  it("never attempts ABORT_TO_WINDOWS, TRANSFER_TO_PROVIDER, or RECORD_FIRST_PROVIDER_WRITE", () => {
    expect(source).not.toContain("RuntimeAuthorityAction.ABORT_TO_WINDOWS");
    expect(source).not.toContain("RuntimeAuthorityAction.TRANSFER_TO_PROVIDER");
    expect(source).not.toContain("RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE");
  });

  it("only drives REQUIRE_RECOVERY as its authority transition", () => {
    expect(source).toContain("RuntimeAuthorityAction.REQUIRE_RECOVERY");
  });

  it("never imports or references the routing-control contract - it cannot revert public routing to Windows", () => {
    const raw = readModule("ProductionProviderForwardRecoveryService.js");
    expect(raw).not.toMatch(/from ["'].*combinedCutoverRoutingControl\.js["']/);
    expect(source).not.toContain("routingControl");
  });

  it("never bypasses the real state machine with a direct authority-row mutation", () => {
    expect(source).not.toContain("authorityStore.claimCanonicalWriteBoundary(");
  });
});

describe("shared recovery decision helper — pure and side-effect free", () => {
  it("combinedCutoverRecoveryDecision.js has no store, network, or filesystem dependency", () => {
    const raw = readModule("../combinedCutoverRecoveryDecision.js");
    const imports = raw.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    expect(imports).not.toMatch(/PostgresCombinedRuntimeAuthorityStore|node:fs|node:http|node:net/);
  });
});
