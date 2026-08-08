import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateBackupCompleteness } from "./backupCompleteness.mjs";

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("backup completeness", () => {
  it("Case I rejects unresolved nested source", () => {
    const root = createRoot();
    createNestedRepository(root, "nested");

    const report = evaluate(root);

    expect(report.passed).toBe(false);
    expect(report.nestedAudit.repositoryCount).toBe(1);
  });

  it("Case J accepts a clean root with no nested repositories", () => {
    const root = createRoot();

    expect(evaluate(root)).toMatchObject({ passed: true });
  });

  it("Case K verifies a required external preservation manifest", () => {
    const root = createRoot();
    const manifest = path.join(root, "external-preservation.json");
    fs.writeFileSync(manifest, "preserved\n");
    const sha256 = sha(manifest);
    writePolicy(root, [], [{
      id: "fixture-preservation",
      manifestSha256: sha256,
      manifestPathEnvironmentVariable: "FIXTURE_PRESERVATION_MANIFEST",
      requiredForSourceRecovery: true,
      recoveryInstructions: "restore fixture",
    }]);

    const report = evaluate(root, { FIXTURE_PRESERVATION_MANIFEST: manifest });

    expect(report.passed).toBe(true);
    expect(report.externalArtifacts[0]).toMatchObject({
      id: "fixture-preservation",
      actualSha256: sha256,
      verificationStatus: "verified",
    });
  });

  it("Case L rejects a missing required external preservation manifest", () => {
    const root = createRoot();
    writePolicy(root, [], [{
      id: "fixture-preservation",
      manifestSha256: "A".repeat(64),
      manifestPathEnvironmentVariable: "FIXTURE_PRESERVATION_MANIFEST",
      requiredForSourceRecovery: true,
      recoveryInstructions: "restore fixture",
    }]);

    const report = evaluate(root, {});

    expect(report.passed).toBe(false);
    expect(report.externalArtifacts[0].verificationStatus).toBe("missing_required");
  });
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-backup-root-"));
  workspaces.push(root);
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "backup-test@example.com");
  git(root, "config", "user.name", "Backup Test");
  fs.writeFileSync(path.join(root, "README.md"), "root\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "initial root");
  writePolicy(root, [], []);
  return root;
}

function createNestedRepository(root, relativePath) {
  const nested = path.join(root, relativePath);
  fs.mkdirSync(nested, { recursive: true });
  git(nested, "init", "--quiet");
  git(nested, "config", "user.email", "backup-test@example.com");
  git(nested, "config", "user.name", "Backup Test");
  fs.writeFileSync(path.join(nested, "source.js"), "export const value = 1;\n");
  git(nested, "add", "source.js");
  git(nested, "commit", "-m", "nested source");
}

function writePolicy(root, repositories, externalArtifacts) {
  const config = path.join(root, "config");
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, "embedded-repository-policy.json"), `${JSON.stringify({
    schemaVersion: "physiqueos_embedded_repository_policy_v1",
    traversalExclusions: [".git", ".next", "node_modules"],
    repositories,
    externalArtifacts,
  }, null, 2)}\n`);
}

function evaluate(root, env = {}) {
  return evaluateBackupCompleteness({
    repositoryRoot: root,
    policyPath: path.join(root, "config", "embedded-repository-policy.json"),
    env,
  });
}

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}
