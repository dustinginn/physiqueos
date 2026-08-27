import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SIMPLIFIED_PROVIDER_OPERATION_PAYLOAD_VERSION,
  SIMPLIFIED_PROVIDER_OPERATION_VERSION,
  createSimplifiedProviderMigrationWorkerHandler,
  fingerprintSimplifiedProviderMigrationRequest,
  validateSimplifiedProviderMigrationRequest,
} from "./SimplifiedProviderMigrationOperation.js";

const H = "a".repeat(64);
const H2 = "b".repeat(64);
const H3 = "c".repeat(64);
const COMMIT = "d".repeat(40);
const PROVIDER_COMMIT = "e".repeat(40);

describe("in-process simplified provider migration operation", () => {
  it("invokes the migration function exactly once inside the existing worker and cleans transport", async () => {
    const request = validateSimplifiedProviderMigrationRequest(input(), context());
    const executeMigration = vi.fn(async ({ observePhase }) => {
      await observePhase("PACKAGE_VALIDATION_STARTED");
      await observePhase("PACKAGE_VALIDATION_COMPLETE", { collectionCount: 39, mediaCount: 402 });
      await observePhase("MEDIA_VALIDATION_STARTED", { mediaCount: 402 });
      await observePhase("MEDIA_ARCHIVE_PROGRESS", { mediaCount: 402, mediaBytes: 288919315 });
      await observePhase("MEDIA_VALIDATION_COMPLETE", { mediaCount: 402, mediaBytes: 288919315 });
      await observePhase("PREIMPORT_GATE_STARTED");
      await observePhase("PREIMPORT_GATE_COMPLETE", { ready: true });
      return { ready: true, phase: "pre-import", firstPostgresWriteAt: null, authorityTransferred: false };
    });
    const cleanup = vi.fn(async () => ({ deletedExactVersion: true, localRemoved: true }));
    const mediaSource = { visit: vi.fn() };
    const store = operationStore();
    const handler = createSimplifiedProviderMigrationWorkerHandler({
      store,
      validationContext: context(),
      executeMigration,
      createEnvironment: async () => ({
        env: {}, pool: { query: vi.fn() }, objectProvider: {},
        transport: { materialize: vi.fn(async (_input, { observePhase }) => {
          await observePhase("TRANSPORT_STREAM_HASH_STARTED", { expectedByteLength: 321998848 });
          await observePhase("TRANSPORT_STREAM_HASH_COMPLETE", { byteLength: 321998848 });
          await observePhase("ARCHIVE_LIST_STARTED");
          await observePhase("ARCHIVE_LIST_COMPLETE", { entryCount: 412 });
          return { packageRoot: "/tmp/package", mediaSource, cleanup };
        }) },
        transportSummary: () => ({ privateVersionedSpace: true }),
        close: vi.fn(),
      }),
    });
    const result = await handler(payload(request));
    expect(executeMigration).toHaveBeenCalledTimes(1);
    expect(executeMigration.mock.calls[0][0]).toMatchObject({
      phase: "pre-import", execute: false,
      args: {
        packagePath: "/tmp/package",
        mediaSource,
        migrationOperationId: request.migrationOperationId,
        currentOutboxMessageId: `simplified-provider-migration:${request.commandId}`,
      },
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(store.succeed).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ state: "succeeded", inProcess: true, workerPid: process.pid });
    expect(store.markPhase.mock.calls.map(([, marker]) => marker.phase)).toEqual([
      "ENVIRONMENT_CONSTRUCTION_STARTED",
      "ENVIRONMENT_CONSTRUCTION_COMPLETE",
      "TRANSPORT_STREAM_HASH_STARTED",
      "TRANSPORT_STREAM_HASH_COMPLETE",
      "ARCHIVE_LIST_STARTED",
      "ARCHIVE_LIST_COMPLETE",
      "RUNNER_ENTRY",
      "PACKAGE_VALIDATION_STARTED",
      "PACKAGE_VALIDATION_COMPLETE",
      "MEDIA_VALIDATION_STARTED",
      "MEDIA_ARCHIVE_PROGRESS",
      "MEDIA_VALIDATION_COMPLETE",
      "PREIMPORT_GATE_STARTED",
      "PREIMPORT_GATE_COMPLETE",
      "RUNNER_EXIT",
      "TRANSPORT_CLEANUP_STARTED",
      "TRANSPORT_CLEANUP_COMPLETE",
    ]);
    expect(result.diagnosticPhases.every((marker) => marker.memory.rss > 0 && marker.workerPid === process.pid)).toBe(true);
  });

  it("converts a migration exception to a structured failed operation and remains callable", async () => {
    const store = operationStore();
    const cleanup = vi.fn(async () => ({ deletedExactVersion: true }));
    let calls = 0;
    const handler = createSimplifiedProviderMigrationWorkerHandler({
      store,
      validationContext: context(),
      executeMigration: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("secret detail"), { code: "EXPECTED_MIGRATION_FAILURE" });
        return { ready: true, firstPostgresWriteAt: null };
      },
      createEnvironment: async () => ({
        env: {}, pool: {}, objectProvider: {},
        transport: { materialize: async () => ({ packageRoot: "/tmp/package", mediaRoot: "/tmp/media", cleanup }) },
        transportSummary: () => ({}), close: vi.fn(),
      }),
    });
    const first = validateSimplifiedProviderMigrationRequest(input(), context());
    await expect(handler(payload(first))).resolves.toMatchObject({ state: "failed", inProcess: true });
    expect(store.fail).toHaveBeenCalledWith(first.commandId, expect.anything(), {
      code: "EXPECTED_MIGRATION_FAILURE",
      message: expect.not.stringContaining("secret detail"),
    });
    const second = validateSimplifiedProviderMigrationRequest(input({ commandId: "simplified-preimport-command-0002" }), context());
    await expect(handler(payload(second))).resolves.toMatchObject({ state: "succeeded", inProcess: true });
    expect(calls).toBe(2);
  });

  it("fails closed for identity drift and for a mutating phase without a cold Windows source", () => {
    expect(() => validateSimplifiedProviderMigrationRequest(input({ runtimeSha256: H2 }), context()))
      .toThrowError(expect.objectContaining({ code: "SIMPLIFIED_PROVIDER_EXPECTED_IDENTITY_MISMATCH" }));
    expect(() => validateSimplifiedProviderMigrationRequest(input({ phase: "import-and-validate", execute: true }), context()))
      .toThrowError(expect.objectContaining({ code: "SIMPLIFIED_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED" }));
    expect(() => validateSimplifiedProviderMigrationRequest(input({ transport: { objectKey: "../escape.tar", byteLength: 1, sha256: H } }), context()))
      .toThrowError(expect.objectContaining({ code: "SIMPLIFIED_TRANSPORT_KEY_INVALID" }));
  });

  it("keeps CLI and worker execution free of a second Node runtime or process exit", () => {
    const worker = fs.readFileSync("scripts/runFoundationWorker.mjs", "utf8");
    const operation = fs.readFileSync(new URL("./SimplifiedProviderMigrationOperation.js", import.meta.url), "utf8");
    const execution = fs.readFileSync(new URL("./SimplifiedProviderMigrationExecution.js", import.meta.url), "utf8");
    const cli = fs.readFileSync("scripts/runSimplifiedProviderMigration.mjs", "utf8");
    expect(`${worker}\n${operation}\n${execution}`).not.toMatch(/process\.execPath|spawn\([^)]*(?:node|npm)|execFile\([^)]*(?:node|npm)|process\.exit\s*\(/i);
    expect(execution).toContain("export async function executeSimplifiedProviderMigration");
    expect(cli).toContain("executeSimplifiedProviderMigration");
    expect(cli).not.toContain("process.exit");
  });
});

