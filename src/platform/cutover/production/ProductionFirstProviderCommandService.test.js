import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPhase4CanonicalRecordStore } from "../../database/Phase4CanonicalRecordStore.js";
import { createTransactionalPostgresFixture } from "../../database/testing/transactionalPostgresFixture.js";
import { initializeCombinedCutoverAuthority } from "../CombinedCutoverAuthorityInitializer.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { RuntimeAuthorityAction } from "../CombinedRuntimeAuthorityState.js";
import { createProductionFirstProviderCommandService } from "./ProductionFirstProviderCommandService.js";

const ENVIRONMENT = "production-combined-cutover";
const OWNER = "user_founder_001";
const OPERATION_ID = "phase7b-migration-operation-0001";
const COMMAND_ID = "phase7b-coordinator:first-provider-command";
const RUN_ID = "phase7b-coordinator-run-0001";
const AUTHORIZATION_FINGERPRINT = "a".repeat(64);
const PROVIDER_DEPLOYMENT_ID = "bed088ae-064e-4420-845c-0d972ed81153";
const PROVIDER_BUILD_ID = "phase7b-build-exact";

function run(overrides = {}) {
  return {
    runId: RUN_ID,
    coordinatorOperationId: "phase7b-coordinator-operation-0001",
    migrationOperationId: OPERATION_ID,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    migrationOperationId: OPERATION_ID,
    firstProviderCommandId: COMMAND_ID,
    providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
    providerBuildId: PROVIDER_BUILD_ID,
    ...overrides,
  };
}

async function fixture({ poolDecorator = (pool) => pool, advance = true } = {}) {
  const postgres = createTransactionalPostgresFixture();
  await initializeCombinedCutoverAuthority({
    pool: postgres.pool,
    environment: ENVIRONMENT,
    windowsSource: { commit: "1".repeat(40), buildId: "windows-build" },
    now: "2026-08-21T06:00:00.000Z",
  });
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool: postgres.pool, environment: ENVIRONMENT });
  if (advance) await advanceToProviderAuthority(authorityStore);
  const pool = poolDecorator(postgres.pool);
  const service = createProductionFirstProviderCommandService({ pool, authorityStore, ownerUserId: OWNER });
  return { postgres, authorityStore, service };
}

async function advanceToProviderAuthority(store) {
  let state = (await store.read()).state;
  state = (await store.transition({
    action: RuntimeAuthorityAction.BEGIN_CUTOVER,
    expectedVersion: state.version,
    commandId: "phase7b:begin-cutover",
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint: AUTHORIZATION_FINGERPRINT,
    fenceId: "phase7b-fence-0001",
    finalSnapshot: {
      runtimeSha256: "b".repeat(64), runtimeRevision: 358, mediaInventorySha256: "c".repeat(64),
      migrationControlSha256: "d".repeat(64), packageDigest: "e".repeat(64),
    },
    providerSource: { commit: "9".repeat(40), buildId: PROVIDER_BUILD_ID },
    target: { databaseClusterId: "cluster-1", databaseName: "physiqueos_production", spacesBucket: "media-production" },
    routingTarget: "provider-ingress",
    reason: "Production cutover boundary test.",
  })).state;
  state = (await store.transition({
    action: RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER,
    expectedVersion: state.version,
    commandId: "phase7b:acknowledge-provider",
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint: AUTHORIZATION_FINGERPRINT,
    providerAcknowledgement: {
      migrationOperationId: OPERATION_ID,
      authorizationFingerprint: AUTHORIZATION_FINGERPRINT,
      fenceId: "phase7b-fence-0001",
      packageDigest: "e".repeat(64),
      providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
    },
    reason: "Production provider acknowledgement test.",
  })).state;
  await store.transition({
    action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
    expectedVersion: state.version,
    commandId: "phase7b:transfer-to-provider",
    migrationOperationId: OPERATION_ID,
    authorizationFingerprint: AUTHORIZATION_FINGERPRINT,
    routingTarget: "provider-ingress",
    reason: "Production authority transfer test.",
  });
}

