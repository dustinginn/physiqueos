import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const powershell =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const endWorkSession = path.resolve("scripts", "endWorkSession.ps1");
const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("End Work Session local-only closeout", () => {
  it("A accepts a clean synchronized repository and skips push", () => {
    const repository = createRepository();
    const backup = createBackup(repository);
    git(repository, "remote", "set-url", "origin", path.join(repository, "missing-remote"));

    const result = runLocalOnly(repository, backup);

    expect(result.status).toBe(0);
    expect(result.output).toContain("0 ahead / 0 behind");
    expect(result.output).toContain("Push skipped by explicit local-only mode.");
    expect(result.output).toContain("Verified local backup accepted:");
    expect(result.output).toContain("External replication status: pending");
    expect(result.output).toContain("Local repository closeout accepted.");
    expect(git(repository, "status", "--porcelain=v1")).toBe("");
  });

  it("B rejects local-only closeout when the branch is ahead", () => {
    const repository = createRepository();
    const backup = createBackup(repository);
    fs.appendFileSync(path.join(repository, "README.md"), "ahead\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "local ahead");

    const result = runLocalOnly(repository, backup);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("ahead=1 behind=0");
    expect(result.output).not.toContain("Local repository closeout accepted.");
  });

  it("C rejects a missing supplied backup", () => {
    const repository = createRepository();
    const missing = path.join(os.tmpdir(), `missing-backup-${crypto.randomUUID()}`);

    const result = runLocalOnly(repository, missing);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Backup directory is missing");
    expect(result.output).toContain("Supplied local backup failed verification");
  });

  it("D rejects a supplied backup for a different HEAD", () => {
    const repository = createRepository();
    const backup = createBackup(repository);
    fs.appendFileSync(path.join(repository, "README.md"), "new synchronized head\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "new synchronized head");
    git(repository, "push", "origin", "main");

    const result = runLocalOnly(repository, backup);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Backup HEAD mismatch");
    expect(result.output).not.toContain("Local repository closeout accepted.");
  });

  it("E blocks an embedded repository before closeout staging", () => {
    const repository = createRepository();
    const backup = createBackup(repository);
    const nested = path.join(repository, "nested-source");
    fs.mkdirSync(nested);
    git(nested, "init", "--quiet");

    const result = runLocalOnly(repository, backup);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("embedded repository is not explicitly configured");
    expect(result.output).not.toContain("Staging tracked and untracked changes");
  });

  it("F blocks unexpected staged files", () => {
    const repository = createRepository();
    const backup = createBackup(repository);
    fs.writeFileSync(path.join(repository, "unexpected.txt"), "unexpected\n");
    git(repository, "add", "unexpected.txt");

    const result = runLocalOnly(repository, backup);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Local-only closeout requires a clean working");
    expect(result.output).not.toContain("Local repository closeout accepted.");
  });

  it("G preserves the default push and backup workflow", () => {
    const script = fs.readFileSync(endWorkSession, "utf8");

    expect(script).toContain("[switch]$LocalOnly");
    expect(script).toContain('} elseif ($hasUpstream) {');
    expect(script).toContain('Invoke-CheckedGit -Arguments @("push")');
    expect(script).toContain('(Join-Path $PSScriptRoot "backupRepository.ps1")');
    expect(script).toContain("-DestinationDirectory $BackupDestination");
  });
});

function createRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-local-closeout-"));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-local-closeout-remote-"));
  workspaces.push(repository, remote);
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.email", "closeout-test@example.com");
  git(repository, "config", "user.name", "Closeout Test");
  fs.writeFileSync(path.join(repository, "README.md"), "fixture\n");
  const config = path.join(repository, "config");
  fs.mkdirSync(config);
  fs.writeFileSync(path.join(config, "embedded-repository-policy.json"), `${JSON.stringify({
    schemaVersion: "physiqueos_embedded_repository_policy_v1",
    traversalExclusions: [".git", ".next", "node_modules"],
    repositories: [],
    externalArtifacts: [],
  }, null, 2)}\n`);
  git(repository, "add", "-A");
  git(repository, "commit", "-m", "fixture root");
  git(remote, "init", "--quiet", "--bare");
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "--set-upstream", "origin", "main");
  return repository;
}

function createBackup(repository) {
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-local-closeout-backup-"));
  workspaces.push(backup);
  const bundlePath = path.join(backup, "physiqueos.bundle");
  git(repository, "bundle", "create", bundlePath, "--all");
  const bundleHash = sha(bundlePath);
  const head = git(repository, "rev-parse", "HEAD");
  const completeness = {
    schemaVersion: "physiqueos_backup_completeness_v1",
    evaluatedAtUtc: new Date().toISOString(),
    nestedAudit: { repositoryCount: 0, repositories: [], violations: [], passed: true },
    externalArtifacts: [],
    violations: [],
    passed: true,
  };
  fs.writeFileSync(
    path.join(backup, "backup-completeness.json"),
    `${JSON.stringify(completeness, null, 2)}\n`,
  );
  const manifest = {
    schemaVersion: "physiqueos_backup_manifest_v2",
    createdAtUtc: new Date().toISOString(),
    repository: "fixture",
    branch: "main",
    commit: head,
    bundle: { file: "physiqueos.bundle", sha256: bundleHash, verificationStatus: "verified" },
    completeness: {
      passed: true,
      reportFile: "backup-completeness.json",
      nestedRepositoryCount: 0,
      externalArtifacts: [],
    },
  };
  fs.writeFileSync(path.join(backup, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(backup, "manifest.txt"), `Commit: ${head}\n`);
  const checksummed = [
    "backup-completeness.json",
    "manifest.json",
    "manifest.txt",
    "physiqueos.bundle",
  ];
  fs.writeFileSync(
    path.join(backup, "checksums.txt"),
    `${checksummed.map((file) => `${sha(path.join(backup, file)).toLowerCase()}  ${file}`).join("\n")}\n`,
  );
  return backup;
}

function runLocalOnly(repository, backup) {
  const result = spawnSync(
    powershell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      endWorkSession,
      "-RepositoryRoot",
      repository,
      "-LocalOnly",
      "-VerifiedBackupPath",
      backup,
      "-ExternalReplicationStatus",
      "pending",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function sha(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}
