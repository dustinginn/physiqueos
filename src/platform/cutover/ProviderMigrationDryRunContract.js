import { createHash } from "node:crypto";

export const PROVIDER_MIGRATION_DRY_RUN_CONTRACT = "provider-production-migration-dry-run-v1";
export const PROVIDER_MIGRATION_DRY_RUN_TOPIC = "operations.production-migration-dry-run";
export const PROVIDER_MIGRATION_DRY_RUN_PAYLOAD_VERSION = "1";
export const PROVIDER_MIGRATION_EXECUTION_BOUNDARY = "digitalocean-app-platform";

const ALLOWED_FIELDS = Object.freeze([
  "contractVersion",
  "operationId",
  "correlationId",
  "operator",
  "environment",
  "dryRun",
  "expectedProductionSourceCommit",
  "expectedProductionBuildId",
  "expectedProviderSourceCommit",
  "expectedProviderBuildId",
  "expectedFounderRevision",
  "expectedFounderSha256",
  "expectedMediaCount",
  "expectedMediaBytes",
  "expectedMediaInventorySha256",
  "expectedControlVersion",
  "expectedControlSha256",
  "expectedRecoverySha256",
  "expectedMigrationId",
  "expectedRollbackSourceCommit",
  "expectedRollbackBuildId",
]);

export function validateProviderMigrationDryRunRequest(input = {}, {
  environment,
  operator,
  providerIdentity,
  productionIdentity,
  founderIdentity,
  mediaIdentity,
  rollbackIdentity,
} = {}) {
  if (!isPlainObject(input)) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", "The remote dry-run payload must be an object.");
  if (input.execute != null || input.finalMigrationAuthorization != null || input.finalGo != null) {
    throw contractError("REMOTE_DRY_RUN_EXECUTION_FLAG_REJECTED", "Remote dry-run requests cannot carry an execution or final authorization flag.");
  }
  const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (unknown.length) throw contractError("REMOTE_DRY_RUN_PAYLOAD_FIELD_REJECTED", `Unsupported remote dry-run field: ${unknown.sort()[0]}.`);
  if (input.dryRun !== true) throw contractError("REMOTE_DRY_RUN_REQUIRED", "Provider migration operations enforce dryRun=true.");
  if (input.contractVersion != null && input.contractVersion !== PROVIDER_MIGRATION_DRY_RUN_CONTRACT) {
    throw contractError("REMOTE_DRY_RUN_CONTRACT_VERSION_UNSUPPORTED", "Remote dry-run contract version is unsupported.");
  }

  const value = {
    contractVersion: PROVIDER_MIGRATION_DRY_RUN_CONTRACT,
    operationId: identifier(input.operationId, "operationId"),
    correlationId: identifier(input.correlationId, "correlationId"),
    operator: required(input.operator, "operator"),
    environment: required(input.environment, "environment"),
    dryRun: true,
    expectedProductionSourceCommit: commit(input.expectedProductionSourceCommit, "expectedProductionSourceCommit"),
    expectedProductionBuildId: identity(input.expectedProductionBuildId, "expectedProductionBuildId"),
    expectedProviderSourceCommit: commit(input.expectedProviderSourceCommit, "expectedProviderSourceCommit"),
    expectedProviderBuildId: identity(input.expectedProviderBuildId, "expectedProviderBuildId"),
    expectedFounderRevision: positiveInteger(input.expectedFounderRevision, "expectedFounderRevision"),
    expectedFounderSha256: sha256(input.expectedFounderSha256, "expectedFounderSha256"),
    expectedMediaCount: nonnegativeInteger(input.expectedMediaCount, "expectedMediaCount"),
    expectedMediaBytes: nonnegativeInteger(input.expectedMediaBytes, "expectedMediaBytes"),
    expectedMediaInventorySha256: sha256(input.expectedMediaInventorySha256, "expectedMediaInventorySha256"),
    expectedControlVersion: positiveInteger(input.expectedControlVersion, "expectedControlVersion"),
    expectedControlSha256: sha256(input.expectedControlSha256, "expectedControlSha256"),
    expectedRecoverySha256: sha256(input.expectedRecoverySha256, "expectedRecoverySha256"),
    expectedMigrationId: identity(input.expectedMigrationId, "expectedMigrationId"),
    expectedRollbackSourceCommit: commit(input.expectedRollbackSourceCommit, "expectedRollbackSourceCommit"),
    expectedRollbackBuildId: identity(input.expectedRollbackBuildId, "expectedRollbackBuildId"),
  };
  if (environment && value.environment !== environment) {
    throw contractError("REMOTE_DRY_RUN_ENVIRONMENT_MISMATCH", "The requested environment is not the configured provider execution environment.");
  }
  if (operator && value.operator !== operator) {
    throw contractError("REMOTE_DRY_RUN_OPERATOR_FORBIDDEN", "The authenticated operational principal is not the configured migration operator.");
  }
  if (providerIdentity) {
    if (value.expectedProviderSourceCommit !== String(providerIdentity.gitSha ?? "").toLowerCase()
      || value.expectedProviderBuildId !== providerIdentity.buildId) {
      throw contractError("REMOTE_DRY_RUN_PROVIDER_IDENTITY_MISMATCH", "The provider executor source/build does not match the exact request.");
    }
  }
  if (productionIdentity) {
    if (value.expectedProductionSourceCommit !== String(productionIdentity.sourceCommit ?? "").toLowerCase()
      || value.expectedProductionBuildId !== productionIdentity.buildId) {
      throw contractError("REMOTE_DRY_RUN_PRODUCTION_IDENTITY_MISMATCH", "The live production source/build does not match the configured provider attestation.");
    }
  }
  if (founderIdentity) {
    if (value.expectedFounderRevision !== Number(founderIdentity.revision)
      || value.expectedFounderSha256 !== String(founderIdentity.sha256 ?? "").toLowerCase()) {
      throw contractError("REMOTE_DRY_RUN_FOUNDER_IDENTITY_MISMATCH", "The live Founder runtime does not match the configured recovery lineage.");
    }
  }
  if (mediaIdentity) {
    if (value.expectedMediaCount !== Number(mediaIdentity.count)
      || value.expectedMediaBytes !== Number(mediaIdentity.bytes)
      || value.expectedMediaInventorySha256 !== String(mediaIdentity.sha256 ?? "").toLowerCase()) {
      throw contractError("REMOTE_DRY_RUN_MEDIA_IDENTITY_MISMATCH", "The live Founder media inventory does not match the configured recovery lineage.");
    }
  }
  if (rollbackIdentity) {
    if (value.expectedRollbackSourceCommit !== String(rollbackIdentity.sourceCommit ?? "").toLowerCase()
      || value.expectedRollbackBuildId !== rollbackIdentity.buildId) {
      throw contractError("REMOTE_DRY_RUN_ROLLBACK_IDENTITY_MISMATCH", "The rollback artifact does not match the configured provider attestation.");
    }
  }
  return Object.freeze(value);
}