function payload(request) {
  return {
    messageId: `simplified-provider-migration:${request.commandId}`,
    payloadVersion: SIMPLIFIED_PROVIDER_OPERATION_PAYLOAD_VERSION,
    payload: { request, payloadFingerprint: fingerprintSimplifiedProviderMigrationRequest(request) },
  };
}
function operationStore() {
  return {
    markRunning: vi.fn(async (commandId) => ({ result: { commandId, state: "running" } })),
    markPhase: vi.fn(async () => ({})),
    succeed: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
  };
}
function context() {
  return {
    founder: { revision: 142, sha256: H },
    media: { count: 402, bytes: 288919315, sha256: H2 },
    backup: { sha256: H3 },
    frozen: { sourceCommit: COMMIT, buildId: "frozen-build" },
    provider: { sourceCommit: PROVIDER_COMMIT, buildId: "provider-build" },
  };
}
function input(overrides = {}) {
  const value = {
    contractVersion: SIMPLIFIED_PROVIDER_OPERATION_VERSION,
    commandId: "simplified-preimport-command-0001",
    migrationMode: "single-user-cold-backup-v1",
    phase: "pre-import",
    execute: false,
    migrationOperationId: "simplified-rev142-20260827",
    migrationId: "a2993575-ed67-7f3d-840c-b147bf5980c1",
    packageDigest: H,
    runtimeRevision: 142,
    runtimeSha256: H,
    controlSha256: H2,
    backupInventorySha256: H3,
    mediaCount: 402,
    mediaBytes: 288919315,
    mediaInventorySha256: H2,
    frozenSourceCommit: COMMIT,
    frozenBuildId: "frozen-build",
    providerSourceCommit: PROVIDER_COMMIT,
    providerBuildId: "provider-build",
    windowsCold: false,
    transport: { objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar", byteLength: 321998848, sha256: H },
    authority: {},
  };
  return { ...value, ...overrides };
}
