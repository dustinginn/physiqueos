import { describe, expect, it } from "vitest";
import {
  createPostgresFounderReadScope,
  createPostgresFounderRepositoryFacade,
  executePostgresFounderRuntimeMutation,
} from "./PostgresFounderRepositoryFacade.js";
import { loadCanonicalRuntime } from "../migration/phase4CanonicalImport.js";
import { PHASE4_DOMAIN_TABLES } from "../migration/phase4DomainCollections.js";
import { resolvePhotoEventContext } from "../../domain/services/PhotoEventContextService.js";
import { runRepositoryReadScope } from "../../application/read-models/RepositoryReadScope.js";
import { createConfirmationAnalysisWriter } from "../../application/evidence/ConfirmationBoundedWriters.js";
import { createAnalysis } from "../../domain/models/analysis.js";

// Memory-oriented regression without brittle heap assertions. The production
// worker died because of HOW MANY TIMES and HOW MUCH of the canonical runtime
// one analysis step loaded, not because of any single allocation. Counting
// runtime loads and the collections each one requested is deterministic and
// pins the mechanism: a whole-runtime load costs ~150 MB retained in
// production, so four concurrent ones exhaust a ~500 MB heap.
//
// Measured on production-shaped synthetic data (46 MB of canonical JSON) with
// the real facade code and a 512 MB heap limit:
//   four concurrent unscoped reads      512 MB peak, out of memory beside a 150 MB baseline
//   the same reads in one read scope    217 MB peak
//   six per-view repository writes      423 MB peak
//   one bounded batched write           149 MB peak

const OWNER = "user_load_bounds";

