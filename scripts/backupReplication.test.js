import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRobocopySuccess,
  replicateRepositoryBackup,
} from "./replicateRepositoryBackup.mjs";

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("external backup replication", () => {
  it("accepts a complete replica after a nonfatal Robocopy success code", () => {
    const { source, externalRoot } = createFixture();

    const result = replicateRepositoryBackup({
      sourceBackupPath: source,
      externalBackupDirectory: externalRoot,
      runner: copyRunner(3),
    });

    expect(result).toMatchObject({
      status: "verified",
      robocopyExitCode: 3,
      verification: { verified: true, fileCount: 3 },
    });
    expect(fs.existsSync(source)).toBe(true);
  });

  it("rejects a fatal Robocopy exit code and retains the local backup", () => {
    const { source, externalRoot } = createFixture();

    const result = replicateRepositoryBackup({
      sourceBackupPath: source,
      externalBackupDirectory: externalRoot,
      runner: () => ({ status: 8, stderr: "fatal copy error" }),
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "robocopy_failed",
      robocopyExitCode: 8,
    });
    expect(fs.existsSync(source)).toBe(true);
  });

  it("rejects an external hash mismatch and retains the local backup", () => {
    const { source, externalRoot } = createFixture();

    const result = replicateRepositoryBackup({
      sourceBackupPath: source,
      externalBackupDirectory: externalRoot,
      runner: ({ sourceBackupPath, replicaBackupPath }) => {
        fs.cpSync(sourceBackupPath, replicaBackupPath, { recursive: true });
        fs.writeFileSync(path.join(replicaBackupPath, "manifest.json"), "corrupt\n");
        return { status: 1 };
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "verification_failed",
      robocopyExitCode: 1,
    });
    expect(result.message).toMatch(/size mismatch|SHA-256 mismatch/);
    expect(fs.existsSync(source)).toBe(true);
  });

  it("returns a bounded timeout failure", () => {
    const { source, externalRoot } = createFixture();
    const error = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });

    const result = replicateRepositoryBackup({
      sourceBackupPath: source,
      externalBackupDirectory: externalRoot,
      timeoutMs: 25,
      runner: () => ({ status: null, error }),
    });

    expect(result).toMatchObject({ status: "failed", reason: "timeout" });
    expect(fs.existsSync(source)).toBe(true);
  });

  it("returns a bounded verification timeout after copying", () => {
    const { source, externalRoot } = createFixture();
    const error = Object.assign(new Error("verification timed out"), { code: "ETIMEDOUT" });

    const result = replicateRepositoryBackup({
      sourceBackupPath: source,
      externalBackupDirectory: externalRoot,
      runner: copyRunner(1),
      verifier: () => { throw error; },
    });

    expect(result).toMatchObject({ status: "failed", reason: "verification_timeout" });
    expect(fs.existsSync(source)).toBe(true);
  });

  it("classifies Robocopy codes below 8 as nonfatal", () => {
    for (let code = 0; code < 8; code += 1) expect(isRobocopySuccess(code)).toBe(true);
    expect(isRobocopySuccess(8)).toBe(false);
    expect(isRobocopySuccess(null)).toBe(false);
  });
});

function createFixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-replication-"));
  workspaces.push(workspace);
  const source = path.join(workspace, "PhysiqueOS_Backup_fixture");
  const externalRoot = path.join(workspace, "external");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "manifest.json"), "manifest\n");
  fs.writeFileSync(path.join(source, "checksums.txt"), "checksums\n");
  fs.writeFileSync(path.join(source, "physiqueos.bundle"), "bundle\n");
  return { source, externalRoot };
}

function copyRunner(status) {
  return ({ sourceBackupPath, replicaBackupPath }) => {
    fs.cpSync(sourceBackupPath, replicaBackupPath, { recursive: true });
    return { status };
  };
}
