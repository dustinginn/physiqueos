import {
  assertCompatibilityRuntimeAuthorityState,
  createCompatibilityRuntimeAuthorityState,
} from "./CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";

export const REQUIRED_COMBINED_COMPATIBILITY_TABLES = Object.freeze([
  "physiqueos.combined_runtime_authority",
  "physiqueos.combined_runtime_authority_audit",
  "physiqueos.combined_transfer_receipts",
  "physiqueos.canonical_runtime_metadata",
  "physiqueos.canonical_application_context",
]);

export async function initializeProviderCompatibilityAuthority({
  pool,
  environment,
  expectedDatabaseName,
  providerSource,
  target,
  authorityStore = null,
  now = new Date().toISOString(),
  commandId = "provider-compatibility-authority:initialize",
} = {}) {
  if (!pool?.query || !pool?.connect) throw initializationError("PROVIDER_COMPATIBILITY_DATABASE_REQUIRED", "Compatibility initialization requires PostgreSQL.");
  if (target?.databaseName !== expectedDatabaseName) {
    throw initializationError("PROVIDER_COMPATIBILITY_TARGET_REJECTED", "Compatibility target does not match the expected database.");
  }
  const databaseResult = await pool.query("SELECT current_database() AS database");
  const databaseName = String(databaseResult.rows[0]?.database ?? "");
  if (databaseName !== expectedDatabaseName || !/^physiqueos_phase5_(?:test|restore)_provider(?:_|$)/.test(databaseName)) {
    throw initializationError("PROVIDER_COMPATIBILITY_TARGET_REJECTED", "Compatibility initialization is restricted to the exact isolated Phase 5 provider database.");
  }

  const missingTables = [];
  for (const table of REQUIRED_COMBINED_COMPATIBILITY_TABLES) {
    const result = await pool.query("SELECT to_regclass($1) AS relation", [table]);
    if (!result.rows[0]?.relation) missingTables.push(table);
  }
  if (missingTables.length > 0) {
    throw initializationError("PROVIDER_COMPATIBILITY_SCHEMA_UNAVAILABLE", `Compatibility schema is missing: ${missingTables.join(", ")}`);
  }

  const operations = await pool.query(
    "SELECT migration_operation_id FROM physiqueos.combined_transfer_receipts LIMIT 1",
  );
  if (operations.rows.length > 0) {
    throw initializationError("PROVIDER_COMPATIBILITY_OPERATION_CONFLICT", "Compatibility database contains a combined transfer operation.");
  }

  const state = createCompatibilityRuntimeAuthorityState({ environment, providerSource, target, now });
  const store = authorityStore ?? createPostgresCombinedRuntimeAuthorityStore({ pool, environment });
  const initialized = await store.initialize(state, { commandId });
  const verified = (await store.read()).state;
  assertCompatibilityRuntimeAuthorityState(verified, { environment, databaseName });
  return Object.freeze({
    outcome: initialized.outcome,
    databaseName,
    schemaTables: REQUIRED_COMBINED_COMPATIBILITY_TABLES,
    authority: verified.authority,
    environment: verified.environment,
    version: verified.version,
    productionWritesAllowed: verified.productionWritesAllowed,
    combinedExecutionAllowed: verified.combinedExecutionAllowed,
    firstProviderCanonicalWriteAt: verified.firstProviderCanonicalWriteAt,
  });
}
function initializationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
