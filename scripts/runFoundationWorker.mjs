import { createUuidV7 } from "../src/contracts/v1/identifiers.js";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { createFoundationPostgresAdapters } from "../src/platform/database/foundationPostgresComposition.js";
import { createDurableOutboxWorker } from "../src/platform/jobs/DurableOutboxWorker.js";
import { runWorkerLoop } from "../src/platform/jobs/workerLoop.js";
import { readBuildIdentity } from "../src/platform/observability/buildIdentity.js";
import { createStructuredLogger } from "../src/platform/observability/structuredLogger.js";

const databaseConfig = readDatabaseConfig();
const pool = createPostgresPool(databaseConfig);
const buildIdentity = readBuildIdentity();
const logger = createStructuredLogger({ buildIdentity });
const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
const controller = new AbortController();

const handlers = Object.freeze({
  "foundation.synthetic": async ({ messageId }) => logger.info("foundation.synthetic", { messageId }),
});
const worker = createDurableOutboxWorker({
  store: adapters.outbox,
  handlers,
  workerId: process.env.PHYSIQUEOS_WORKER_ID || createUuidV7(),
  buildId: buildIdentity.buildId,
  logger,
});

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());

try {
  await runWorkerLoop({ worker, signal: controller.signal });
} catch (error) {
  logger.error("worker.crashed", { code: error?.code ?? "WORKER_CRASHED" });
  process.exitCode = 1;
} finally {
  await pool.end();
}
