import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { readDatabaseConfig } from "../../database/config.js";
import { createPostgresPool } from "../../database/pool.js";
import { readSpacesConfig } from "../../object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../../object-storage/SpacesPrivateObjectProvider.js";
import { readAndValidateCanonicalPackage } from "../../migration/phase4CanonicalExport.js";
import { importCanonicalPackage, validateCanonicalImport } from "../../migration/phase4CanonicalImport.js";
import { migrateCanonicalPackageMediaToSpaces } from "../../migration/ProductionSpacesMediaMigration.js";
import { createPhase4MediaObjectId } from "../../migration/phase4LocalMediaMigration.js";
import { createInitialCombinedRuntimeAuthorityState } from "../CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { createSimplifiedAuthorityHandoffService } from "./SimplifiedAuthorityHandoffService.js";
import {
  SIMPLIFIED_MIGRATION_MODE,
  assertSimplifiedDisposableTarget,
  assertSimplifiedProviderExecutionBoundary,
  assertSimplifiedSchema,
} from "./SimplifiedMigrationEligibility.js";

export const SIMPLIFIED_PROVIDER_PHASES = Object.freeze([
  "pre-import", "import-and-validate", "prepare-authority", "transfer-authority",
]);

export async function executeSimplifiedProviderMigration({
  phase,
  execute = false,
  args = {},
  env = process.env,
  pool: suppliedPool = null,
  objectProvider: suppliedObjectProvider = null,
  observePhase = async () => undefined,
} = {}) {
  assertPhase(phase, execute);
  assertSimplifiedProviderExecutionBoundary(env);
  const databaseConfig = readDatabaseConfig({ ...env, PHYSIQUEOS_DATABASE_ENABLED: "1" });
  const spacesConfig = readSpacesConfig(env);
  if (!databaseConfig.enabled || !spacesConfig.enabled) {
    throw new Error("Simplified provider migration requires the existing attached database and private Space.");
  }
  const pool = suppliedPool ?? createPostgresPool(databaseConfig);
  const objectProvider = suppliedObjectProvider ?? createSpacesPrivateObjectProvider(spacesConfig);
  const ownsPool = suppliedPool == null;
  const ownsObjectProvider = suppliedObjectProvider == null;
  const packageRoot = required(args.packagePath, "packagePath");
  const mediaRoot = required(args.mediaRoot, "mediaRoot");
  const operationId = required(args.migrationOperationId, "migrationOperationId");

  try {
    await observePhase("PACKAGE_VALIDATION_STARTED");
    const packageData = await readAndValidateCanonicalPackage(packageRoot);
    await observePhase("PACKAGE_VALIDATION_COMPLETE", {
      collectionCount: Object.keys(packageData.collections).length,
      mediaCount: packageData.manifest.files.length,
    });
    const ownerUserId = String(packageData.collections.user?.id ?? "");
    assertPackageIdentity(packageData.manifest, args, operationId);
    await observePhase("MEDIA_VALIDATION_STARTED", { mediaCount: packageData.manifest.files.length });
    const mediaSource = await verifyMediaSnapshot({ packageData, mediaRoot });
    await observePhase("MEDIA_VALIDATION_COMPLETE", {
      mediaCount: mediaSource.objectCount,
      mediaBytes: mediaSource.byteLength,
    });
    const databaseName = (await pool.query("SELECT current_database() AS database")).rows[0]?.database;
    const migrationNames = (await pool.query(
      "SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY run_on,id",
    )).rows.map((row) => row.name);
    assertSimplifiedSchema(migrationNames);
    const preImport = ["pre-import", "import-and-validate"].includes(phase)
      ? await inspectPreImportObserved({
          pool,
          objectProvider,
          packageData,
          ownerUserId,
          syntheticUserId: required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID"),
          createMediaObjectId: createPhase4MediaObjectId,
          currentOutboxMessageId: args.currentOutboxMessageId ?? null,
          observePhase,
        })
      : null;
    if (!preImport) await assertProviderStillPreWrite(pool);

    if (phase === "pre-import") {
      return Object.freeze({
        ready: true,
        phase,
        database: databaseName,
        schema: migrationNames,
        target: preImport,
        mediaSource,
        firstPostgresWriteAt: null,
        authorityTransferred: false,
      });
    }

    const targetAuthorization = Object.freeze({
      productionExecutionAuthorized: true,
      expectedDatabase: databaseName,
      migrationOperationId: operationId,
    });
    if (phase === "import-and-validate") {
      const imported = await importCanonicalPackage({
        pool,
        packageRoot,
        expectedSourceIdentity: packageData.manifest.source,
        requireMigrationOperationId: true,
        targetAuthorization,
      });
      const media = await migrateCanonicalPackageMediaToSpaces({
        packageRoot,
        snapshotMediaRoot: mediaRoot,
        pool,
        objectProvider,
      });
      const parity = await verifyPrivateParity({
        pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization,
      });
      return Object.freeze({
        ready: true,
        phase,
        packageDigest: packageData.manifest.semanticDigest,
        migrationId: packageData.manifest.migrationId,
        import: imported,
        media: { objectCount: media.objectCount, byteLength: media.byteLength },
        parity,
        firstPostgresWriteAt: null,
        authorityTransferred: false,
      });
    }

    const parity = await verifyPrivateParity({
      pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization,
    });
    const dryRun = await requireSuccessfulDryRun(pool, operationId, packageData.manifest.semanticDigest);
    const environment = required(args.authorityEnvironment, "authorityEnvironment");
    const store = createPostgresCombinedRuntimeAuthorityStore({ pool, environment });
    await initializeSimplifiedAuthority({ store, environment, args });
    const service = createSimplifiedAuthorityHandoffService({ authorityStore: store });
    const handoffInput = buildHandoffInput({
      args,
      packageData,
      databaseName,
      spacesBucket: spacesConfig.bucket,
      dryRun,
      parity,
      env,
    });
    const result = phase === "prepare-authority"
      ? await service.prepare(handoffInput)
      : await service.transferAuthority(handoffInput);
    return Object.freeze({ ready: true, phase, result, firstPostgresWriteAt: null });
  } finally {
    if (ownsObjectProvider) objectProvider.close();
    if (ownsPool) await pool.end();
  }
}