export function fingerprintProviderMigrationDryRunRequest(request) {
  return createHash("sha256").update(canonicalJson(request)).digest("hex");
}

export function assertProviderExecutionBoundary(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY !== PROVIDER_MIGRATION_EXECUTION_BOUNDARY
    || env.PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED !== "1") {
    throw contractError(
      "MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED",
      "Production provider checks must execute inside the approved DigitalOcean App Platform boundary.",
    );
  }
}

export function safeMigrationFailure(error) {
  const code = /^[A-Z0-9_]{3,80}$/.test(String(error?.code ?? ""))
    ? String(error.code)
    : "REMOTE_DRY_RUN_FAILED";
  return Object.freeze({ code, message: safeMessage(error?.message) });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeMessage(value) {
  const message = String(value ?? "Remote provider validation failed.");
  if (/postgres(?:ql)?:\/\/|secret|password|authorization|bearer\s/i.test(message)) return "Remote provider validation failed; inspect protected correlated logs.";
  return message.slice(0, 300);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is required.`);
  return candidate;
}

function identifier(value, field) {
  const candidate = required(value, field);
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(candidate)) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is invalid.`);
  return candidate;
}

function identity(value, field) {
  const candidate = required(value, field);
  if (candidate.length > 200 || /[\r\n]/.test(candidate)) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is invalid.`);
  return candidate;
}

function commit(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidate)) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} must be a full commit hash.`);
  return candidate;
}

function sha256(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is invalid.`);
  return candidate;
}

function positiveInteger(value, field) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is invalid.`);
  return candidate;
}

function nonnegativeInteger(value, field) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw contractError("REMOTE_DRY_RUN_PAYLOAD_INVALID", `${field} is invalid.`);
  return candidate;
}

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
