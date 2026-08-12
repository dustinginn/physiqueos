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
});
