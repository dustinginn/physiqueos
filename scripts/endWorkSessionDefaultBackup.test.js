import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyRepositoryBackup } from "./verifyRepositoryBackup.mjs";

const powershell =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const endWorkSession = path.resolve("scripts", "endWorkSession.ps1");
const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("End Work Session default local-first backup", () => {
  it("creates and verifies locally before accepting an external replica", () => {
    const fixture = createFixture();

    const result = runDefault(fixture);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Local backup verified:");
    expect(result.output).toContain("External backup replica verified:");
    expect(result.output).toContain("Off-machine backup replica accepted.");
    expect(result.output).toContain("Pushed: yes");
    const localBackup = onlyBackup(fixture.localRoot);
    const externalBackup = path.join(fixture.externalRoot, path.basename(localBackup));
    expect(fs.existsSync(externalBackup)).toBe(true);
    expect(verifyRepositoryBackup({
      backupPath: localBackup,
      expectedHead: git(fixture.repository, "rev-parse", "HEAD"),
      expectedBranch: "main",
    })).toMatchObject({ completenessPassed: true, branch: "main" });
    expect(git(fixture.repository, "rev-parse", "HEAD")).toBe(
      git(fixture.repository, "rev-parse", "origin/main"),
    );
    expect(git(fixture.repository, "status", "--porcelain=v1")).toBe("");
  });

  it("does not attempt external replication when local backup creation fails", () => {
    const fixture = createFixture();
    const invalidLocalRoot = path.join(fixture.workspace, "not-a-directory");
    fs.writeFileSync(invalidLocalRoot, "file\n");

    const result = runDefault(fixture, { localRoot: invalidLocalRoot });

    expect(result.status).not.toBe(0);
    expect(result.output).not.toContain("Replicating verified backup");
    expect(fs.existsSync(fixture.externalRoot)).toBe(false);
  });

  it("accepts the local closeout when the external destination is unavailable", () => {
    const fixture = createFixture();
    const unavailableRoot = path.join(fixture.workspace, "external-file");
    fs.writeFileSync(unavailableRoot, "not a directory\n");

    const result = runDefault(fixture, { externalRoot: unavailableRoot });

    expect(result.status).toBe(0);
    expect(result.output).toContain("Local backup verified:");
    expect(result.output).toContain("External replication failed");
    expect(result.output).toContain("Repository closeout accepted locally.");
    expect(result.output).toContain("Off-machine backup requires follow-up.");
    expect(fs.existsSync(onlyBackup(fixture.localRoot))).toBe(true);
  }, 15_000);

  it("retains the verified local backup when replication is explicitly deferred", () => {
    const fixture = createFixture();

    const result = runDefault(fixture, { skipExternalReplication: true });

    expect(result.status).toBe(0);
    expect(result.output).toContain("External replication skipped explicitly");
    expect(result.output).toContain("External replication: pending");
    expect(result.output).toContain("End Work Session Complete (local backup only)");
    expect(fs.existsSync(onlyBackup(fixture.localRoot))).toBe(true);
    expect(fs.existsSync(fixture.externalRoot)).toBe(false);
  });
});

function createFixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-default-closeout-"));
  workspaces.push(workspace);
  const repository = path.join(workspace, "repository");
  const remote = path.join(workspace, "remote.git");
  const localRoot = path.join(workspace, "local-backups");
  const externalRoot = path.join(workspace, "external-backups");
  fs.mkdirSync(repository);
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
  fs.mkdirSync(remote);
  git(remote, "init", "--quiet", "--bare");
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "--set-upstream", "origin", "main");
  return { workspace, repository, localRoot, externalRoot };
}

function runDefault(fixture, overrides = {}) {
  const result = spawnSync(
    powershell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      endWorkSession,
      "-RepositoryRoot",
      fixture.repository,
      "-LocalBackupDirectory",
      overrides.localRoot ?? fixture.localRoot,
      "-ExternalBackupDirectory",
      overrides.externalRoot ?? fixture.externalRoot,
      "-ExternalReplicationTimeoutSeconds",
      "15",
      ...(overrides.skipExternalReplication ? ["-SkipExternalReplication"] : []),
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function onlyBackup(root) {
  const backups = fs.readdirSync(root).map((name) => path.join(root, name));
  expect(backups).toHaveLength(1);
  return backups[0];
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}
