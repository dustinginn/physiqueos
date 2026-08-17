import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPayloadHash } from "../src/contracts/v1/canonicalJson.js";
import { MIGRATION_MANIFEST_VERSION } from "../src/platform/migration/migrationManifest.js";

// Regression coverage for the ERR_MODULE_NOT_FOUND this script produced when
// invoked directly (as the Gate 5 recovery restore test does): the script
// imported migrationManifest.js, whose own extension-less import of
// canonicalJson only resolves under the shared sourceModuleResolutionHook,
// which this entrypoint previously never registered.

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("validateMigrationManifest CLI entrypoint", () => {
  it("validates a well-formed manifest when invoked directly via node", () => {
    const manifestPath = writeManifest({
      migrationId: "test-migration-0001",
      collections: [{ sourceCollection: "goals", recordCount: 1 }],
      files: [{ path: "canonical-runtime.json" }],
    });

    const output = runCli(manifestPath);

    expect(output.status).toBe(0);
    const parsed = JSON.parse(output.stdout);
    expect(parsed).toMatchObject({ valid: true, migrationId: "test-migration-0001", collectionCount: 1, fileCount: 1 });
  });

  it("rejects a manifest whose semantic digest was tampered with", () => {
    const manifestPath = writeManifest({ migrationId: "test-migration-0002", collections: [], files: [] });
    const tampered = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    tampered.migrationId = "different-migration-id";
    fs.writeFileSync(manifestPath, JSON.stringify(tampered));

    const output = runCli(manifestPath);

    expect(output.status).not.toBe(0);
    expect(output.stderr).toContain("semantic digest does not match");
  });
});

function writeManifest({ migrationId, collections, files }) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-validate-manifest-"));
  workspaces.push(workspace);
  const unsigned = { manifestVersion: MIGRATION_MANIFEST_VERSION, migrationId, collections, files };
  const manifest = { ...unsigned, semanticDigest: createPayloadHash(unsigned) };
  const manifestPath = path.join(workspace, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}

function runCli(manifestPath) {
  try {
    const stdout = execFileSync("node", ["scripts/validateMigrationManifest.mjs", manifestPath], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error.message) };
  }
}