function execute(service, overrides = {}) {
  const args = {
    run: overrides.run ?? run(),
    input: overrides.input ?? input(),
    commandId: overrides.commandId ?? COMMAND_ID,
  };
  return service.executeFirstProviderCommand(args);
}

describe("ProductionFirstProviderCommandService", () => {
  it("atomically commits the exact source-owned M marker and authority boundary", async () => {
    const f = await fixture();
    const result = await execute(f.service);

    expect(result).toMatchObject({ outcome: "committed", runId: RUN_ID, migrationOperationId: OPERATION_ID, commandId: COMMAND_ID });
    const authority = f.postgres.committedAuthority(ENVIRONMENT);
    expect(authority.firstProviderCommandId).toBe(COMMAND_ID);
    expect(new Date(authority.firstProviderCanonicalWriteAt).toISOString()).toBe(authority.firstProviderCanonicalWriteAt);
    expect(f.postgres.committedCanonicalRecords()).toEqual([
      expect.objectContaining({
        collection: "migrationMarkers",
        recordId: markerId(COMMAND_ID),
        payload: expect.objectContaining({
          kind: "phase7b-first-provider-command",
          runId: RUN_ID,
          migrationOperationId: OPERATION_ID,
          commandId: COMMAND_ID,
          providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
          providerBuildId: PROVIDER_BUILD_ID,
          firstProviderCanonicalWriteAt: authority.firstProviderCanonicalWriteAt,
        }),
      }),
    ]);
  });

  it("accepts an exact same-command replay without another write or authority audit", async () => {
    const f = await fixture();
    await execute(f.service);
    const firstAuthority = f.postgres.committedAuthority(ENVIRONMENT);
    const firstRecord = f.postgres.committedCanonicalRecords()[0];
    const firstAuditCount = f.postgres.committedAuditRows(ENVIRONMENT).length;

    expect(await execute(f.service)).toMatchObject({ outcome: "idempotent-replay" });
    expect(f.postgres.committedAuthority(ENVIRONMENT)).toEqual(firstAuthority);
    expect(f.postgres.committedCanonicalRecords()).toEqual([firstRecord]);
    expect(f.postgres.committedAuditRows(ENVIRONMENT)).toHaveLength(firstAuditCount);
  });

  it("fails closed on a conflicting second command", async () => {
    const f = await fixture();
    await execute(f.service);
    const other = "phase7b-coordinator:other-provider-command";
    await expect(execute(f.service, { commandId: other, input: input({ firstProviderCommandId: other }) }))
      .rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_CONFLICT" });
    expect(f.postgres.committedAuthority(ENVIRONMENT).firstProviderCommandId).toBe(COMMAND_ID);
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(1);
  });

  it.each([
    ["operation", { run: run({ migrationOperationId: "phase7b-other-operation-0001" }) }],
    ["dispatch command", { commandId: "phase7b-coordinator:wrong-dispatch" }],
  ])("rejects mismatched %s identity before opening a transaction", async (_label, overrides) => {
    const f = await fixture();
    const before = f.postgres.statements().length;
    await expect(execute(f.service, overrides)).rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_IDENTITY_MISMATCH" });
    expect(f.postgres.statements()).toHaveLength(before);
  });

  it("rolls the authority boundary back when the canonical marker write fails", async () => {
    const f = await fixture();
    f.postgres.injectFailure({
      match: (sql) => sql.startsWith("INSERT INTO physiqueos.canonical_confidence_records"),
      error: Object.assign(new Error("injected marker failure"), { code: "INJECTED_MARKER_FAILURE" }),
    });
    await expect(execute(f.service)).rejects.toMatchObject({ code: "INJECTED_MARKER_FAILURE" });
    expect(f.postgres.committedAuthority(ENVIRONMENT).firstProviderCanonicalWriteAt).toBeNull();
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(0);
  });

  it("reconciles a committed command after its COMMIT response is lost", async () => {
    let first = true;
    const decorate = (pool) => ({
      ...pool,
      async connect() {
        const client = await pool.connect();
        if (!first) return client;
        first = false;
        return {
          ...client,
          async query(sql, values) {
            if (String(sql).trim() !== "COMMIT") return client.query(sql, values);
            await client.query(sql, values);
            throw Object.assign(new Error("commit response lost"), { code: "INJECTED_COMMIT_RESPONSE_LOST" });
          },
        };
      },
    });
    const f = await fixture({ poolDecorator: decorate });
    await expect(execute(f.service)).rejects.toMatchObject({ code: "INJECTED_COMMIT_RESPONSE_LOST" });
    expect(f.postgres.committedAuthority(ENVIRONMENT).firstProviderCommandId).toBe(COMMAND_ID);
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(1);
    expect(await execute(f.service)).toMatchObject({ outcome: "idempotent-replay" });
  });

  it("serializes concurrent attempts on the owner advisory lock", async () => {
    let releaseFirstCommit;
    let signalFirstCommit;
    const firstCommitReached = new Promise((resolve) => { signalFirstCommit = resolve; });
    const release = new Promise((resolve) => { releaseFirstCommit = resolve; });
    let connection = 0;
    const decorate = (pool) => ({
      ...pool,
      async connect() {
        const client = await pool.connect();
        connection += 1;
        if (connection !== 1) return client;
        return {
          ...client,
          async query(sql, values) {
            if (String(sql).trim() === "COMMIT") {
              signalFirstCommit();
              await release;
            }
            return client.query(sql, values);
          },
        };
      },
    });
    const f = await fixture({ poolDecorator: decorate });
    const firstAttempt = execute(f.service);
    await firstCommitReached;
    await expect(execute(f.service)).rejects.toMatchObject({ code: "FIXTURE_LOCK_CONFLICT" });
    releaseFirstCommit();
    await expect(firstAttempt).resolves.toMatchObject({ outcome: "committed" });
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(1);
  });

  it("fails closed when authority evidence exists without the canonical marker", async () => {
    const f = await fixture();
    const client = await f.postgres.pool.connect();
    await client.query("BEGIN");
    await f.authorityStore.claimCanonicalWriteBoundary({ client, migrationOperationId: OPERATION_ID, commandId: COMMAND_ID });
    await client.query("COMMIT");
    client.release();

    await expect(execute(f.service)).rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_PARTIAL_EVIDENCE" });
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(0);
  });

  it("fails closed when a canonical marker exists before the authority boundary", async () => {
    const f = await fixture();
    const client = await f.postgres.pool.connect();
    await client.query("BEGIN");
    const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
    await records.put({
      ownerUserId: OWNER,
      collection: "migrationMarkers",
      recordId: markerId(COMMAND_ID),
      payload: { id: markerId(COMMAND_ID), userId: OWNER, status: "accepted", version: 1 },
    });
    await client.query("COMMIT");
    client.release();

    await expect(execute(f.service)).rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_PARTIAL_EVIDENCE" });
    expect(f.postgres.committedAuthority(ENVIRONMENT).firstProviderCanonicalWriteAt).toBeNull();
  });

  it("rejects execution before provider-authoritative writes are enabled", async () => {
    const f = await fixture({ advance: false });
    await expect(execute(f.service)).rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_AUTHORITY_REJECTED" });
    expect(f.postgres.committedCanonicalRecords()).toHaveLength(0);
  });

  it("rejects replay when deployment/build evidence differs from the durable marker", async () => {
    const f = await fixture();
    await execute(f.service);
    await expect(execute(f.service, { input: input({ providerBuildId: "phase7b-build-wrong" }) }))
      .rejects.toMatchObject({ code: "FIRST_PROVIDER_COMMAND_MARKER_CONFLICT" });
    expect(f.postgres.committedCanonicalRecords()[0].version).toBe(1);
  });
});

function markerId(commandId) {
  return `phase7b-first-provider:${createHash("sha256").update(commandId).digest("hex").slice(0, 32)}`;
}