async function inspectPreImportObserved(input) {
  await input.observePhase("PREIMPORT_GATE_STARTED");
  const result = await inspectPreImport(input);
  await input.observePhase("PREIMPORT_GATE_COMPLETE", { ready: result.ready === true });
  return result;
}

async function verifyMediaSnapshot({ packageData, mediaRoot }) {
  const root = path.resolve(mediaRoot);
  const expected = new Set(packageData.manifest.files.map((entry) => entry.relativePath));
  const actual = await listFiles(root);
  if (actual.length !== expected.size || actual.some((relativePath) => !expected.has(relativePath))) {
    throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "Transported media inventory differs from the canonical package.");
  }
  let byteLength = 0;
  let maximumFileBytes = 0;
  for (const entry of packageData.manifest.files) {
    const file = confinedPath(root, entry.relativePath);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size !== entry.size || await hashFile(file) !== entry.sha256) {
      throw coded("SIMPLIFIED_PROVIDER_MEDIA_IDENTITY_MISMATCH", "Transported media differs from the canonical package.");
    }
    byteLength += stat.size;
    maximumFileBytes = Math.max(maximumFileBytes, stat.size);
  }
  return Object.freeze({
    verified: true,
    objectCount: expected.size,
    byteLength,
    maximumFileBytes,
    processing: "sequential-streaming-hash",
  });
}

