import { createUuidV7 } from "../src/contracts/v1/identifiers.js";
import { register } from "node:module";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { createFoundationPostgresAdapters } from "../src/platform/database/foundationPostgresComposition.js";
import { createDurableOutboxWorker, WorkerMessageError } from "../src/platform/jobs/DurableOutboxWorker.js";
import { runWorkerLoop } from "../src/platform/jobs/workerLoop.js";
import { readBuildIdentity } from "../src/platform/observability/buildIdentity.js";
import { createStructuredLogger } from "../src/platform/observability/structuredLogger.js";
import { createPostgresProviderMigrationDryRunStore } from "../src/platform/cutover/PostgresProviderMigrationDryRunStore.js";
import { createProviderMigrationDryRunWorkerHandler } from "../src/platform/cutover/ProviderMigrationDryRunWorker.js";
import { PROVIDER_MIGRATION_DRY_RUN_TOPIC } from "../src/platform/cutover/ProviderMigrationDryRunContract.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../src/platform/cutover/PostgresCombinedRuntimeAuthorityStore.js";
import { createAuthorityGatedWorker } from "../src/platform/jobs/AuthorityGatedWorker.js";
import { readSpacesConfig } from "../src/platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../src/platform/object-storage/SpacesPrivateObjectProvider.js";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const simplifiedMigration = process.env.PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED === "1"
  ? await loadSimplifiedMigrationModules()
  : null;
