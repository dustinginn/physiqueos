import { readDatabaseConfig } from "../database/config.js";
import { createPostgresPool } from "../database/pool.js";
import { createFoundationPostgresAdapters } from "../database/foundationPostgresComposition.js";
import { readSpacesConfig } from "../object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../object-storage/SpacesPrivateObjectProvider.js";
import { evaluateOperationalReadiness } from "../observability/operationalReadiness.js";
import { readBuildIdentity } from "../observability/buildIdentity.js";

let activeRuntime;
export const foundationBuildIdentity = readBuildIdentity();

export function isPhase2StagingEnabled(env = process.env) {
  return env.PHYSIQUEOS_PHASE2_STAGING_ENABLED === "1";
}

export function getPhase2StagingRuntime(env = process.env) {
  if (!isPhase2StagingEnabled(env)) return null;
  if (activeRuntime) return activeRuntime;
  const databaseConfig = readDatabaseConfig(env);
  const spacesConfig = readSpacesConfig(env);
  const pool = createPostgresPool(databaseConfig);
  const objectProvider = spacesConfig.enabled ? createSpacesPrivateObjectProvider(spacesConfig) : null;
  const adapters = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
  activeRuntime = Object.freeze({ pool, objectProvider, adapters, databaseConfig, spacesConfig });
  return activeRuntime;
}

export async function getPhase2OperationalReadiness(env = process.env) {
  const runtime = getPhase2StagingRuntime(env);
  if (!runtime) return null;
  return evaluateOperationalReadiness({
    buildIdentity: foundationBuildIdentity,
    environment: {
      databaseEnabled: runtime.databaseConfig.enabled,
      objectStorageEnabled: runtime.spacesConfig.enabled,
      objectStorageRequired: true,
    },
    database: runtime.pool,
    objectProvider: runtime.objectProvider,
    workerStore: runtime.adapters.outbox,
    workerRequired: true,
  });
}

export async function closePhase2StagingRuntime() {
  if (!activeRuntime) return;
  const runtime = activeRuntime;
  activeRuntime = undefined;
  runtime.objectProvider?.close?.();
  await runtime.pool.end();
}
