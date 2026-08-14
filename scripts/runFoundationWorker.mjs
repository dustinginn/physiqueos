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

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const databaseConfig = readDatabaseConfig();
const pool = createPostgresPool(databaseConfig);
const buildIdentity = readBuildIdentity();
const logger = createStructuredLogger({ buildIdentity });
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
const controller = new AbortController();

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
      }),
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
        environment: required(process.env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"),
      }),
      heartbeat: adapters.outbox.heartbeat,
      workerId: worker.workerId,
      buildId: buildIdentity.buildId,
    })
  : worker;

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());

try {
  await runWorkerLoop({ worker: effectiveWorker, signal: controller.signal });
} catch (error) {
  logger.error("worker.crashed", { code: error?.code ?? "WORKER_CRASHED" });
  process.exitCode = 1;
} finally {
  await pool.end();
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
