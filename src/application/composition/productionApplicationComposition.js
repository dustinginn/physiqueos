import { createLegacyFounderReadLoaders } from "../read-models/LegacyFounderReadLoaders.js";
import { createPhase3ReadModelService } from "../read-models/Phase3ReadModelService.js";
import { LegacyFounderRepositories } from "../../data/repositories/founderRepositories.js";
import { getFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore.js";
import { createDurableMigrationControlStore, resolveMigrationControlPath } from "../../platform/cutover/DurableMigrationControlStore.js";
import { createProductionApplicationCompositionRuntime } from "../../platform/cutover/ProductionApplicationCompositionRuntime.js";
import {
  createPhase5ProviderApplicationComposition,
  createPhase5ProviderMediaCatalog,
} from "../../platform/database/phase5ProviderComposition.js";
import { createAuthorizedMediaService } from "../media/AuthorizedMediaService.js";
import { createOpaqueSpacesMediaGateway } from "../../platform/object-storage/OpaqueSpacesMediaGateway.js";
import {
  createPostgresFounderReadScope,
  executePostgresFounderRuntimeMutation,
} from "../../platform/database/PostgresFounderRepositoryFacade.js";
import { loadCanonicalRuntime } from "../../platform/migration/phase4CanonicalImport.js";
import { registerRuntimeTrainingExercises } from "../../domain/models/trainingExerciseIdentity.js";
import { readDatabaseConfig } from "../../platform/database/config.js";
import { createPostgresPool } from "../../platform/database/pool.js";
import { createPostgresProviderReadinessProbe } from "../../platform/database/ProviderReadinessProbe.js";
import { readSpacesConfig } from "../../platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../../platform/object-storage/SpacesPrivateObjectProvider.js";
import { createCanonicalWriteFence } from "../../platform/cutover/canonicalWriteFence.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "../../platform/cutover/migrationControlState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../../platform/cutover/PostgresCombinedRuntimeAuthorityStore.js";
import { assertCompatibilityRuntimeAuthorityState } from "../../platform/cutover/CombinedRuntimeAuthorityState.js";
import { assertCompatibilityOwnerIdentity } from "../../platform/cutover/combinedCutoverCompatibilityOwnerGuard.js";
import {
  createPostgresTrainingNavigationReadStore,
  createRepositoryTrainingNavigationReadStore,
} from "../../platform/database/PostgresTrainingNavigationReadStore.js";
import { createTrainingNavigationReadService } from "../training/TrainingNavigationReadService.js";
import {
  createPostgresProgressHubReadStore,
  createRepositoryProgressHubReadStore,
} from "../../platform/database/PostgresProgressHubReadStore.js";
import { createProgressHubReadService } from "../progress/ProgressHubReadService.js";
import {
  createPostgresProgressEvidenceReadStore,
  createRepositoryProgressEvidenceReadStore,
} from "../../platform/database/PostgresProgressEvidenceReadStore.js";
import { createProgressEvidenceReadService } from "../progress/ProgressEvidenceReadService.js";
import {
  createPostgresProgressPhotosReadStore,
  createRepositoryProgressPhotosReadStore,
} from "../../platform/database/PostgresProgressPhotosReadStore.js";
import { createProgressPhotosReadService } from "../progress/ProgressPhotosReadService.js";
import { createPhotoEventBriefingReadService } from "../briefings/PhotoEventBriefingReadService.js";
import { createPostgresPhotoEventBriefingReadStore } from "../../platform/database/PostgresPhotoEventBriefingReadStore.js";
import {
  createPostgresCoreNavigationReadStore,
  createRepositoryCoreNavigationReadStore,
} from "../../platform/database/PostgresCoreNavigationReadStore.js";
import { createCoreNavigationReadService } from "../core/CoreNavigationReadService.js";
import {
  createPostgresEvidenceReviewReadStore,
  createRepositoryEvidenceReviewReadStore,
} from "../../platform/database/PostgresEvidenceReviewReadStore.js";
import { createEvidenceReviewReadService } from "../evidence/EvidenceReviewReadService.js";
import { createPostgresPhotoEventReadStore } from
  "../../platform/database/PostgresPhotoEventReadStore.js";
import {
  createPostgresCompletedGoalReadStore,
  createRepositoryCompletedGoalReadStore,
} from "../../platform/database/PostgresCompletedGoalReadStore.js";
import { createCompletedGoalReadService } from "../goals/CompletedGoalReadService.js";
import {
  createPostgresActiveGoalReadStore,
  createRepositoryActiveGoalReadStore,
} from "../../platform/database/PostgresActiveGoalReadStore.js";
import { createActiveGoalReadService } from "../goals/ActiveGoalReadService.js";
import {
  createPostgresPriorityNavigationReadStore,
  createRepositoryPriorityNavigationReadStore,
} from "../../platform/database/PostgresPriorityNavigationReadStore.js";
import { createPriorityNavigationReadService } from "../priorities/PriorityNavigationReadService.js";
import {
  createPostgresBriefingNavigationReadStore,
  createRepositoryBriefingNavigationReadStore,
} from "../../platform/database/PostgresBriefingNavigationReadStore.js";
import { createBriefingNavigationReadService } from "../briefings/BriefingNavigationReadService.js";
import { createAsyncEvidenceIntakeService } from "../evidence/AsyncEvidenceIntakeService.js";
import { createPostgresEvidenceIntakeStore } from "../../platform/database/PostgresEvidenceIntakeStore.js";
import { createProviderCanonicalUploadService } from "../media/ProviderCanonicalUploadService.js";
import { createFoundationPostgresTransactionRunner } from "../../platform/database/foundationPostgresComposition.js";
import { createFounderAuthService } from "../../platform/auth/FounderAuthService.js";
import { createFounderWeightSummaryReadService } from "../weight/FounderWeightSummaryReadService.js";

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
  if (env.NEXT_PHASE === "phase-production-build" && env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return createLegacyComposition({ controlStore: buildTimeLegacyControlStore() });
  }
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") {
    if (env.NEXT_PHASE === "phase-production-build") throw providerBuildAccessError();
    return createPostgresComposition({ controlStore: null, env, providerFullRuntime: true });
  }
  return getProductionApplicationCompositionRuntime(env).resolve();
}

