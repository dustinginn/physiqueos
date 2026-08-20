import { describe, expect, it, vi } from "vitest";
import { createCompatibilityRuntimeAuthorityState } from "./CombinedRuntimeAuthorityState.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "./PostgresCombinedRuntimeAuthorityStore.js";

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