function createDatabase() {
  const stats = { runtimeLoads: 0, loadedCollections: [], inserts: [], deletes: [], selectsForUpdate: 0, metadataBumps: 0 };
  const rowsByTable = new Map();
  const add = (collection, id, payload) => {
    const table = PHASE4_DOMAIN_TABLES[collection];
    if (!rowsByTable.has(table)) rowsByTable.set(table, []);
    rowsByTable.get(table).push({ collection_name: collection, source_ordinal: rowsByTable.get(table).length, record_id: id, payload });
  };
  add("user", "user", { id: OWNER });
  add("goals", "goal_1", { id: "goal_1", status: "active", title: "Goal" });
  add("executionItems", "item_1", { id: "item_1" });
  add("dexaScans", "dexa_1", { id: "dexa_1", measuredAt: "2026-05-24" });
  add("analyses", "analysis_existing", { id: "analysis_existing", evidenceIds: ["other"], evidenceTypes: ["dexa"] });
  add("dailyBriefings", "briefing_1", { id: "briefing_1" });
  async function query(text, values = []) {
    if (/collection_name=ANY/.test(text)) {
      stats.runtimeLoads += 1;
      const out = [];
      for (const match of text.matchAll(/FROM physiqueos\.(\w+)\s+WHERE owner_user_id=\$1 AND collection_name=ANY\(\$(\d+)::text\[\]\)/g)) {
        const names = values[Number(match[2]) - 1];
        stats.loadedCollections.push(...names);
        for (const row of rowsByTable.get(match[1]) ?? []) if (names.includes(row.collection_name)) out.push({ ...row, payload: structuredClone(row.payload) });
      }
      return { rows: out, rowCount: out.length };
    }
    if (/current_database/.test(text)) return { rows: [{ database: "physiqueos_phase5_test_provider" }] };
    if (/UPDATE physiqueos.canonical_runtime_metadata/.test(text)) { stats.metadataBumps += 1; return { rows: [{ revision: 2 }], rowCount: 1 }; }
    if (/canonical_runtime_metadata/.test(text)) return { rows: [{ runtime_version: "v", revision: 1, last_command_id: null, updated_at: new Date(), imported_at: new Date() }], rowCount: 1 };
    if (/FOR UPDATE/.test(text)) { stats.selectsForUpdate += 1; return { rows: [{ version: 1 }], rowCount: 1 }; }
    if (/^\s*DELETE FROM physiqueos\.(\w+)/.test(text)) { stats.deletes.push(/DELETE FROM physiqueos\.(\w+)/.exec(text)[1]); return { rows: [], rowCount: 0 }; }
    if (/INSERT INTO physiqueos\.(\w+)/.test(text)) {
      stats.inserts.push({ table: /INSERT INTO physiqueos\.(\w+)/.exec(text)[1], collection: values[1], id: values[2] });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
  const client = { query, release() {} };
  const pool = { query, async connect() { return client; }, totalCount: 1, idleCount: 1, waitingCount: 0 };
  return { stats, pool, query };
}

function createFacade() {
  const database = createDatabase();
  const readScope = createPostgresFounderReadScope({
    loadRuntime: () => loadCanonicalRuntime({ query: database.query, ownerUserId: OWNER }),
  });
  const facade = createPostgresFounderRepositoryFacade({
    pool: database.pool,
    ownerUserId: OWNER,
    authorityStore: { assertCompatibilityAccess: async () => {} },
    compatibilityMode: true,
    requireCompatibilityAuthority: false,
    readRepositories: () => readScope.readRepositories(),
    runInReadScope: (callback, metadata) => readScope.run(callback, metadata),
  });
  return { ...database, facade };
}

describe("confirmation analysis runtime load bounds", () => {
  it("characterizes the failure: Goal context read outside a scope loads the whole runtime once per concurrent read", async () => {
    const { facade, stats } = createFacade();
    await resolvePhotoEventContext({ repositories: facade, userId: OWNER, evidenceDate: "2026-09-19" });
    // getActiveGoal, listGoals, listExecutionItems, listDEXAScans run concurrently.
    expect(stats.runtimeLoads).toBe(4);
  });

  it("shares exactly one runtime load across the same reads inside a read scope", async () => {
    const { facade, stats } = createFacade();
    const context = await runRepositoryReadScope({
      repositories: facade,
      readModel: "action.evidence-review-analysis-photo-context",
      callback: () => resolvePhotoEventContext({ repositories: facade, userId: OWNER, evidenceDate: "2026-09-19" }),
    });
    expect(stats.runtimeLoads).toBe(1);
    expect(context.evidenceDate).toBe("2026-09-19");
  });

  it("persists a session's analyses by loading and rewriting only the analyses collection", async () => {
    const { facade, stats, pool } = createFacade();
    const persist = createConfirmationAnalysisWriter({
      repositories: facade,
      loadCanonicalCommitBindings: async () => ({
        mutateCanonicalRuntime: (input) => executePostgresFounderRuntimeMutation({
          pool, ownerUserId: OWNER, authorityStore: { assertCompatibilityAccess: async () => {} },
          compatibilityMode: true, bounded: true, returnReceipt: true, ...input,
        }),
      }),
    });
    const batch = ["a", "b", "c", "d", "e", "synthesis"].map((name) => createAnalysis({
      id: `analysis_${name}`, createdAt: "2026-09-20T15:00:00.000Z", title: name, summary: name,
      evidenceIds: [`ev_${name}`], evidenceTypes: ["photo_session"],
    }));

    await persist(batch);

    expect(stats.runtimeLoads).toBe(1);
    expect([...new Set(stats.loadedCollections)]).toEqual(["analyses"]);
    // The pre-existing analysis plus the six new ones, rewritten in one transaction.
    expect(stats.inserts.map((insert) => insert.collection)).toEqual(Array(7).fill("analyses"));
    expect(new Set(stats.inserts.map((insert) => insert.table))).toEqual(new Set([PHASE4_DOMAIN_TABLES.analyses]));
    expect(stats.metadataBumps).toBe(1);
  });

  it("replaying the same batch after a lost acknowledgement leaves one analysis per stable id", async () => {
    const { facade, stats, pool } = createFacade();
    const persist = createConfirmationAnalysisWriter({
      repositories: facade,
      loadCanonicalCommitBindings: async () => ({
        mutateCanonicalRuntime: (input) => executePostgresFounderRuntimeMutation({
          pool, ownerUserId: OWNER, authorityStore: { assertCompatibilityAccess: async () => {} },
          compatibilityMode: true, bounded: true, returnReceipt: true, ...input,
        }),
      }),
    });
    const batch = [createAnalysis({
      id: "analysis_stable", createdAt: "2026-09-20T15:00:00.000Z", title: "s", summary: "s",
      evidenceIds: ["ev_stable"], evidenceTypes: ["photo_session"],
    })];
    await persist(batch);
    const firstInserts = stats.inserts.length;
    expect(firstInserts).toBe(2);
    // The in-memory fake database does not persist writes, so a replay sees the
    // same starting collection and must produce the same rewrite, not growth.
    await persist(batch);
    expect(stats.inserts.length - firstInserts).toBe(firstInserts);
  });
});
