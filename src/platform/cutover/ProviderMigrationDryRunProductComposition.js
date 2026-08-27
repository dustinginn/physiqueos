import { createHash, timingSafeEqual } from "node:crypto";
import { readDatabaseConfig } from "../database/config.js";
import { createPostgresPool } from "../database/pool.js";
import { readBuildIdentity } from "../observability/buildIdentity.js";
import { createProviderMigrationDryRunController } from "./ProviderMigrationDryRunController.js";
import { assertProviderExecutionBoundary } from "./ProviderMigrationDryRunContract.js";
import { createPostgresProviderMigrationDryRunStore } from "./PostgresProviderMigrationDryRunStore.js";

let resolved;

export function getProviderMigrationDryRunProductController(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED !== "1") return null;
  assertProviderExecutionBoundary(env);
  if (resolved) return resolved.controller;
  const databaseConfig = readDatabaseConfig(env);
  if (!databaseConfig.enabled) throw new Error("Provider migration dry-run storage requires PostgreSQL.");
  const pool = createPostgresPool(databaseConfig);
  const providerIdentity = readBuildIdentity(env);
  const store = createPostgresProviderMigrationDryRunStore({ pool });
  resolved = Object.freeze({
    pool,
    controller: createProviderMigrationDryRunController({
      store,
      validationContext: validationContext(env, providerIdentity),
    }),
  });
  return resolved.controller;
}

export function authorizeProviderMigrationDryRun(header, env = process.env) {
  const expected = required(env.PHYSIQUEOS_OPERATIONS_TOKEN, "PHYSIQUEOS_OPERATIONS_TOKEN");
  if (expected.length < 32) throw coded("OPERATIONS_AUTH_NOT_CONFIGURED", "The operations token must contain at least 32 characters.");
  const match = /^Bearer ([^\s]+)$/.exec(String(header ?? ""));
  if (!match) return false;
  const suppliedHash = createHash("sha256").update(match[1]).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export function providerMigrationDryRunHttpStatus(error) {
  if (error?.code === "REMOTE_DRY_RUN_OPERATOR_FORBIDDEN") return 403;
  if (/CONFLICT|MISMATCH/.test(String(error?.code ?? ""))) return 409;
  if (/^REMOTE_DRY_RUN_(?:PAYLOAD|CONTENT_TYPE|CONTRACT_VERSION|EXECUTION_FLAG|REQUIRED)/.test(String(error?.code ?? ""))) return 400;
  return 500;
}

export function safeProviderMigrationDryRunCode(error) {
  const code = String(error?.code ?? "INTERNAL_ERROR");
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "INTERNAL_ERROR";
}

export async function closeProviderMigrationDryRunProductComposition() {
  const current = resolved;
  resolved = undefined;
  await current?.pool?.end?.();
}

function validationContext(env, providerIdentity) {
  return Object.freeze({
    environment: "production",
    operator: required(env.PHYSIQUEOS_MIGRATION_OPERATOR_ID, "PHYSIQUEOS_MIGRATION_OPERATOR_ID"),
    providerIdentity,
    productionIdentity: Object.freeze({
      sourceCommit: required(env.PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT, "PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT"),
      buildId: required(env.PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID, "PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID"),
    }),
    founderIdentity: Object.freeze({
      revision: required(env.PHYSIQUEOS_EXPECTED_FOUNDER_REVISION, "PHYSIQUEOS_EXPECTED_FOUNDER_REVISION"),
      sha256: required(env.PHYSIQUEOS_EXPECTED_FOUNDER_SHA256, "PHYSIQUEOS_EXPECTED_FOUNDER_SHA256"),
    }),
    mediaIdentity: Object.freeze({
      count: required(env.PHYSIQUEOS_EXPECTED_MEDIA_COUNT, "PHYSIQUEOS_EXPECTED_MEDIA_COUNT"),
      bytes: required(env.PHYSIQUEOS_EXPECTED_MEDIA_BYTES, "PHYSIQUEOS_EXPECTED_MEDIA_BYTES"),
      sha256: required(env.PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256, "PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256"),
    }),
    rollbackIdentity: Object.freeze({
      sourceCommit: required(env.PHYSIQUEOS_EXPECTED_ROLLBACK_SOURCE_COMMIT, "PHYSIQUEOS_EXPECTED_ROLLBACK_SOURCE_COMMIT"),
      buildId: required(env.PHYSIQUEOS_EXPECTED_ROLLBACK_BUILD_ID, "PHYSIQUEOS_EXPECTED_ROLLBACK_BUILD_ID"),
    }),
    backupIdentity: Object.freeze({
      sha256: required(env.PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256, "PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256"),
    }),
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw coded("OPERATIONS_AUTH_NOT_CONFIGURED", `${field} is required.`);
  return candidate;
}

function coded(code, message) { const error = new Error(message); error.code = code; return error; }
