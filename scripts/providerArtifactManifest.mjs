import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROVIDER_ARTIFACT_MANIFEST_VERSION =
  "physiqueos_provider_artifact_manifest_v1";
export const PROVIDER_BUILD_IDENTITY_FILE = "PROVIDER_BUILD_IDENTITY.json";
export const PROVIDER_ARTIFACT_MANIFEST_FILE = "provider-artifact-manifest.json";

export function createProviderBuildIdentity({
  sourceCommit,
  sourceTree,
  providerBuildId,
  nextBuildId,
} = {}) {
  return Object.freeze({
    schemaVersion: "physiqueos_provider_build_identity_v1",
    sourceCommit: exactCommit(sourceCommit),
    sourceTree: exactTree(sourceTree),
    providerBuildId: required(providerBuildId, "providerBuildId"),
    nextBuildId: required(nextBuildId, "nextBuildId"),
  });
}

export function writeProviderBuildIdentity({ destination, identity } = {}) {
  const target = path.resolve(required(destination, "destination"));
  fs.writeFileSync(target, `${JSON.stringify(identity)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return target;
}

export function inventoryArtifactRoot(root) {
  const resolved = path.resolve(required(root, "root"));
  const hash = createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;
  for (const file of listFiles(resolved)) {
    const relative = path.relative(resolved, file).split(path.sep).join("/");
    const contents = fs.readFileSync(file);
    fileCount += 1;
    totalBytes += contents.length;
    hash.update(`${path.basename(resolved)}/${relative}\0`);
    hash.update(contents);
  }
  return Object.freeze({
    fileCount,
    totalBytes,
    sha256: hash.digest("hex").toUpperCase(),
  });
}

export function writeProviderArtifactManifest({
  artifactRoot,
  identity,
  webRoot,
  workerRoot,
  web,
  worker,
} = {}) {
  const manifestRoot = path.resolve(required(artifactRoot, "artifactRoot"));
  const body = {
    schemaVersion: PROVIDER_ARTIFACT_MANIFEST_VERSION,
    identity,
    web: normalizeInventory(web ?? inventoryArtifactRoot(webRoot)),
    worker: normalizeInventory(worker ?? inventoryArtifactRoot(workerRoot)),
  };
  const manifest = Object.freeze({
    ...body,
    manifestSha256: digest(body),
  });
  const manifestPath = path.join(manifestRoot, PROVIDER_ARTIFACT_MANIFEST_FILE);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return Object.freeze({ manifest, manifestPath });
}

export function validateProviderArtifactManifest({
  artifactRoot,
  expectedIdentity,
} = {}) {
  const root = path.resolve(required(artifactRoot, "artifactRoot"));
  const manifestPath = path.join(root, PROVIDER_ARTIFACT_MANIFEST_FILE);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const { manifestSha256, ...body } = manifest;
  if (manifest.schemaVersion !== PROVIDER_ARTIFACT_MANIFEST_VERSION ||
      manifestSha256 !== digest(body)) {
    throw coded("PROVIDER_ARTIFACT_MANIFEST_INVALID",
      "Provider artifact manifest identity is invalid.");
  }
  if (!sameIdentity(manifest.identity, expectedIdentity)) {
    throw coded("PROVIDER_ARTIFACT_SOURCE_IDENTITY_MISMATCH",
      "Provider artifact source/build identity differs from the requested build.");
  }
  const webRoot = path.join(root, "web");
  const workerRoot = path.join(root, "worker");
  for (const outputRoot of [webRoot, workerRoot]) {
    const embedded = JSON.parse(fs.readFileSync(
      path.join(outputRoot, PROVIDER_BUILD_IDENTITY_FILE), "utf8"));
    if (!sameIdentity(embedded, expectedIdentity)) {
      throw coded("PROVIDER_ARTIFACT_SOURCE_IDENTITY_MISMATCH",
        "Provider artifact embedded identity differs from its manifest.");
    }
  }
  const actualWeb = inventoryArtifactRoot(webRoot);
  const actualWorker = inventoryArtifactRoot(workerRoot);
  if (!sameInventory(actualWeb, manifest.web) ||
      !sameInventory(actualWorker, manifest.worker)) {
    throw coded("PROVIDER_ARTIFACT_CONTENT_MISMATCH",
      "Provider artifact contents differ from the bound manifest.");
  }
  return Object.freeze({
    status: "PASS",
    manifestPath,
    manifestSha256,
    identity: Object.freeze(manifest.identity),
    web: actualWeb,
    worker: actualWorker,
  });
}

function normalizeInventory(value) {
  return Object.freeze({
    fileCount: Number(value?.fileCount),
    totalBytes: Number(value?.totalBytes),
    sha256: String(value?.sha256 ?? "").toUpperCase(),
  });
}

function sameInventory(left, right) {
  return left.fileCount === right.fileCount &&
    left.totalBytes === right.totalBytes &&
    left.sha256 === right.sha256;
}

function sameIdentity(left, right) {
  return left?.schemaVersion === right?.schemaVersion &&
    left?.sourceCommit === right?.sourceCommit &&
    left?.sourceTree === right?.sourceTree &&
    left?.providerBuildId === right?.providerBuildId &&
    left?.nextBuildId === right?.nextBuildId;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value))
    .digest("hex").toUpperCase();
}

function listFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw coded("PROVIDER_ARTIFACT_REPARSE_PATH_FORBIDDEN",
        `Provider artifact contains a symbolic/reparse path: ${full}`);
    }
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function exactCommit(value) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(result)) throw new Error("sourceCommit is invalid.");
  return result;
}

function exactTree(value) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(result)) throw new Error("sourceTree is invalid.");
  return result;
}

function required(value, field) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function coded(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}
