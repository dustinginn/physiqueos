import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const args = parseArgs(process.argv.slice(2));
const phase = required(args.phase, "--phase");
const execute = args.execute === "true";
if (!new Set(["pre-import", "import-and-validate", "prepare-authority", "transfer-authority"]).has(phase)) throw new Error("Unsupported simplified provider phase.");
if (phase !== "pre-import" && !execute) throw coded("SIMPLIFIED_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED", "Mutating provider phases require --execute true.");
if (phase === "pre-import" && execute) throw coded("SIMPLIFIED_PROVIDER_PREFLIGHT_MUST_BE_READ_ONLY", "Pre-import inspection rejects --execute true.");

const [eligibility, database, poolModule, spaces, spacesProvider, canonicalExport, canonicalImport, mediaMigration, mediaIdentity, authorityState, authorityStoreModule, handoffModule] = await Promise.all([
  import("../src/platform/cutover/simplified/SimplifiedMigrationEligibility.js"),
  import("../src/platform/database/config.js"),
  import("../src/platform/database/pool.js"),
  import("../src/platform/object-storage/spacesConfig.js"),
  import("../src/platform/object-storage/SpacesPrivateObjectProvider.js"),
  import("../src/platform/migration/phase4CanonicalExport.js"),
  import("../src/platform/migration/phase4CanonicalImport.js"),
  import("../src/platform/migration/ProductionSpacesMediaMigration.js"),
  import("../src/platform/migration/phase4LocalMediaMigration.js"),
  import("../src/platform/cutover/CombinedRuntimeAuthorityState.js"),
  import("../src/platform/cutover/PostgresCombinedRuntimeAuthorityStore.js"),
  import("../src/platform/cutover/simplified/SimplifiedAuthorityHandoffService.js"),
]);
eligibility.assertSimplifiedProviderExecutionBoundary(process.env);
const databaseConfig = database.readDatabaseConfig({ ...process.env, PHYSIQUEOS_DATABASE_ENABLED: "1" });
const spacesConfig = spaces.readSpacesConfig(process.env);
if (!databaseConfig.enabled || !spacesConfig.enabled) throw new Error("Simplified provider migration requires the existing attached database and private Space.");
const pool = poolModule.createPostgresPool(databaseConfig);
const objectProvider = spacesProvider.createSpacesPrivateObjectProvider(spacesConfig);
const packageRoot = required(args["package-path"], "--package-path");
const mediaRoot = required(args["media-root"], "--media-root");
const packageData = await canonicalExport.readAndValidateCanonicalPackage(packageRoot);
const ownerUserId = String(packageData.collections.user?.id ?? "");
const operationId = required(args["operation-id"], "--operation-id");
assertPackageIdentity(packageData.manifest, args, operationId);

