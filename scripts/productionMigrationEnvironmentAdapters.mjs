import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const root = path.resolve(import.meta.dirname, "..");

export async function createProductionMigrationEnvironment({ env = process.env } = {}) {
  const [
    { createProductionMigrationRunner },
    { createDurableMigrationControlStore, resolveMigrationControlPath },
    { createDigitalOceanManagedPostgresBackupFreshnessVerifier },
    { readDatabaseConfig },
    { createPostgresPool },
    { readSpacesConfig },
    { createSpacesPrivateObjectProvider },
    canonicalExport,
    canonicalImport,
    sourceIdentityModel,
    { FOUNDATION_SOURCE_COLLECTIONS },
    { createFounderRuntimeStore },
    { createSeedRepositories },
    { createLegacyFounderReadLoaders },
    { createPhase3ReadModelService },
    { createPhase5ProviderApplicationComposition },
    { createPhase4CanonicalRecordStore },
    { migrateCanonicalPackageMediaToSpaces, rollbackMigratedSpacesMedia },
    { getProductionApplicationCompositionRuntime, closeProductionApplicationComposition },
  ] = await Promise.all([
    import("../src/platform/cutover/ProductionMigrationRunner.js"),
    import("../src/platform/cutover/DurableMigrationControlStore.js"),
    import("../src/platform/backup/DigitalOceanManagedPostgresBackupFreshness.js"),
    import("../src/platform/database/config.js"),
    import("../src/platform/database/pool.js"),
    import("../src/platform/object-storage/spacesConfig.js"),
    import("../src/platform/object-storage/SpacesPrivateObjectProvider.js"),
    import("../src/platform/migration/phase4CanonicalExport.js"),
    import("../src/platform/migration/phase4CanonicalImport.js"),
    import("../src/platform/migration/MigrationSourceIdentity.js"),
    import("../src/platform/migration/foundationSourceCollections.js"),
    import("../src/data/repositories/founderRuntimeStore.js"),
    import("../src/data/repositories/createSeedRepositories.js"),
    import("../src/application/read-models/LegacyFounderReadLoaders.js"),
    import("../src/application/read-models/Phase3ReadModelService.js"),
    import("../src/platform/database/phase5ProviderComposition.js"),
    import("../src/platform/database/Phase4CanonicalRecordStore.js"),
    import("../src/platform/migration/ProductionSpacesMediaMigration.js"),
    import("../src/application/composition/productionApplicationComposition.js"),
  ]);

  const runtimePath = path.resolve(root, env.PHYSIQUEOS_RUNTIME_STORE_PATH ?? path.join("private", "founder", "runtime-store.json"));
  const mediaRoot = path.resolve(root, env.PHYSIQUEOS_FOUNDER_PRIVATE_ROOT ?? path.join("private", "founder"));
  const databaseConfig = readDatabaseConfig(env);
  const spacesConfig = readSpacesConfig(env);
  if (!databaseConfig.enabled || !spacesConfig.enabled) throw new Error("Production migration environment requires explicit PostgreSQL and Spaces configuration.");
  const pool = createPostgresPool(databaseConfig);
  const objectProvider = createSpacesPrivateObjectProvider(spacesConfig);
  const ownerUserId = required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID");
  const clusterId = required(env.PHYSIQUEOS_DATABASE_CLUSTER_ID, "PHYSIQUEOS_DATABASE_CLUSTER_ID");
  const providerToken = required(env.DIGITALOCEAN_ACCESS_TOKEN, "DIGITALOCEAN_ACCESS_TOKEN");
  const recoveryArchive = path.resolve(required(env.PHYSIQUEOS_MIGRATION_RECOVERY_ARCHIVE, "PHYSIQUEOS_MIGRATION_RECOVERY_ARCHIVE"));
  const recoverySha256 = sha256(required(env.PHYSIQUEOS_MIGRATION_RECOVERY_SHA256, "PHYSIQUEOS_MIGRATION_RECOVERY_SHA256"));
  const controlStore = createDurableMigrationControlStore({ filePath: resolveMigrationControlPath({ env }) });
  const applicationRuntime = getProductionApplicationCompositionRuntime(env);
  const backupFreshnessVerifier = createDigitalOceanManagedPostgresBackupFreshnessVerifier({ clusterId, accessToken: providerToken });
  const buildIdentityProvider = sourceIdentityModel.createFilesystemBuildIdentityProvider({ repositoryRoot: root });
  let packageData;
  let sourceIdentity;
  let providerComposition;
  let paths;
  let mediaResult = null;

  const adapters = {
    async inspectBuildIdentity() {
      const build = await buildIdentityProvider();
      return pass({ identity: { commit: build.applicationSourceCommit, buildId: build.applicationBuildId }, repositoryCommit: build.repositoryCommit, migrationScriptCommit: build.migrationScriptCommit });
    },
    async inspectCanonicalSource() {
      const source = await inspectRuntime(runtimePath);
      return pass({ runtimeRevision: source.revision, runtimeSha256: source.sha256, runtimeVersion: source.version, runtimeBytes: source.size, runtimeUpdatedAt: source.updatedAt });
    },
    async verifyBackup() {
      const actual = await hashFile(recoveryArchive);
      if (actual.sha256 !== recoverySha256) throw new Error("Encrypted migration recovery packet hash mismatch.");
      return pass({ encryptedRecovery: { size: actual.size, sha256: actual.sha256 } });
    },
    async verifyTargetHealth() {
      const database = (await pool.query("SELECT current_database() AS name")).rows[0]?.name;
      await pool.query("SELECT 1");
      await objectProvider.healthCheck();
      return pass({ database, objectStorage: "reachable" });
    },
    async verifyMigrationScripts() {
      const migrations = await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY run_on");
      providerComposition = await createPhase5ProviderApplicationComposition({ pool, ownerUserId, objectProvider, mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER") });
      return pass({
        migrationCount: migrations.rows.length,
        productionRunnerWired: true,
        providerCompositionWired: Boolean(providerComposition.readModels && providerComposition.commands?.execute),
      });
    },
    async verifyCollectionInventory() {
      const runtime = JSON.parse((await fs.readFile(runtimePath, "utf8")).replace(/^\uFEFF/, ""));
      const unknown = Object.keys(runtime).filter((key) => !new Set(["version", "revision", "lastCommitId", "updatedAt", "importedAt", ...FOUNDATION_SOURCE_COLLECTIONS]).has(key));
      const missing = FOUNDATION_SOURCE_COLLECTIONS.filter((key) => !(key in runtime));
      if (unknown.length || missing.length) throw new Error(`Canonical collection inventory failed (unknown=${unknown.join(",")}; missing=${missing.join(",")}).`);
      return pass({ expectedCollectionCount: FOUNDATION_SOURCE_COLLECTIONS.length, unknownCollections: [], missingCollections: [] });
    },
    async captureFinalSnapshot({ input }) {
      paths = operationPaths(input.migrationOperationId);
      await fs.mkdir(paths.root, { recursive: false });
      return canonicalExport.captureReadOnlyFounderSnapshot({
        sourceRuntimePath: runtimePath,
        sourceMediaRoot: mediaRoot,
        snapshotRoot: paths.snapshot,
        mediaInclude: (relativePath) => /^(?:evidence|photos|dexa)\//.test(relativePath),
      });
    },
    async exportCanonicalPackage({ input }) {
      sourceIdentity = await sourceIdentityModel.deriveTrustedMigrationSourceIdentity({
        runtimePath: path.join(paths.snapshot, "runtime-store.json"),
        packageVersion: canonicalExport.PHASE4_PACKAGE_VERSION,
        sourceSchemaVersion: "000003",
        migrationOperationId: input.migrationOperationId,
        buildIdentityProvider,
      });
      return canonicalExport.exportCanonicalPackage({
        runtimePath: path.join(paths.snapshot, "runtime-store.json"),
        mediaRoot: path.join(paths.snapshot, "media"),
        outputRoot: paths.package,
        sourceIdentity,
        normalizeRuntime: (runtime) => createFounderRuntimeStore(runtime),
      });
    },
    async verifyPackage({ input }) {
      packageData = await canonicalExport.readAndValidateCanonicalPackage(paths.package);
      sourceIdentityModel.assertMigrationSourceIdentityMatches(packageData.manifest.source, sourceIdentity, { requireMigrationOperationId: true });
      if (packageData.manifest.migrationId !== input.expectedMigrationId) throw new Error("Final fenced package migration ID differs from the authorized value.");
      return { status: "passed", migrationId: packageData.manifest.migrationId, collectionCount: FOUNDATION_SOURCE_COLLECTIONS.length };
    },
    async importCanonicalPackage({ input }) {
      return canonicalImport.importCanonicalPackage({
        pool,
        packageRoot: paths.package,
        expectedSourceIdentity: sourceIdentity,
        requireMigrationOperationId: true,
        targetAuthorization: productionTargetAuthorization(input),
      });
    },
    async migrateMedia() {
      try {
        mediaResult = await migrateCanonicalPackageMediaToSpaces({ packageRoot: paths.package, snapshotMediaRoot: path.join(paths.snapshot, "media"), pool, objectProvider });
        return mediaResult;
      } catch (error) {
        mediaResult = { uploaded: error.uploadedProviderObjects ?? [] };
        throw error;
      }
    },
    async verifyImport({ input }) {
      return canonicalImport.validateCanonicalImport({ pool, packageRoot: paths.package, targetAuthorization: productionTargetAuthorization(input) });
    },
    async verifyReadParity() {
      const runtime = { version: packageData.manifest.source.runtime.version, revision: Number(packageData.manifest.source.runtime.revision), updatedAt: packageData.manifest.source.runtime.updatedAt, ...packageData.collections };
      const repositories = createSeedRepositories(runtime);
      const legacy = createPhase3ReadModelService({ loaders: createLegacyFounderReadLoaders({ repositories, readRuntimeStore: () => runtime }) });
      providerComposition ??= await createPhase5ProviderApplicationComposition({ pool, ownerUserId, objectProvider, mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER") });
      const principal = migrationPrincipal(ownerUserId);
      const checks = await compareRepresentativeReads({ legacy, postgres: providerComposition.readModels, principal, runtime });
      return { status: "passed", checks };
    },
    async verifyCommandReadiness() {
      providerComposition ??= await createPhase5ProviderApplicationComposition({ pool, ownerUserId, objectProvider, mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER") });
      return { ready: Boolean(providerComposition.commands?.execute), acceptedUserWrite: false };
    },
    async switchComposition() {
      applicationRuntime.clearCache();
      const composition = await applicationRuntime.resolve();
      if (composition.compositionMode !== "postgres" || composition.canonicalStoreEpoch !== "postgres-canonical") throw new Error("Live application did not resolve PostgreSQL composition after the control switch.");
      return { status: "passed", kind: composition.kind };
    },
    async verifyProductionReads() {
      const composition = await applicationRuntime.resolve();
      const profile = await composition.readModels.profile(migrationPrincipal(ownerUserId), {});
      return { ready: Boolean(profile), profileEtag: profile?.etag ?? null };
    },
    async acceptRepresentativePostgresWrite({ input, state }) {
      const records = createPhase4CanonicalRecordStore({ query: (text, values) => pool.query(text, values) });
      const id = `migration-smoke:${input.migrationOperationId}`;
      const record = await records.put({
        ownerUserId,
        collection: "migrationMarkers",
        recordId: id,
        payload: { id, userId: ownerUserId, status: "accepted", canonicalStoreEpoch: state.canonicalStoreEpoch, migrationOperationId: input.migrationOperationId, provenance: { source: "production-migration-runner" } },
      });
      return { accepted: Boolean(record), recordId: id };
    },
    async runPostCutoverSmoke({ input }) {
      const records = createPhase4CanonicalRecordStore({ query: (text, values) => pool.query(text, values) });
      const marker = await records.get({ ownerUserId, collection: "migrationMarkers", recordId: `migration-smoke:${input.migrationOperationId}` });
      if (!marker) throw new Error("Post-cutover canonical write was not durable.");
      const profile = await (await applicationRuntime.resolve()).readModels.profile(migrationPrincipal(ownerUserId), {});
      return { ready: Boolean(profile), migrationMarker: marker.id };
    },
    async enterStabilization() {
      return { state: "stabilization", monitoring: "required-seven-daily-use-days" };
    },
    async rollbackTargetBeforeWrite({ input }) {
      const media = mediaResult?.uploaded ?? [];
      const mediaRollback = await rollbackMigratedSpacesMedia({ objectProvider, uploaded: media });
      await canonicalImport.resetCanonicalTarget(pool, productionTargetAuthorization(input));
      return { reset: true, mediaRollback };
    },
  };

  const runner = createProductionMigrationRunner({ controlStore, adapters, backupFreshnessVerifier });
  return Object.freeze({
    runner,
    readOperatorInput: (args) => readOperatorInput(args, env, controlStore.read().state),
    redactResult: (result) => JSON.parse(JSON.stringify(result, (_key, value) => typeof value === "string" && value.includes("postgresql://") ? "[REDACTED]" : value)),
    async close() {
      objectProvider.close();
      await Promise.allSettled([pool.end(), closeProductionApplicationComposition()]);
    },
  });

  function productionTargetAuthorization(input) {
    return Object.freeze({
      productionExecutionAuthorized: true,
      expectedDatabase: new URL(databaseConfig.connectionString).pathname.slice(1),
      migrationOperationId: input.migrationOperationId,
    });
  }
}

function readOperatorInput(args, env, control) {
  const value = {
    operator: required(args.operator, "--operator"),
    migrationOperationId: required(args["operation-id"], "--operation-id"),
    expectedMigrationId: required(args["migration-id"], "--migration-id"),
    correlationId: required(args["correlation-id"], "--correlation-id"),
    commandPrefix: required(args["command-prefix"], "--command-prefix"),
    reason: required(args.reason, "--reason"),
    expectedSourceCommit: required(args["expected-commit"], "--expected-commit"),
    expectedBuildId: required(args["expected-build"], "--expected-build"),
    expectedRuntimeRevision: required(args["expected-runtime-revision"], "--expected-runtime-revision"),
    expectedRuntimeSha256: required(args["expected-runtime-sha256"], "--expected-runtime-sha256"),
    expectedControlVersion: Number(args["expected-control-version"] ?? control.version),
  };
  if (args.execute === "true") value.finalMigrationAuthorization = required(env.PHYSIQUEOS_FINAL_MIGRATION_AUTHORIZATION, "PHYSIQUEOS_FINAL_MIGRATION_AUTHORIZATION");
  return value;
}

async function compareRepresentativeReads({ legacy, postgres, principal, runtime }) {
  const pendingReview = runtime.evidenceReviews.find((item) => item.status === "pending") ?? runtime.evidenceReviews[0];
  const priority = runtime.executionItems[0];
  const checks = {};
  for (const [method, input] of [
    ["home", {}], ["log", { timeZone: runtime.user.timeZone ?? runtime.user.timezone }],
    ["evidenceReview", { reviewId: pendingReview?.id ?? pendingReview?.review_id }], ["goals", {}],
    ["operatingPlan", {}], ["priorities", { priorityId: priority?.id }], ["progress", {}],
    ["confidence", {}], ["briefings", {}], ["training", {}], ["profile", {}],
  ]) {
    const [left, right] = await Promise.all([legacy[method](principal, input), postgres[method](principal, input)]);
    if (digestJson(left) !== digestJson(right)) throw new Error(`Application read parity failed for ${method}.`);
    checks[method] = "pass";
  }
  return Object.freeze(checks);
}

function operationPaths(operationId) {
  if (!/^[A-Za-z0-9._:-]+$/.test(operationId)) throw new Error("Migration operation ID is unsafe for a workspace path.");
  const operationRoot = path.resolve(root, ".tmp", "production-migration", operationId);
  const parent = path.resolve(root, ".tmp", "production-migration");
  if (!operationRoot.startsWith(`${parent}${path.sep}`)) throw new Error("Migration operation path escaped .tmp.");
  return Object.freeze({ root: operationRoot, snapshot: path.join(operationRoot, "snapshot"), package: path.join(operationRoot, "package") });
}

async function inspectRuntime(file) {
  const bytes = await fs.readFile(file);
  const runtime = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  return { version: runtime.version, revision: runtime.revision, updatedAt: runtime.updatedAt, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function hashFile(file) {
  const bytes = await fs.readFile(file);
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function migrationPrincipal(userId) {
  return Object.freeze({ userId, deviceId: "production-migration-runner", sessionId: "production-migration-runner" });
}

function pass(value = {}) { return Object.freeze({ ready: true, mutated: false, ...value }); }
function digestJson(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sha256(value) { const candidate = value.toLowerCase(); if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error("Recovery SHA-256 is invalid."); return candidate; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw new Error(`${field} is required.`); return candidate; }
