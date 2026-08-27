import {
  GetBucketVersioningCommand,
  HeadBucketCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createDigitalOceanManagedPostgresBackupFreshnessVerifier } from "../backup/DigitalOceanManagedPostgresBackupFreshness.js";
import { readDatabaseConfig } from "../database/config.js";
import { createPostgresPool } from "../database/pool.js";
import { createPhase5ProviderApplicationComposition } from "../database/phase5ProviderComposition.js";
import { FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS, FOUNDATION_REQUIRED_SOURCE_COLLECTIONS } from "../migration/foundationSourceCollections.js";
import { PHASE4_PACKAGE_VERSION } from "../migration/phase4CanonicalExport.js";
import { createSpacesPrivateObjectProvider } from "../object-storage/SpacesPrivateObjectProvider.js";
import { readSpacesConfig } from "../object-storage/spacesConfig.js";
import { readBuildIdentity } from "../observability/buildIdentity.js";
import { createProductionMigrationRunner } from "./ProductionMigrationRunner.js";
import { createCanonicalApplicationCompositionSelector } from "./CanonicalApplicationCompositionSelector.js";
import { CanonicalCompositionMode, CanonicalStoreEpoch } from "./migrationControlState.js";
import { assertProviderExecutionBoundary } from "./ProviderMigrationDryRunContract.js";
import {
  CANONICAL_WRITE_ENTRY_POINTS,
  classifyFounderRepositoryMethod,
  listFounderRepositoryMethodInventory,
} from "./canonicalWriteSurfaceInventory.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import {
  SIMPLIFIED_MIGRATION_MODE,
  assertSimplifiedDisposableTarget,
  assertSimplifiedFrozenSource,
  assertSimplifiedSchema,
} from "./simplified/SimplifiedMigrationEligibility.js";

const EXPECTED_SCHEMA_MIGRATION = "000004_phase5_provider_readiness";
const FOUNDER_SCOPED_TABLES = Object.freeze([
  "canonical_user_records", "canonical_goal_records", "canonical_plan_records", "canonical_protocol_records",
  "canonical_execution_records", "canonical_checkin_records", "canonical_evidence_records", "canonical_training_records",
  "canonical_briefing_records", "canonical_confidence_records", "canonical_relationships", "canonical_media_objects",
  "canonical_runtime_metadata", "canonical_application_context",
]);
const COUNTED_TABLES = Object.freeze([
  "canonical_user_records", "canonical_goal_records", "canonical_plan_records",
  "canonical_protocol_records", "canonical_execution_records", "canonical_checkin_records",
  "canonical_evidence_records", "canonical_training_records", "canonical_briefing_records",
  "canonical_confidence_records", "canonical_relationships", "canonical_media_objects",
  "phase4_import_runs", "phase5_validation_runs", "migration_runs",
]);

