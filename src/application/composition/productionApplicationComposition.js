import { createLegacyFounderReadLoaders } from "../read-models/LegacyFounderReadLoaders.js";
import { createPhase3ReadModelService } from "../read-models/Phase3ReadModelService.js";
import { LegacyFounderRepositories } from "../../data/repositories/founderRepositories.js";
import { getFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore.js";
import { createDurableMigrationControlStore, resolveMigrationControlPath } from "../../platform/cutover/DurableMigrationControlStore.js";
import { createProductionApplicationCompositionRuntime } from "../../platform/cutover/ProductionApplicationCompositionRuntime.js";
import { createPhase5ProviderApplicationComposition } from "../../platform/database/phase5ProviderComposition.js";
import { readDatabaseConfig } from "../../platform/database/config.js";
import { createPostgresPool } from "../../platform/database/pool.js";
import { readSpacesConfig } from "../../platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../../platform/object-storage/SpacesPrivateObjectProvider.js";
import { createCanonicalWriteFence } from "../../platform/cutover/canonicalWriteFence.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "../../platform/cutover/migrationControlState.js";

let activeRuntime;
let providerRuntime;

export function getProductionApplicationCompositionRuntime(env = process.env) {
  if (activeRuntime) return activeRuntime;
  const controlStore = createDurableMigrationControlStore({ filePath: resolveMigrationControlPath({ env }) });
  activeRuntime = createProductionApplicationCompositionRuntime({
    controlStore,
    createLegacyComposition: async () => createLegacyComposition({ controlStore }),
    createPostgresComposition: async () => createPostgresComposition({ controlStore, env }),
  });
  return activeRuntime;
}

export async function getProductionApplicationComposition(env = process.env) {
  if (env.NEXT_PHASE === "phase-production-build") {
    return createLegacyComposition({ controlStore: buildTimeLegacyControlStore() });
  }
  return getProductionApplicationCompositionRuntime(env).resolve();
}

export async function closeProductionApplicationComposition() {
  const current = providerRuntime;
  providerRuntime = undefined;
  activeRuntime = undefined;
  current?.objectProvider?.close?.();
  await current?.pool?.end?.();
}

function createLegacyComposition({ controlStore }) {
  const runtime = getFounderRuntimeStore();
  const loaders = createLegacyFounderReadLoaders({
    repositories: LegacyFounderRepositories,
    readRuntimeStore: getFounderRuntimeStore,
  });
  return Object.freeze({
    kind: "production-legacy-json",
    canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
    compositionMode: CanonicalCompositionMode.LEGACY_JSON,
    repositories: LegacyFounderRepositories,
    runtime,
    readModels: createPhase3ReadModelService({
      loaders,
      readResourceVersion: () => String(getFounderRuntimeStore().revision ?? 1),
    }),
    writeFence: createCanonicalWriteFence({
      controlStore,
      requiredCompositionMode: CanonicalCompositionMode.LEGACY_JSON,
      expectedCanonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
    }),
  });
}

async function createPostgresComposition({ controlStore, env }) {
  if (!providerRuntime) {
    const databaseConfig = readDatabaseConfig(env);
    const spacesConfig = readSpacesConfig(env);
    if (!databaseConfig.enabled || !spacesConfig.enabled) {
      throw new Error("PostgreSQL/Spaces production composition is unavailable without explicit provider configuration.");
    }
    const ownerUserId = required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID");
    const pool = createPostgresPool(databaseConfig);
    const objectProvider = createSpacesPrivateObjectProvider(spacesConfig);
    providerRuntime = Object.freeze({ pool, objectProvider, ownerUserId });
  }
  const writeFence = createCanonicalWriteFence({
    controlStore,
    requiredCompositionMode: CanonicalCompositionMode.POSTGRES,
    expectedCanonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
  });
  const composition = await createPhase5ProviderApplicationComposition({
    pool: providerRuntime.pool,
    ownerUserId: providerRuntime.ownerUserId,
    objectProvider: providerRuntime.objectProvider,
    mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER"),
    writeFence,
  });
  return Object.freeze({
    ...composition,
    kind: "production-postgres-spaces",
    canonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
    compositionMode: CanonicalCompositionMode.POSTGRES,
    repositoryPersistence: "snapshot-read-only; writes use commands.execute",
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function buildTimeLegacyControlStore() {
  return Object.freeze({
    read: () => ({
      state: Object.freeze({
        fenceState: "build-time-prerender",
        canonicalStoreEpoch: CanonicalStoreEpoch.LEGACY_JSON,
        compositionMode: CanonicalCompositionMode.LEGACY_JSON,
        writesEnabled: false,
        readsEnabled: true,
      }),
    }),
  });
}
