import { readDatabaseConfig } from "../../database/config.js";
import { createPostgresPool } from "../../database/pool.js";
import { readBuildIdentity } from "../../observability/buildIdentity.js";
import { assertProviderExecutionBoundary } from "../ProviderMigrationDryRunContract.js";
import {
  createPostgresSimplifiedProviderMigrationOperationStore,
  createSimplifiedProviderMigrationController,
} from "./SimplifiedProviderMigrationOperation.js";

let resolved;

export function getSimplifiedProviderMigrationProductController(env = process.env) {
  if (env.PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED !== "1") return null;
  assertProviderExecutionBoundary(env);
  if (resolved) return resolved.controller;
  const databaseConfig = readDatabaseConfig(env);
  if (!databaseConfig.enabled) throw new Error("Simplified provider operation storage requires PostgreSQL.");
  const pool = createPostgresPool(databaseConfig);
  const providerIdentity = readBuildIdentity(env);
  resolved = Object.freeze({
    pool,
    controller: createSimplifiedProviderMigrationController({
      store: createPostgresSimplifiedProviderMigrationOperationStore({
        pool,
        ownerUserId: required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID"),
      }),
      validationContext: validationContext(env, providerIdentity),
    }),
  });
  return resolved.controller;
}

export async function closeSimplifiedProviderMigrationProductComposition() {
  const current = resolved;
  resolved = undefined;
  await current?.pool?.end?.();
}

export function simplifiedProviderMigrationHttpStatus(error) {
  const code = String(error?.code ?? "");
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (/CONFLICT|MISMATCH/.test(code)) return 409;
  if (/REQUIRED|INVALID|UNSUPPORTED|AUTHORIZATION/.test(code)) return 400;
  return 500;
}

export function safeSimplifiedProviderMigrationCode(error) {
  const code = String(error?.code ?? "INTERNAL_ERROR");
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "INTERNAL_ERROR";
}

export function simplifiedProviderMigrationValidationContext(env = process.env) {
  return validationContext(env, readBuildIdentity(env));
}

function validationContext(env, providerIdentity) {
  return Object.freeze({
    founder: Object.freeze({
      revision: Number(required(env.PHYSIQUEOS_EXPECTED_FOUNDER_REVISION, "PHYSIQUEOS_EXPECTED_FOUNDER_REVISION")),
      sha256: required(env.PHYSIQUEOS_EXPECTED_FOUNDER_SHA256, "PHYSIQUEOS_EXPECTED_FOUNDER_SHA256").toLowerCase(),
    }),
    media: Object.freeze({
      count: Number(required(env.PHYSIQUEOS_EXPECTED_MEDIA_COUNT, "PHYSIQUEOS_EXPECTED_MEDIA_COUNT")),
      bytes: Number(required(env.PHYSIQUEOS_EXPECTED_MEDIA_BYTES, "PHYSIQUEOS_EXPECTED_MEDIA_BYTES")),
      sha256: required(env.PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256, "PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256").toLowerCase(),
    }),
    backup: Object.freeze({
      sha256: required(env.PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256, "PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256").toLowerCase(),
    }),
    frozen: Object.freeze({
      sourceCommit: required(env.PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT, "PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT").toLowerCase(),
      buildId: required(env.PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID, "PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID"),
    }),
    provider: Object.freeze({
      sourceCommit: required(providerIdentity.gitSha, "PHYSIQUEOS_GIT_SHA").toLowerCase(),
      buildId: required(providerIdentity.buildId, "PHYSIQUEOS_BUILD_ID"),
    }),
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw Object.assign(new Error(`${field} is required.`), { code: "SIMPLIFIED_PROVIDER_NOT_CONFIGURED" });
  return candidate;
}
