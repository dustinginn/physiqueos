import { describe, expect, it, vi } from "vitest";
import { createProductionRepositoryFacade } from "./founderRepositories.js";

describe("production repository facade", () => {
  it("routes every existing repository consumer through the selected composition", async () => {
    const legacy = { weights: { listWeightEntries: vi.fn(async () => "legacy") } };
    const provider = { weights: { listWeightEntries: vi.fn(async () => "postgres") } };
    let selected = legacy;
    const facade = createProductionRepositoryFacade({
      legacyRepositories: legacy,
      resolveComposition: async () => ({ repositories: selected }),
    });

    await expect(facade.weights.listWeightEntries("owner")).resolves.toBe("legacy");
    selected = provider;
    await expect(facade.weights.listWeightEntries("owner")).resolves.toBe("postgres");
    expect(legacy.weights.listWeightEntries).toHaveBeenCalledTimes(1);
    expect(provider.weights.listWeightEntries).toHaveBeenCalledTimes(1);
  });

  it("fails closed on uncomposed direct PostgreSQL writes instead of mutating a snapshot repository", async () => {
    const providerWrite = vi.fn(async () => "in-memory-only");
    const facade = createProductionRepositoryFacade({
      legacyRepositories: { weights: { addWeightEntry: vi.fn() } },
      resolveComposition: async () => ({
        canonicalStoreEpoch: "postgres-canonical",
        repositories: { weights: { addWeightEntry: providerWrite } },
      }),
    });

    await expect(facade.weights.addWeightEntry({ id: "one" })).rejects.toMatchObject({
      code: "DIRECT_POSTGRES_REPOSITORY_WRITE_UNAVAILABLE",
    });
    expect(providerWrite).not.toHaveBeenCalled();
  });

  it("fails closed instead of falling back to legacy when the selected provider lacks a method", async () => {
    const legacyWrite = vi.fn(async () => "legacy");
    const facade = createProductionRepositoryFacade({
      legacyRepositories: { weights: { addWeightEntry: legacyWrite } },
      resolveComposition: async () => ({ repositories: { weights: {} } }),
    });

    await expect(facade.weights.addWeightEntry({ id: "one" })).rejects.toThrow(/does not provide weights\.addWeightEntry/);
    expect(legacyWrite).not.toHaveBeenCalled();
  });
});
