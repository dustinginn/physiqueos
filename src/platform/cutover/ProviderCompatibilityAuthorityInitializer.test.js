import { describe, expect, it, vi } from "vitest";
import { createCompatibilityRuntimeAuthorityState } from "./CombinedRuntimeAuthorityState.js";
import {
  initializeProviderCompatibilityAuthority,
  REQUIRED_COMBINED_COMPATIBILITY_TABLES,
} from "./ProviderCompatibilityAuthorityInitializer.js";

const environment = "compatibility-nonproduction";
const expectedDatabaseName = "physiqueos_phase5_test_provider_20260811";
const providerSource = { commit: "a".repeat(40), buildId: "compatibility-build" };
const target = { databaseClusterId: "cluster", databaseName: expectedDatabaseName, spacesBucket: "synthetic-space" };

describe("provider compatibility authority initializer", () => {
  it("initializes and verifies the exact non-authoritative tuple idempotently", async () => {
    const state = createCompatibilityRuntimeAuthorityState({ environment, providerSource, target, now: "2026-08-14T00:00:00.000Z" });
    const initialize = vi.fn(async () => ({ state, outcome: "already-initialized" }));
    const pool = fakePool();
    const result = await initializeProviderCompatibilityAuthority({
      pool, environment, expectedDatabaseName, providerSource, target,
      authorityStore: { initialize, read: async () => ({ state }) },
      now: "2026-08-14T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      outcome: "already-initialized",
      authority: "provider-compatibility-nonauthoritative",
      productionWritesAllowed: false,
      combinedExecutionAllowed: false,
      firstProviderCanonicalWriteAt: null,
    });
    expect(initialize).toHaveBeenCalledOnce();
  });

  it("rejects the wrong database, missing 000005 schema, or an existing transfer operation", async () => {
    await expect(run(fakePool({ databaseName: "defaultdb" }))).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_TARGET_REJECTED" });
    await expect(run(fakePool({ missingTable: REQUIRED_COMBINED_COMPATIBILITY_TABLES[0] }))).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_SCHEMA_UNAVAILABLE" });
    await expect(run(fakePool({ operation: "production-operation" }))).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_OPERATION_CONFLICT" });
  });
});

function run(pool) {
  return initializeProviderCompatibilityAuthority({
    pool, environment, expectedDatabaseName, providerSource, target,
    authorityStore: { initialize: vi.fn(), read: vi.fn() },
  });
}
function fakePool({ databaseName = expectedDatabaseName, missingTable = null, operation = null } = {}) {
  return {
    connect: vi.fn(),
    query: vi.fn(async (sql, values = []) => {
      if (sql === "SELECT current_database() AS database") return { rows: [{ database: databaseName }] };
      if (sql === "SELECT to_regclass($1) AS relation") return { rows: [{ relation: values[0] === missingTable ? null : values[0] }] };
      if (sql.includes("combined_transfer_receipts")) return { rows: operation ? [{ migration_operation_id: operation }] : [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}
