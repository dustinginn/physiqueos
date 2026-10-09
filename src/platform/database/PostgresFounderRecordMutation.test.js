import { describe, expect, it } from "vitest";
import {
  createPostgresFounderRepositoryFacade,
  executePostgresFounderRecordMutation,
} from "./PostgresFounderRepositoryFacade.js";
import { createFakeFounderCanonicalDatabase } from "../../testSupport/fakeFounderCanonicalDatabase.js";

const OWNER = "user_record_mutation";
const authorityStore = Object.freeze({ claimCanonicalWriteBoundary: async () => {} });

function scan(id, measuredAt, extra = {}) {
  return { id, userId: OWNER, measuredAt, provider: "Synthetic", bodyFatPercentage: 18, ...extra };
}

function database() {
  return createFakeFounderCanonicalDatabase({
    ownerUserId: OWNER,
    collections: {
      user: { id: OWNER },
      dexaScans: [scan("scan_a", "2026-06-20"), scan("scan_b", "2026-09-12")],
      executionItems: [{ id: "execution_next_dexa", userId: OWNER, status: "scheduled" }],
      analyses: [{ id: "analysis_1", evidenceIds: ["x"], evidenceTypes: ["dexa"] }],
    },
  });
}

function mutation(db, input) {
  return executePostgresFounderRecordMutation({
    pool: db.pool, ownerUserId: OWNER, authorityStore, commandId: "command-1", ...input,
  });
}

