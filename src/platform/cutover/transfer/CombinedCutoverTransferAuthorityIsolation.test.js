// Static architectural proof that the transfer channel cannot touch runtime authority, canonical
// import, production writes, or routing. No module in this set IMPORTS the authority state
// machine, the authority store, the canonical record store, or the worker - transfer completion is
// a byte-level fact with zero reach into those concerns. (Doc comments in these files legitimately
// *describe* that invariant in prose, so this check inspects only `import` statements, not free
// text.) Complementary dynamic proof lives in `syntheticCombinedCutoverRehearsal.test.js`, which
// exercises the real authority store end to end and shows `firstProviderCanonicalWriteAt` is set
// only by the real authority-protected transaction, never by transfer plumbing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TRANSFER_MODULES = [
  "combinedCutoverTransferContract.js",
  "combinedCutoverTransferAuth.js",
  "combinedCutoverTransferStaging.js",
  "PostgresCombinedCutoverTransferReceiptStore.js",
  "combinedCutoverTransferService.js",
  "combinedCutoverManifestTransferService.js",
  "combinedCutoverTransferComposition.js",
  "WindowsCombinedCutoverTransferClient.js",
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /CombinedRuntimeAuthorityState/,
  /PostgresCombinedRuntimeAuthorityStore/,
  /Phase4CanonicalRecordStore/,
  /AuthorityGatedWorker/,
  /ApplicationCanonicalRuntime/,
];

function importStatements(source) {
  return source.split("\n").filter((line) => /^\s*import\b/.test(line));
}

describe("combined cutover transfer channel — authority/import/routing/worker isolation", () => {
  for (const moduleName of TRANSFER_MODULES) {
    it(`${moduleName} imports nothing from runtime authority, canonical import, or the worker`, () => {
      const source = readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
      const imports = importStatements(source).join("\n");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(imports).not.toMatch(pattern);
      }
    });
  }

  it("no transfer module calls claimCanonicalWriteBoundary or transitions authority to provider-authoritative", () => {
    for (const moduleName of TRANSFER_MODULES) {
      const source = readFileSync(new URL(`./${moduleName}`, import.meta.url), "utf8");
      expect(source).not.toContain("claimCanonicalWriteBoundary(");
      expect(source).not.toContain("RuntimeAuthorityAction.TRANSFER_TO_PROVIDER");
      expect(source).not.toContain("RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE");
    }
  });

  it("the reused operation-level receipt table import is the transfer receipt store only, never the authority store", () => {
    const source = readFileSync(new URL("./combinedCutoverTransferComposition.js", import.meta.url), "utf8");
    expect(source).toContain("PostgresCombinedTransferReceiptStore.js");
    expect(importStatements(source).join("\n")).not.toContain("PostgresCombinedRuntimeAuthorityStore");
  });
});
