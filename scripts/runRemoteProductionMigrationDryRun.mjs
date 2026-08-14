import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { inspectFoundationSourceInventory } from "../src/platform/migration/foundationSourceCollections.js";

const root = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
if (args["dry-run"] !== "true") throw clientError("REMOTE_DRY_RUN_REQUIRED", "Specify --dry-run true; remote execution is not supported.");
if (args.execute != null || args["final-go"] != null) throw clientError("REMOTE_DRY_RUN_EXECUTION_FLAG_REJECTED", "The remote control client refuses execution/final-GO flags.");

const endpoint = new URL(required(args.endpoint ?? process.env.PHYSIQUEOS_REMOTE_DRY_RUN_ENDPOINT, "--endpoint"));
if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
  throw clientError("REMOTE_DRY_RUN_ENDPOINT_INSECURE", "The remote dry-run endpoint must use HTTPS.");
}
const operationsToken = required(process.env.PHYSIQUEOS_OPERATIONS_TOKEN, "PHYSIQUEOS_OPERATIONS_TOKEN");
const operationId = required(args["operation-id"], "--operation-id");
const correlationId = required(args["correlation-id"], "--correlation-id");
const productionBuildRoot = path.resolve(process.env.PHYSIQUEOS_PRODUCTION_BUILD_ROOT ?? root);
const runtimePath = path.resolve(root, process.env.PHYSIQUEOS_RUNTIME_STORE_PATH ?? path.join("private", "founder", "runtime-store.json"));
const controlPath = path.resolve(root, process.env.PHYSIQUEOS_MIGRATION_CONTROL_PATH ?? path.join("private", "founder", "migration-control.json"));
const mediaRoot = path.resolve(root, process.env.PHYSIQUEOS_FOUNDER_PRIVATE_ROOT ?? path.join("private", "founder"));
const rollbackPath = path.resolve(required(args["rollback-path"], "--rollback-path"));
const recoveryArchive = path.resolve(required(process.env.PHYSIQUEOS_MIGRATION_RECOVERY_ARCHIVE, "PHYSIQUEOS_MIGRATION_RECOVERY_ARCHIVE"));

const [runtimeBytes, controlBytes, productionSourceCommit, productionBuildId, rollbackSourceCommit, rollbackBuildId, recovery, media] = await Promise.all([
  fs.readFile(runtimePath),
  fs.readFile(controlPath),
  readIdentity(path.join(productionBuildRoot, ".next", "SOURCE_COMMIT")),
  readIdentity(path.join(productionBuildRoot, ".next", "BUILD_ID")),
  readIdentity(path.join(rollbackPath, "SOURCE_COMMIT")),
  readIdentity(path.join(rollbackPath, "BUILD_ID")),
  hashFile(recoveryArchive),
  inspectFounderMedia(mediaRoot),
]);
const runtime = JSON.parse(runtimeBytes.toString("utf8").replace(/^\uFEFF/, ""));
const controlEnvelope = JSON.parse(controlBytes.toString("utf8").replace(/^\uFEFF/, ""));
const control = controlEnvelope.state;
assertInactiveLegacyControl(control);
const inventory = inspectFoundationSourceInventory(runtime);
if (inventory.required.presentCount !== 39 || inventory.required.missing.length || inventory.unknown.length
  || inventory.excluded.length !== 3 || inventory.excluded.some((entry) => entry.sourcePresent)) {
  throw clientError("REMOTE_DRY_RUN_COLLECTION_INVENTORY_BLOCKED", "The local Founder collection inventory is not the accepted 39-required/3-excluded contract.");
}
const expectedRecoverySha256 = sha256(required(process.env.PHYSIQUEOS_MIGRATION_RECOVERY_SHA256, "PHYSIQUEOS_MIGRATION_RECOVERY_SHA256"));
if (recovery.sha256 !== expectedRecoverySha256) throw clientError("REMOTE_DRY_RUN_RECOVERY_IDENTITY_MISMATCH", "The local encrypted recovery packet checksum does not match the accepted value.");

const request = Object.freeze({
  operationId,
  correlationId,
  operator: required(args.operator ?? "Founder", "--operator"),
  environment: "production",
  dryRun: true,
  expectedProductionSourceCommit: commit(productionSourceCommit, "live production source"),
  expectedProductionBuildId: productionBuildId,
  expectedProviderSourceCommit: commit(required(args["expected-provider-commit"], "--expected-provider-commit"), "provider source"),
  expectedProviderBuildId: required(args["expected-provider-build"], "--expected-provider-build"),
  expectedFounderRevision: Number(runtime.revision),
  expectedFounderSha256: digest(runtimeBytes),
  expectedMediaCount: media.count,
  expectedMediaBytes: media.bytes,
  expectedMediaInventorySha256: media.sha256,
  expectedControlVersion: Number(control.version),
  expectedControlSha256: digest(controlBytes),
  expectedRecoverySha256,
  expectedMigrationId: required(args["migration-id"], "--migration-id"),
  expectedRollbackSourceCommit: commit(rollbackSourceCommit, "rollback source"),
  expectedRollbackBuildId: rollbackBuildId,
});

