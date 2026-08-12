import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { register } from "node:module";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "failed",
    code: error.code ?? "MIGRATION_WRAPPER_REHEARSAL_FAILED",
    error: error.message,
    migrationRecovery: error.migrationRecovery ?? null,
  }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = required(args["database-url"] ?? process.env.PHYSIQUEOS_PHASE4_DATABASE_URL, "--database-url");
  assertGuardedDatabase(databaseUrl);
  const sourceSnapshotRoot = safeExistingPath(args["source-snapshot"] ?? path.join(root, ".tmp", "operational-readiness-20260812", "snapshot"));
  const outputRoot = safeOutputPath(required(args.output, "--output"));
  const failAt = args["fail-at"] ?? null;
  if (fs.existsSync(outputRoot)) throw safety("Rehearsal output must be a fresh path.");
  fs.mkdirSync(outputRoot, { recursive: true });
  const controlPath = path.join(outputRoot, "migration-control.json");
  const finalSnapshotRoot = path.join(outputRoot, "final-snapshot");
  const packageRoot = path.join(outputRoot, "package");
  const objectRoot = path.join(outputRoot, "objects");
  const sourceRuntimePath = path.join(sourceSnapshotRoot, "runtime-store.json");
  const sourceMediaRoot = path.join(sourceSnapshotRoot, "media");
  const sourceHashBefore = hashFile(sourceRuntimePath);
  const pool = createValidationPostgresPool({
    connectionString: databaseUrl,
    maximumPoolSize: 4,
    applicationName: "physiqueos-migration-wrapper-rehearsal",
  });

  const [
    { createDurableMigrationControlStore },
    { createProductionMigrationOrchestrator },
    { createCanonicalApplicationCompositionSelector },
    { createCanonicalWriteFence },
    stateModel,
    canonicalExport,
    canonicalImport,
    { migratePackageMediaLocally },
    { createFounderRuntimeStore },
    { createPhase4PostgresApplicationComposition, createPhase4TransactionRunner },
    { createCanonicalPersistenceCommandPorts, CANONICAL_PERSISTENCE_PORT_NAMES },
    { createPhase3CommandService, Phase3Command },
    { createFoundationPostgresAdapters },
    { createPhase4CanonicalRecordStore },
  ] = await Promise.all([
    import("../src/platform/cutover/DurableMigrationControlStore.js"),
    import("../src/platform/cutover/ProductionMigrationOrchestrator.js"),
    import("../src/platform/cutover/CanonicalApplicationCompositionSelector.js"),
    import("../src/platform/cutover/canonicalWriteFence.js"),
    import("../src/platform/cutover/migrationControlState.js"),
    import("../src/platform/migration/phase4CanonicalExport.js"),
    import("../src/platform/migration/phase4CanonicalImport.js"),
    import("../src/platform/migration/phase4LocalMediaMigration.js"),
    import("../src/data/repositories/founderRuntimeStore.js"),
    import("../src/platform/database/phase4PostgresComposition.js"),
    import("../src/application/commands/CanonicalPersistenceCommandPorts.js"),
    import("../src/application/commands/Phase3CommandService.js"),
    import("../src/platform/database/foundationPostgresComposition.js"),
    import("../src/platform/database/Phase4CanonicalRecordStore.js"),
  ]);
  const store = createDurableMigrationControlStore({ filePath: controlPath });
  store.initialize({
    environment: "isolated-rehearsal",
    operator: "founder",
    commandId: "rehearsal-control-initialize-0001",
    correlationId: "rehearsal-control-correlation-0001",
    sourceIdentity: { commit: "6f4976101cb21eb9d3a7e28ee9a960fcf34141c7", buildId: "RmjN47V8xsq3-6jSlZh-9" },
  });
  let packageData = null;
  let postgresComposition = null;
  let selector = null;
  const principal = { userId: "user_founder_001", deviceId: "migration-rehearsal-device", sessionId: "migration-rehearsal-session" };
  const eventLog = [];
  const adapters = {
    inspectBuildIdentity: preflight("inspectBuildIdentity", () => ({ identity: { commit: "6f4976101cb21eb9d3a7e28ee9a960fcf34141c7", buildId: "RmjN47V8xsq3-6jSlZh-9" } })),
    inspectCanonicalSource: preflight("inspectCanonicalSource", () => ({ sha256: sourceHashBefore, revision: JSON.parse(fs.readFileSync(sourceRuntimePath, "utf8")).revision })),
    verifyBackup: preflight("verifyBackup", () => ({ sourceSnapshotRoot, runtimeSha256: sourceHashBefore, mediaCount: countFiles(sourceMediaRoot) })),
    verifyTargetHealth: preflight("verifyTargetHealth", async () => ({ database: (await pool.query("SELECT current_database() AS name")).rows[0].name })),
    verifyMigrationScripts: preflight("verifyMigrationScripts", async () => ({ migrationCount: Number((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.physiqueos_schema_migrations")).rows[0].count) })),
    verifyCollectionInventory: preflight("verifyCollectionInventory", () => ({ expectedCollectionCount: 42, unknownCollections: [] })),
    async captureFinalSnapshot() {
      mark("captureFinalSnapshot"); maybeFail("captureFinalSnapshot");
      return canonicalExport.captureReadOnlyFounderSnapshot({ sourceRuntimePath, sourceMediaRoot, snapshotRoot: finalSnapshotRoot });
    },
    async exportCanonicalPackage() {
      mark("exportCanonicalPackage"); maybeFail("exportCanonicalPackage");
      return canonicalExport.exportCanonicalPackage({
        runtimePath: path.join(finalSnapshotRoot, "runtime-store.json"),
        mediaRoot: path.join(finalSnapshotRoot, "media"),
        outputRoot: packageRoot,
        repositoryRevision: "6f4976101cb21eb9d3a7e28ee9a960fcf34141c7",
        normalizeRuntime: (runtime) => createFounderRuntimeStore(runtime),
      });
    },
    async verifyPackage() {
      mark("verifyPackage"); maybeFail("verifyPackage");
      packageData = await canonicalExport.readAndValidateCanonicalPackage(packageRoot);
      if (Object.keys(packageData.collections).length !== 42) throw safety("Canonical package does not contain all 42 collections.");
      return { migrationId: packageData.manifest.migrationId, manifestDigest: packageData.manifest.manifestDigest, collectionCount: 42 };
    },
    async importCanonicalPackage() {
      mark("importCanonicalPackage"); maybeFail("importCanonicalPackage");
      return canonicalImport.importCanonicalPackage({ pool, packageRoot, resetTarget: false });
    },
    async migrateMedia() {
      mark("migrateMedia"); maybeFail("migrateMedia");
      return migratePackageMediaLocally({ packageRoot, snapshotMediaRoot: path.join(finalSnapshotRoot, "media"), objectRoot });
    },
    async verifyImport() {
      mark("verifyImport"); maybeFail("verifyImport");
      return canonicalImport.validateCanonicalImport({ pool, packageRoot });
    },
    async verifyReadParity() {
      mark("verifyReadParity"); maybeFail("verifyReadParity");
      const result = await execFileAsync(process.execPath, [path.join(root, "scripts", "validatePhase4ReadParity.mjs"), packageRoot], {
        cwd: root,
        env: { ...process.env, PHYSIQUEOS_PHASE4_DATABASE_URL: databaseUrl },
        timeout: 120_000,
        windowsHide: true,
      });
      return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    },
    async verifyCommandReadiness() {
      mark("verifyCommandReadiness"); maybeFail("verifyCommandReadiness");
      postgresComposition = await createPhase4PostgresApplicationComposition({ pool, ownerUserId: packageData.collections.user.id });
      return { ready: Boolean(postgresComposition.commands?.execute), acceptedUserWrite: false };
    },
    async switchComposition({ state }) {
      mark("switchComposition"); maybeFail("switchComposition");
      selector = createCanonicalApplicationCompositionSelector({
        controlStore: store,
        createLegacyComposition: async () => ({ kind: "legacy-json-read-composition" }),
        createPostgresComposition: async () => postgresComposition,
      });
      return selector.getComposition({ expectedMode: stateModel.CanonicalCompositionMode.POSTGRES, expectedEpoch: stateModel.CanonicalStoreEpoch.POSTGRES_CANONICAL });
    },
    async verifyProductionReads({ state }) {
      mark("verifyProductionReads"); maybeFail("verifyProductionReads");
      const composition = await selector.getComposition({ expectedMode: state.compositionMode, expectedEpoch: state.canonicalStoreEpoch });
      const profile = await composition.readModels.profile(principal, {});
      return { ready: Boolean(profile), profileEtag: profile.etag ?? null };
    },
    async acceptRepresentativePostgresWrite({ state }) {
      mark("acceptRepresentativePostgresWrite"); maybeFail("acceptRepresentativePostgresWrite");
      const fence = createCanonicalWriteFence({ controlStore: store, requiredCompositionMode: stateModel.CanonicalCompositionMode.POSTGRES });
      if (fence.inspect().writesEnabled !== false) throw safety("Representative rehearsal write must occur while the operational fence remains active.");
      const runner = createPhase4TransactionRunner({ pool });
      const foundation = createFoundationPostgresAdapters({ query: (text, values) => pool.query(text, values) });
      await pool.query("DELETE FROM physiqueos.sessions WHERE id=$1", [principal.sessionId]);
      await pool.query("DELETE FROM physiqueos.devices WHERE id=$1", [principal.deviceId]);
      await foundation.identity.createDevice({ id: principal.deviceId, userId: principal.userId, platform: "isolated-rehearsal", displayName: "Migration rehearsal" });
      await foundation.identity.createSession({ id: principal.sessionId, userId: principal.userId, deviceId: principal.deviceId, authenticatedAt: new Date(), idleExpiresAt: new Date(Date.now() + 86_400_000), absoluteExpiresAt: new Date(Date.now() + 172_800_000), refreshFamilyId: "migration-rehearsal-family" });
      const ports = Object.fromEntries(CANONICAL_PERSISTENCE_PORT_NAMES.map((name) => [name, (context) =>
        createCanonicalPersistenceCommandPorts({ records: context.transaction.canonicalRecords })[name](context)]));
      const commands = createPhase3CommandService({ transactionRunner: runner, ports });
      const outcome = await commands.execute({
        commandType: Phase3Command.SUBMIT_WEIGHT,
        principal,
        metadata: {
          commandId: "0198f100-0000-7000-8000-000000009901",
          idempotencyKey: "migration-rehearsal-first-postgres-write-0001",
          canonicalStoreEpoch: state.canonicalStoreEpoch,
        },
        payload: { localDate: "2099-01-01", value: 180, unit: "lb" },
      });
      return { accepted: outcome.outcome === "committed", receiptId: outcome.receipt.id ?? outcome.receipt.commandId };
    },
    async runPostCutoverSmoke() {
      mark("runPostCutoverSmoke"); maybeFail("runPostCutoverSmoke");
      const records = createPhase4CanonicalRecordStore({ query: (text, values) => pool.query(text, values) });
      const record = await records.get({ ownerUserId: principal.userId, collection: "weightEntries", recordId: "weight:2099-01-01" });
      if (!record) throw safety("Representative PostgreSQL write was not durable.");
      return { ready: true, representativeWriteCount: 1 };
    },
    async enterStabilization({ state }) {
      mark("enterStabilization"); maybeFail("enterStabilization");
      return { state: state.currentStep, monitoring: "isolated-only" };
    },
    async rollbackTargetBeforeWrite() {
      mark("rollbackTargetBeforeWrite");
      await canonicalImport.resetCanonicalTarget(pool);
      return { reset: true };
    },
  };
  const wrapper = createProductionMigrationOrchestrator({ controlStore: store, adapters });
  try {
    const dryRun = await wrapper.dryRun(wrapperInput());
    const result = await wrapper.execute(wrapperInput());
    const sourceHashAfter = hashFile(sourceRuntimePath);
    if (sourceHashAfter !== sourceHashBefore) throw safety("Immutable source snapshot changed during rehearsal.");
    const report = {
      classification: "isolated-production-migration-wrapper-rehearsal-passed",
      database: new URL(databaseUrl).pathname.slice(1),
      sourceHashBefore,
      sourceHashAfter,
      sourceRevision: packageData.manifest.source.runtimeRevision,
      collectionCount: Object.keys(packageData.collections).length,
      mediaCount: countFiles(objectRoot),
      dryRun: { classification: dryRun.classification, totalDurationMs: dryRun.totalDurationMs },
      execution: result,
      eventLog,
      auditCount: store.read().audit.length,
    };
    fs.writeFileSync(path.join(outputRoot, "rehearsal-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await pool.end();
  }

  function preflight(name, work) {
    return async () => {
      mark(name); maybeFail(name);
      return { ready: true, mutated: false, ...(await work()) };
    };
  }
  function mark(name) { eventLog.push({ name, at: new Date().toISOString() }); }
  function maybeFail(name) {
    if (failAt === name) {
      const error = new Error(`Deliberate isolated failure at ${name}.`);
      error.code = `REHEARSAL_${name.toUpperCase()}_FAILURE`;
      throw error;
    }
  }
}

function wrapperInput() {
  return {
    mode: "isolated",
    operator: "founder",
    migrationOperationId: "revision-119-isolated-rehearsal",
    expectedMigrationId: "cc4903f9-6145-7b3a-8059-010a6de4ed1b",
    correlationId: "revision-119-rehearsal-correlation",
    commandPrefix: "revision-119-rehearsal-command",
    reason: "Isolated rehearsal against an immutable revision-119 copy.",
    auditMetadata: { sourceRuntimeSha256: "cc4903f96145fb3a3059010a6de4ed1b9a31dd4fec3a4d6cf6a10d9ccebf4281", sourceRuntimeRevision: "119" },
  };
}

function assertGuardedDatabase(value) {
  const url = new URL(value);
  const database = url.pathname.slice(1);
  if (!new Set(["127.0.0.1", "localhost"]).has(url.hostname) || !/^physiqueos_phase4_rehearsal_migration_safety_[a-z0-9_]+$/.test(database)) {
    throw safety("Rehearsal refuses a non-local or unguarded database target.");
  }
}

function safeExistingPath(value) {
  const resolved = path.resolve(value);
  if (!isWithin(path.join(root, ".tmp"), resolved) || !fs.statSync(resolved).isDirectory()) throw safety("Source snapshot must be an existing directory under .tmp.");
  return resolved;
}

function safeOutputPath(value) {
  const resolved = path.resolve(value);
  if (!isWithin(path.join(root, ".tmp"), resolved)) throw safety("Rehearsal output must remain under .tmp.");
  return resolved;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function countFiles(directory) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    if (!key?.startsWith("--") || values[index + 1] == null) throw safety(`Invalid argument: ${key ?? "missing"}.`);
    result[key.slice(2)] = values[index + 1];
  }
  return result;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw safety(`${field} is required.`);
  return value.trim();
}

function safety(message) {
  const error = new Error(message);
  error.code = "MIGRATION_WRAPPER_REHEARSAL_SAFETY_STOP";
  return error;
}