const databaseConfig = readDatabaseConfig();
const pool = createPostgresPool(databaseConfig);
const buildIdentity = readBuildIdentity();
const logger = createStructuredLogger({ buildIdentity });
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
const controller = new AbortController();
const compatibilityMode = process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
const authorityEnvironment = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1"
  ? required(process.env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT")
  : null;
const compatibilityDatabaseName = compatibilityMode
  ? required(process.env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME, "PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME")
  : null;
if (compatibilityMode) {
  const database = await pool.query("SELECT current_database() AS database");
  if (database.rows[0]?.database !== compatibilityDatabaseName) {
    const error = new Error("Worker compatibility database identity does not match.");
    error.code = "PROVIDER_COMPATIBILITY_TARGET_REJECTED";
    throw error;
  }
}

const simplifiedOperationStore = simplifiedMigration
  ? simplifiedMigration.createPostgresSimplifiedProviderMigrationOperationStore({
      pool,
      ownerUserId: required(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID"),
    })
  : null;

const handlers = Object.freeze({
  "foundation.synthetic": async ({ messageId }) => logger.info("foundation.synthetic", { messageId }),
  "foundation.synthetic.failure": async () => { throw new WorkerMessageError("SYNTHETIC_FAILURE", "Synthetic staging failure requested."); },
  ...(process.env.PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED === "1" ? {
    [PROVIDER_MIGRATION_DRY_RUN_TOPIC]: createProviderMigrationDryRunWorkerHandler({
      store: createPostgresProviderMigrationDryRunStore({
        pool,
      }),
      createEnvironment: async ({ request }) => {
        const { createProviderProductionMigrationDryRunEnvironment } = await import("../src/platform/cutover/ProviderProductionMigrationDryRunEnvironment.js");
        return createProviderProductionMigrationDryRunEnvironment({ request });
      },
      validationContext: Object.freeze({
        environment: "production",
        operator: required(process.env.PHYSIQUEOS_MIGRATION_OPERATOR_ID, "PHYSIQUEOS_MIGRATION_OPERATOR_ID"),
        providerIdentity: buildIdentity,
        productionIdentity: Object.freeze({
          sourceCommit: required(process.env.PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT, "PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT"),
          buildId: required(process.env.PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID, "PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID"),
        }),
        founderIdentity: Object.freeze({
          revision: required(process.env.PHYSIQUEOS_EXPECTED_FOUNDER_REVISION, "PHYSIQUEOS_EXPECTED_FOUNDER_REVISION"),
          sha256: required(process.env.PHYSIQUEOS_EXPECTED_FOUNDER_SHA256, "PHYSIQUEOS_EXPECTED_FOUNDER_SHA256"),
        }),
        mediaIdentity: Object.freeze({
          count: required(process.env.PHYSIQUEOS_EXPECTED_MEDIA_COUNT, "PHYSIQUEOS_EXPECTED_MEDIA_COUNT"),
          bytes: required(process.env.PHYSIQUEOS_EXPECTED_MEDIA_BYTES, "PHYSIQUEOS_EXPECTED_MEDIA_BYTES"),
          sha256: required(process.env.PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256, "PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256"),
        }),
        rollbackIdentity: Object.freeze({
          sourceCommit: required(process.env.PHYSIQUEOS_EXPECTED_ROLLBACK_SOURCE_COMMIT, "PHYSIQUEOS_EXPECTED_ROLLBACK_SOURCE_COMMIT"),
          buildId: required(process.env.PHYSIQUEOS_EXPECTED_ROLLBACK_BUILD_ID, "PHYSIQUEOS_EXPECTED_ROLLBACK_BUILD_ID"),
        }),
        backupIdentity: Object.freeze({
          sha256: required(process.env.PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256, "PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256"),
        }),
      }),
      logger,
    }),
  } : {}),
  ...(simplifiedOperationStore ? {
    [simplifiedMigration.SIMPLIFIED_PROVIDER_OPERATION_TOPIC]: simplifiedMigration.createSimplifiedProviderMigrationWorkerHandler({
      store: simplifiedOperationStore,
      validationContext: simplifiedMigration.simplifiedProviderMigrationValidationContext(process.env),
      executeMigration: simplifiedMigration.executeSimplifiedProviderMigration,
      createEnvironment: async () => {
        const objectProvider = createSpacesPrivateObjectProvider(readSpacesConfig(process.env));
        return Object.freeze({
          env: process.env,
          pool,
          objectProvider,
          transport: simplifiedMigration.createSimplifiedProviderMigrationTransport({ objectProvider }),
          transportSummary: (transport) => Object.freeze({
            byteLength: transport.byteLength,
            sha256: transport.sha256,
            privateVersionedSpace: true,
          }),
          close: async () => objectProvider.close(),
        });
      },
      logger,
    }),
  } : {}),
});
const worker = createDurableOutboxWorker({
  store: adapters.outbox,
  handlers,
  workerId: process.env.PHYSIQUEOS_WORKER_ID || createUuidV7(),
  buildId: buildIdentity.buildId,
  logger,
  maximumAttempts: readMaximumAttempts(process.env.PHYSIQUEOS_WORKER_MAX_ATTEMPTS),
});
const effectiveWorker = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1"
  ? createAuthorityGatedWorker({
      worker,
      authorityStore: createPostgresCombinedRuntimeAuthorityStore({
        pool,
        environment: authorityEnvironment,
      }),
      heartbeat: adapters.outbox.heartbeat,
      workerId: worker.workerId,
      buildId: buildIdentity.buildId,
      preAuthorityTopics: simplifiedMigration ? [simplifiedMigration.SIMPLIFIED_PROVIDER_OPERATION_TOPIC] : [],
      compatibilityMode,
      compatibilityEnvironment: authorityEnvironment,
      compatibilityDatabaseName,
    })
  : worker;

if (process.env.PHYSIQUEOS_PROVIDER_WORKER_BOOT_PROBE === "1") {
  process.stdout.write(`${JSON.stringify({
    status: "PROVIDER_WORKER_APPLICATION_LOOP_READY",
    workerPid: process.pid,
    simplifiedMigrationHandlerRegistered: Boolean(simplifiedOperationStore),
    migrationCoordinatorProcessModel: "in-process-existing-worker",
  })}\n`);
  await pool.end();
} else {
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());
  try {
    await runWorkerLoop({ worker: effectiveWorker, signal: controller.signal });
  } catch (error) {
    logger.error("worker.crashed", { code: error?.code ?? "WORKER_CRASHED" });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function loadSimplifiedMigrationModules() {
  const operation = await import("../src/platform/cutover/simplified/SimplifiedProviderMigrationOperation.js");
  const execution = await import("../src/platform/cutover/simplified/SimplifiedProviderMigrationExecution.js");
  const transport = await import("../src/platform/cutover/simplified/SimplifiedProviderMigrationTransport.js");
  const composition = await import("../src/platform/cutover/simplified/SimplifiedProviderMigrationProductComposition.js");
  return Object.freeze({
    SIMPLIFIED_PROVIDER_OPERATION_TOPIC: operation.SIMPLIFIED_PROVIDER_OPERATION_TOPIC,
    createPostgresSimplifiedProviderMigrationOperationStore: operation.createPostgresSimplifiedProviderMigrationOperationStore,
    createSimplifiedProviderMigrationWorkerHandler: operation.createSimplifiedProviderMigrationWorkerHandler,
    executeSimplifiedProviderMigration: execution.executeSimplifiedProviderMigration,
    createSimplifiedProviderMigrationTransport: transport.createSimplifiedProviderMigrationTransport,
    simplifiedProviderMigrationValidationContext: composition.simplifiedProviderMigrationValidationContext,
  });
}

function readMaximumAttempts(value) {
  if (value == null || value === "") return 8;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("Worker maximum attempts must be between 1 and 20.");
  return result;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}