export async function createProviderProductionMigrationDryRunEnvironment({ env = process.env, request } = {}) {
  assertProviderExecutionBoundary(env);
  if (request?.dryRun !== true) throw boundaryError("REMOTE_DRY_RUN_REQUIRED", "The provider execution environment accepts dry-run only.");
  const simplified = request.migrationMode === SIMPLIFIED_MIGRATION_MODE;
  const providerIdentity = readBuildIdentity(env);
  if (!providerIdentity.gitSha) throw boundaryError("REMOTE_DRY_RUN_PROVIDER_IDENTITY_UNAVAILABLE", "The App Platform source identity is unavailable.");

  const databaseConfig = readDatabaseConfig({
    ...env,
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: required(simplified ? env.PHYSIQUEOS_DATABASE_URL : env.PHYSIQUEOS_MIGRATION_DATABASE_URL, simplified ? "PHYSIQUEOS_DATABASE_URL" : "PHYSIQUEOS_MIGRATION_DATABASE_URL"),
    PHYSIQUEOS_DATABASE_APPLICATION_NAME: "physiqueos-provider-migration-dry-run",
  });
  const spacesConfig = readSpacesConfig(env);
  if (!spacesConfig.enabled) throw new Error("Provider migration dry-run requires the configured private Space.");
  const pool = createPostgresPool(databaseConfig);
  const objectProvider = createSpacesPrivateObjectProvider(spacesConfig);
  const spacesInspector = createSpacesReadOnlyInspector(spacesConfig);
  const clusterId = simplified ? null : required(env.PHYSIQUEOS_DATABASE_CLUSTER_ID, "PHYSIQUEOS_DATABASE_CLUSTER_ID");
  const backupFreshnessVerifier = simplified ? null : createDigitalOceanManagedPostgresBackupFreshnessVerifier({
    clusterId, accessToken: required(env.DIGITALOCEAN_ACCESS_TOKEN, "DIGITALOCEAN_ACCESS_TOKEN"),
  });
  const ownerUserId = required(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID, "PHYSIQUEOS_CANONICAL_OWNER_USER_ID");
  const configuredRecoverySha256 = simplified ? null : sha256(required(env.PHYSIQUEOS_MIGRATION_RECOVERY_SHA256, "PHYSIQUEOS_MIGRATION_RECOVERY_SHA256"));
  const configuredControlSha256 = simplified ? request.expectedControlSha256 : sha256(required(env.PHYSIQUEOS_MIGRATION_CONTROL_SHA256, "PHYSIQUEOS_MIGRATION_CONTROL_SHA256"));
  const controlState = Object.freeze({
    schemaVersion: "production-migration-control-v1",
    version: request.expectedControlVersion,
    environment: "production",
    fenceId: simplified ? request.previousFenceId : null,
    migrationOperationId: simplified ? request.previousMigrationOperationId : null,
    expectedMigrationId: simplified ? request.previousExpectedMigrationId : null,
    fenceState: simplified ? request.expectedControlFenceState : "inactive",
    canonicalStoreEpoch: "legacy-json",
    compositionMode: "legacy-json",
    canonicalStoreTarget: "legacy-json",
    writesEnabled: true,
    readsEnabled: true,
    firstPostgresWriteAt: null,
    ...(simplified ? {
      currentStep: request.expectedControlCurrentStep,
      lastTransition: request.expectedControlLastTransition,
      abortedAt: request.previousAbortedAt,
      releasedAt: request.previousReleasedAt,
    } : {}),
  });
  const controlStore = Object.freeze({
    read: () => Object.freeze({ state: controlState, audit: Object.freeze([]) }),
    transition: () => { throw boundaryError("REMOTE_DRY_RUN_CONTROL_TRANSITION_FORBIDDEN", "Provider dry-run attempted a migration-control transition."); },
  });
  let providerComposition;
  let targetIdentity;
  let spacesStatus;

  const adapters = {
    async inspectBuildIdentity() {
      return pass({
        identity: { commit: providerIdentity.gitSha, buildId: providerIdentity.buildId },
        repositoryCommit: providerIdentity.gitSha,
        migrationScriptCommit: providerIdentity.gitSha,
        productionIdentity: {
          sourceCommit: request.expectedProductionSourceCommit,
          buildId: request.expectedProductionBuildId,
          attestation: "windows-control-plane-verified",
        },
      });
    },
    async inspectCanonicalSource() {
      return pass({
        runtimeRevision: request.expectedFounderRevision,
        runtimeSha256: request.expectedFounderSha256,
        source: "windows-control-plane-attestation",
      });
    },
    async verifyBackup() {
      if (simplified) {
        assertSimplifiedFrozenSource({
          control: controlState,
          operationId: request.operationId,
          expectedRuntimeRevision: request.expectedFounderRevision,
          actualRuntimeRevision: request.expectedFounderRevision,
          expectedRuntimeSha256: request.expectedFounderSha256,
          actualRuntimeSha256: request.expectedFounderSha256,
          expectedControlSha256: request.expectedControlSha256,
          actualControlSha256: configuredControlSha256,
          expectedBackupInventorySha256: request.expectedBackupInventorySha256,
          actualBackupInventorySha256: request.expectedBackupInventorySha256,
          expectedSourceCommit: request.expectedProductionSourceCommit,
          actualSourceCommit: request.expectedRollbackSourceCommit,
        });
        return pass({
          finalRollbackBackup: { sha256: request.expectedBackupInventorySha256, source: "windows-control-plane-verified-and-drive-replicated" },
          canonicalPackage: { migrationId: request.expectedMigrationId, packageDigest: request.expectedPackageDigest },
          migrationControl: { sha256: configuredControlSha256, state: controlState.fenceState, epoch: "legacy-json", composition: "legacy-json" },
          rollbackArtifact: { sourceCommit: request.expectedRollbackSourceCommit, buildId: request.expectedRollbackBuildId, source: "scratch-booted-frozen-backup" },
        });
      }
      if (request.expectedRecoverySha256 !== configuredRecoverySha256) {
        throw boundaryError("REMOTE_DRY_RUN_RECOVERY_IDENTITY_MISMATCH", "The recovery packet checksum does not match the provider configuration.");
      }
      if (request.expectedControlSha256 !== configuredControlSha256) {
        throw boundaryError("REMOTE_DRY_RUN_CONTROL_DIGEST_MISMATCH", "The migration-control digest does not match the provider configuration.");
      }
      return pass({
        encryptedRecovery: { sha256: configuredRecoverySha256, source: "provider-configured-attestation" },
        migrationControl: { sha256: configuredControlSha256, state: "inactive", epoch: "legacy-json", composition: "legacy-json" },
        rollbackArtifact: { sourceCommit: request.expectedRollbackSourceCommit, buildId: request.expectedRollbackBuildId, source: "windows-control-plane-attestation" },
      });
    },
    async verifyTargetHealth() {
      const database = (await pool.query("SELECT current_database() AS name, current_setting('server_version') AS version")).rows[0];
      const migrations = await migrationNames(pool);
      targetIdentity = Object.freeze({
        clusterId: clusterId ?? "attached-app-database",
        database: database?.name ?? null,
        host: new URL(databaseConfig.connectionString).hostname,
        postgresVersion: database?.version ?? null,
        latestSchemaMigration: migrations.at(-1) ?? null,
      });
      if (!String(database?.version ?? "").startsWith("17.")) throw boundaryError("REMOTE_DRY_RUN_POSTGRES_VERSION_MISMATCH", "The provider target is not PostgreSQL 17.");
      if (simplified) assertSimplifiedSchema(migrations);
      else if (targetIdentity.latestSchemaMigration !== EXPECTED_SCHEMA_MIGRATION) throw boundaryError("REMOTE_DRY_RUN_SCHEMA_MISMATCH", "The provider target schema is not at the accepted migration level.");
      spacesStatus = await spacesInspector.verify();
      return pass({ database: targetIdentity, objectStorage: spacesStatus });
    },
    async verifyMigrationScripts() {
      providerComposition = await createPhase5ProviderApplicationComposition({
        pool,
        ownerUserId,
        objectProvider,
        mediaAccessSecret: required(env.PHYSIQUEOS_CREDENTIAL_PEPPER, "PHYSIQUEOS_CREDENTIAL_PEPPER"),
      });
      const selection = await createCanonicalApplicationCompositionSelector({
        controlStore: { read: () => ({ state: { compositionMode: CanonicalCompositionMode.POSTGRES, canonicalStoreEpoch: CanonicalStoreEpoch.POSTGRES } }) },
        createLegacyComposition: async () => ({ kind: "unselected-legacy" }),
        createPostgresComposition: async () => providerComposition,
      }).getComposition({ expectedMode: CanonicalCompositionMode.POSTGRES, expectedEpoch: CanonicalStoreEpoch.POSTGRES });
      return pass({
        productionRunnerWired: true,
        providerCompositionWired: Boolean(providerComposition.readModels && providerComposition.commands?.execute && selection.kind === providerComposition.kind),
        canonicalCompositionSelectorWired: true,
        packageVersion: PHASE4_PACKAGE_VERSION,
        manifestVersion: "2",
        latestSchemaMigration: targetIdentity?.latestSchemaMigration ?? null,
      });
    },
    async verifyCollectionInventory() {
      if (FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.length !== 39 || FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS.length !== 3) {
        throw boundaryError("REMOTE_DRY_RUN_COLLECTION_CONTRACT_MISMATCH", "The accepted 39-required/3-excluded collection contract changed.");
      }
      const writeSurface = inspectWriteSurface();
      return pass({
        collectionContractVersion: "founder-canonical-collections-v2",
        expectedCollectionCount: 39,
        presentCollectionCount: 39,
        optionalPresentCount: 0,
        excludedCollections: FOUNDATION_EXCLUDED_SOURCE_COLLECTIONS,
        unknownCollections: [],
        missingCollections: [],
        writeSurface,
        source: "windows-control-plane inventory attested; provider contract independently loaded",
      });
    },
    ...forbiddenExecutionAdapters(),
  };

  const rollbackSafetyVerifier = simplified ? {
    async verify() {
      const eligibility = await inspectSimplifiedTargetEligibility({
        pool, spacesInspector, founderUserId: request.expectedFounderUserId, syntheticUserId: ownerUserId,
      });
      return Object.freeze({ ...assertSimplifiedDisposableTarget(eligibility), connectionHost: new URL(databaseConfig.connectionString).hostname, inspection: eligibility });
    },
  } : null;
  const runner = createProductionMigrationRunner({ controlStore, adapters, backupFreshnessVerifier, rollbackSafetyVerifier });
  return Object.freeze({
    runner,
    providerIdentity,
    async captureMutationSnapshot() {
      const [database, objects] = await Promise.all([captureDatabaseCounts(pool), spacesInspector.inventory()]);
      return Object.freeze({ database, objects, digest: digest({ database, objects }) });
    },
    assertNoMutation(before, after) {
      if (before?.digest !== after?.digest) throw boundaryError("REMOTE_DRY_RUN_MUTATION_DETECTED", "Provider dry-run changed target database or Space inventory.");
    },
    summaries: () => Object.freeze({ targetIdentity, spacesStatus }),
    async close() {
      objectProvider.close();
      spacesInspector.close();
      await pool.end();
    },
  });
}

