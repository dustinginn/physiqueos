import { describe, expect, it, vi } from "vitest";
import { createPhase4CanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";

describe("Phase 4 persistence ownership boundary", () => {
  it("places owner scope in every read and version predicate in every stale-sensitive write", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ payload: { id: "goal", version: 2 }, version: "2" }] });
    const records = createPhase4CanonicalRecordStore({ query });
    expect(await records.get({ ownerUserId: "owner-a", collection: "goals", recordId: "goal" })).toBeNull();
    await records.put({ ownerUserId: "owner-a", collection: "goals", recordId: "goal", payload: { id: "goal" }, expectedVersion: 1 });
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1");
    expect(query.mock.calls[1][0]).toContain("version=$10");
    expect(query.mock.calls[1][1][0]).toBe("owner-a");
  });

  it("scopes date-range reads by owner, collection and the indexed occurrence_date column", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ payload: { id: "healthkit_sleep_sample_a" }, version: "1" }] });
    const records = createPhase4CanonicalRecordStore({ query });
    await expect(records.listByOccurrenceDateRange({
      ownerUserId: "owner-a", collection: "healthKitSleepSamples", startDate: "2026-09-09", endDate: "2026-09-13",
    })).resolves.toEqual([{ id: "healthkit_sleep_sample_a", version: 1 }]);
    // (owner_user_id, collection_name, occurrence_date, observed_at) is the
    // canonical_training_records_owner_collection_idx prefix: no new index.
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1 AND collection_name=$2 AND occurrence_date BETWEEN $3::date AND $4::date");
    expect(query.mock.calls[0][1]).toEqual(["owner-a", "healthKitSleepSamples", "2026-09-09", "2026-09-13"]);
    await expect(records.listByOccurrenceDateRange({
      ownerUserId: "owner-a", collection: "healthKitSleepSamples", startDate: "2026-09-13", endDate: "2026-09-09",
    })).rejects.toThrow("inclusive YYYY-MM-DD range");
    await expect(records.listByOccurrenceDateRange({
      ownerUserId: "owner-a", collection: "healthKitSleepSamples", startDate: null, endDate: "2026-09-09",
    })).rejects.toThrow("inclusive YYYY-MM-DD range");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("performs bounded multi-record and multi-collection reads with owner scope", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ payload: { id: "b" }, version: "2" }] })
      .mockResolvedValueOnce({ rows: [
        { collection_name: "goals", payload: { id: "goal" }, version: "3" },
        { collection_name: "user", payload: { id: "owner-a" }, version: "1" },
      ] });
    const records = createPhase4CanonicalRecordStore({ query });
    await expect(records.getMany({
      ownerUserId: "owner-a", collection: "weightEntries", recordIds: ["b", "b", ""],
    })).resolves.toEqual([{ id: "b", version: 2 }]);
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1 AND collection_name=$2 AND record_id=ANY($3::text[])");
    expect(query.mock.calls[0][1]).toEqual(["owner-a", "weightEntries", ["b"]]);

    await expect(records.listMany({ ownerUserId: "owner-a", collections: ["user", "goals", "user"] }))
      .resolves.toEqual({ user: [{ id: "owner-a", version: 1 }], goals: [{ id: "goal", version: 3 }] });
    expect(query.mock.calls[1][0]).toContain("UNION ALL");
    expect(query.mock.calls[1][0]).toContain("owner_user_id=$1");
    expect(query.mock.calls[1][1][0]).toBe("owner-a");
  });

  it("rejects unknown collections before constructing SQL", () => {
    const records = createPhase4CanonicalRecordStore({ query: vi.fn() });
    expect(() => records.get({ ownerUserId: "owner", collection: "futureUnknown", recordId: "id" })).rejects.toThrow("Unsupported required canonical collection");
  });

  it("reads immutable Server-owned storage timestamps with owner and collection scope", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      record_id: "training|authoritative|training_logger_draft_sep23",
      created_at: "2026-09-23T14:56:31Z",
      updated_at: "2026-09-23T14:56:31Z",
    }] });
    const records = createPhase4CanonicalRecordStore({ query });

    await expect(records.listStorageMetadata({ ownerUserId: "owner-a", collection: "canonicalEvidenceObjects" }))
      .resolves.toEqual([{
        recordId: "training|authoritative|training_logger_draft_sep23",
        createdAt: "2026-09-23T14:56:31.000Z",
        updatedAt: "2026-09-23T14:56:31.000Z",
      }]);
    expect(query.mock.calls[0][0]).toContain("SELECT record_id,created_at,updated_at");
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1 AND collection_name=$2");
    expect(query.mock.calls[0][1]).toEqual(["owner-a", "canonicalEvidenceObjects"]);
  });

  it("loads date-scoped canonical Evidence and immutable storage metadata together", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      record_id: "training-one",
      payload: { canonicalId: "training-one", payload: { evidence_type: "training", observed_at: "2026-10-10" } },
      version: "4",
      created_at: "2026-10-10T17:00:00Z",
      updated_at: "2026-10-10T18:00:00Z",
    }] });
    const records = createPhase4CanonicalRecordStore({ query });

    await expect(records.listEvidenceWithStorageMetadataByDateRange({
      ownerUserId: "owner-a", startDate: "2026-10-01", endDate: "2026-10-10",
    })).resolves.toEqual({
      records: [{ canonicalId: "training-one", payload: { evidence_type: "training", observed_at: "2026-10-10" }, version: 4 }],
      storageMetadata: [{
        recordId: "training-one",
        createdAt: "2026-10-10T17:00:00.000Z",
        updatedAt: "2026-10-10T18:00:00.000Z",
      }],
    });
    expect(query.mock.calls[0][0]).toContain("collection_name='canonicalEvidenceObjects'");
    expect(query.mock.calls[0][0]).toContain("payload#>>'{payload,observed_at}'");
    expect(query.mock.calls[0][0]).toContain("BETWEEN $2 AND $3");
    expect(query.mock.calls[0][1]).toEqual(["owner-a", "2026-10-01", "2026-10-10"]);
  });

  it("creates source observations without overwriting a concurrent immutable identity", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        payload: { id: "healthkit-one", semanticFingerprint: "sha256_existing", version: 1 },
        version: "1",
      }] });
    const records = createPhase4CanonicalRecordStore({ query });
    const result = await records.putIfAbsent({
      ownerUserId: "owner-a",
      collection: "healthKitObservations",
      recordId: "healthkit-one",
      sourceIdentity: "healthkit-one",
      payload: { id: "healthkit-one", semanticFingerprint: "sha256_incoming" },
    });
    expect(query.mock.calls[0][0]).toContain(
      "ON CONFLICT (owner_user_id,collection_name,record_id) DO NOTHING"
    );
    expect(query.mock.calls[1][0]).toContain("owner_user_id=$1");
    expect(result).toEqual({
      created: false,
      record: { id: "healthkit-one", semanticFingerprint: "sha256_existing", version: 1 },
    });
  });

  it("shares Web's owner lock and conditionally advances the canonical composite revision", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ revision: "85", version: "2", last_command_id: "prior", updated_at: "2026-09-15T00:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [{ revision: "86", version: "3", last_command_id: "next", updated_at: "2026-09-15T19:00:00Z" }] })
      .mockResolvedValueOnce({ rows: [] });
    const records = createPhase4CanonicalRecordStore({ query });
    expect(await records.getRuntimeMetadata({ ownerUserId: "owner-a", lock: true })).toMatchObject({ revision: 85 });
    expect(query.mock.calls[0]).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["physiqueos:owner-a"]]);
    expect(query.mock.calls[1][0]).toContain("owner_user_id=$1 FOR UPDATE");
    expect(await records.advanceRuntimeMetadata({ ownerUserId: "owner-a", expectedRevision: 85, commandId: "next", at: new Date("2026-09-15T19:00:00Z") }))
      .toMatchObject({ revision: 86, lastCommandId: "next" });
    expect(query.mock.calls[2][0]).toContain("owner_user_id=$1 AND revision=$2");
    await expect(records.advanceRuntimeMetadata({ ownerUserId: "owner-a", expectedRevision: 85, commandId: "stale" }))
      .rejects.toMatchObject({ code: "EXPECTED_VERSION_CONFLICT" });
  });
});
