import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FORBIDDEN_ROOT_DIRECTORIES = new Set([
  ".tmp", "backups", "logs", "playwright-report", "private", "runtime-exports",
  "screenshots", "test-results", "tmp",
]);
const FORBIDDEN_FILE_NAMES = [
  /^\.env(?:\.|$)/i,
  /founder.*runtime.*\.json$/i,
  /^runtime-store(?:\..*)?\.json$/i,
  /^migration-control(?:\..*)?\.json$/i,
  /playwright.*founder/i,
  /credential.*\.clixml$/i,
];
const FORBIDDEN_ARCHIVE_NAMES = [
  /recovery.*\.(?:zip|7z|tar|tgz|gz|enc)$/i,
  /\.(?:dump|backup)$/i,
];
const SECRET_PATTERNS = [
  { name: "credential-bearing-database-uri", pattern: /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i },
  { name: "digitalocean-api-token", pattern: /\bdop_v1_[A-Za-z0-9_-]{20,}\b/ },
  { name: "founder-owner-identifier", pattern: /\buser_founder_[A-Za-z0-9_-]+\b/i },
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

export async function scanProviderArtifact({
  roots,
  forbiddenValues = readJsonEnvironment("PHYSIQUEOS_ARTIFACT_FORBIDDEN_VALUES"),
  forbiddenSha256 = readJsonEnvironment("PHYSIQUEOS_ARTIFACT_FORBIDDEN_SHA256"),
  founderOwnerIdentifiers = readJsonEnvironment("PHYSIQUEOS_ARTIFACT_FOUNDER_OWNER_IDENTIFIERS"),
} = {}) {
  if (!Array.isArray(roots) || roots.length === 0) throw new Error("Provider artifact scan requires at least one root.");
  const violations = [];
  let fileCount = 0;
  let totalBytes = 0;
  const normalizedForbiddenHashes = new Set(forbiddenSha256.map((value) => String(value).toLowerCase()));
  const sensitiveValues = [...forbiddenValues, ...founderOwnerIdentifiers]
    .map(String).filter((value) => value.length >= 8);

  for (const inputRoot of roots) {
    const root = path.resolve(inputRoot);
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new Error(`Provider artifact scan root is not a directory: ${root}`);
    for await (const filePath of walk(root)) {
      fileCount += 1;
      const relativePath = normalize(path.relative(root, filePath));
      const rootSegment = relativePath.split("/")[0].toLowerCase();
      const fileName = path.basename(relativePath);
      const file = await fs.readFile(filePath);
      totalBytes += file.length;

      if (FORBIDDEN_ROOT_DIRECTORIES.has(rootSegment)) violation(violations, relativePath, "forbidden-root-directory");
      if (FORBIDDEN_FILE_NAMES.some((pattern) => pattern.test(fileName))) violation(violations, relativePath, "forbidden-private-filename");
      if (FORBIDDEN_ARCHIVE_NAMES.some((pattern) => pattern.test(fileName))) violation(violations, relativePath, "forbidden-recovery-artifact");

      const digest = createHash("sha256").update(file).digest("hex");
      if (normalizedForbiddenHashes.has(digest)) violation(violations, relativePath, "forbidden-production-file-hash");

      const text = file.toString("utf8");
      for (const item of SECRET_PATTERNS) {
        if (item.pattern.test(text)) violation(violations, relativePath, item.name);
      }
      if (sensitiveValues.some((value) => text.includes(value))) {
        violation(violations, relativePath, "forbidden-private-value");
      }
    }
  }

  const result = Object.freeze({
    status: violations.length === 0 ? "PASS" : "BLOCKED",
    fileCount,
    totalBytes,
    violations: Object.freeze(violations),
  });
  if (violations.length > 0) {
    const error = new Error(`Provider artifact privacy scan found ${violations.length} violation(s).`);
    error.code = "PROVIDER_ARTIFACT_PRIVACY_REJECTED";
    error.result = result;
    throw error;
  }
  return result;
}

async function* walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      violationError(entryPath, "Provider artifact scan refuses symbolic links.");
    }
    if (entry.isDirectory()) yield* walk(entryPath);
    else if (entry.isFile()) yield entryPath;
  }
}

function readJsonEnvironment(name) {
  const value = process.env[name];
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array.`);
  return parsed;
}

function violation(target, relativePath, reason) {
  if (!target.some((entry) => entry.path === relativePath && entry.reason === reason)) {
    target.push(Object.freeze({ path: relativePath, reason }));
  }
}

function violationError(entryPath, message) {
  const error = new Error(`${message} ${entryPath}`);
  error.code = "PROVIDER_ARTIFACT_PRIVACY_REJECTED";
  throw error;
}

function normalize(value) { return value.split(path.sep).join("/"); }

async function main() {
  try {
    const result = await scanProviderArtifact({ roots: process.argv.slice(2) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error?.result) process.stderr.write(`${JSON.stringify(error.result)}\n`);
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