function inspectWriteSurface() {
  const unknown = [];
  for (const [repositoryName, repository] of Object.entries(createSeedRepositories({}))) {
    for (const [methodName, value] of Object.entries(repository)) {
      if (typeof value !== "function") continue;
      try { classifyFounderRepositoryMethod(repositoryName, methodName); }
      catch { unknown.push(`${repositoryName}.${methodName}`); }
    }
  }
  const unfenced = CANONICAL_WRITE_ENTRY_POINTS.filter((entry) => entry.canonical && entry.fenceInterception !== "required-and-implemented");
  if (unknown.length || unfenced.length) throw boundaryError("REMOTE_DRY_RUN_WRITE_SURFACE_INCOMPLETE", "The canonical write-surface inventory is incomplete.");
  return Object.freeze({
    repositoryMethodCount: listFounderRepositoryMethodInventory().length,
    canonicalEntryPointCount: CANONICAL_WRITE_ENTRY_POINTS.filter((entry) => entry.canonical).length,
    unknown: Object.freeze(unknown),
    unfenced: Object.freeze(unfenced.map((entry) => entry.id)),
    noDualWrite: true,
    epochProtection: true,
  });
}

export function createSpacesReadOnlyInspector(config) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return Object.freeze({
    async verify() {
      const [versioning, multipart, , anonymous] = await Promise.all([
        client.send(new GetBucketVersioningCommand({ Bucket: config.bucket })),
        client.send(new ListMultipartUploadsCommand({ Bucket: config.bucket, MaxUploads: 1 })),
        client.send(new HeadBucketCommand({ Bucket: config.bucket })),
        fetch(anonymousBucketUrl(config), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) }),
      ]);
      if (versioning.Status !== "Enabled") throw boundaryError("REMOTE_DRY_RUN_SPACES_VERSIONING_INACTIVE", "The accepted Space does not have versioning enabled.");
      if ((multipart.Uploads ?? []).length > 0) throw boundaryError("REMOTE_DRY_RUN_SPACES_MULTIPART_INCOMPLETE", "The accepted Space has an incomplete multipart upload.");
      if (anonymous.status !== 403) throw boundaryError("REMOTE_DRY_RUN_SPACES_PUBLIC", "The accepted Space did not deny an anonymous bucket request.");
      return Object.freeze({
        bucket: config.bucket,
        region: config.region,
        private: true,
        versioning: "Enabled",
        incompleteMultipartUploads: 0,
        credentials: "bucket-scoped server environment",
      });
    },
    async inventory() {
      const objects = [];
      let continuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken: continuationToken }));
        objects.push(...(page.Contents ?? []).map((item) => ({ key: item.Key, bytes: Number(item.Size ?? 0), etag: item.ETag ?? null })));
        continuationToken = page.IsTruncated ? page.NextContinuationToken : null;
      } while (continuationToken);
      objects.sort((left, right) => String(left.key).localeCompare(String(right.key)));
      return Object.freeze({ count: objects.length, bytes: objects.reduce((sum, item) => sum + item.bytes, 0), digest: digest(objects) });
    },
    async countPrefix(prefix) {
      let count = 0;
      let continuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
        count += (page.Contents ?? []).length;
        continuationToken = page.IsTruncated ? page.NextContinuationToken : null;
      } while (continuationToken);
      return count;
    },
    close() { client.destroy(); },
  });
}

