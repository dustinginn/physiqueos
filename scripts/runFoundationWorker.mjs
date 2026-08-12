import { createUuidV7 } from "../src/contracts/v1/identifiers.js";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { createFoundationPostgresAdapters } from "../src/platform/database/foundationPostgresComposition.js";
import { createDurableOutboxWorker, WorkerMessageError } from "../src/platform/jobs/DurableOutboxWorker.js";
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
  "foundation.synthetic.failure": async () => { throw new WorkerMessageError("SYNTHETIC_FAILURE", "Synthetic staging failure requested."); },
});
const worker = createDurableOutboxWorker({
  store: adapters.outbox,
  handlers,
  workerId: process.env.PHYSIQUEOS_WORKER_ID || createUuidV7(),
  buildId: buildIdentity.buildId,
  logger,
  maximumAttempts: readMaximumAttempts(process.env.PHYSIQUEOS_WORKER_MAX_ATTEMPTS),
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

function readMaximumAttempts(value) {
  if (value == null || value === "") return 8;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("Worker maximum attempts must be between 1 and 20.");
  return result;
}