describe("named-record canonical mutation", () => {
  it("appends one new record without loading or rewriting any collection", async () => {
    const db = database();
    const receipt = await mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_c" }],
      mutate: async ({ read }) => {
        expect(read("dexaScans", "scan_c")).toBeNull();
        return { writes: [{ collection: "dexaScans", recordId: "scan_c", payload: scan("scan_c", "2026-10-09") }], result: "ok" };
      },
    });

    expect(receipt).toMatchObject({ committed: true, result: "ok", memoryProfile: { runtimeLoadCount: 0, collectionLoadCount: 0, recordLoadCount: 1, recordWriteCount: 1 } });
    expect(db.stats.collectionLoads).toEqual([]);
    expect(db.stats.collectionRewrites).toEqual([]);
    expect(db.stats.recordWrites).toEqual(["dexaScans:scan_c"]);
    expect(db.stats.metadataBumps).toBe(1);
    expect(db.row("dexaScans", "scan_c")).toMatchObject({ ordinal: 2, version: 1 });
    // Neighbours are not rewritten: their versions do not move.
    expect(db.get("dexaScans", "scan_a").version).toBe(1);
    expect(db.get("dexaScans", "scan_b").version).toBe(1);
  });

  it("replaces one existing record fenced on the version it was read at", async () => {
    const db = database();
    await mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_b" }],
      mutate: async ({ read }) => {
        const current = read("dexaScans", "scan_b");
        expect(current.version).toBe(1);
        return { writes: [{ collection: "dexaScans", recordId: "scan_b", payload: { ...current, provider: "Corrected" } }] };
      },
    });
    expect(db.get("dexaScans", "scan_b")).toMatchObject({ provider: "Corrected", version: 2 });
    expect(db.row("dexaScans", "scan_b").ordinal).toBe(1);
  });

  it("writes the same row the whole-runtime repository path writes, and only that row", async () => {
    const whole = database();
    const bounded = database();
    const facade = createPostgresFounderRepositoryFacade({ pool: whole.pool, ownerUserId: OWNER, authorityStore });
    const next = scan("scan_c", "2026-10-09", { observed_at: "2026-10-09T00:00:00.000Z", status: "active", provenance: { source: "pdf" } });

    await facade.dexaScans.upsertDEXAScan(structuredClone(next));
    await mutation(bounded, {
      records: [{ collection: "dexaScans", recordId: "scan_c" }],
      mutate: async () => ({ writes: [{ collection: "dexaScans", recordId: "scan_c", payload: structuredClone(next) }] }),
    });

    const omitBuffer = ({ payloadBuffer: _ignored, ...rest }) => rest;
    expect(omitBuffer(bounded.row("dexaScans", "scan_c"))).toEqual(omitBuffer(whole.row("dexaScans", "scan_c")));
    // The whole-runtime path loaded every collection and rewrote all of dexaScans.
    expect(whole.stats.collectionLoads.length).toBeGreaterThan(30);
    expect(whole.stats.collectionRewrites).toEqual(["dexaScans"]);
    expect(whole.get("dexaScans", "scan_a").version).toBe(2);
    expect(bounded.stats.collectionLoads).toEqual([]);
    expect(bounded.get("dexaScans", "scan_a").version).toBe(1);
  });

  it("commits without a metadata bump when nothing changes", async () => {
    const db = database();
    const receipt = await mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async () => ({ writes: [], result: "unchanged" }),
    });
    expect(receipt).toMatchObject({ committed: true, revision: null, result: "unchanged" });
    expect(db.stats.metadataBumps).toBe(0);
    expect(db.stats.recordWrites).toEqual([]);
  });

  it("rolls back and writes nothing when the callback writes an undeclared record", async () => {
    const db = database();
    await expect(mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async () => ({ writes: [
        { collection: "dexaScans", recordId: "scan_a", payload: scan("scan_a", "2026-06-20", { provider: "x" }) },
        { collection: "dexaScans", recordId: "scan_b", payload: scan("scan_b", "2026-09-12", { provider: "y" }) },
      ] }),
    })).rejects.toMatchObject({ code: "FOUNDER_RECORD_MUTATION_SCOPE_VIOLATION" });
    expect(db.stats.rollbacks).toBe(1);
    expect(db.get("dexaScans", "scan_a")).toMatchObject({ provider: "Synthetic", version: 1 });
  });

  it("refuses to read an undeclared record", async () => {
    const db = database();
    await expect(mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async ({ read }) => { read("executionItems", "execution_next_dexa"); return { writes: [] }; },
    })).rejects.toMatchObject({ code: "FOUNDER_RECORD_MUTATION_SCOPE_VIOLATION" });
  });

  it("rejects a payload whose identity differs from the declared record", async () => {
    const db = database();
    await expect(mutation(db, {
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async () => ({ writes: [{ collection: "dexaScans", recordId: "scan_a", payload: scan("scan_z", "2026-06-20") }] }),
    })).rejects.toMatchObject({ code: "FOUNDER_RECORD_MUTATION_IDENTITY_MISMATCH" });
    expect(db.stats.rollbacks).toBe(1);
  });

  it("fails closed with a revision conflict when the row moved after it was read", async () => {
    const db = database();
    const pool = {
      async connect() {
        const client = await db.pool.connect();
        return {
          release: () => client.release(),
          query: (text, values) => /SET legacy_id=\$4,version=\$5/.test(text)
            ? Promise.resolve({ rows: [], rowCount: 0 })
            : client.query(text, values),
        };
      },
      query: db.query,
    };
    await expect(executePostgresFounderRecordMutation({
      pool, ownerUserId: OWNER, authorityStore,
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async ({ read }) => ({ writes: [{ collection: "dexaScans", recordId: "scan_a", payload: { ...read("dexaScans", "scan_a"), provider: "z" } }] }),
    })).rejects.toMatchObject({ code: "FOUNDER_STORE_REVISION_CONFLICT" });
    expect(db.stats.rollbacks).toBe(1);
    expect(db.stats.metadataBumps).toBe(0);
  });

  it("requires runtime authority outside compatibility mode", async () => {
    const db = database();
    await expect(executePostgresFounderRecordMutation({
      pool: db.pool, ownerUserId: OWNER,
      records: [{ collection: "dexaScans", recordId: "scan_a" }],
      mutate: async () => ({ writes: [] }),
    })).rejects.toMatchObject({ code: "CANONICAL_RUNTIME_AUTHORITY_REQUIRED" });
  });

  it.each([
    [[]],
    [[{ collection: "user", recordId: OWNER }]],
    [[{ collection: "dexaScans", recordId: "" }]],
    [[{ collection: "dexaScans", recordId: "a" }, { collection: "dexaScans", recordId: "a" }]],
    [Array.from({ length: 17 }, (_, index) => ({ collection: "dexaScans", recordId: `s${index}` }))],
  ])("rejects an invalid record scope %#", async (records) => {
    const db = database();
    await expect(mutation(db, { records, mutate: async () => ({ writes: [] }) }))
      .rejects.toMatchObject({ code: "FOUNDER_RECORD_MUTATION_SCOPE_INVALID" });
    expect(db.stats.statements).toBe(0);
  });
});
