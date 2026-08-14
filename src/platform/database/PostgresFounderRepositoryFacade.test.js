import { describe, expect, it, vi } from "vitest";
import { createPhase5SyntheticRuntime, PHASE5_SYNTHETIC_OWNER_ID } from "../migration/phase5SyntheticPackage.js";
import { createPostgresFounderRepositoryFacade } from "./PostgresFounderRepositoryFacade.js";

describe("PostgreSQL Founder repository facade", () => {
  it("hydrates reads from PostgreSQL and commits a repository mutation with metadata and outbox", async () => {
    const database = fakeDatabase();
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      compatibilityMode: true,
      now: () => new Date("2026-08-14T01:00:00.000Z"),
      createCommandId: () => "repository-command-1",
    });

    const before = await repositories.goals.getGoalById("phase5-goals-001");
    expect(before.title).toBe("Synthetic strength and composition goal");
    const updated = await repositories.goals.updateGoal(before.id, { title: "Provider canonical goal" });
    expect(updated.title).toBe("Provider canonical goal");
    expect((await repositories.goals.getGoalById(before.id)).title).toBe("Provider canonical goal");
    expect(database.metadata.revision).toBe(5002);
    expect(database.outbox).toHaveLength(1);
    expect(database.outbox[0]).toMatchObject({ commandId: "repository-command-1", collections: ["goals"] });
    expect(database.transactions).toEqual(["BEGIN", "COMMIT"]);
  });

  it("claims the first provider boundary inside the same transaction before a canonical write", async () => {
    const database = fakeDatabase();
    const claimCanonicalWriteBoundary = vi.fn(async () => ({ outcome: "recorded" }));
    const repositories = createPostgresFounderRepositoryFacade({
      pool: database.pool,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      authorityStore: { claimCanonicalWriteBoundary },
      migrationOperationId: "combined-operation",
      compatibilityMode: false,
      createCommandId: () => "first-provider-command",
    });
    await repositories.goals.updateGoal("phase5-goals-001", { title: "Canonical" });
    expect(claimCanonicalWriteBoundary).toHaveBeenCalledWith(expect.objectContaining({
      client: database.client,
      migrationOperationId: "combined-operation",
      commandId: "first-provider-command",
    }));
  });
});

function fakeDatabase() {
  const runtime = structuredClone(createPhase5SyntheticRuntime());
  const metadata = { revision: runtime.revision };
  const outbox = [];
  const transactions = [];
  const query = vi.fn(async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
      transactions.push(normalized);
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (normalized === "SELECT current_database() AS database") return { rows: [{ database: "physiqueos_phase5_test_provider_unit" }], rowCount: 1 };
    if (normalized.includes("SELECT record_id,payload FROM physiqueos.")) {
      const collection = values[1];
      const source = runtime[collection];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      return { rows: records.map((payload, index) => ({ record_id: id(payload, index), payload: structuredClone(payload) })), rowCount: records.length };
    }
    if (normalized.includes("FROM physiqueos.phase4_import_runs")) {
      return { rows: [{ report: { runtimeVersion: runtime.version, runtimeRevision: metadata.revision, sourceUpdatedAt: runtime.updatedAt }, source_sha256: "a".repeat(64) }], rowCount: 1 };
    }
    if (normalized.includes("FROM physiqueos.canonical_application_context")) {
      return { rows: [{ operating_rhythm: null, adaptive_trust_profile: null, retired_milestones: [] }], rowCount: 1 };
    }
    if (normalized.startsWith("DELETE FROM physiqueos.")) {
      const collection = values[1];
      if (collection) {
        const retained = new Set(values[2] ?? []);
        const source = runtime[collection];
        const records = source == null ? [] : Array.isArray(source) ? source : [source];
        runtime[collection] = records.filter((record, index) => retained.has(id(record, index)));
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT version FROM physiqueos.")) {
      const source = runtime[values[1]];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      const record = records.find((entry, index) => id(entry, index) === values[2]);
      return { rows: record ? [{ version: record.version ?? 1 }] : [], rowCount: record ? 1 : 0 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.") && normalized.includes("collection_name,record_id")) {
      const collection = values[1];
      const payload = JSON.parse(values[11]);
      const source = runtime[collection];
      const records = source == null ? [] : Array.isArray(source) ? source : [source];
      const position = records.findIndex((entry, index) => id(entry, index) === values[2]);
      if (position >= 0) records[position] = payload;
      else records.push(payload);
      runtime[collection] = ["user", "nutritionContext", "operatingPlan"].includes(collection) ? records[0] ?? null : records;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) {
      metadata.revision += 1;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT runtime_version,revision,last_command_id,updated_at,imported_at")) {
      return { rows: [{ runtime_version: "founder-seed-v2", revision: metadata.revision,
        last_command_id: null, updated_at: "2026-08-13T00:00:00.000Z",
        imported_at: "2026-08-13T00:00:00.000Z" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.outbox_messages")) {
      outbox.push(JSON.parse(values[3]));
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in fake database: ${normalized}`);
  });
  const client = { query, release: vi.fn() };
  return { runtime, metadata, outbox, transactions, client, pool: { query, connect: async () => client } };
}

function id(record, position) { return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`); }
