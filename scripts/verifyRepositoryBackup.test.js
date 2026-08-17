import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256, verifyRepositoryBackup } from "./verifyRepositoryBackup.mjs";

// verifyRepositoryBackup must read the SAME embedded-repository policy decision the audit
// already made (config/embedded-repository-policy.json via auditEmbeddedRepositories.mjs) —
// recorded per-repository in backup-completeness.json's nestedAudit.repositories — rather
// than categorically rejecting any backup that contains embedded repositories at all. These
// fixtures hand-construct that report the same shape auditEmbeddedRepositories.mjs produces,
// so the verifier is exercised directly and fast, without needing a real nested worktree.

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("verifyRepositoryBackup — embedded repository handling", () => {
  it("passes a backup with zero embedded repositories", () => {
    const fixture = createBackupFixture({ repositories: [] });
    expect(verifyRepositoryBackup(fixture.args)).toMatchObject({ completenessPassed: true });
  });

  it("passes an approved clean linked worktree", () => {
    const fixture = createBackupFixture({
      repositories: [approvedRepository({
        path: ".tmp/windows-deploy-9c1aa80c",
        lifecycle: "current_production_candidate",
        endWorkSessionBehavior: "allow_clean",
        untrackedCount: 0,
        dirtyPaths: [],
      })],
    });
    expect(verifyRepositoryBackup(fixture.args)).toMatchObject({ completenessPassed: true });
  });

  it("passes an approved generated-only incident repository whose dirty files are exactly the allowed logs", () => {
    const fixture = createBackupFixture({
      repositories: [approvedRepository({
        path: ".tmp/incident-failed-artifact-264a6306",
        lifecycle: "protected_incident_evidence",
        endWorkSessionBehavior: "allow_generated_only",
        untrackedCount: 2,
        dirtyPaths: [
          { path: "failed-artifact.err.log", status: "??" },
          { path: "failed-artifact.out.log", status: "??" },
        ],
      })],
    });
    expect(verifyRepositoryBackup(fixture.args)).toMatchObject({ completenessPassed: true });
  });

  it("fails an unexpected/unconfigured repository even if the report otherwise looks complete", () => {
    const fixture = createBackupFixture({
      repositories: [unapprovedRepository({ path: ".tmp/windows-deploy-random999" })],
      forcePassed: true,
    });
    expect(() => verifyRepositoryBackup(fixture.args)).toThrow(/did not pass|unapproved embedded repository/);
  });

  it("fails a dirty clean-only repository", () => {
    const fixture = createBackupFixture({
      repositories: [{
        ...approvedRepository({
          path: ".tmp/windows-deploy-9c1aa80c",
          lifecycle: "current_production_candidate",
          endWorkSessionBehavior: "allow_clean",
          untrackedCount: 0,
          dirtyPaths: [],
        }),
        allowed: false,
        untrackedCount: 1,
        dirtyPaths: [{ path: "stray-build-output.log", status: "??" }],
        violations: ["dirty nested repository is blocked (0 modified, 0 deleted, 1 untracked)"],
      }],
      forcePassed: true,
    });
    expect(() => verifyRepositoryBackup(fixture.args)).toThrow(/did not pass|unapproved embedded repository/);
  });

  it("fails an extra dirty file in a generated-only repository beyond the explicitly approved logs", () => {
    const fixture = createBackupFixture({
      repositories: [{
        ...approvedRepository({
          path: ".tmp/incident-failed-artifact-264a6306",
          lifecycle: "protected_incident_evidence",
          endWorkSessionBehavior: "allow_generated_only",
          untrackedCount: 3,
          dirtyPaths: [
            { path: "failed-artifact.err.log", status: "??" },
            { path: "failed-artifact.out.log", status: "??" },
            { path: "unexpected-extra-file.txt", status: "??" },
          ],
        }),
        allowed: false,
        violations: ["dirty state is not permitted by the generated-only policy (3 paths)"],
      }],
      forcePassed: true,
    });
    expect(() => verifyRepositoryBackup(fixture.args)).toThrow(/did not pass|unapproved embedded repository/);
  });

  it("still fails when the completeness report is manually forced to passed:true despite an unapproved repository (default-deny cannot be bypassed by report tampering)", () => {
    const fixture = createBackupFixture({
      repositories: [unapprovedRepository({ path: ".tmp/windows-deploy-random999" })],
      forcePassed: true,
      forceTopLevelPassed: true,
    });
    expect(() => verifyRepositoryBackup(fixture.args)).toThrow(/unapproved embedded repository/);
  });

  it("rejects an approved-looking repository record that omits the approval-detail fields (cannot prove why it was accepted)", () => {
    const fixture = createBackupFixture({
      repositories: [{
        ...approvedRepository({
          path: ".tmp/windows-deploy-9c1aa80c",
          lifecycle: "current_production_candidate",
          endWorkSessionBehavior: "allow_clean",
          untrackedCount: 0,
          dirtyPaths: [],
        }),
        policyPurpose: null,
      }],
    });
    expect(() => verifyRepositoryBackup(fixture.args)).toThrow(/missing required approval detail/);
  });
});

