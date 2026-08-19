// Lazy production wiring for the combined-cutover PREPARATION service (import, parity,
// provider-prepared acknowledgement). Mirrors `../transfer/combinedCutoverTransferComposition.js`'s
// pattern from Phase 3: resolved only when explicitly enabled, fails closed on missing
// configuration, and does nothing at import time so importing this module never opens a database
// connection or reaches Spaces. Manages its own PostgreSQL pool and Spaces client, independent of
// the Phase 3 transfer composition's, so the two phases remain independently enableable.

import { S3Client } from "@aws-sdk/client-s3";
import { readDatabaseConfig } from "../../database/config.js";
import { createPostgresPool } from "../../database/pool.js";
import { readSpacesConfig } from "../../object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../../object-storage/SpacesPrivateObjectProvider.js";
import { createSpacesCombinedCutoverTransferStaging } from "../transfer/combinedCutoverTransferStaging.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "../transfer/PostgresCombinedCutoverTransferReceiptStore.js";
import { createPostgresCombinedTransferReceiptStore } from "../PostgresCombinedTransferReceiptStore.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { isCompatibilityShapedEnvironment } from "../compatibilityEnvironmentShape.js";
import { assertCompatibilityOwnerIdentity } from "../combinedCutoverCompatibilityOwnerGuard.js";
import { createPostgresCombinedCutoverPreparationStore } from "./PostgresCombinedCutoverPreparationStore.js";
import { createProductionCanonicalImportService } from "./ProductionCanonicalImportService.js";
import { createProductionProviderParityService } from "./ProductionProviderParityService.js";
import { createProductionAcknowledgeProviderPreparedService } from "./ProductionAcknowledgeProviderPreparedService.js";
import { createCombinedCutoverPreparationService } from "./combinedCutoverPreparationService.js";
import { readCombinedCutoverPreparationAuthConfig, isCombinedCutoverPreparationEnabled } from "./combinedCutoverPreparationAuth.js";

let resolved = null;

function required(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function resolve(env) {
  if (resolved) return resolved;
  const runtimeAuthorityEnvironment = required(env, "PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT");
  const ownerUserId = required(env, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID");
  if (isCompatibilityShapedEnvironment(runtimeAuthorityEnvironment)) {
    // Checked FIRST, before any database/Spaces client or persistence-capable service is built:
    // this composition drives canonical import and parity comparison, both persistence mutations,
    // so an isolated compatibility/rehearsal deployment must never operate under a Founder-owner
    // identity. Outside a compatibility-shaped environment (the eventual production combined-cutover
    // deployment), the real Founder owner remains legitimate and this check does not apply.
    assertCompatibilityOwnerIdentity(ownerUserId, {
      expectedOwnerUserId: env.PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID ?? null,
    });
  }
  const databaseConfig = readDatabaseConfig(env);
  const spacesConfig = readSpacesConfig(env);
  if (!databaseConfig.enabled || !spacesConfig.enabled) {
    throw new Error("The combined-cutover preparation channel requires database and object storage configuration.");
  }
  const pool = createPostgresPool(databaseConfig);
  const client = new S3Client({
    region: spacesConfig.region, endpoint: spacesConfig.endpoint, forcePathStyle: false,
    credentials: { accessKeyId: spacesConfig.accessKeyId, secretAccessKey: spacesConfig.secretAccessKey },
  });
  const objectProvider = createSpacesPrivateObjectProvider(spacesConfig, { client });
  const staging = createSpacesCombinedCutoverTransferStaging({ client, bucket: spacesConfig.bucket });
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool, staging });
  const manifestReceiptStore = createPostgresCombinedTransferReceiptStore({ pool });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool });
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({
    pool, environment: runtimeAuthorityEnvironment,
  });
  const targetDatabase = new URL(databaseConfig.connectionString).pathname.slice(1);
  const mediaAccessSecret = required(env, "PHYSIQUEOS_CREDENTIAL_PEPPER");
  const providerDeploymentId = required(env, "PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID");

  const importService = createProductionCanonicalImportService({
    pool, objectProvider, manifestReceiptStore, artifactReceiptStore, preparationStore, targetDatabase,
  });
  const parityService = createProductionProviderParityService({
    pool, objectProvider, manifestReceiptStore, artifactReceiptStore, preparationStore, ownerUserId, mediaAccessSecret,
  });
  const acknowledgeService = createProductionAcknowledgeProviderPreparedService({
    authorityStore, manifestReceiptStore, artifactReceiptStore, preparationStore, providerDeploymentId,
  });

  resolved = Object.freeze({ pool, client, preparationStore, importService, parityService, acknowledgeService });
  return resolved;
}

export function getCombinedCutoverPreparationService(env = process.env) {
  if (!isCombinedCutoverPreparationEnabled(env)) return null;
  const authConfig = readCombinedCutoverPreparationAuthConfig(env);
  const { preparationStore, importService, parityService, acknowledgeService } = resolve(env);
  return createCombinedCutoverPreparationService({ importService, parityService, acknowledgeService, preparationStore, authConfig });
}

export async function closeCombinedCutoverPreparationComposition() {
  const current = resolved;
  resolved = null;
  current?.client?.destroy?.();
  await current?.pool?.end?.();
}
