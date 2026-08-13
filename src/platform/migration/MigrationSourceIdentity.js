import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TRUSTED_IDENTITY = Symbol("trusted-migration-source-identity");

export const MIGRATION_SOURCE_IDENTITY_VERSION = "migration-source-identity-v1";

export async function deriveTrustedMigrationSourceIdentity({
  runtimePath,
  packageVersion,
  sourceSchemaVersion,
  buildIdentityProvider,
  migrationOperationId = null,
} = {}) {
  if (typeof buildIdentityProvider !== "function") {
    throw new Error("Migration source identity requires a trusted build-identity provider.");
  }
  const bytes = await fs.readFile(path.resolve(runtimePath));
  const runtime = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  const build = await buildIdentityProvider();
  const identity = {
    identityVersion: MIGRATION_SOURCE_IDENTITY_VERSION,
    runtime: {
      version: required(runtime.version, "runtime.version"),
      revision: String(runtime.revision ?? 0),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      updatedAt: new Date(runtime.updatedAt ?? runtime.importedAt).toISOString(),
    },
    repository: {
      commit: commit(build.repositoryCommit, "repositoryCommit"),
    },
    application: {
      buildId: required(build.applicationBuildId, "applicationBuildId"),
      sourceCommit: commit(build.applicationSourceCommit, "applicationSourceCommit"),
    },
    migration: {
      scriptCommit: commit(build.migrationScriptCommit, "migrationScriptCommit"),
      operationId: optional(migrationOperationId),
    },
    package: {
      version: required(packageVersion, "packageVersion"),
    },
    schema: {
      sourceVersion: required(sourceSchemaVersion, "sourceSchemaVersion"),
    },
  };
  Object.defineProperty(identity, TRUSTED_IDENTITY, { value: true, enumerable: false });
  return deepFreeze(identity);
}

export function assertTrustedMigrationSourceIdentity(identity) {
  if (!identity?.[TRUSTED_IDENTITY]) {
    throw new Error("Canonical export requires source identity derived by the trusted resolver.");
  }
  validateSerializableMigrationSourceIdentity(identity);
  return identity;
}

export function validateSerializableMigrationSourceIdentity(identity) {
  if (identity?.identityVersion !== MIGRATION_SOURCE_IDENTITY_VERSION) {
    throw new Error("Migration source identity version is unsupported.");
  }
  required(identity.runtime?.version, "runtime.version");
  required(identity.runtime?.revision, "runtime.revision");
  sha256(identity.runtime?.sha256, "runtime.sha256");
  new Date(identity.runtime?.updatedAt).toISOString();
  commit(identity.repository?.commit, "repository.commit");
  required(identity.application?.buildId, "application.buildId");
  commit(identity.application?.sourceCommit, "application.sourceCommit");
  commit(identity.migration?.scriptCommit, "migration.scriptCommit");
  required(identity.package?.version, "package.version");
  required(identity.schema?.sourceVersion, "schema.sourceVersion");
  return identity;
}

export function assertMigrationSourceIdentityMatches(actual, expected, {
  requireMigrationOperationId = false,
} = {}) {
  validateSerializableMigrationSourceIdentity(actual);
  validateSerializableMigrationSourceIdentity(expected);
  const comparisons = [
    ["repository commit", actual.repository.commit, expected.repository.commit],
    ["application build ID", actual.application.buildId, expected.application.buildId],
    ["application source commit", actual.application.sourceCommit, expected.application.sourceCommit],
    ["migration script commit", actual.migration.scriptCommit, expected.migration.scriptCommit],
    ["Founder runtime version", actual.runtime.version, expected.runtime.version],
    ["Founder runtime revision", actual.runtime.revision, expected.runtime.revision],
    ["Founder runtime hash", actual.runtime.sha256, expected.runtime.sha256],
    ["migration package version", actual.package.version, expected.package.version],
    ["source schema version", actual.schema.sourceVersion, expected.schema.sourceVersion],
  ];
  if (requireMigrationOperationId || expected.migration.operationId != null) {
    comparisons.push(["migration operation ID", actual.migration.operationId, expected.migration.operationId]);
  }
  const mismatches = comparisons
    .filter(([, left, right]) => String(left ?? "") !== String(right ?? ""))
    .map(([field, left, right]) => ({ field, actual: left ?? null, expected: right ?? null }));
  if (mismatches.length) {
    const error = new Error(`Canonical package source identity mismatch: ${mismatches.map((item) => item.field).join(", ")}.`);
    error.code = "MIGRATION_SOURCE_IDENTITY_MISMATCH";
    error.mismatches = Object.freeze(mismatches.map(Object.freeze));
    throw error;
  }
  return true;
}

export function createFilesystemBuildIdentityProvider({
  repositoryRoot = process.cwd(),
  distDirectory = process.env.PHYSIQUEOS_BUILD_DIST_DIR ?? ".next",
  expectedRepositoryCommit = null,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const dist = path.resolve(root, distDirectory);
  return async () => {
    const repositoryCommit = (await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    })).stdout.trim();
    if (expectedRepositoryCommit != null && repositoryCommit !== expectedRepositoryCommit) {
      throw new Error("Repository HEAD does not match the expected migration-script checkpoint.");
    }
    const [applicationBuildId, applicationSourceCommit] = await Promise.all([
      fs.readFile(path.join(dist, "BUILD_ID"), "utf8").then((value) => value.trim()),
      fs.readFile(path.join(dist, "SOURCE_COMMIT"), "utf8").then((value) => value.trim()),
    ]);
    return Object.freeze({
      repositoryCommit,
      applicationBuildId,
      applicationSourceCommit,
      migrationScriptCommit: repositoryCommit,
    });
  };
}

export function createFixedBuildIdentityProvider(identity) {
  const value = Object.freeze({
    repositoryCommit: commit(identity?.repositoryCommit, "repositoryCommit"),
    applicationBuildId: required(identity?.applicationBuildId, "applicationBuildId"),
    applicationSourceCommit: commit(identity?.applicationSourceCommit, "applicationSourceCommit"),
    migrationScriptCommit: commit(identity?.migrationScriptCommit, "migrationScriptCommit"),
  });
  return async () => value;
}

function commit(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(candidate)) throw new Error(`${field} must be a Git commit identity.`);
  return candidate;
}

function sha256(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error(`${field} must be SHA-256 hex.`);
  return candidate;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function optional(value) {
  const candidate = String(value ?? "").trim();
  return candidate || null;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
