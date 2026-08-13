import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("production migration remediation wiring", () => {
  it("has one executable production runner wired to the accepted orchestrator", () => {
    const cli = read("scripts/runProductionMigration.mjs");
    const environment = read("scripts/productionMigrationEnvironmentAdapters.mjs");
    const runner = read("src/platform/cutover/ProductionMigrationRunner.js");
    expect(cli).toContain("createProductionMigrationEnvironment");
    expect(environment).toContain("createProductionMigrationRunner");
    expect(environment).toContain("createPhase5ProviderApplicationComposition");
    expect(runner).toContain("createProductionMigrationOrchestrator");
  });

  it("wires the accepted live Phase 3 web surfaces through server-owned composition", () => {
    for (const file of ["src/app/log/page.js", "src/app/profile/operating-plan/page.js", "src/screens/GoalsHubScreen.jsx"]) {
      const source = read(file);
      expect(source).toContain("getProductionApplicationComposition");
      expect(source).not.toContain("import { FounderRepositories }");
    }
  });

  it("routes the shared production repository facade through composition with no raw legacy import bypass", () => {
    const facade = read("src/data/repositories/founderRepositories.js");
    const composition = read("src/application/composition/productionApplicationComposition.js");
    expect(facade).toContain("getProductionApplicationComposition");
    expect(facade).toContain("DIRECT_POSTGRES_REPOSITORY_WRITE_UNAVAILABLE");
    expect(facade).toContain('process.env.NEXT_PHASE === "phase-production-build"');
    expect(composition).toContain("LegacyFounderRepositories");
    const bypasses = sourceFiles(path.join(root, "src"))
      .filter((file) => !file.endsWith("founderRepositories.js") && !file.endsWith("productionApplicationComposition.js"))
      .filter((file) => readAbsolute(file).includes("LegacyFounderRepositories"));
    expect(bypasses).toEqual([]);
  });

  it("does not retain the stale Phase 3 checkpoint in current-copy export tooling", () => {
    for (const file of ["scripts/runPhase4CurrentCopyExport.mjs", "scripts/verifyPhase4PackageDeterminism.mjs"]) {
      const source = read(file);
      expect(source).not.toContain("694d3cac7158c3ebdbafcef6a61699be52d5937a");
      expect(source).toContain("deriveTrustedMigrationSourceIdentity");
    }
  });

  it("requires the 24-hour provider-backed backup gate in the same runner dry-run", () => {
    const runner = read("src/platform/cutover/ProductionMigrationRunner.js");
    expect(runner).toContain("backupFreshnessVerifier.verify()");
    expect(runner).toContain("assertManagedPostgresBackupFreshness");
  });
});

function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function readAbsolute(file) { return fs.readFileSync(file, "utf8"); }
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:js|jsx|mjs)$/.test(entry.name) ? [file] : [];
  });
}
