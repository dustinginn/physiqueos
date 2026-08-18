import {
  RuntimeAuthority,
  createInitialCombinedRuntimeAuthorityState,
} from "./CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";

// The combined cutover protocol (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md)
// begins from `windows-legacy-authoritative`, but no production path seeded that state:
// the only existing initializer creates the isolated `provider-compatibility-nonauthoritative`
// tuple. Because `physiqueos.combined_runtime_authority.environment` is the table's PRIMARY KEY
// (db/migrations/000005_combined_runtime_authority.cjs) and the authority store is constructed
// per-environment, the production cutover record is a SEPARATE ROW under its own environment
// key - not a mutation of the compatibility row. That removes any need for a
// compatibility-to-Windows-legacy transition, leaves the compatibility tuple untouched and
// independently auditable, and keeps a single authority model rather than a competing one.
//
// This entry point only PREPARES the durable pre-cutover record. It can never transfer
// authority: it constructs `windows-legacy-authoritative` (whose own validator forbids provider
// routing and PostgreSQL canonical persistence), and it re-reads and re-asserts the persisted
// tuple afterwards. Authority transfer remains exclusively `TRANSFER_TO_PROVIDER`, driven by
// CombinedAppPlatformCutoverOrchestrator.

export const REQUIRED_COMBINED_CUTOVER_TABLES = Object.freeze([
  "physiqueos.combined_runtime_authority",
  "physiqueos.combined_runtime_authority_audit",
  "physiqueos.combined_transfer_receipts",
]);

// Compatibility environments are regex-bound to /^compatibility(?:[-/]|$)/i by
// CombinedRuntimeAuthorityState. Refusing that shape here guarantees this initializer can never
// target, repurpose, or collide with the isolated compatibility record.
const COMPATIBILITY_ENVIRONMENT = /^compatibility(?:[-/]|$)/i;

export function assertCombinedCutoverPreCutoverAuthorityState(state, { environment } = {}) {
  if (!state) throw initializationError("COMBINED_CUTOVER_AUTHORITY_UNAVAILABLE", "Combined cutover authority state is unavailable.");
  if (environment != null && state.environment !== environment) {
    throw initializationError("COMBINED_CUTOVER_AUTHORITY_REJECTED", "Combined cutover authority environment does not match the configured environment.");
  }
  const expected = {
    authority: RuntimeAuthority.WINDOWS_LEGACY,
    publicRuntimeAuthority: "windows",
    migrationControlAuthority: "windows",
    workerAuthority: "windows",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (state[field] !== value) {
      throw initializationError("COMBINED_CUTOVER_AUTHORITY_REJECTED", `Combined cutover authority ${field} is not in the expected pre-cutover state.`);
    }
  }
  for (const field of ["migrationOperationId", "authorizationFingerprint", "fenceId", "finalSnapshot", "providerAcknowledgement", "routingTarget"]) {
    if (state[field] != null) {
      throw initializationError("COMBINED_CUTOVER_AUTHORITY_OPERATION_ACTIVE", `Combined cutover authority already carries ${field}; a cutover operation is in progress.`);
    }
  }
  if (state.firstProviderCanonicalWriteAt != null || state.firstProviderCommandId != null) {
    throw initializationError("COMBINED_CUTOVER_BOUNDARY_ALREADY_CROSSED", "The provider canonical write boundary has already been crossed; forward recovery applies.");
  }
  return state;
}

export async function initializeCombinedCutoverAuthority({
  pool,
  environment,
  windowsSource,
  authorityStore = null,
  now = new Date().toISOString(),
  commandId = "combined-cutover-authority:initialize",
} = {}) {
  if (!pool?.query || !pool?.connect) throw initializationError("COMBINED_CUTOVER_DATABASE_REQUIRED", "Combined cutover authority initialization requires PostgreSQL.");
  const environmentName = String(environment ?? "").trim();
  if (!environmentName) throw initializationError("COMBINED_CUTOVER_ENVIRONMENT_REQUIRED", "Combined cutover authority initialization requires an environment.");
  if (COMPATIBILITY_ENVIRONMENT.test(environmentName)) {
    throw initializationError("COMBINED_CUTOVER_ENVIRONMENT_REJECTED", "The isolated compatibility environment cannot be repurposed as a combined cutover authority record.");
  }

  const missingTables = [];
  for (const table of REQUIRED_COMBINED_CUTOVER_TABLES) {
    const result = await pool.query("SELECT to_regclass($1) AS relation", [table]);
    if (!result.rows[0]?.relation) missingTables.push(table);
  }
  if (missingTables.length > 0) {
    throw initializationError("COMBINED_CUTOVER_SCHEMA_UNAVAILABLE", `Combined cutover schema is missing: ${missingTables.join(", ")}`);
  }

  // A transfer receipt implies an operation already reached the provider; seeding a fresh
  // pre-cutover record over that history would erase the evidence that it happened.
  const receipts = await pool.query(
    "SELECT migration_operation_id FROM physiqueos.combined_transfer_receipts LIMIT 1",
  );
  if (receipts.rows.length > 0) {
    throw initializationError("COMBINED_CUTOVER_OPERATION_CONFLICT", "The target database already contains a combined transfer operation.");
  }

  const state = createInitialCombinedRuntimeAuthorityState({ environment: environmentName, windowsSource, now });
  const store = authorityStore ?? createPostgresCombinedRuntimeAuthorityStore({ pool, environment: environmentName });
  // initialize() is idempotent for an identical tuple and fails closed
  // (RUNTIME_AUTHORITY_INITIALIZATION_CONFLICT) for any divergent existing row, so an existing
  // compatibility or mid-cutover record under this key can never be silently overwritten.
  const initialized = await store.initialize(state, { commandId });
  const verified = (await store.read()).state;
  assertCombinedCutoverPreCutoverAuthorityState(verified, { environment: environmentName });

  return Object.freeze({
    outcome: initialized.outcome,
    environment: verified.environment,
    authority: verified.authority,
    version: verified.version,
    publicRuntimeAuthority: verified.publicRuntimeAuthority,
    migrationControlAuthority: verified.migrationControlAuthority,
    workerAuthority: verified.workerAuthority,
    canonicalStoreEpoch: verified.canonicalStoreEpoch,
    compositionMode: verified.compositionMode,
    firstProviderCanonicalWriteAt: verified.firstProviderCanonicalWriteAt,
    schemaTables: REQUIRED_COMBINED_CUTOVER_TABLES,
  });
}

function initializationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
