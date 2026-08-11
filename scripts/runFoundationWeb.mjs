import http from "node:http";
import { createFoundationRequestHandler } from "../src/platform/http/foundationServer.js";
import {
  closePhase2StagingRuntime,
  foundationBuildIdentity,
  getPhase2OperationalReadiness,
  isPhase2StagingEnabled,
} from "../src/platform/foundation/phase2Runtime.js";
import { createStructuredLogger } from "../src/platform/observability/structuredLogger.js";

if (!isPhase2StagingEnabled()) throw new Error("The foundation web process requires PHYSIQUEOS_PHASE2_STAGING_ENABLED=1.");
const port = normalizePort(process.env.PORT);
const logger = createStructuredLogger({ buildIdentity: foundationBuildIdentity });
const server = http.createServer(createFoundationRequestHandler({
  getReadiness: () => getPhase2OperationalReadiness(),
  buildIdentity: foundationBuildIdentity,
  operationsToken: process.env.PHYSIQUEOS_OPERATIONS_TOKEN,
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
