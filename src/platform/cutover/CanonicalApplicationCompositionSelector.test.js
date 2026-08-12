import { describe, expect, it, vi } from "vitest";
import { createCanonicalApplicationCompositionSelector } from "./CanonicalApplicationCompositionSelector.js";

describe("canonical application composition selector", () => {
  it("selects only the durable expected composition and rejects stale expectations", async () => {
    let state = { compositionMode: "legacy-json", canonicalStoreEpoch: "legacy-json" };
    const legacy = vi.fn(async () => ({ kind: "legacy" }));
    const postgres = vi.fn(async () => ({ kind: "postgres" }));
    const selector = createCanonicalApplicationCompositionSelector({
      controlStore: { read: () => ({ state }) },
      createLegacyComposition: legacy,
      createPostgresComposition: postgres,
    });
    await expect(selector.getComposition({ expectedMode: "legacy-json", expectedEpoch: "legacy-json" })).resolves.toMatchObject({ kind: "legacy" });
    state = { compositionMode: "postgres", canonicalStoreEpoch: "postgres-canonical" };
    await expect(selector.getComposition({ expectedMode: "legacy-json" })).rejects.toMatchObject({ code: "CANONICAL_COMPOSITION_CONFLICT" });
    await expect(selector.getComposition({ expectedMode: "postgres", expectedEpoch: "postgres-canonical" })).resolves.toMatchObject({ kind: "postgres" });
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(postgres).toHaveBeenCalledTimes(1);
  });
});
