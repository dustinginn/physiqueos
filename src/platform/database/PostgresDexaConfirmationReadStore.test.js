import { describe, expect, it, vi } from "vitest";
import { createPostgresDexaConfirmationReadStore } from "./PostgresDexaConfirmationReadStore.js";

describe("PostgreSQL bounded DEXA confirmation reads", () => {
  it("reads named records without loading a collection and preserves requested order", async () => {
    const query = vi.fn(async () => ({ rows: [
      { record_id: "two", version: 3, payload: { id: "two" } },
      { record_id: "one", version: 2, payload: { id: "one" } },
    ] }));
    const store = createPostgresDexaConfirmationReadStore({
      pool: { query },
      ownerUserId: "owner",
    });
    await expect(store.getRecords("analyses", ["one", "two"]))
      .resolves.toEqual([{ id: "one", version: 2 }, { id: "two", version: 3 }]);
    expect(query.mock.calls[0][0]).toContain("record_id=ANY");
    expect(query.mock.calls[0][1]).toEqual(["owner", "analyses", ["one", "two"]]);
  });

  it("bounds DEXA histories and recovery side effects", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ version: 1, payload: { canonicalId: "new" } }, { version: 1, payload: { canonicalId: "old" } }] })
      .mockResolvedValueOnce({ rows: [{ version: 1, payload: { canonicalId: "scan" } }] })
      .mockResolvedValueOnce({ rows: [{ version: 1, payload: { id: "work" } }] });
    const store = createPostgresDexaConfirmationReadStore({ pool: { query }, ownerUserId: "owner" });
    expect(await store.listCanonicalDexaHistory({ limit: 32 }))
      .toEqual([{ canonicalId: "old", version: 1 }, { canonicalId: "new", version: 1 }]);
    const recovery = await store.readRecoveryInputs({ reviewId: "review", packageId: "package" });
    expect(recovery.canonicalEvidenceObjects).toEqual([{ canonicalId: "scan", version: 1 }]);
    expect(recovery.briefingReconciliationWorkItems).toEqual([{ id: "work", version: 1 }]);
    expect(query.mock.calls[0][1][2]).toBe(32);
  });
});
