import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${label} is missing or invalid JSON: ${error.message}`);
  }
}

function resolveBackupFile(backupPath, relativePath, label) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a relative backup path`);
  }
  const resolved = path.resolve(backupPath, relativePath);
  const boundary = `${path.resolve(backupPath)}${path.sep}`;
  if (!resolved.startsWith(boundary)) throw new Error(`${label} escapes the backup directory`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} is missing: ${resolved}`);
  }
  return resolved;
}

function listFiles(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  };
  visit(root);
  return result.sort();
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout;
}

export function verifyRepositoryBackup({ backupPath, expectedHead, expectedBranch }) {
  if (!backupPath || !expectedHead || !expectedBranch) {
    throw new Error("Backup path, expected HEAD, and expected branch are required");
  }
  const resolvedBackup = path.resolve(backupPath);
  if (!fs.existsSync(resolvedBackup) || !fs.statSync(resolvedBackup).isDirectory()) {
    throw new Error(`Backup directory is missing: ${resolvedBackup}`);
  }

  const manifestPath = path.join(resolvedBackup, "manifest.json");
  const completenessPath = path.join(resolvedBackup, "backup-completeness.json");
  const checksumPath = path.join(resolvedBackup, "checksums.txt");
  const manifest = readJson(manifestPath, "Backup manifest");
  const completeness = readJson(completenessPath, "Backup completeness report");

  if (manifest.schemaVersion !== "physiqueos_backup_manifest_v2") {
    throw new Error(`Unsupported backup manifest schema: ${manifest.schemaVersion}`);
  }
  if (manifest.branch !== expectedBranch) {
    throw new Error(`Backup branch mismatch: expected ${expectedBranch}, found ${manifest.branch}`);
  }
  if (manifest.commit !== expectedHead) {
    throw new Error(`Backup HEAD mismatch: expected ${expectedHead}, found ${manifest.commit}`);
  }
  if (!completeness.passed || (completeness.violations ?? []).length > 0) {
    throw new Error("Backup completeness report did not pass");
  }
  if (completeness.nestedAudit?.repositoryCount !== 0) {
    throw new Error("Backup completeness report contains embedded repositories");
  }
  if (!manifest.completeness?.passed || manifest.completeness?.nestedRepositoryCount !== 0) {
    throw new Error("Backup manifest does not record a passing completeness result");
  }
  if (manifest.completeness?.reportFile !== "backup-completeness.json") {
    throw new Error("Backup manifest references an unexpected completeness report");
  }

  const bundlePath = resolveBackupFile(resolvedBackup, manifest.bundle?.file, "Git bundle");
  const bundleSha256 = sha256(bundlePath);
  if (bundleSha256 !== String(manifest.bundle?.sha256 ?? "").toUpperCase()) {
    throw new Error("Git bundle SHA-256 does not match the backup manifest");
  }
  if (manifest.bundle?.verificationStatus !== "verified") {
    throw new Error("Backup manifest does not mark the Git bundle verified");
  }

  runGit(["bundle", "verify", bundlePath]);
  const heads = runGit(["bundle", "list-heads", bundlePath]).trim().split(/\r?\n/);
  if (!heads.includes(`${expectedHead} refs/heads/${expectedBranch}`)) {
    throw new Error(`Git bundle is missing refs/heads/${expectedBranch} at ${expectedHead}`);
  }
  if (!heads.some((line) => line.startsWith(`${expectedHead} `))) {
    throw new Error(`Git bundle does not contain expected HEAD ${expectedHead}`);
  }

  const checksumLines = fs.readFileSync(checksumPath, "utf8").replace(/^\uFEFF/, "")
    .split(/\r?\n/).filter(Boolean);
  const recorded = new Set();
  for (const line of checksumLines) {
    const match = /^([0-9a-fA-F]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum entry: ${line}`);
    const relativePath = match[2].split("\\").join("/");
    if (recorded.has(relativePath.toLowerCase())) throw new Error(`Duplicate checksum entry: ${relativePath}`);
    recorded.add(relativePath.toLowerCase());
    const filePath = resolveBackupFile(resolvedBackup, relativePath, "Checksummed file");
    if (sha256(filePath) !== match[1].toUpperCase()) {
      throw new Error(`Checksum mismatch: ${relativePath}`);
    }
  }
  const expectedFiles = listFiles(resolvedBackup).filter((file) => file.toLowerCase() !== "checksums.txt");
  const unrecorded = expectedFiles.filter((file) => !recorded.has(file.toLowerCase()));
  if (unrecorded.length > 0 || recorded.size !== expectedFiles.length) {
    throw new Error(`Backup file inventory is incomplete: ${unrecorded.join(", ")}`);
  }

  const manifestArtifacts = new Map(
    (manifest.completeness.externalArtifacts ?? []).map((artifact) => [artifact.id, artifact]),
  );
  if (manifestArtifacts.size !== (completeness.externalArtifacts ?? []).length) {
    throw new Error("Backup manifest external artifact inventory is inconsistent");
  }
  for (const artifact of completeness.externalArtifacts ?? []) {
    const recordedArtifact = manifestArtifacts.get(artifact.id);
    if (!recordedArtifact || recordedArtifact.verificationStatus !== artifact.verificationStatus) {
      throw new Error(`External artifact record mismatch: ${artifact.id}`);
    }
    if (artifact.requiredForSourceRecovery && artifact.verificationStatus !== "verified") {
      throw new Error(`Required external artifact is not verified: ${artifact.id}`);
    }
    if (artifact.verificationStatus === "verified") {
      if (!artifact.manifestPath || !fs.existsSync(artifact.manifestPath)) {
        throw new Error(`Verified external artifact is missing: ${artifact.id}`);
      }
      const actual = sha256(artifact.manifestPath);
      if (
        actual !== String(artifact.manifestSha256).toUpperCase() ||
        actual !== String(artifact.actualSha256).toUpperCase()
      ) {
        throw new Error(`External artifact hash mismatch: ${artifact.id}`);
      }
    }
  }

  const files = listFiles(resolvedBackup);
  const totalBytes = files.reduce((sum, relativePath) => (
    sum + fs.statSync(path.join(resolvedBackup, relativePath)).size
  ), 0);

  return {
    schemaVersion: "physiqueos_verified_backup_identity_v1",
    backupPath: resolvedBackup,
    createdAtUtc: manifest.createdAtUtc,
    manifestSha256: sha256(manifestPath),
    bundleSha256,
    branch: manifest.branch,
    head: manifest.commit,
    fileCount: files.length,
    totalBytes,
    completenessPassed: true,
    externalArtifacts: completeness.externalArtifacts ?? [],
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]] = argv[index + 1];
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const identity = verifyRepositoryBackup({
      backupPath: options["--backup"],
      expectedHead: options["--expected-head"],
      expectedBranch: options["--expected-branch"],
    });
    process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
