import { readDatabaseConfig } from "../database/config";
import { createPostgresPool } from "../database/pool";
import { createFoundationPostgresAdapters } from "../database/foundationPostgresComposition";
import { readSpacesConfig } from "../object-storage/spacesConfig";
import { createSpacesPrivateObjectProvider } from "../object-storage/SpacesPrivateObjectProvider";
import { evaluateOperationalReadiness } from "../observability/operationalReadiness";
import { foundationBuildIdentity } from "./runtime";

let activeRuntime;

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
