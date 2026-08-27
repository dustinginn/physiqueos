import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FOUNDATION_REQUIRED_SOURCE_COLLECTIONS } from "../src/platform/migration/foundationSourceCollections.js";
import { PHASE4_PACKAGE_VERSION, exportCanonicalPackage } from "../src/platform/migration/phase4CanonicalExport.js";
import { createFixedBuildIdentityProvider, deriveTrustedMigrationSourceIdentity } from "../src/platform/migration/MigrationSourceIdentity.js";

const root = process.cwd();
const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (item) => item.close ? new Promise((resolve) => item.close(resolve)) : fs.rm(item, { recursive: true, force: true })));
});

describe("Windows remote production migration dry-run client", () => {
  it("validates local identities, submits no provider credentials, polls durable status, and renders provider READY", async () => {
    const fixture = await createFixture();
    let submitted;
    const server = http.createServer(async (request, response) => {
      expect(request.headers.authorization).toBe("Bearer synthetic-operations-token-32-characters");
      if (request.method === "POST") {
        submitted = JSON.parse(await body(request));
        return json(response, 202, remoteStatus(submitted, "queued"));
      }
      return json(response, 200, remoteStatus(submitted, "succeeded"));
    });
    cleanup.push(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const result = await runClient(fixture, endpoint);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "succeeded",
      finalClassification: "READY",
      providerDependentValidationExecutedIn: "DigitalOcean App Platform",
      controlPlane: { providerCredentialsTransmitted: false, collectionInventory: { required: 39, excluded: 3 } },
    });
    expect(submitted).toMatchObject({ dryRun: true, operator: "Founder", expectedFounderRevision: 122 });
    expect(Object.keys(submitted)).not.toEqual(expect.arrayContaining(["databasePassword", "databaseUrl", "spacesSecretKey", "providerToken", "recoveryPassphrase"]));
  });

  it("fails closed when the remote provider identity differs", async () => {
    const fixture = await createFixture();
    let submitted;
    const server = http.createServer(async (request, response) => {
      if (request.method === "POST") submitted = JSON.parse(await body(request));
      const status = remoteStatus(submitted, "succeeded");
      status.providerSourceBuild = { sourceCommit: "9".repeat(40), buildId: "wrong" };
      return json(response, request.method === "POST" ? 202 : 200, status);
    });
    cleanup.push(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const result = await runClient(fixture, `http://127.0.0.1:${server.address().port}`);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Remote status reported a different provider source/build");
  });
});

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-remote-client-"));
  cleanup.push(directory);
  const buildRoot = path.join(directory, "production");
  const rollbackRoot = path.join(directory, "rollback");
  await fs.mkdir(path.join(buildRoot, ".next"), { recursive: true });
  await fs.mkdir(rollbackRoot, { recursive: true });
  await fs.writeFile(path.join(buildRoot, ".next", "SOURCE_COMMIT"), `${"b".repeat(40)}\n`);
  await fs.writeFile(path.join(buildRoot, ".next", "BUILD_ID"), "production-build\n");
  await fs.writeFile(path.join(rollbackRoot, "SOURCE_COMMIT"), `${"f".repeat(40)}\n`);
  await fs.writeFile(path.join(rollbackRoot, "BUILD_ID"), "rollback-build\n");
  const runtime = Object.fromEntries(FOUNDATION_REQUIRED_SOURCE_COLLECTIONS.map((name) => [name, name === "user" ? { id: "founder" } : []]));
  Object.assign(runtime, { version: "fixture", revision: 122, updatedAt: "2026-08-13T00:00:00.000Z" });
  const runtimePath = path.join(directory, "runtime.json");
  const controlPath = path.join(directory, "control.json");
  const backupInventoryPath = path.join(directory, "SHA256SUMS.txt");
  const mediaRoot = path.join(directory, "media");
  const packageRoot = path.join(directory, "package");
  for (const category of ["dexa", "evidence", "photos"]) await fs.mkdir(path.join(mediaRoot, category), { recursive: true });
  await fs.writeFile(path.join(mediaRoot, "photos", "synthetic.jpg"), "synthetic-media");
  await fs.writeFile(runtimePath, JSON.stringify(runtime));
  await fs.writeFile(controlPath, JSON.stringify({ state: {
    schemaVersion: "production-migration-control-v1", environment: "production", version: 14, fenceState: "aborted", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json", canonicalStoreTarget: "legacy-json",
    readsEnabled: true, writesEnabled: true, fenceId: "old-fence", migrationOperationId: "old-operation", expectedMigrationId: "old-package",
    currentStep: "aborted-to-legacy", lastTransition: "abort-to-legacy", abortedAt: "2026-08-18T20:48:28.376Z", releasedAt: "2026-08-18T20:48:28.376Z", firstPostgresWriteAt: null,
  } }));
  await fs.writeFile(backupInventoryPath, "verified-final-backup-inventory");
  const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
    runtimePath,
    packageVersion: PHASE4_PACKAGE_VERSION,
    sourceSchemaVersion: "000003",
    migrationOperationId: "remote-client-test-0001",
    buildIdentityProvider: createFixedBuildIdentityProvider({ repositoryCommit: "b".repeat(40), applicationBuildId: "production-build", applicationSourceCommit: "b".repeat(40), migrationScriptCommit: "b".repeat(40) }),
  });
  await exportCanonicalPackage({ runtimePath, mediaRoot, outputRoot: packageRoot, sourceIdentity });
  return { buildRoot, rollbackRoot, runtimePath, controlPath, backupInventoryPath, backupInventorySha256: digest("verified-final-backup-inventory"), mediaRoot, packageRoot };
}

function runClient(fixture, endpoint) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      path.join(root, "scripts", "runRemoteProductionMigrationDryRun.mjs"),
      "--dry-run", "true",
      "--mode", "single-user-cold-backup-v1",
      "--endpoint", endpoint,
      "--operation-id", "remote-client-test-0001",
      "--correlation-id", "remote-client-correlation-0001",
      "--expected-provider-commit", "a".repeat(40),
      "--expected-provider-build", "provider-build",
      "--package-path", fixture.packageRoot,
      "--rollback-path", fixture.rollbackRoot,
      "--poll-interval-ms", "250",
      "--poll-timeout-ms", "10000",
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PHYSIQUEOS_OPERATIONS_TOKEN: "synthetic-operations-token-32-characters",
        PHYSIQUEOS_PRODUCTION_BUILD_ROOT: fixture.buildRoot,
        PHYSIQUEOS_RUNTIME_STORE_PATH: fixture.runtimePath,
        PHYSIQUEOS_MIGRATION_CONTROL_PATH: fixture.controlPath,
        PHYSIQUEOS_FINAL_BACKUP_SHA256SUMS: fixture.backupInventoryPath,
        PHYSIQUEOS_FINAL_BACKUP_SHA256SUMS_SHA256: fixture.backupInventorySha256,
        PHYSIQUEOS_FOUNDER_PRIVATE_ROOT: fixture.mediaRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function remoteStatus(request, state) {
  return {
    operationId: request?.operationId,
    state,
    sourceBuild: { sourceCommit: request?.expectedProductionSourceCommit, buildId: request?.expectedProductionBuildId },
    providerSourceBuild: { sourceCommit: request?.expectedProviderSourceCommit, buildId: request?.expectedProviderBuildId },
    providerChecks: state === "succeeded" ? { database: { ready: true }, spaces: { private: true } } : null,
    noMutation: state === "succeeded" ? { passed: true } : null,
    finalClassification: state === "succeeded" ? "READY" : "PENDING",
  };
}

async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8"); }
function json(response, status, value) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