const submitted = await requestJson(endpoint, "/api/v1/operations/production-migration-dry-runs", {
  method: "POST",
  token: operationsToken,
  body: request,
});
assertRemoteIdentity(submitted, request);
let status = submitted;
const deadline = Date.now() + numberArg(args["poll-timeout-ms"], 10 * 60_000, 10_000, 15 * 60_000);
const pollIntervalMs = numberArg(args["poll-interval-ms"], 2_000, 250, 10_000);
while (!new Set(["succeeded", "failed"]).has(status.state)) {
  if (Date.now() >= deadline) throw clientError("REMOTE_DRY_RUN_STATUS_TIMEOUT", "The provider dry-run did not reach a terminal state before the polling deadline.");
  await delay(pollIntervalMs);
  status = await requestJson(endpoint, `/api/v1/operations/production-migration-dry-runs/${encodeURIComponent(operationId)}`, { token: operationsToken });
  assertRemoteIdentity(status, request);
}
if (status.state !== "succeeded" || status.finalClassification !== "READY" || status.providerChecks == null || status.noMutation?.passed !== true) {
  const error = clientError(status.failureCode ?? "REMOTE_DRY_RUN_NOT_READY", "The provider dry-run did not reach READY.");
  error.remoteStatus = status;
  throw error;
}
process.stdout.write(`${JSON.stringify({
  ...status,
  controlPlane: {
    platform: "windows",
    providerCredentialsTransmitted: false,
    localFounderRevision: runtime.revision,
    localFounderSha256: request.expectedFounderSha256,
    localControlSha256: request.expectedControlSha256,
    localMediaInventory: media,
    collectionInventory: { required: 39, excluded: 3, unknown: 0, missing: 0 },
    recoveryBytes: recovery.size,
    recoverySha256: recovery.sha256,
  },
  providerDependentValidationExecutedIn: "DigitalOcean App Platform",
})}\n`);

async function requestJson(base, pathname, { method = "GET", token, body = null } = {}) {
  const response = await fetch(new URL(pathname, base), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw clientError("REMOTE_DRY_RUN_RESPONSE_INVALID", `The remote dry-run endpoint returned HTTP ${response.status} without JSON.`); }
  if (!response.ok) throw clientError(payload?.code ?? "REMOTE_DRY_RUN_REQUEST_FAILED", `The remote dry-run endpoint returned HTTP ${response.status}.`);
  return payload;
}

function assertRemoteIdentity(status, request) {
  const production = status.sourceBuild;
  const provider = status.providerSourceBuild;
  if (production?.sourceCommit !== request.expectedProductionSourceCommit || production?.buildId !== request.expectedProductionBuildId) {
    throw clientError("REMOTE_DRY_RUN_PRODUCTION_IDENTITY_MISMATCH", "Remote status reported a different production source/build.");
  }
  const providerCommit = provider?.sourceCommit ?? provider?.gitSha;
  if (providerCommit !== request.expectedProviderSourceCommit || provider?.buildId !== request.expectedProviderBuildId) {
    throw clientError("REMOTE_DRY_RUN_PROVIDER_IDENTITY_MISMATCH", "Remote status reported a different provider source/build.");
  }
}

function assertInactiveLegacyControl(state) {
  const expected = { fenceState: "inactive", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json", readsEnabled: true, writesEnabled: true, migrationOperationId: null, firstPostgresWriteAt: null };
  for (const [field, value] of Object.entries(expected)) {
    if (state?.[field] !== value) throw clientError("PRODUCTION_MIGRATION_EXPECTED_STATE_MISMATCH", `Migration control ${field} is not the accepted inactive legacy value.`);
  }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value == null) throw clientError("REMOTE_DRY_RUN_ARGUMENT_INVALID", `Invalid argument: ${key ?? "missing"}.`);
    result[key.slice(2)] = value;
  }
  return result;
}

async function readIdentity(file) { return (await fs.readFile(file, "utf8")).trim(); }
async function hashFile(file) { const bytes = await fs.readFile(file); return { size: bytes.length, sha256: digest(bytes) }; }
async function inspectFounderMedia(privateRoot) {
  const entries = [];
  for (const category of ["dexa", "evidence", "photos"]) {
    const categoryRoot = path.join(privateRoot, category);
    for (const file of await listFiles(categoryRoot)) {
      const stat = await fs.stat(file);
      entries.push({
        path: path.relative(privateRoot, file).replaceAll("\\", "/"),
        bytes: stat.size,
        sha256: await hashStream(file),
      });
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    count: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: digest(JSON.stringify(entries)),
  });
}
async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}
function hashStream(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function sha256(value) { const candidate = value.toLowerCase(); if (!/^[a-f0-9]{64}$/.test(candidate)) throw clientError("REMOTE_DRY_RUN_ARGUMENT_INVALID", "Recovery SHA-256 is invalid."); return candidate; }
function commit(value, field) { const candidate = String(value ?? "").trim().toLowerCase(); if (!/^[a-f0-9]{40}$/.test(candidate)) throw clientError("REMOTE_DRY_RUN_ARGUMENT_INVALID", `${field} is invalid.`); return candidate; }
function required(value, field) { const candidate = String(value ?? "").trim(); if (!candidate) throw clientError("REMOTE_DRY_RUN_ARGUMENT_INVALID", `${field} is required.`); return candidate; }
function numberArg(value, fallback, minimum, maximum) { const result = value == null ? fallback : Number(value); if (!Number.isInteger(result) || result < minimum || result > maximum) throw clientError("REMOTE_DRY_RUN_ARGUMENT_INVALID", "Polling interval/timeout is invalid."); return result; }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function clientError(code, message) { const error = new Error(message); error.code = code; return error; }
