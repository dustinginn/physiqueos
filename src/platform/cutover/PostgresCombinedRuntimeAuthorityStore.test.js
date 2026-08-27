import { describe, expect, it, vi } from "vitest";
import {
  createCompatibilityRuntimeAuthorityState,
  createInitialCombinedRuntimeAuthorityState,
  RuntimeAuthorityAction,
} from "./CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";
import { createTransactionalPostgresFixture } from "../database/testing/transactionalPostgresFixture.js";

const environment = "compatibility-nonproduction";
const state = createCompatibilityRuntimeAuthorityState({
  environment,
  providerSource: { commit: "a".repeat(40), buildId: "build" },
  target: {
    databaseClusterId: "cluster",
    databaseName: "physiqueos_phase5_test_provider_20260811",
    spacesBucket: "synthetic-space",
  },
  now: "2026-08-14T00:00:00.000Z",
});

describe("PostgreSQL combined runtime-authority store initialization", () => {
  it("treats the same durable tuple as an idempotent no-op despite timestamp drift", async () => {
    const database = fakeDatabase({ ...state, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z" });
    const store = createPostgresCombinedRuntimeAuthorityStore({ pool: database.pool, environment });
    await expect(store.initialize(state)).resolves.toMatchObject({ outcome: "already-initialized" });
    expect(database.queries).toContain("COMMIT");
  });

  it("fails closed when an existing authority tuple differs", async () => {
    const database = fakeDatabase({ ...state, providerSource: { ...state.providerSource, buildId: "other-build" } });
    const store = createPostgresCombinedRuntimeAuthorityStore({ pool: database.pool, environment });
    await expect(store.initialize(state)).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_INITIALIZATION_CONFLICT" });
    expect(database.queries).toContain("ROLLBACK");
  });

  it("supports a bounded read-only authority query for readiness", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ state }], rowCount: 1 });
    const store = createPostgresCombinedRuntimeAuthorityStore({ pool: { query, connect: vi.fn() }, environment });

    await expect(store.read({ queryTimeoutMs: 1200 })).resolves.toEqual({ state });

    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      values: [environment],
      query_timeout: 1200,
    }));
    expect(query.mock.calls[0][0].text).toMatch(/^SELECT state FROM/);
  });
});

describe("PostgreSQL combined runtime-authority store updates", () => {
  it("binds every update parameter contiguously while preserving immutable created_at", async () => {
    const productionEnvironment = "combined-cutover-production";
    const fixture = createTransactionalPostgresFixture();
    const store = createPostgresCombinedRuntimeAuthorityStore({ pool: fixture.pool, environment: productionEnvironment });
    const initial = createInitialCombinedRuntimeAuthorityState({
      environment: productionEnvironment,
      windowsSource: { commit: "f".repeat(40), buildId: "windows-build" },
      now: "2026-08-27T23:19:17.815Z",
    });
    await store.initialize(initial);

    const transition = await store.transition({
      action: RuntimeAuthorityAction.BEGIN_CUTOVER,
      expectedVersion: 1,
      migrationOperationId: "simplified-rev142-20260827",
      authorizationFingerprint: "a".repeat(64),
      fenceId: "windows-cold-rev142-a2993575",
      finalSnapshot: {
        runtimeSha256: "b".repeat(64), runtimeRevision: 142, mediaInventorySha256: "c".repeat(64),
        migrationControlSha256: "d".repeat(64), packageDigest: "e".repeat(64),
      },
      providerSource: { commit: "1".repeat(40), buildId: "provider-build" },
      target: { databaseClusterId: "attached-app-database", databaseName: "provider-db", spacesBucket: "private-space" },
      routingTarget: "https://provider.example",
      commandId: "simplified-rev142-final-20260827:begin",
      reason: "Begin the accepted single-user cold-backup migration with Windows cold.",
    });

    const update = fixture.statements().find((entry) => entry.sql.startsWith("UPDATE physiqueos.combined_runtime_authority SET"));
    const placeholders = [...update.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    expect([...new Set(placeholders)].sort((left, right) => left - right)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(update.values).toHaveLength(18);
    expect(update.values[0]).toBe(productionEnvironment);
    expect(update.values[1]).toBe(2);
    expect(update.values[2]).toBe("combined-cutover-in-progress");
    expect(update.values[3]).toBe("simplified-rev142-20260827");
    expect(update.values[13]).toBeNull();
    expect(update.values[14]).toBeNull();
    expect(JSON.parse(update.values[15])).toEqual(transition.state);
    expect(update.values[16]).toBe(transition.state.updatedAt);
    expect(update.values[17]).toBe(1);
    expect(transition.state).toMatchObject({
      environment: productionEnvironment,
      version: 2,
      authority: "combined-cutover-in-progress",
      firstProviderCanonicalWriteAt: null,
      publicRuntimeAuthority: "windows",
    });
    expect(transition.state.createdAt).toBe(initial.createdAt);
  });
});

function fakeDatabase(existing) {
  const queries = [];
  const client = {
    query: vi.fn(async (sql) => {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push(normalized);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.startsWith("SELECT state FROM physiqueos.combined_runtime_authority")) return { rows: [{ state: existing }], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${normalized}`);
    }),
    release: vi.fn(),
  };
  return { queries, client, pool: { connect: async () => client, query: client.query } };
}
