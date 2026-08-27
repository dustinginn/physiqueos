import http from "node:http";
import { createFoundationRequestHandler } from "../src/platform/http/foundationServer.js";
import {
  closePhase2StagingRuntime,
  foundationBuildIdentity,
  getPhase2OperationalReadiness,
  getPhase2StagingRuntime,
  isPhase2StagingEnabled,
} from "../src/platform/foundation/phase2Runtime.js";
import { createStructuredLogger } from "../src/platform/observability/structuredLogger.js";
import { createPostgresProviderMigrationDryRunStore } from "../src/platform/cutover/PostgresProviderMigrationDryRunStore.js";
import { createProviderMigrationDryRunController } from "../src/platform/cutover/ProviderMigrationDryRunController.js";
import { assertProviderExecutionBoundary } from "../src/platform/cutover/ProviderMigrationDryRunContract.js";

if (!isPhase2StagingEnabled()) throw new Error("The foundation web process requires PHYSIQUEOS_PHASE2_STAGING_ENABLED=1.");
const port = normalizePort(process.env.PORT);
const logger = createStructuredLogger({ buildIdentity: foundationBuildIdentity });
const migrationDryRun = createMigrationDryRunController();
const server = http.createServer(createFoundationRequestHandler({
  getReadiness: () => getPhase2OperationalReadiness(),
  buildIdentity: foundationBuildIdentity,
  operationsToken: process.env.PHYSIQUEOS_OPERATIONS_TOKEN,
  migrationDryRun,
  logger,
}));

server.listen(port, "0.0.0.0", () => logger.info("foundation.web.started", { port }));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown(signal));

async function shutdown(signal) {
  logger.info("foundation.web.stopping", { signal });
  server.close(async () => {
    await closePhase2StagingRuntime();
    process.exitCode = 0;
  });
  setTimeout(() => { process.exitCode = 1; server.closeAllConnections?.(); }, 10_000).unref();
}

function normalizePort(value) {
  const portValue = Number(value ?? 8080);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) throw new Error("PORT is invalid.");
  return portValue;
}

function createMigrationDryRunController() {
  if (process.env.PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED !== "1") return null;
  assertProviderExecutionBoundary(process.env);
  const runtime = getPhase2StagingRuntime();
  const store = createPostgresProviderMigrationDryRunStore({
    pool: runtime.pool,
  });
  return createProviderMigrationDryRunController({
    store,
    validationContext: Object.freeze({
      environment: "production",
      operator: required(process.env.PHYSIQUEOS_MIGRATION_OPERATOR_ID, "PHYSIQUEOS_MIGRATION_OPERATOR_ID"),
      providerIdentity: foundationBuildIdentity,
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
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}
