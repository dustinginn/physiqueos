export async function evaluateOperationalReadiness({ buildIdentity, environment, database, objectProvider = null, workerStore = null, workerRequired = false, maximumHeartbeatAgeMs = 120_000, expectedSchemaMigration = "000002_phase2_platform_operations", clock = () => new Date() }) {
  const checks = [];
  checks.push(configurationCheck(environment));
  checks.push(await safeCheck("database", async () => {
    await database.query("SELECT 1 AS reachable");
    return { ready: true, code: "DATABASE_REACHABLE" };
  }, "DATABASE_UNREACHABLE"));
  checks.push(await safeCheck("schema", async () => {
    const result = await database.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY run_on DESC, id DESC LIMIT 1");
    const name = result.rows?.[0]?.name ?? null;
    return { ready: name === expectedSchemaMigration, code: name === expectedSchemaMigration ? "SCHEMA_COMPATIBLE" : "SCHEMA_INCOMPATIBLE" };
  }, "SCHEMA_UNAVAILABLE"));
  checks.push(objectProvider
    ? await safeCheck("object_storage", async () => ({ ...(await objectProvider.healthCheck()), ready: true, code: "OBJECT_STORAGE_REACHABLE" }), "OBJECT_STORAGE_UNREACHABLE")
    : { name: "object_storage", ready: environment.objectStorageRequired !== true, code: environment.objectStorageRequired ? "OBJECT_STORAGE_REQUIRED" : "OBJECT_STORAGE_NOT_CONFIGURED" });
  checks.push(workerRequired ? await workerCheck(workerStore, clock(), maximumHeartbeatAgeMs) : { name: "worker", ready: true, code: "WORKER_NOT_REQUIRED" });
  return Object.freeze({
    status: checks.every((check) => check.ready) ? "ready" : "not_ready",
    buildId: buildIdentity.buildId,
    apiVersion: buildIdentity.apiVersion,
    checks: Object.freeze(checks.map((check) => Object.freeze({ name: check.name, ready: check.ready, code: check.code }))),
  });
}

export async function evaluateProtectedOperationalStatus(input) {
  const publicResult = await evaluateOperationalReadiness(input);
  return Object.freeze({ ...publicResult, evaluatedAt: (input.clock?.() ?? new Date()).toISOString(), configuration: Object.freeze({ databaseEnabled: input.environment.databaseEnabled === true, objectStorageEnabled: input.environment.objectStorageEnabled === true, workerRequired: input.workerRequired === true }) });
}

function configurationCheck(environment) {
  const ready = environment.databaseEnabled === true && (!environment.objectStorageRequired || environment.objectStorageEnabled === true);
  return { name: "configuration", ready, code: ready ? "CONFIGURATION_PRESENT" : "CONFIGURATION_MISSING" };
}
async function workerCheck(store, now, maximumAgeMs) {
  if (!store?.latestHeartbeat) return { name: "worker", ready: false, code: "WORKER_HEARTBEAT_UNAVAILABLE" };
  const heartbeat = await store.latestHeartbeat();
  const healthy = heartbeat?.status === "healthy" && now.getTime() - new Date(heartbeat.observed_at).getTime() <= maximumAgeMs;
  return { name: "worker", ready: healthy, code: healthy ? "WORKER_HEALTHY" : "WORKER_HEARTBEAT_STALE" };
}
async function safeCheck(name, work, failureCode) {
  try { const result = await work(); return { name, ready: result.ready === true, code: result.code }; }
  catch { return { name, ready: false, code: failureCode }; }
}
