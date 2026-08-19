// Lazy production wiring for the combined-cutover transfer service. Mirrors the pattern already
// used by `createMigrationDryRunController` in scripts/runFoundationWeb.mjs: resolved only when
// explicitly enabled, fails closed on missing configuration, and does nothing at import time so
// importing this module never opens a database connection or reaches Spaces.
//
// Deliberately reuses the same `PHYSIQUEOS_DATABASE_*` / `PHYSIQUEOS_SPACES_*` configuration the
// rest of the provider runtime already uses (see infra/digitalocean/app.product.template.yaml) -
// this channel needs no new database or bucket: the byte-level layer uses the additive 000006
// tables and the `cutover-transfer/` namespace inside the existing private Space, and the
// operation-level layer reuses the existing `physiqueos.combined_transfer_receipts` table (000005).

import { S3Client } from "@aws-sdk/client-s3";
import { readDatabaseConfig } from "../../database/config.js";
import { createPostgresPool } from "../../database/pool.js";
import { readSpacesConfig } from "../../object-storage/spacesConfig.js";
import { createSpacesCombinedCutoverTransferStaging } from "./combinedCutoverTransferStaging.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "./PostgresCombinedCutoverTransferReceiptStore.js";
import { createPostgresCombinedTransferReceiptStore } from "../PostgresCombinedTransferReceiptStore.js";
import { createCombinedCutoverTransferService, loadCombinedCutoverTransferAuthConfig } from "./combinedCutoverTransferService.js";
import { createCombinedCutoverManifestTransferService } from "./combinedCutoverManifestTransferService.js";
import { isCombinedCutoverTransferEnabled } from "./combinedCutoverTransferAuth.js";

let resolved = null;

function resolve(env) {
  if (resolved) return resolved;
  const databaseConfig = readDatabaseConfig(env);
  const spacesConfig = readSpacesConfig(env);
  if (!databaseConfig.enabled || !spacesConfig.enabled) {
    throw new Error("The combined-cutover transfer channel requires database and object storage configuration.");
  }
  const pool = createPostgresPool(databaseConfig);
  const client = new S3Client({
    region: spacesConfig.region,
    endpoint: spacesConfig.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: spacesConfig.accessKeyId, secretAccessKey: spacesConfig.secretAccessKey },
  });
  const staging = createSpacesCombinedCutoverTransferStaging({ client, bucket: spacesConfig.bucket });
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool, staging });
  const manifestReceiptStore = createPostgresCombinedTransferReceiptStore({ pool });
  resolved = Object.freeze({ pool, client, artifactReceiptStore, manifestReceiptStore });
  return resolved;
}

export function getCombinedCutoverTransferService(env = process.env) {
  if (!isCombinedCutoverTransferEnabled(env)) return null;
  const authConfig = loadCombinedCutoverTransferAuthConfig(env);
  const { artifactReceiptStore } = resolve(env);
  return createCombinedCutoverTransferService({ receiptStore: artifactReceiptStore, authConfig });
}

export function getCombinedCutoverManifestTransferService(env = process.env) {
  if (!isCombinedCutoverTransferEnabled(env)) return null;
  const authConfig = loadCombinedCutoverTransferAuthConfig(env);
  const { artifactReceiptStore, manifestReceiptStore } = resolve(env);
  return createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig });
}

export async function closeCombinedCutoverTransferComposition() {
  const current = resolved;
  resolved = null;
  current?.client?.destroy?.();
  await current?.pool?.end?.();
}
