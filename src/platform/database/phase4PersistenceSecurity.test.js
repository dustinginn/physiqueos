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

  it("creates source observations without overwriting a concurrent immutable identity", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ payload: { id: "healthkit-one", semanticFingerprint: "sha256_existing", version: 1 }, version: "1" }] });
    const records = createPhase4CanonicalRecordStore({ query });
    const result = await records.putIfAbsent({
      ownerUserId: "owner-a",
      collection: "healthKitObservations",
      recordId: "healthkit-one",
      sourceIdentity: "healthkit-one",
      payload: { id: "healthkit-one", semanticFingerprint: "sha256_incoming" },
    });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (owner_user_id,collection_name,record_id) DO NOTHING");
    expect(query.mock.calls[1][0]).toContain("owner_user_id=$1");
    expect(result).toEqual({
      created: false,
      record: { id: "healthkit-one", semanticFingerprint: "sha256_existing", version: 1 },
    });
  });
});