export function getProductionFounderAuthService(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  return createFounderAuthService({
    transactionRunner: createFoundationPostgresTransactionRunner({ pool: runtime.pool }),
    credentialPepper: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER"),
  });
}

export function getProductionFounderWeightSummaryReadService(env = process.env) {
  return createFounderWeightSummaryReadService({
    readLatestWeight: (userId) => runProductionApplicationReadScope(async () => {
      const composition = await getProductionApplicationComposition(env);
      return composition.repositories.weights.getLatestWeightEntry(userId);
    }, { readModel: "native.weight-summary.v1" }, env),
  });
}

export async function runProductionApplicationReadScope(callback, metadata = {}, env = process.env) {
  if (typeof callback !== "function") throw new Error("Production application read scope requires a callback.");
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") return callback();
  return getOrCreateProviderRuntime(env).readScope.run(callback, metadata);
}

export function getProductionAsyncEvidenceIntakeService(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  const compatibilityMode = env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  if (compatibilityMode) throw providerBuildAccessError();
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({
    pool: runtime.pool,
    environment: required(env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"),
  });
  return createAsyncEvidenceIntakeService({
    store: createPostgresEvidenceIntakeStore({
      pool: runtime.pool,
      ownerUserId: runtime.ownerUserId,
      authorityStore,
      migrationOperationId: env.PHYSIQUEOS_MIGRATION_OPERATION_ID ?? null,
    }),
    uploads: createProviderCanonicalUploadService({
      pool: runtime.pool,
      objectProvider: runtime.objectProvider,
      authorityStore,
      migrationOperationId: env.PHYSIQUEOS_MIGRATION_OPERATION_ID ?? null,
      compatibilityMode: false,
    }),
  });
}

export async function getProductionApplicationCanonicalCommitComposition(
  env = process.env
) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" ||
      env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  const compatibilityMode = env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({
    pool: runtime.pool,
    environment: required(
      env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT,
      "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"
    ),
  });
  if (compatibilityMode) {
    assertCompatibilityOwnerIdentity(runtime.ownerUserId, {
      expectedOwnerUserId:
        env.PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID ?? null,
    });
    const expectedDatabaseName = required(
      env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME,
      "PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME"
    );
    const database = await runtime.pool.query("SELECT current_database() AS database");
    if (database.rows[0]?.database !== expectedDatabaseName) {
      throw Object.assign(
        new Error("Provider compatibility database identity does not match."),
        { code: "PROVIDER_COMPATIBILITY_TARGET_REJECTED" }
      );
    }
    const state = (await authorityStore.read()).state;
    assertCompatibilityRuntimeAuthorityState(state, {
      environment: env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT,
      databaseName: expectedDatabaseName,
    });
  }
  return Object.freeze({
    mutateRuntimeBounded: ({
      commandId,
      operation,
      allowedCollections,
      readCollections,
      readApplicationContext = true,
      readImportMetadata = true,
      allowApplicationContextMutation = false,
      mutate,
    }) => executePostgresFounderRuntimeMutation({
      pool: runtime.pool,
      ownerUserId: runtime.ownerUserId,
      authorityStore,
      migrationOperationId: compatibilityMode
        ? null
        : env.PHYSIQUEOS_MIGRATION_OPERATION_ID ?? null,
      compatibilityMode,
      requireCompatibilityAuthority: compatibilityMode,
      commandId,
      operation,
      mutate,
      bounded: true,
      allowedCollections,
      readCollections,
      readApplicationContext,
      readImportMetadata,
      allowApplicationContextMutation,
      returnReceipt: true,
    }),
  });
}

