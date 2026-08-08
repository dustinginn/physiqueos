import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditEmbeddedRepositories } from "./auditEmbeddedRepositories.mjs";

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("embedded repository audit", () => {
  it("Case A blocks an unconfigured standalone nested repository", () => {
    const root = createRoot();
    createNestedRepository(root, "nested");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories[0]).toMatchObject({
      path: "nested",
      repositoryType: "standalone_repository",
      explicitlyAllowlisted: false,
    });
  });

  it("Case B blocks an unconfigured linked worktree", () => {
    const root = createRoot();
    git(root, "worktree", "add", "-b", "fixture-linked", path.join(root, "linked"), "HEAD");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories[0]).toMatchObject({
      path: "linked",
      repositoryType: "linked_worktree",
    });
  });

  it("Case C blocks modified tracked source inside a nested repository", () => {
    const root = createRoot();
    const nested = createNestedRepository(root, "nested");
    write(nested, "source.js", "export const value = 2;\n");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories[0].dirtyTrackedCount).toBe(1);
  });

  it("Case D reports both nested and tracked gitlink SHAs when HEAD drifts", () => {
    const root = createRoot();
    const nested = createNestedRepository(root, "nested");
    git(root, "add", "nested");
    git(root, "commit", "-m", "track nested gitlink");
    const trackedSha = git(root, "rev-parse", "HEAD:nested");
    write(nested, "later.js", "export const later = true;\n");
    git(nested, "add", "later.js");
    git(nested, "commit", "-m", "advance nested");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories[0].trackedRootGitlinkSha).toBe(trackedSha);
    expect(report.repositories[0].head).not.toBe(trackedSha);
  });

  it("Case E blocks unknown untracked nested source", () => {
    const root = createRoot();
    const nested = createNestedRepository(root, "nested");
    write(nested, "untracked.js", "export const untracked = true;\n");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories[0].untrackedCount).toBe(1);
  });

  it("Case F allows approved generated-only dirtiness only under explicit policy", () => {
    const root = createRoot();
    const nested = createNestedRepository(root, "nested");
    write(nested, "generated/cache.bin", "generated\n");
    writePolicy(root, [{
      path: "nested",
      repositoryType: "standalone_repository",
      purpose: "fixture generated output",
      owner: "test",
      lifecycle: "fixture",
      mayBeDirty: true,
      generatedOnlyDirtyAllowed: true,
      generatedOnlyPatterns: ["generated/**"],
      participatesInBackup: false,
      recoveryRequirements: "none",
      endWorkSessionBehavior: "allow_generated_only",
    }]);
    const report = audit(root);
    expect(report.passed).toBe(true);
    expect(report.repositories[0].allowed).toBe(true);
  });

  it("Case G blocks before git add can introduce mode-160000", () => {
    const root = createRoot();
    createNestedRepository(root, "nested");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(git(root, "ls-files", "--stage")).not.toContain("160000");
  });

  it("Case N passes when no nested repositories exist", () => {
    const root = createRoot();
    expect(audit(root)).toMatchObject({ passed: true, repositoryCount: 0 });
  });

  it("Case O handles a configured intentional submodule under explicit policy", () => {
    const root = createRoot();
    const external = createExternalRepository();
    git(root, "-c", "protocol.file.allow=always", "submodule", "add", external, "modules/intentional");
    git(root, "commit", "-am", "add intentional submodule");
    writePolicy(root, [{
      path: "modules/intentional",
      repositoryType: "submodule",
      purpose: "fixture intentional dependency",
      owner: "test",
      lifecycle: "submodule",
      mayBeDirty: false,
      generatedOnlyDirtyAllowed: false,
      participatesInBackup: true,
      recoveryRequirements: "restore using .gitmodules",
      endWorkSessionBehavior: "allow_clean",
    }]);
    const report = audit(root);
    expect(report.passed).toBe(true);
    expect(report.repositories[0]).toMatchObject({
      configuredSubmodule: true,
      repositoryType: "submodule",
      allowed: true,
    });
  });

  it("Case P detects the current accidental deployment topology fixture", () => {
    const root = createRoot();
    createNestedRepository(root, "deployment/cumulative-production-source");
    createNestedRepository(root, "deployment/retatrutide-support-source");
    git(root, "add", "deployment/cumulative-production-source", "deployment/retatrutide-support-source");
    const report = audit(root);
    expect(report.passed).toBe(false);
    expect(report.repositories).toHaveLength(2);
    expect(report.repositories.every((entry) => entry.trackedRootGitlinkSha)).toBe(true);
    expect(report.violations.join("\n")).toContain("no intentional .gitmodules ownership");
  });
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-embedded-root-"));
  workspaces.push(root);
  git(root, "init", "--quiet");
  configureGit(root);
  write(root, "README.md", "root\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "initial root");
  writePolicy(root, []);
  return root;
}

function createNestedRepository(root, relativePath) {
  const nested = path.join(root, relativePath);
  fs.mkdirSync(nested, { recursive: true });
  git(nested, "init", "--quiet");
  configureGit(nested);
  write(nested, "source.js", "export const value = 1;\n");
  git(nested, "add", "source.js");
  git(nested, "commit", "-m", "initial nested");
  return nested;
}

function createExternalRepository() {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-submodule-source-"));
  workspaces.push(external);
  git(external, "init", "--quiet");
  configureGit(external);
  write(external, "module.js", "export const moduleValue = true;\n");
  git(external, "add", "module.js");
  git(external, "commit", "-m", "initial module");
  return external;
}

function writePolicy(root, repositories) {
  write(root, "config/embedded-repository-policy.json", `${JSON.stringify({
    schemaVersion: "physiqueos_embedded_repository_policy_v1",
    traversalExclusions: [".git", ".next", "node_modules"],
    repositories,
    externalArtifacts: [],
  }, null, 2)}\n`);
}

function audit(root) {
  return auditEmbeddedRepositories({
    repositoryRoot: root,
    policyPath: path.join(root, "config/embedded-repository-policy.json"),
  });
}

function configureGit(repository) {
  git(repository, "config", "user.email", "audit-test@example.com");
  git(repository, "config", "user.name", "Audit Test");
}

function write(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}
