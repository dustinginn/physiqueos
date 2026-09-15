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

  it("rejects unknown collections before constructing SQL", () => {
    const records = createPhase4CanonicalRecordStore({ query: vi.fn() });
    expect(() => records.get({ ownerUserId: "owner", collection: "futureUnknown", recordId: "id" })).rejects.toThrow("Unsupported required canonical collection");
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
