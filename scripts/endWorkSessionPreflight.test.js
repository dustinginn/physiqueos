import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const powershell =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const preflight = path.resolve("scripts", "assertSafeStagedFiles.ps1");
const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("End Work Session staged-file preflight", () => {
  it("runs the embedded-repository audit before git add -A", () => {
    const script = fs.readFileSync(
      path.resolve("scripts", "endWorkSession.ps1"),
      "utf8",
    );
    const auditIndex = script.indexOf("assertSafeEmbeddedRepositories.ps1");
    const addIndex = script.indexOf('@("add", "-A")');
    const stagedIndex = script.indexOf("assertSafeStagedFiles.ps1");

    expect(auditIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeGreaterThan(auditIndex);
    expect(stagedIndex).toBeGreaterThan(addIndex);
  });

  it("keeps local-only synchronization and backup verification after staged preflight", () => {
    const script = fs.readFileSync(
      path.resolve("scripts", "endWorkSession.ps1"),
      "utf8",
    );
    const stagedIndex = script.indexOf("assertSafeStagedFiles.ps1");
    const divergenceIndex = script.indexOf("rev-list --left-right --count");
    const backupIndex = script.indexOf("verifyRepositoryBackup.mjs");

    expect(divergenceIndex).toBeGreaterThan(stagedIndex);
    expect(backupIndex).toBeGreaterThan(divergenceIndex);
  });

  it("rejects generated Next.js rollback cache paths", () => {
    const repository = createRepository();
    writeFile(
      repository,
      ".next.rollback-123/dev/cache/turbopack/cache.sst",
      "generated cache",
    );
    git(repository, "add", "-A");

    const result = runPreflight(repository);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Prohibited generated path");
    expect(result.output).toContain(".next.rollback-123/dev/cache/turbopack/cache.sst");
    expect(fs.existsSync(path.join(repository, ".next.rollback-123"))).toBe(true);
    expect(git(repository, "diff", "--cached", "--name-only")).toContain(
      ".next.rollback-123/dev/cache/turbopack/cache.sst",
    );
  });

  it("rejects a staged blob larger than 100 MiB", () => {
    const repository = createRepository();
    const oversizedPath = path.join(repository, "assets", "oversized.bin");
    fs.mkdirSync(path.dirname(oversizedPath), { recursive: true });
    const handle = fs.openSync(oversizedPath, "w");
    try {
      fs.ftruncateSync(handle, 100 * 1024 * 1024 + 1);
    } finally {
      fs.closeSync(handle);
    }
    git(repository, "add", "-A");

    const result = runPreflight(repository);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("exceeds the 100 MiB GitHub limit");
    expect(result.output).toContain("assets/oversized.bin");
    expect(fs.statSync(oversizedPath).size).toBe(100 * 1024 * 1024 + 1);
    expect(git(repository, "diff", "--cached", "--name-only")).toContain(
      "assets/oversized.bin",
    );
  });

  it("allows normal legitimate source changes", () => {
    const repository = createRepository();
    writeFile(repository, "src/example.js", "export const healthy = true;\n");
    git(repository, "add", "-A");

    const result = runPreflight(repository);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Staged-file preflight passed.");
  });
});

function createRepository() {
  const repository = fs.mkdtempSync(
    path.join(os.tmpdir(), "physiqueos-end-session-preflight-"),
  );
  workspaces.push(repository);
  git(repository, "init", "--quiet");
  return repository;
}

function writeFile(repository, relativePath, contents) {
  const destination = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function git(repository, ...args) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function runPreflight(repository) {
  const result = spawnSync(
    powershell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      preflight,
      "-RepositoryRoot",
      repository,
    ],
    { encoding: "utf8" },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}
