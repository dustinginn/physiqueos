import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function auditEmbeddedRepositories({ repositoryRoot, policyPath }) {
  const root = path.resolve(repositoryRoot);
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const topLevel = git(root, ["rev-parse", "--show-toplevel"]).stdout.trim();
  if (!topLevel || path.resolve(topLevel) !== root) {
    throw new Error(`Embedded-repository audit requires the root worktree: ${root}`);
  }

  const trackedGitlinks = getTrackedGitlinks(root);
  const configuredSubmodules = getConfiguredSubmodules(root);
  const discoveries = scanForRepositories(root, policy.traversalExclusions ?? []);
  for (const gitlink of trackedGitlinks.values()) {
    if (!discoveries.has(gitlink.path)) {
      discoveries.set(gitlink.path, {
        path: gitlink.path,
        repositoryType: "tracked_gitlink_without_worktree_metadata",
        gitMetadataPath: null,
      });
    }
  }

  const policyByPath = new Map(
    (policy.repositories ?? []).map((entry) => [normalize(entry.path), entry]),
  );
  const repositories = [];
  const violations = [];

  for (const discovery of [...discoveries.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const nestedRoot = path.join(root, discovery.path);
    const tracked = trackedGitlinks.get(discovery.path) ?? null;
    const configuredSubmodule = configuredSubmodules.has(discovery.path);
    const nested = inspectNestedRepository(nestedRoot);
    const configuredPolicy = policyByPath.get(discovery.path) ?? null;
    const policyResult = evaluatePolicy({
      configuredPolicy,
      configuredSubmodule,
      discovery,
      nested,
      tracked,
    });
    const record = {
      path: discovery.path,
      repositoryType: configuredSubmodule ? "submodule" : discovery.repositoryType,
      head: nested.head,
      trackedRootGitlinkSha: tracked?.sha ?? null,
      dirtyTrackedCount: nested.modified,
      deletedTrackedCount: nested.deleted,
      untrackedCount: nested.untracked,
      dirtyPaths: nested.paths,
      configuredSubmodule,
      explicitlyAllowlisted: Boolean(configuredPolicy),
      policyClassification: policyResult.classification,
      policyPurpose: configuredPolicy?.purpose ?? null,
      policyOwner: configuredPolicy?.owner ?? null,
      policyLifecycle: configuredPolicy?.lifecycle ?? null,
      participatesInBackup: configuredPolicy?.participatesInBackup ?? false,
      recoveryRequirements: configuredPolicy?.recoveryRequirements ?? null,
      endWorkSessionBehavior: configuredPolicy?.endWorkSessionBehavior ?? "block",
      allowed: policyResult.allowed,
      violations: policyResult.violations,
    };
    repositories.push(record);
    violations.push(...policyResult.violations.map((message) => `${discovery.path}: ${message}`));
  }

  return {
    schemaVersion: "physiqueos_embedded_repository_audit_v1",
    auditedAtUtc: new Date().toISOString(),
    repositoryRoot: root,
    rootHead: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
    policyPath: path.resolve(policyPath),
    repositoryCount: repositories.length,
    repositories,
    traversalExclusions: policy.traversalExclusions ?? [],
    violations,
    passed: violations.length === 0,
  };
}

function scanForRepositories(root, exclusions) {
  const discoveries = new Map();
  const pending = [{ absolute: root, relative: "" }];
  while (pending.length) {
    const current = pending.pop();
    if (current.relative) {
      const gitMetadata = path.join(current.absolute, ".git");
      if (fs.existsSync(gitMetadata)) {
        const stat = fs.lstatSync(gitMetadata);
        discoveries.set(current.relative, {
          path: current.relative,
          repositoryType: stat.isDirectory()
            ? "standalone_repository"
            : classifyGitFile(gitMetadata),
          gitMetadataPath: gitMetadata,
        });
        continue;
      }
    }
    let children;
    try {
      children = fs.readdirSync(current.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      const relative = normalize(path.join(current.relative, child.name));
      if (isExcluded(relative, child.name, exclusions)) continue;
      pending.push({ absolute: path.join(current.absolute, child.name), relative });
    }
  }
  return discoveries;
}

function classifyGitFile(gitMetadataPath) {
  const value = fs.readFileSync(gitMetadataPath, "utf8").trim().replaceAll("\\", "/");
  if (/\/worktrees\//i.test(value)) return "linked_worktree";
  if (/\/modules\//i.test(value)) return "submodule_worktree";
  return "git_file_repository";
}

function isExcluded(relative, name, exclusions) {
  return exclusions.some((pattern) => {
    const normalizedPattern = normalize(pattern);
    if (normalizedPattern.endsWith("*")) {
      const prefix = normalizedPattern.slice(0, -1);
      return name.startsWith(prefix) || relative.startsWith(prefix);
    }
    return name === normalizedPattern || relative === normalizedPattern;
  });
}

function getTrackedGitlinks(root) {
  const output = git(root, ["-c", "core.quotepath=false", "ls-files", "--stage"]).stdout;
  const result = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\d+) ([0-9a-f]+) \d+\t(.+)$/.exec(line);
    if (match?.[1] === "160000") {
      const relativePath = normalize(match[3]);
      result.set(relativePath, { path: relativePath, sha: match[2] });
    }
  }
  return result;
}

function getConfiguredSubmodules(root) {
  const gitmodules = path.join(root, ".gitmodules");
  if (!fs.existsSync(gitmodules)) return new Set();
  const result = spawnSync("git", ["config", "-f", gitmodules, "--get-regexp", "^submodule\\..*\\.path$"], {
    cwd: root,
    encoding: "utf8",
  });
  if (![0, 1].includes(result.status)) {
    throw new Error(`Unable to inspect .gitmodules: ${result.stderr}`);
  }
  return new Set((result.stdout ?? "").split(/\r?\n/).filter(Boolean).map((line) => normalize(line.replace(/^\S+\s+/, ""))));
}

function inspectNestedRepository(nestedRoot) {
  if (!fs.existsSync(nestedRoot)) {
    return { head: null, modified: 0, deleted: 0, untracked: 0, paths: [] };
  }
  const headResult = git(nestedRoot, ["rev-parse", "HEAD"], { allowFailure: true });
  const statusResult = git(nestedRoot, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall"], { allowFailure: true });
  if (statusResult.status !== 0) {
    return { head: headResult.status === 0 ? headResult.stdout.trim() : null, modified: 0, deleted: 0, untracked: 0, paths: [] };
  }
  let modified = 0;
  let deleted = 0;
  let untracked = 0;
  const paths = [];
  for (const line of statusResult.stdout.split(/\r?\n/).filter(Boolean)) {
    const status = line.slice(0, 2);
    const relativePath = normalize(line.slice(3));
    paths.push({ path: relativePath, status });
    if (status === "??") untracked++;
    else if (status.includes("D")) deleted++;
    else modified++;
  }
  return { head: headResult.status === 0 ? headResult.stdout.trim() : null, modified, deleted, untracked, paths };
}

function evaluatePolicy({ configuredPolicy, configuredSubmodule, discovery, nested, tracked }) {
  const violations = [];
  if (!configuredPolicy) {
    violations.push("embedded repository is not explicitly configured; default policy is block");
  } else {
    if (configuredPolicy.repositoryType === "submodule" && !configuredSubmodule) {
      violations.push("policy expects an intentional submodule, but .gitmodules does not own this path");
    }
    if (configuredSubmodule && configuredPolicy.repositoryType !== "submodule") {
      violations.push(".gitmodules owns this path, but policy does not classify it as a submodule");
    }
    if (tracked?.sha && nested.head && tracked.sha !== nested.head && !configuredPolicy.allowHeadDrift) {
      violations.push(`nested HEAD ${nested.head} differs from tracked gitlink ${tracked.sha}`);
    }
    const dirtyCount = nested.modified + nested.deleted + nested.untracked;
    if (dirtyCount > 0) {
      if (configuredPolicy.endWorkSessionBehavior === "allow_generated_only") {
        const patterns = configuredPolicy.generatedOnlyPatterns ?? [];
        const unsafe = nested.paths.filter((entry) => !patterns.some((pattern) => matchesPath(entry.path, pattern)));
        if (!configuredPolicy.mayBeDirty || !configuredPolicy.generatedOnlyDirtyAllowed || unsafe.length) {
          violations.push(`dirty state is not permitted by the generated-only policy (${dirtyCount} paths)`);
        }
      } else {
        violations.push(`dirty nested repository is blocked (${nested.modified} modified, ${nested.deleted} deleted, ${nested.untracked} untracked)`);
      }
    }
    if (!["allow_clean", "allow_generated_only"].includes(configuredPolicy.endWorkSessionBehavior)) {
      violations.push("policy endWorkSessionBehavior is block");
    }
  }
  if (tracked && !configuredSubmodule) {
    violations.push(`mode-160000 entry ${tracked.sha} has no intentional .gitmodules ownership`);
  }
  return {
    allowed: violations.length === 0,
    classification: violations.length === 0 ? "explicitly_allowed" : discovery.repositoryType === "linked_worktree" ? "blocked_linked_worktree" : "blocked_embedded_repository",
    violations,
  };
}

function matchesPath(relativePath, pattern) {
  const normalizedPath = normalize(relativePath);
  const normalizedPattern = normalize(pattern);
  if (normalizedPattern.endsWith("/**")) return normalizedPath.startsWith(normalizedPattern.slice(0, -3));
  return normalizedPath === normalizedPattern;
}

function normalize(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, ...args], {
    cwd,
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Git failed in ${cwd}: git ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    options[argv[index]] = argv[index + 1];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const repositoryRoot = path.resolve(options["--repository-root"] ?? process.cwd());
    const policyPath = path.resolve(options["--policy"] ?? path.join(repositoryRoot, "config/embedded-repository-policy.json"));
    const report = auditEmbeddedRepositories({ repositoryRoot, policyPath });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (options["--output"]) fs.writeFileSync(path.resolve(options["--output"]), serialized, "utf8");
    const summary = {
      passed: report.passed,
      repositoryCount: report.repositoryCount,
      repositories: report.repositories.map((entry) => ({
        path: entry.path,
        repositoryType: entry.repositoryType,
        head: entry.head,
        trackedRootGitlinkSha: entry.trackedRootGitlinkSha,
        dirtyTrackedCount: entry.dirtyTrackedCount,
        deletedTrackedCount: entry.deletedTrackedCount,
        untrackedCount: entry.untrackedCount,
        allowed: entry.allowed,
      })),
      violations: report.violations,
    };
    process.stdout.write(options["--verbose"] === "true" ? serialized : `${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