async function inspectPreImport({
  pool,
  objectProvider,
  packageData,
  ownerUserId,
  syntheticUserId,
  createMediaObjectId,
  currentOutboxMessageId,
}) {
  const users = await pool.query(
    "SELECT count(*) FILTER (WHERE id=$1)::bigint AS synthetic,count(*) FILTER (WHERE id<>$1 AND id<>$2)::bigint AS other,count(*) FILTER (WHERE id=$2)::bigint AS founder FROM physiqueos.users",
    [syntheticUserId, ownerUserId],
  );
  const scopedTables = [
    "canonical_user_records", "canonical_goal_records", "canonical_plan_records", "canonical_protocol_records",
    "canonical_execution_records", "canonical_checkin_records", "canonical_evidence_records", "canonical_training_records",
    "canonical_briefing_records", "canonical_confidence_records", "canonical_relationships", "canonical_media_objects",
    "canonical_runtime_metadata", "canonical_application_context",
  ];
  let founderRows = Number(users.rows[0]?.founder ?? 0);
  for (const table of scopedTables) {
    founderRows += Number((await pool.query(
      `SELECT count(*)::bigint AS count FROM physiqueos.${table} WHERE owner_user_id=$1`,
      [ownerUserId],
    )).rows[0]?.count ?? 0);
  }
  const authority = await pool.query(
    "SELECT state->>'authority' AS authority,state->>'firstProviderCanonicalWriteAt' AS first_write FROM physiqueos.combined_runtime_authority ORDER BY environment",
  );
  const outbox = await pool.query(
    "SELECT count(*) FILTER (WHERE status='failed')::bigint AS failed,count(*) FILTER (WHERE status='dead')::bigint AS dead,count(*) FILTER (WHERE status='processing' AND claim_expires_at<now() AND ($1::text IS NULL OR id<>$1))::bigint AS expired FROM physiqueos.outbox_messages",
    [currentOutboxMessageId],
  );
  let founderObjects = 0;
  let token = null;
  do {
    const page = await objectProvider.listInventory({ continuationToken: token });
    founderObjects += page.objects.filter((entry) => entry.key.startsWith(`private/${ownerUserId}/`)).length;
    token = page.continuationToken;
  } while (token);
  const mediaIds = packageData.manifest.files.map(createMediaObjectId);
  const mediaCollisions = mediaIds.length
    ? Number((await pool.query(
        "SELECT count(*)::bigint AS count FROM physiqueos.canonical_media_objects WHERE id=ANY($1::text[])",
        [mediaIds],
      )).rows[0]?.count ?? 0)
    : 0;
  const importRunCollision = Number((await pool.query(
    "SELECT count(*)::bigint AS count FROM physiqueos.phase4_import_runs WHERE id=$1",
    [packageData.manifest.migrationId],
  )).rows[0]?.count ?? 0);
  return assertSimplifiedDisposableTarget({
    authorityStates: authority.rows.map((row) => row.authority),
    firstWriteMarkers: authority.rows.map((row) => row.first_write),
    founderScopedRowCount: founderRows,
    founderSpaceObjectCount: founderObjects,
    syntheticUserCount: Number(users.rows[0]?.synthetic ?? 0),
    nonSyntheticUserCount: Number(users.rows[0]?.other ?? 0),
    syntheticDataDistinguishable: ownerUserId !== syntheticUserId,
    primaryKeyCollisionCount: founderRows + mediaCollisions + importRunCollision,
    outbox: {
      failed: Number(outbox.rows[0]?.failed ?? 0),
      dead: Number(outbox.rows[0]?.dead ?? 0),
      expiredLeases: Number(outbox.rows[0]?.expired ?? 0),
    },
  });
}

async function assertProviderStillPreWrite(pool) {
  const result = await pool.query(
    "SELECT state->>'authority' AS authority,state->>'firstProviderCanonicalWriteAt' AS first_write FROM physiqueos.combined_runtime_authority ORDER BY environment",
  );
  if (result.rows.some((row) => row.first_write != null || ["provider-authoritative", "recovery-required"].includes(row.authority))) {
    throw coded("SIMPLIFIED_PROVIDER_FIRST_WRITE_CROSSED", "Provider authority or first-write boundary is already active.");
  }
}

async function verifyPrivateParity({ pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization }) {
  const canonical = await validateCanonicalImport({ pool, packageRoot, targetAuthorization });
  const mediaRows = await pool.query(
    "SELECT id,byte_length,sha256,storage_key,provider_version FROM physiqueos.canonical_media_objects WHERE owner_user_id=$1 ORDER BY id",
    [ownerUserId],
  );
  if (mediaRows.rows.length !== packageData.manifest.files.length) {
    throw coded("SIMPLIFIED_PROVIDER_MEDIA_PARITY_FAILED", "Provider media row count differs from the canonical package.");
  }
  for (const row of mediaRows.rows) {
    const object = await objectProvider.inspectObject({ objectKey: row.storage_key, providerVersion: row.provider_version });
    if (object.byteLength !== Number(row.byte_length) || object.sha256 !== row.sha256) {
      throw coded("SIMPLIFIED_PROVIDER_MEDIA_PARITY_FAILED", "A private Space object differs from its canonical row.");
    }
  }
  return Object.freeze({
    ready: true,
    packageDigest: packageData.manifest.semanticDigest,
    collectionCount: Object.keys(canonical.counts).length,
    mediaCount: mediaRows.rows.length,
  });
}

async function requireSuccessfulDryRun(pool, operationId, packageDigest) {
  const row = (await pool.query(
    "SELECT result,validation_result,report FROM physiqueos.migration_runs WHERE id=$1",
    [operationId],
  )).rows[0];
  if (row?.result !== "succeeded" || row?.validation_result !== "succeeded"
    || row.report?.result?.finalClassification !== "READY"
    || row.report?.result?.providerChecks?.backup?.canonicalPackage?.packageDigest !== packageDigest) {
    throw coded("SIMPLIFIED_PROVIDER_DRY_RUN_REQUIRED", "The exact package has no successful provider production dry-run.");
  }
  return Object.freeze({ ready: true });
}

