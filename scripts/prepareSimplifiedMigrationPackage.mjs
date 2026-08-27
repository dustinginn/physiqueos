import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const [{ createFounderRuntimeStore }, canonicalExport, sourceIdentityModel, { assertSimplifiedFrozenSource }] = await Promise.all([
  import("../src/data/repositories/founderRuntimeStore.js"),
  import("../src/platform/migration/phase4CanonicalExport.js"),
  import("../src/platform/migration/MigrationSourceIdentity.js"),
  import("../src/platform/cutover/simplified/SimplifiedMigrationEligibility.js"),
]);
const { PHASE4_PACKAGE_VERSION, exportCanonicalPackage, readAndValidateCanonicalPackage } = canonicalExport;
const { createFixedBuildIdentityProvider, deriveTrustedMigrationSourceIdentity } = sourceIdentityModel;

const args = parseArgs(process.argv.slice(2));
const runtimePath = path.resolve(required(args["runtime-path"], "--runtime-path"));
const controlPath = path.resolve(required(args["control-path"], "--control-path"));
const mediaRoot = path.resolve(required(args["media-root"], "--media-root"));
const backupInventoryPath = path.resolve(required(args["backup-inventory"], "--backup-inventory"));
const outputRoot = path.resolve(required(args["output-root"], "--output-root"));
const operationId = required(args["operation-id"], "--operation-id");
const frozenSourceCommit = commit(args["frozen-source-commit"], "--frozen-source-commit");
const migrationScriptCommit = commit(args["migration-script-commit"], "--migration-script-commit");
const frozenBuildId = required(args["frozen-build-id"], "--frozen-build-id");

const [runtimeBytes, controlBytes, backupInventoryBytes] = await Promise.all([
  fs.readFile(runtimePath), fs.readFile(controlPath), fs.readFile(backupInventoryPath),
]);
const runtime = JSON.parse(runtimeBytes.toString("utf8").replace(/^\uFEFF/, ""));
const control = JSON.parse(controlBytes.toString("utf8").replace(/^\uFEFF/, "")).state;
assertSimplifiedFrozenSource({
  control,
  operationId,
  expectedRuntimeRevision: Number(required(args["expected-runtime-revision"], "--expected-runtime-revision")),
  actualRuntimeRevision: runtime.revision,
  expectedRuntimeSha256: digestValue(required(args["expected-runtime-sha256"], "--expected-runtime-sha256")),
  actualRuntimeSha256: digest(runtimeBytes),
  expectedControlSha256: digestValue(required(args["expected-control-sha256"], "--expected-control-sha256")),
  actualControlSha256: digest(controlBytes),
  expectedBackupInventorySha256: digestValue(required(args["expected-backup-inventory-sha256"], "--expected-backup-inventory-sha256")),
  actualBackupInventorySha256: digest(backupInventoryBytes),
  expectedSourceCommit: frozenSourceCommit,
  actualSourceCommit: frozenSourceCommit,
});

await fs.access(mediaRoot);
await fs.access(path.dirname(outputRoot));
const buildIdentityProvider = createFixedBuildIdentityProvider({
  repositoryCommit: migrationScriptCommit,
  applicationBuildId: frozenBuildId,
  applicationSourceCommit: frozenSourceCommit,
  migrationScriptCommit,
});
const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
  runtimePath,
  packageVersion: PHASE4_PACKAGE_VERSION,
  sourceSchemaVersion: "000003",
  buildIdentityProvider,
  migrationOperationId: operationId,
});
const exported = await exportCanonicalPackage({ runtimePath, mediaRoot, outputRoot, sourceIdentity, normalizeRuntime: (value) => createFounderRuntimeStore(value) });
const verified = await readAndValidateCanonicalPackage(outputRoot);
const [runtimeAfter, controlAfter, inventoryAfter] = await Promise.all([fs.readFile(runtimePath), fs.readFile(controlPath), fs.readFile(backupInventoryPath)]);
if (digest(runtimeAfter) !== digest(runtimeBytes) || digest(controlAfter) !== digest(controlBytes) || digest(inventoryAfter) !== digest(backupInventoryBytes)) {
  throw coded("SIMPLIFIED_PACKAGE_MUTATED_BACKUP", "Canonical package generation changed the accepted frozen backup.");
}
process.stdout.write(`${JSON.stringify({
  ready: true,
  migrationMode: "single-user-cold-backup-v1",
  packageRoot: outputRoot,
  migrationId: verified.manifest.migrationId,
  packageDigest: verified.manifest.semanticDigest,
  source: verified.manifest.source,
  collections: verified.manifest.collections.length,
  mediaFiles: verified.manifest.files.length,
  mediaBytes: verified.manifest.files.reduce((sum, entry) => sum + Number(entry.size), 0),
  mediaInventorySha256: digest(Buffer.from(JSON.stringify(verified.manifest.files.map((entry) => ({
    path: entry.relativePath,
    bytes: Number(entry.size),
    sha256: entry.sha256,
  })).sort((left, right) => left.path.localeCompare(right.path))))),
  frozenBackupUnchanged: true,
})}\n`);

function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 2) { const key = values[index]; const value = values[index + 1]; if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument: ${key ?? "missing"}.`); result[key.slice(2)] = value; } return result; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function digestValue(value) { const candidate = String(value).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error("Expected SHA-256 is invalid."); return candidate; }
function commit(value, field) { const candidate = required(value, field).toLowerCase(); if (!/^[a-f0-9]{40}$/.test(candidate)) throw new Error(`${field} is invalid.`); return candidate; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw new Error(`${field} is required.`); return candidate; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
