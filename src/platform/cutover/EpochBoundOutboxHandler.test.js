import { describe, expect, it, vi } from "vitest";
import { createEpochBoundOutboxHandler } from "./EpochBoundOutboxHandler.js";

describe("epoch-bound outbox handling", () => {
  it("executes only work created in the current canonical-store epoch", async () => {
    const handler = vi.fn(async () => ({ acknowledged: true }));
    const controlStore = { read: () => ({ state: { canonicalStoreEpoch: "postgres-canonical", compositionMode: "postgres" } }) };
    const execute = createEpochBoundOutboxHandler({ controlStore, handler });
    await expect(execute({ payload: { canonicalStoreEpoch: "postgres-canonical" } })).resolves.toEqual({ acknowledged: true });
    await expect(execute({ payload: { canonicalStoreEpoch: "legacy-json" } })).rejects.toMatchObject({ code: "OUTBOX_EPOCH_MISMATCH" });
    await expect(execute({ payload: {} })).rejects.toMatchObject({ code: "OUTBOX_EPOCH_MISSING" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