async function initializeSimplifiedAuthority({ store, environment, args }) {
  try {
    return await store.read();
  } catch (error) {
    if (error?.code !== "RUNTIME_AUTHORITY_UNAVAILABLE") throw error;
  }
  const state = createInitialCombinedRuntimeAuthorityState({
    environment,
    windowsSource: {
      commit: required(args.frozenSourceCommit, "frozenSourceCommit"),
      buildId: required(args.frozenBuildId, "frozenBuildId"),
    },
  });
  return store.initialize(state, { commandId: `${required(args.commandPrefix, "commandPrefix")}:initialize-authority` });
}

function buildHandoffInput({ args, packageData, databaseName, spacesBucket, dryRun, parity, env }) {
  return {
    migrationMode: SIMPLIFIED_MIGRATION_MODE,
    windowsCold: args.windowsCold === true,
    providerPreflight: { ready: true, authority: "non-authoritative", firstPostgresWriteAt: null },
    productionDryRun: dryRun,
    importResult: { ready: true, packageDigest: packageData.manifest.semanticDigest },
    parityResult: parity,
    routingReadiness: { ready: args.routingReady === true },
    migrationOperationId: required(args.migrationOperationId, "migrationOperationId"),
    commandPrefix: required(args.commandPrefix, "commandPrefix"),
    fenceId: required(args.fenceId, "fenceId"),
    packageDigest: packageData.manifest.semanticDigest,
    providerDeploymentId: required(env.PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID, "PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID"),
    providerSource: {
      commit: required(env.PHYSIQUEOS_GIT_SHA, "PHYSIQUEOS_GIT_SHA"),
      buildId: required(env.PHYSIQUEOS_BUILD_ID, "PHYSIQUEOS_BUILD_ID"),
    },
    target: { databaseClusterId: "attached-app-database", databaseName, spacesBucket },
    routingTarget: required(args.routingTarget, "routingTarget"),
    finalSnapshot: {
      runtimeSha256: packageData.manifest.source.runtime.sha256,
      runtimeRevision: packageData.manifest.source.runtime.revision,
      mediaInventorySha256: required(args.mediaInventorySha256, "mediaInventorySha256"),
      migrationControlSha256: required(args.controlSha256, "controlSha256"),
      packageDigest: packageData.manifest.semanticDigest,
    },
  };
}

function assertPackageIdentity(manifest, args, operationId) {
  const expected = {
    revision: String(required(args.runtimeRevision, "runtimeRevision")),
    sha256: digest(args.runtimeSha256, "runtimeSha256"),
    sourceCommit: commit(args.frozenSourceCommit, "frozenSourceCommit"),
    packageDigest: digest(args.packageDigest, "packageDigest"),
    migrationId: required(args.migrationId, "migrationId"),
  };
  if (String(manifest.source.runtime.revision) !== expected.revision
    || manifest.source.runtime.sha256 !== expected.sha256
    || manifest.source.application.sourceCommit !== expected.sourceCommit
    || manifest.source.migration.operationId !== operationId
    || manifest.migrationId !== expected.migrationId
    || manifest.semanticDigest !== expected.packageDigest) {
    throw coded("SIMPLIFIED_PROVIDER_PACKAGE_IDENTITY_MISMATCH", "Canonical package identity differs from the accepted frozen source.");
  }
}

function assertPhase(phase, execute) {
  if (!SIMPLIFIED_PROVIDER_PHASES.includes(phase)) throw new Error("Unsupported simplified provider phase.");
  if (phase !== "pre-import" && execute !== true) {
    throw coded("SIMPLIFIED_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED", "Mutating provider phases require explicit execution authorization.");
  }
  if (phase === "pre-import" && execute === true) {
    throw coded("SIMPLIFIED_PROVIDER_PREFLIGHT_MUST_BE_READ_ONLY", "Pre-import inspection rejects execution authorization.");
  }
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "Transported media contains a symbolic link.");
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
      else throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "Transported media contains an unsupported filesystem entry.");
    }
  }
  await walk(root);
  return files;
}

function confinedPath(root, relative) {
  const target = path.resolve(root, ...String(relative).split("/"));
  const relation = path.relative(root, target);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "Media path escaped the transported snapshot.");
  }
  return target;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}
function digest(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`);
  return candidate;
}
function commit(value, field) {
  const candidate = required(value, field).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidate)) throw new Error(`${field} must be a Git commit.`);
  return candidate;
}
function coded(code, message) { return Object.assign(new Error(message), { code }); }