function approvedRepository({ path: repoPath, lifecycle, endWorkSessionBehavior, untrackedCount, dirtyPaths }) {
  return {
    path: repoPath,
    repositoryType: "linked_worktree",
    head: "0000000000000000000000000000000000000000",
    trackedRootGitlinkSha: null,
    dirtyTrackedCount: 0,
    deletedTrackedCount: 0,
    untrackedCount,
    dirtyPaths,
    configuredSubmodule: false,
    explicitlyAllowlisted: true,
    policyClassification: "explicitly_allowed",
    policyPurpose: `fixture purpose for ${repoPath}`,
    policyOwner: "founder",
    policyLifecycle: lifecycle,
    participatesInBackup: true,
    recoveryRequirements: "fixture recovery requirement",
    endWorkSessionBehavior,
    allowed: true,
    violations: [],
  };
}

function unapprovedRepository({ path: repoPath }) {
  return {
    path: repoPath,
    repositoryType: "linked_worktree",
    head: "0000000000000000000000000000000000000000",
    trackedRootGitlinkSha: null,
    dirtyTrackedCount: 0,
    deletedTrackedCount: 0,
    untrackedCount: 0,
    dirtyPaths: [],
    configuredSubmodule: false,
    explicitlyAllowlisted: false,
    policyClassification: "blocked_linked_worktree",
    policyPurpose: null,
    policyOwner: null,
    policyLifecycle: null,
    participatesInBackup: false,
    recoveryRequirements: null,
    endWorkSessionBehavior: "block",
    allowed: false,
    violations: ["embedded repository is not explicitly configured; default policy is block"],
  };
}

function createBackupFixture({ repositories, forcePassed = false, forceTopLevelPassed = false }) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-verify-backup-"));
  workspaces.push(workspace);

  const repository = path.join(workspace, "repository");
  fs.mkdirSync(repository);
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.email", "verify-backup-test@example.com");
  git(repository, "config", "user.name", "Verify Backup Test");
  fs.writeFileSync(path.join(repository, "README.md"), "fixture\n");
  git(repository, "add", "-A");
  git(repository, "commit", "-m", "fixture root");
  const head = git(repository, "rev-parse", "HEAD");

  const backupPath = path.join(workspace, "backup");
  fs.mkdirSync(backupPath);
  const bundlePath = path.join(backupPath, "physiqueos.bundle");
  git(repository, "bundle", "create", bundlePath, "--all");
  const bundleSha256 = sha256(bundlePath);

  const violations = repositories.flatMap((entry) =>
    (entry.violations ?? []).map((message) => `${entry.path}: ${message}`));
  const nestedAudit = {
    schemaVersion: "physiqueos_embedded_repository_audit_v1",
    auditedAtUtc: new Date().toISOString(),
    repositoryRoot: repository,
    rootHead: head,
    policyPath: path.join(repository, "config/embedded-repository-policy.json"),
    repositoryCount: repositories.length,
    repositories,
    traversalExclusions: [".git", ".next", "node_modules"],
    violations,
    passed: forceTopLevelPassed ? true : violations.length === 0,
  };
  const completeness = {
    schemaVersion: "physiqueos_backup_completeness_v1",
    evaluatedAtUtc: new Date().toISOString(),
    nestedAudit,
    externalArtifacts: [],
    violations: forcePassed ? [] : violations,
    passed: forcePassed ? true : violations.length === 0,
  };
  writeJson(path.join(backupPath, "backup-completeness.json"), completeness);

  const manifest = {
    schemaVersion: "physiqueos_backup_manifest_v2",
    createdAtUtc: new Date().toISOString(),
    repository: "physiqueos-fixture",
    branch: "main",
    commit: head,
    bundle: { file: "physiqueos.bundle", sha256: bundleSha256, verificationStatus: "verified" },
    completeness: {
      passed: completeness.passed,
      reportFile: "backup-completeness.json",
      nestedRepositoryCount: repositories.length,
      externalArtifacts: [],
    },
  };
  writeJson(path.join(backupPath, "manifest.json"), manifest);

  const checksumFiles = ["backup-completeness.json", "manifest.json", "physiqueos.bundle"];
  const checksumLines = checksumFiles.map((file) => `${sha256(path.join(backupPath, file)).toLowerCase()}  ${file}`);
  fs.writeFileSync(path.join(backupPath, "checksums.txt"), `${checksumLines.join("\n")}\n`);

  return {
    workspace,
    repository,
    backupPath,
    args: { backupPath, expectedHead: head, expectedBranch: "main" },
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}
