import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createNativeSandboxWeightCandidateService } from "../evidence/NativeSandboxWeightCandidateService.js";
import { createProviderCanonicalUploadService } from "../media/ProviderCanonicalUploadService.js";
import { createFounderWeightSummaryReadService } from "../weight/FounderWeightSummaryReadService.js";
import { createFoundationPostgresTransactionRunner } from "../../platform/database/foundationPostgresComposition.js";
import { readDatabaseConfig } from "../../platform/database/config.js";
import { createPostgresPool } from "../../platform/database/pool.js";
import { createPostgresNativeSandboxWeightStore } from "../../platform/database/PostgresNativeSandboxWeightStore.js";
import { createFounderAuthService } from "../../platform/auth/FounderAuthService.js";
import { readSpacesConfig } from "../../platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../../platform/object-storage/SpacesPrivateObjectProvider.js";
import { foundationLogger } from "../../platform/foundation/runtime.js";
import {
  createAuthorityScopedObjectProvider,
  createNativeSandboxAuthorityBoundary,
  createSandboxDatabaseAuthorityGuard,
  readNativeSandboxAuthorityConfig,
} from "../../platform/sandbox/NativeSandboxAuthority.js";

let runtime;

export function getNativeSandboxApplicationComposition(env = process.env) {
  if (runtime) return runtime;
  const config = readNativeSandboxAuthorityConfig(env);
  if (!config.enabled) throw unavailable();

  const databaseConfig = readDatabaseConfig({
    ...env,
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: config.databaseUrl,
    PHYSIQUEOS_DATABASE_APPLICATION_NAME: config.databaseApplicationName,
    PHYSIQUEOS_DATABASE_POOL_MAX: env.PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_POOL_MAX ?? "2",
  });
  if (databaseConfig.databaseName !== config.databaseName) throw unavailable();
  const pool = createPostgresPool(databaseConfig);
  const boundary = createNativeSandboxAuthorityBoundary(config);
  const databaseAuthority = createSandboxDatabaseAuthorityGuard({ pool, config });
  const spacesConfig = readSpacesConfig(env);
  if (!spacesConfig.enabled) throw unavailable();
  const objectProvider = createAuthorityScopedObjectProvider({
    provider: createSpacesPrivateObjectProvider(spacesConfig),
    config,
  });
  const uploads = createProviderCanonicalUploadService({
    pool,
    objectProvider,
    authorityStore: databaseAuthority,
    compatibilityMode: false,
  });
  const weightStore = createPostgresNativeSandboxWeightStore({ pool, authority: Object.freeze({ ...boundary, ...databaseAuthority }) });
  const weightCandidateService = createNativeSandboxWeightCandidateService({
    authority: boundary,
    store: weightStore,
    media: uploads,
    logger: foundationLogger,
  });
  const founderAuthService = createFounderAuthService({
    transactionRunner: createFoundationPostgresTransactionRunner({ pool }),
    credentialPepper: config.credentialPepper,
  });
  const weightSummaryReadService = createFounderWeightSummaryReadService({
    readLatestWeight: async (userId) => {
      boundary.requirePrincipal({ userId, scopes: ["founder:read"], deviceId: "server", sessionId: "server", authenticatedAt: new Date().toISOString() });
      await databaseAuthority.assertDatabase();
      const result = await pool.query(
        `SELECT payload FROM physiqueos.canonical_checkin_records
          WHERE owner_user_id=$1 AND collection_name='weightEntries'
          ORDER BY occurrence_date DESC,source_ordinal DESC LIMIT 1`,
        [config.ownerUserId],
      );
      return result.rows[0]?.payload ?? null;
    },
  });
  runtime = Object.freeze({
    kind: "native-integration-sandbox-postgres-spaces",
    config,
    authority: boundary,
    databaseAuthority,
    pool,
    objectProvider,
    founderAuthService,
    weightSummaryReadService,
    weightCandidateService,
  });
  return runtime;
}

export function resetNativeSandboxApplicationCompositionForTests() {
  if (process.env.NODE_ENV === "production") throw new Error("Native sandbox composition cannot be reset in production.");
  runtime = undefined;
}

function unavailable() {
  return new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
}