try {
  const databaseName = (await pool.query("SELECT current_database() AS database")).rows[0]?.database;
  const migrationNames = (await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY run_on,id")).rows.map((row) => row.name);
  eligibility.assertSimplifiedSchema(migrationNames);
  const preImport = ["pre-import", "import-and-validate"].includes(phase)
    ? await inspectPreImport({ pool, objectProvider, packageData, ownerUserId, syntheticUserId: required(process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID"), createMediaObjectId: mediaIdentity.createPhase4MediaObjectId })
    : null;
  if (!preImport) await assertProviderStillPreWrite(pool);

  if (phase === "pre-import") {
    returnJson({ ready: true, phase, database: databaseName, schema: migrationNames, target: preImport, firstPostgresWriteAt: null });
  } else {
    const targetAuthorization = { productionExecutionAuthorized: true, expectedDatabase: databaseName, migrationOperationId: operationId };
    if (phase === "import-and-validate") {
      const imported = await canonicalImport.importCanonicalPackage({ pool, packageRoot, expectedSourceIdentity: packageData.manifest.source, requireMigrationOperationId: true, targetAuthorization });
      const media = await mediaMigration.migrateCanonicalPackageMediaToSpaces({ packageRoot, snapshotMediaRoot: mediaRoot, pool, objectProvider });
      const parity = await verifyPrivateParity({ pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization });
      returnJson({ ready: true, phase, packageDigest: packageData.manifest.semanticDigest, migrationId: packageData.manifest.migrationId, import: imported, media: { objectCount: media.objectCount, byteLength: media.byteLength }, parity, firstPostgresWriteAt: null, authorityTransferred: false });
    } else {
      const parity = await verifyPrivateParity({ pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization });
      const dryRun = await requireSuccessfulDryRun(pool, operationId, packageData.manifest.semanticDigest);
      const environment = required(args["authority-environment"], "--authority-environment");
      const store = authorityStoreModule.createPostgresCombinedRuntimeAuthorityStore({ pool, environment });
      await initializeSimplifiedAuthority({ store, authorityState, environment, args });
      const service = handoffModule.createSimplifiedAuthorityHandoffService({ authorityStore: store });
      const handoffInput = buildHandoffInput({ args, packageData, databaseName, spacesBucket: spacesConfig.bucket, dryRun, parity });
      const result = phase === "prepare-authority" ? await service.prepare(handoffInput) : await service.transferAuthority(handoffInput);
      returnJson({ ready: true, phase, result, firstPostgresWriteAt: null });
    }
  }
} finally {
  objectProvider.close();
  await pool.end();
}

async function inspectPreImport({ pool, objectProvider, packageData, ownerUserId, syntheticUserId, createMediaObjectId }) {
  const users = await pool.query("SELECT count(*) FILTER (WHERE id=$1)::bigint AS synthetic,count(*) FILTER (WHERE id<>$1 AND id<>$2)::bigint AS other,count(*) FILTER (WHERE id=$2)::bigint AS founder FROM physiqueos.users", [syntheticUserId, ownerUserId]);
  const scopedTables = ["canonical_user_records","canonical_goal_records","canonical_plan_records","canonical_protocol_records","canonical_execution_records","canonical_checkin_records","canonical_evidence_records","canonical_training_records","canonical_briefing_records","canonical_confidence_records","canonical_relationships","canonical_media_objects","canonical_runtime_metadata","canonical_application_context"];
  let founderRows = Number(users.rows[0]?.founder ?? 0);
  for (const table of scopedTables) founderRows += Number((await pool.query(`SELECT count(*)::bigint AS count FROM physiqueos.${table} WHERE owner_user_id=$1`, [ownerUserId])).rows[0]?.count ?? 0);
  const authority = await pool.query("SELECT state->>'authority' AS authority,state->>'firstProviderCanonicalWriteAt' AS first_write FROM physiqueos.combined_runtime_authority ORDER BY environment");
  const outbox = await pool.query("SELECT count(*) FILTER (WHERE status='failed')::bigint AS failed,count(*) FILTER (WHERE status='dead')::bigint AS dead,count(*) FILTER (WHERE status='processing' AND claim_expires_at<now())::bigint AS expired FROM physiqueos.outbox_messages");
  let founderObjects = 0;
  let token = null;
  do { const page = await objectProvider.listInventory({ continuationToken: token }); founderObjects += page.objects.filter((entry) => entry.key.startsWith(`private/${ownerUserId}/`)).length; token = page.continuationToken; } while (token);
  const mediaIds = packageData.manifest.files.map(createMediaObjectId);
  const mediaCollisions = mediaIds.length ? Number((await pool.query("SELECT count(*)::bigint AS count FROM physiqueos.canonical_media_objects WHERE id=ANY($1::text[])", [mediaIds])).rows[0]?.count ?? 0) : 0;
  const importRunCollision = Number((await pool.query("SELECT count(*)::bigint AS count FROM physiqueos.phase4_import_runs WHERE id=$1", [packageData.manifest.migrationId])).rows[0]?.count ?? 0);
  return eligibility.assertSimplifiedDisposableTarget({ authorityStates: authority.rows.map((row) => row.authority), firstWriteMarkers: authority.rows.map((row) => row.first_write), founderScopedRowCount: founderRows, founderSpaceObjectCount: founderObjects, syntheticUserCount: Number(users.rows[0]?.synthetic ?? 0), nonSyntheticUserCount: Number(users.rows[0]?.other ?? 0), syntheticDataDistinguishable: ownerUserId !== syntheticUserId, primaryKeyCollisionCount: founderRows + mediaCollisions + importRunCollision, outbox: { failed: Number(outbox.rows[0]?.failed ?? 0), dead: Number(outbox.rows[0]?.dead ?? 0), expiredLeases: Number(outbox.rows[0]?.expired ?? 0) } });
}

async function assertProviderStillPreWrite(pool) {
  const result = await pool.query("SELECT state->>'authority' AS authority,state->>'firstProviderCanonicalWriteAt' AS first_write FROM physiqueos.combined_runtime_authority ORDER BY environment");
  if (result.rows.some((row) => row.first_write != null || ["provider-authoritative", "recovery-required"].includes(row.authority))) {
    throw coded("SIMPLIFIED_PROVIDER_FIRST_WRITE_CROSSED", "Provider authority or first-write boundary is already active.");
  }
  return true;
}

async function verifyPrivateParity({ pool, objectProvider, packageRoot, packageData, ownerUserId, targetAuthorization }) {
  const canonical = await canonicalImport.validateCanonicalImport({ pool, packageRoot, targetAuthorization });
  const mediaRows = await pool.query("SELECT id,byte_length,sha256,storage_key,provider_version FROM physiqueos.canonical_media_objects WHERE owner_user_id=$1 ORDER BY id", [ownerUserId]);
  if (mediaRows.rows.length !== packageData.manifest.files.length) throw coded("SIMPLIFIED_PROVIDER_MEDIA_PARITY_FAILED", "Provider media row count differs from the canonical package.");
  for (const row of mediaRows.rows) { const object = await objectProvider.inspectObject({ objectKey: row.storage_key, providerVersion: row.provider_version }); if (object.byteLength !== Number(row.byte_length) || object.sha256 !== row.sha256) throw coded("SIMPLIFIED_PROVIDER_MEDIA_PARITY_FAILED", "A private Space object differs from its canonical row."); }
  return Object.freeze({ ready: true, packageDigest: packageData.manifest.semanticDigest, collectionCount: Object.keys(canonical.counts).length, mediaCount: mediaRows.rows.length });
}

async function requireSuccessfulDryRun(pool, operationId, packageDigest) {
  const row = (await pool.query("SELECT result,validation_result,report FROM physiqueos.migration_runs WHERE id=$1", [operationId])).rows[0];
  if (row?.result !== "succeeded" || row?.validation_result !== "succeeded" || row.report?.result?.finalClassification !== "READY" || row.report?.result?.providerChecks?.backup?.canonicalPackage?.packageDigest !== packageDigest) throw coded("SIMPLIFIED_PROVIDER_DRY_RUN_REQUIRED", "The exact package has no successful provider production dry-run.");
  return Object.freeze({ ready: true });
}

async function initializeSimplifiedAuthority({ store, authorityState, environment, args }) {
  try { return await store.read(); } catch (error) { if (error?.code !== "RUNTIME_AUTHORITY_UNAVAILABLE") throw error; }
  const state = authorityState.createInitialCombinedRuntimeAuthorityState({ environment, windowsSource: { commit: required(args["frozen-source-commit"], "--frozen-source-commit"), buildId: required(args["frozen-build-id"], "--frozen-build-id") } });
  return store.initialize(state, { commandId: `${required(args["command-prefix"], "--command-prefix")}:initialize-authority` });
}

function buildHandoffInput({ args, packageData, databaseName, spacesBucket, dryRun, parity }) { return { migrationMode: eligibility.SIMPLIFIED_MIGRATION_MODE, windowsCold: args["windows-cold"] === "true", providerPreflight: { ready: true, authority: "non-authoritative", firstPostgresWriteAt: null }, productionDryRun: dryRun, importResult: { ready: true, packageDigest: packageData.manifest.semanticDigest }, parityResult: parity, routingReadiness: { ready: args["routing-ready"] === "true" }, migrationOperationId: required(args["operation-id"], "--operation-id"), commandPrefix: required(args["command-prefix"], "--command-prefix"), fenceId: required(args["fence-id"], "--fence-id"), packageDigest: packageData.manifest.semanticDigest, providerDeploymentId: required(process.env.PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID, "PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID"), providerSource: { commit: required(process.env.PHYSIQUEOS_GIT_SHA, "PHYSIQUEOS_GIT_SHA"), buildId: required(process.env.PHYSIQUEOS_BUILD_ID, "PHYSIQUEOS_BUILD_ID") }, target: { databaseClusterId: "attached-app-database", databaseName, spacesBucket }, routingTarget: required(args["routing-target"], "--routing-target"), finalSnapshot: { runtimeSha256: packageData.manifest.source.runtime.sha256, runtimeRevision: packageData.manifest.source.runtime.revision, mediaInventorySha256: required(args["media-inventory-sha256"], "--media-inventory-sha256"), migrationControlSha256: required(args["control-sha256"], "--control-sha256"), packageDigest: packageData.manifest.semanticDigest } }; }
function assertPackageIdentity(manifest, args, operationId) { const expected = { revision: required(args["runtime-revision"], "--runtime-revision"), sha256: required(args["runtime-sha256"], "--runtime-sha256").toLowerCase(), sourceCommit: required(args["frozen-source-commit"], "--frozen-source-commit").toLowerCase(), packageDigest: required(args["package-digest"], "--package-digest").toLowerCase() }; if (String(manifest.source.runtime.revision) !== expected.revision || manifest.source.runtime.sha256 !== expected.sha256 || manifest.source.application.sourceCommit !== expected.sourceCommit || manifest.source.migration.operationId !== operationId || manifest.semanticDigest !== expected.packageDigest) throw coded("SIMPLIFIED_PROVIDER_PACKAGE_IDENTITY_MISMATCH", "Canonical package identity differs from the accepted frozen source."); }
function parseArgs(values) { const result = {}; for (let i = 0; i < values.length; i += 2) { if (!values[i]?.startsWith("--") || values[i + 1] == null) throw new Error(`Invalid argument: ${values[i] ?? "missing"}.`); result[values[i].slice(2)] = values[i + 1]; } return result; }
function returnJson(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw new Error(`${field} is required.`); return candidate; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