// Founder-created canonical exercises (e.g. a Founder-added machine or variant) are not
// part of the static FOUNDER_ALPHA_TRAINING_EXERCISES registry; resolving them by ID or
// exact name depends on the module-global runtimeTrainingExercises map in
// trainingExerciseIdentity.js. That map is only ever populated as an incidental side
// effect of a canonical-commit composition (createPhase4PostgresApplicationComposition,
// which every canonical write path already goes through). Pure read paths that construct
// their store directly from getOrCreateProviderRuntime (Training navigation, Evidence
// Review's exercise picker) never trigger that side effect, so on a fresh process — right
// after every deploy — Founder-created exercises are invisible until an unrelated write
// happens to run first. This performs the same bounded, single-collection provider read
// phase4PostgresComposition.js already does for canonical writes, so any read path that
// needs canonical exercise identities can hydrate them explicitly before use instead of
// depending on write-time history it has no control over.
export async function hydrateProductionTrainingExerciseRegistry(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const runtime = getOrCreateProviderRuntime(env);
  const canonicalRuntime = await loadCanonicalRuntime({
    query: (text, values) => runtime.pool.query(text, values),
    ownerUserId: runtime.ownerUserId,
    collections: ["canonicalExerciseLibrary"],
    includeApplicationContext: false,
    includeImportMetadata: false,
  });
  registerRuntimeTrainingExercises(canonicalRuntime.canonicalExerciseLibrary ?? []);
}

export function getProductionTrainingNavigationReadService(env = process.env) {
  const providerMode = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build";
  const store = providerMode
    ? createProviderTrainingNavigationReadStore(env)
    : createRepositoryTrainingNavigationReadStore({ repositories: LegacyFounderRepositories });
  return createTrainingNavigationReadService({
    store,
    hydrateCanonicalExerciseRegistry: providerMode
      ? () => hydrateProductionTrainingExerciseRegistry(env)
      : null,
  });
}

export function getProductionProgressHubReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderProgressHubReadStore(env)
    : createRepositoryProgressHubReadStore({ repositories: LegacyFounderRepositories });
  return createProgressHubReadService({ store });
}

export function getProductionProgressEvidenceReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderProgressEvidenceReadStore(env)
    : createRepositoryProgressEvidenceReadStore({ repositories: LegacyFounderRepositories });
  return createProgressEvidenceReadService({ store });
}

export function getProductionCoreNavigationReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderCoreNavigationReadStore(env)
    : createRepositoryCoreNavigationReadStore({ readRuntimeStore: getFounderRuntimeStore });
  return createCoreNavigationReadService({ store });
}

export function getProductionProgressPhotosReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderProgressPhotosReadStore(env)
    : createRepositoryProgressPhotosReadStore({ repositories: LegacyFounderRepositories });
  return createProgressPhotosReadService({ store });
}

export function getProductionCompletedGoalReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderCompletedGoalReadStore(env)
    : createRepositoryCompletedGoalReadStore({ repositories: LegacyFounderRepositories });
  return createCompletedGoalReadService({ store });
}

export function getProductionActiveGoalReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderActiveGoalReadStore(env)
    : createRepositoryActiveGoalReadStore({ repositories: LegacyFounderRepositories, loadRuntime: getFounderRuntimeStore });
  return createActiveGoalReadService({ store });
}

export function getProductionPriorityNavigationReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderPriorityNavigationReadStore(env)
    : createRepositoryPriorityNavigationReadStore({ repositories: LegacyFounderRepositories });
  return createPriorityNavigationReadService({ store });
}

export function getProductionBriefingNavigationReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderBriefingNavigationReadStore(env)
    : createRepositoryBriefingNavigationReadStore({ repositories: LegacyFounderRepositories, loadRuntime: getFounderRuntimeStore });
  return createBriefingNavigationReadService({ store });
}

export function getProductionPhotoEventBriefingReadService(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  return createPhotoEventBriefingReadService({
    store: createPostgresPhotoEventBriefingReadStore({
      pool: runtime.pool,
      ownerUserId: runtime.ownerUserId,
      onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
        ? (event) => console.info("provider.photo_event_briefing_read.complete", event)
        : null,
    }),
  });
}

export function getProductionProviderMediaDelivery(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  const catalog = createPhase5ProviderMediaCatalog({
    query: (text, values) => runtime.pool.query(text, values),
  });
  const gateway = createOpaqueSpacesMediaGateway({
    provider: runtime.objectProvider,
    catalog,
    secret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER"),
  });
  const media = createAuthorizedMediaService({ catalog, delivery: gateway });
  return Object.freeze({
    ownerUserId: runtime.ownerUserId,
    async openRead({ principal, objectId, lifetimeSeconds = 60 }) {
      const descriptor = await media.authorizeRead({ principal, objectId, lifetimeSeconds });
      return gateway.redeemRead({ accessHandle: descriptor.accessHandle, principal });
    },
  });
}

export function getProductionEvidenceReviewReadService(env = process.env) {
  const store = env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1" && env.NEXT_PHASE !== "phase-production-build"
    ? createProviderEvidenceReviewReadStore(env)
    : createRepositoryEvidenceReviewReadStore({ repositories: LegacyFounderRepositories });
  return createEvidenceReviewReadService({ store });
}

export function getProductionPhotoEventReadStore(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" ||
      env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresPhotoEventReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.photo_event_read.complete", event)
      : null,
  });
}