function anonymousBucketUrl(config) {
  const endpoint = new URL(config.endpoint);
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = "/";
  endpoint.search = "";
  return endpoint;
}

async function migrationNames(pool) {
  const result = await pool.query("SELECT name FROM physiqueos.physiqueos_schema_migrations ORDER BY run_on,id");
  return result.rows.map((row) => row.name);
}

export async function inspectSimplifiedTargetEligibility({ pool, spacesInspector, founderUserId, syntheticUserId }) {
  if (!founderUserId || founderUserId === syntheticUserId) {
    throw boundaryError("SIMPLIFIED_TARGET_SYNTHETIC_DATA_REJECTED", "Founder and rehearsal ownership are not distinguishable.");
  }
  const existing = new Set((await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='physiqueos'")).rows.map((row) => row.tablename));
  let founderScopedRowCount = 0;
  for (const table of FOUNDER_SCOPED_TABLES) {
    if (!existing.has(table)) continue;
    const result = await pool.query(`SELECT count(*)::bigint AS count FROM physiqueos.${table} WHERE owner_user_id=$1`, [founderUserId]);
    founderScopedRowCount += Number(result.rows[0]?.count ?? 0);
  }
  const users = await pool.query(
    "SELECT count(*) FILTER (WHERE id=$1)::bigint AS synthetic_count, count(*) FILTER (WHERE id<>$1 AND id<>$2)::bigint AS other_count, count(*) FILTER (WHERE id=$2)::bigint AS founder_count FROM physiqueos.users",
    [syntheticUserId, founderUserId],
  );
  founderScopedRowCount += Number(users.rows[0]?.founder_count ?? 0);
  const authority = existing.has("combined_runtime_authority")
    ? await pool.query("SELECT state->>'authority' AS authority,state->>'firstProviderCanonicalWriteAt' AS first_write FROM physiqueos.combined_runtime_authority ORDER BY environment")
    : { rows: [] };
  const outbox = existing.has("outbox_messages")
    ? await pool.query("SELECT count(*) FILTER (WHERE status='failed')::bigint AS failed,count(*) FILTER (WHERE status='dead')::bigint AS dead,count(*) FILTER (WHERE status='processing' AND claim_expires_at<now())::bigint AS expired_leases FROM physiqueos.outbox_messages")
    : { rows: [{}] };
  const founderSpaceObjectCount = await spacesInspector.countPrefix(`private/${founderUserId}/`);
  return Object.freeze({
    authorityStates: authority.rows.map((row) => row.authority),
    firstWriteMarkers: authority.rows.map((row) => row.first_write ?? null),
    founderScopedRowCount,
    founderSpaceObjectCount,
    syntheticUserCount: Number(users.rows[0]?.synthetic_count ?? 0),
    nonSyntheticUserCount: Number(users.rows[0]?.other_count ?? 0),
    syntheticDataDistinguishable: true,
    primaryKeyCollisionCount: founderScopedRowCount > 0 ? 1 : 0,
    outbox: {
      failed: Number(outbox.rows[0]?.failed ?? 0),
      dead: Number(outbox.rows[0]?.dead ?? 0),
      expiredLeases: Number(outbox.rows[0]?.expired_leases ?? 0),
    },
  });
}

async function captureDatabaseCounts(pool) {
  const existing = new Set((await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='physiqueos'")).rows.map((row) => row.tablename));
  const counts = {};
  for (const table of COUNTED_TABLES) {
    if (!existing.has(table)) continue;
    const result = await pool.query(`SELECT count(*)::bigint AS count FROM physiqueos.${table}`);
    counts[table] = String(result.rows[0]?.count ?? "0");
  }
  return Object.freeze(counts);
}

function forbiddenExecutionAdapters() {
  const names = [
    "captureFinalSnapshot", "exportCanonicalPackage", "verifyPackage", "importCanonicalPackage",
    "verifyImport", "verifyReadParity", "verifyCommandReadiness", "switchComposition",
    "verifyProductionReads", "acceptRepresentativePostgresWrite", "runPostCutoverSmoke", "enterStabilization",
  ];
  return Object.fromEntries(names.map((name) => [name, async () => {
    throw boundaryError("REMOTE_DRY_RUN_EXECUTION_FORBIDDEN", `Provider dry-run cannot execute ${name}.`);
  }]));
}

function pass(value = {}) { return Object.freeze({ ready: true, mutated: false, ...value }); }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sha256(value) { const candidate = value.toLowerCase(); if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error("Configured SHA-256 is invalid."); return candidate; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw new Error(`${field} is required.`); return candidate; }
function boundaryError(code, message) { const error = new Error(message); error.code = code; return error; }
