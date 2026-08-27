// Static architectural proof for the Phase 4 preparation channel (import, parity, provider-prepared
// acknowledgement). Unlike the Phase 3 transfer channel, `ProductionAcknowledgeProviderPreparedService.js`
// legitimately READS `authorityStore.read()` to check eligibility - that is expected and required.
// What must never happen anywhere in this module set: a WRITE to runtime authority
// (`authorityStore.transition`), a canonical-write-boundary claim, a first-provider-write marker, an
// authority-transfer action, or anything routing/worker-related. Only
// `CombinedAppPlatformCutoverOrchestrator` itself ever calls `authorityStore.transition(...)`, using
// the acknowledgement object this module's acknowledge service returns - never the other way around.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PREPARATION_MODULES = [
  "combinedCutoverPreparationContract.js",
  "combinedCutoverPreparationAuth.js",
  "combinedCutoverPreparationEvidence.js",
  "combinedCutoverArtifactAssembly.js",
  "PostgresCombinedCutoverPreparationStore.js",
  "ProductionCanonicalImportService.js",
  "ProductionProviderParityService.js",
  "ProductionAcknowledgeProviderPreparedService.js",
  "combinedCutoverPreparationService.js",
  "combinedCutoverPreparationComposition.js",
  "WindowsCombinedCutoverPreparationClient.js",
];

const FORBIDDEN_WRITE_PATTERNS = [
  /authorityStore\s*\.\s*transition\s*\(/,
  /authorityStore\s*\.\s*claimCanonicalWriteBoundary\s*\(/,
  /RuntimeAuthorityAction\.TRANSFER_TO_PROVIDER/,
  /RuntimeAuthorityAction\.RECORD_FIRST_PROVIDER_WRITE/,
  /RuntimeAuthorityAction\.ABORT_TO_WINDOWS/,
  /firstProviderCanonicalWriteAt\s*[:=]/, // assignment/construction, not the read-only comparisons this file does use
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /Phase4CanonicalRecordStore/,
  /AuthorityGatedWorker/,
  /ApplicationCanonicalRuntime/,
  /routingTarget/,
];

function importStatements(source) {
  return source.split(/\r?\n/).filter((line) => /^\s*import\b/.test(line));
}

// Strips // line comments and /* */ block comments so the write-pattern checks below match only
// actual code, not this module set's own doc comments describing (in prose) what the ORCHESTRATOR
// does with the acknowledgement object these files return.
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("combined cutover preparation channel — authority write isolation", () => {
  for (const moduleName of PREPARATION_MODULES) {
    it(`${moduleName} never writes to runtime authority or crosses the first-provider-write boundary`, () => {
      const source = codeOnly(readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8"));
      for (const pattern of FORBIDDEN_WRITE_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });

    it(`${moduleName} imports nothing from the canonical-write-boundary machinery, worker, or routing`, () => {
      const source = readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
      const imports = importStatements(source).join("\n");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(imports).not.toMatch(pattern);
      }
    });
  }

  it("only the acknowledge service imports the runtime-authority state module, and only to read it", () => {
    const source = codeOnly(readFileSync(new URL("./ProductionAcknowledgeProviderPreparedService.js", import.meta.url), "utf8"));
    expect(source).toContain("authorityStore.read()");
    expect(source).not.toContain("authorityStore.transition(");
    for (const moduleName of PREPARATION_MODULES.filter((name) => name !== "ProductionAcknowledgeProviderPreparedService.js")) {
      const other = readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
      expect(importStatements(other).join("\n")).not.toContain("CombinedRuntimeAuthorityState");
    }
  });

  it("import and parity services never import the runtime-authority state machine at all", () => {
    for (const moduleName of ["ProductionCanonicalImportService.js", "ProductionProviderParityService.js"]) {
      const source = readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
      expect(importStatements(source).join("\n")).not.toContain("CombinedRuntimeAuthorityState");
      expect(importStatements(source).join("\n")).not.toContain("PostgresCombinedRuntimeAuthorityStore");
    }
  });

  it("the canonical import machinery it reuses never touches combined_runtime_authority", () => {
    const importFile = readFileSync(new URL("../../migration/phase4CanonicalImport.js", import.meta.url), "utf8");
    expect(importFile).not.toContain("combined_runtime_authority");
    const mediaFile = readFileSync(new URL("../../migration/ProductionSpacesMediaMigration.js", import.meta.url), "utf8");
    expect(mediaFile).not.toContain("combined_runtime_authority");
  });
});