export function getProductionProviderReadinessComposition(env = process.env) {
  if (env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1" || env.NEXT_PHASE === "phase-production-build") {
    throw providerBuildAccessError();
  }
  const runtime = getOrCreateProviderRuntime(env);
  const compatibilityMode = env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  if (compatibilityMode) {
    assertCompatibilityOwnerIdentity(runtime.ownerUserId, {
      expectedOwnerUserId: env.PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID ?? null,
    });
  }
  required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER");
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({
    pool: runtime.pool,
    environment: required(env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"),
  });
  const expectedDatabaseName = compatibilityMode
    ? required(env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME, "PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME")
    : runtime.databaseName;
  return Object.freeze({
    kind: "production-provider-readiness",
    compatibilityMode,
    ownerUserId: runtime.ownerUserId,
    expectedDatabaseName,
    databaseProbe: createPostgresProviderReadinessProbe({ pool: runtime.pool, ownerUserId: runtime.ownerUserId }),
    objectProvider: runtime.objectProvider,
    authorityStore,
  });
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

async function createPostgresComposition({ controlStore, env, providerFullRuntime = false }) {
  const runtime = getOrCreateProviderRuntime(env);
  const compatibilityMode = providerFullRuntime && env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1";
  const authorityStore = providerFullRuntime
    ? createPostgresCombinedRuntimeAuthorityStore({
        pool: runtime.pool,
        environment: required(env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"),
      })
    : null;
  if (compatibilityMode) {
    // Checked FIRST, before any database identity check or persistence-capable composition is
    // built: a compatibility/rehearsal environment must never operate under a Founder-owner
    // identity, regardless of what else is configured.
    assertCompatibilityOwnerIdentity(runtime.ownerUserId, {
      expectedOwnerUserId: env.PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID ?? null,
    });
    const expectedDatabaseName = required(env.PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME, "PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME");
    const database = await runtime.pool.query("SELECT current_database() AS database");
    if (database.rows[0]?.database !== expectedDatabaseName) {
      throw Object.assign(new Error("Provider compatibility database identity does not match."), { code: "PROVIDER_COMPATIBILITY_TARGET_REJECTED" });
    }
    const state = (await authorityStore.read()).state;
    assertCompatibilityRuntimeAuthorityState(state, {
      environment: env.PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT,
      databaseName: expectedDatabaseName,
    });
  }
  const writeFence = controlStore ? createCanonicalWriteFence({
    controlStore,
    requiredCompositionMode: CanonicalCompositionMode.POSTGRES,
    expectedCanonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES_CANONICAL,
  }) : null;
  const composition = await createPhase5ProviderApplicationComposition({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    objectProvider: runtime.objectProvider,
    mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER"),
    writeFence,
    authorityStore,
    migrationOperationId: compatibilityMode ? null : env.PHYSIQUEOS_MIGRATION_OPERATION_ID ?? null,
    compatibilityMode,
    requireCompatibilityAuthority: compatibilityMode,
    readDiagnostics: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.canonical_read_scope.complete", event)
      : null,
    providerReadScope: runtime.readScope,
  });
  return Object.freeze({
    ...composition,
    kind: compatibilityMode ? "provider-postgres-spaces-compatibility" : "production-postgres-spaces",
    canonicalStoreEpoch: compatibilityMode ? CanonicalStoreEpoch.LEGACY_JSON : CanonicalStoreEpoch.POSTGRES_CANONICAL,
    compositionMode: CanonicalCompositionMode.POSTGRES,
    repositoryPersistence: "transactional-postgres-repository-and-command-ports",
    objectProvider: runtime.objectProvider,
    authorityStore,
    compatibilityMode,
    productionWritesAllowed: compatibilityMode ? false : undefined,
    combinedExecutionAllowed: compatibilityMode ? false : undefined,
  });
}

function getOrCreateProviderRuntime(env) {
  if (providerRuntime) return providerRuntime;
  const databaseConfig = readDatabaseConfig(env);
  const spacesConfig = readSpacesConfig(env);
  if (!databaseConfig.enabled || !spacesConfig.enabled) {
    throw new Error("PostgreSQL/Spaces production composition is unavailable without explicit provider configuration.");
  }
  const ownerUserId = required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID");
  const pool = createPostgresPool(databaseConfig);
  const objectProvider = createSpacesPrivateObjectProvider(spacesConfig);
  const readScope = createPostgresFounderReadScope({
    loadRuntime: () => loadCanonicalRuntime({ query: (text, values) => pool.query(text, values), ownerUserId }),
    readPoolState: () => ({ totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount }),
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.canonical_read_scope.complete", event)
      : null,
  });
  providerRuntime = Object.freeze({
    pool,
    objectProvider,
    readScope,
    ownerUserId,
    databaseName: databaseConfig.databaseName,
  });
  return providerRuntime;
}

function createProviderTrainingNavigationReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresTrainingNavigationReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.training_navigation_read.complete", event)
      : null,
  });
}

function createProviderProgressHubReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresProgressHubReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.progress_hub_read.complete", event)
      : null,
  });
}

function createProviderProgressEvidenceReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresProgressEvidenceReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.progress_evidence_read.complete", event)
      : null,
  });
}

function createProviderProgressPhotosReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresProgressPhotosReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.progress_photos_read.complete", event)
      : null,
  });
}

function createProviderCoreNavigationReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresCoreNavigationReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.core_navigation_read.complete", event)
      : null,
  });
}

function createProviderEvidenceReviewReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresEvidenceReviewReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.evidence_review_read.complete", event)
      : null,
  });
}

function createProviderCompletedGoalReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresCompletedGoalReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.completed_goal_read.complete", event)
      : null,
  });
}

function createProviderActiveGoalReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresActiveGoalReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.active_goal_read.complete", event)
      : null,
  });
}

function createProviderPriorityNavigationReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresPriorityNavigationReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.priority_navigation_read.complete", event)
      : null,
  });
}

function createProviderBriefingNavigationReadStore(env) {
  const runtime = getOrCreateProviderRuntime(env);
  return createPostgresBriefingNavigationReadStore({
    pool: runtime.pool,
    ownerUserId: runtime.ownerUserId,
    onComplete: env.PHYSIQUEOS_PROVIDER_READ_DIAGNOSTICS === "1"
      ? (event) => console.info("provider.briefing_navigation_read.complete", event)
      : null,
  });
}

function providerBuildAccessError() {
  const error = new Error("Provider product data cannot be resolved during image build.");
  error.code = "PROVIDER_BUILD_DATA_ACCESS_FORBIDDEN";
  return error;
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
