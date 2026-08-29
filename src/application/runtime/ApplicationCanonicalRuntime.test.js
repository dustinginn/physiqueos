import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const composition = vi.hoisted(() => ({ current: null }));

vi.mock("../composition/productionApplicationComposition.js", () => ({
  getProductionApplicationComposition: () => composition.current,
}));

import {
  createApplicationRuntimeBindings,
  createProviderFounderStoreUnitOfWork,
  loadApplicationCanonicalCommitBindings,
  loadApplicationCanonicalRuntime,
} from "./ApplicationCanonicalRuntime.js";

describe("provider application canonical runtime", () => {
  beforeEach(() => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
  });

  afterEach(() => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    composition.current = null;
  });

  it("hydrates fresh PostgreSQL state and commits a compound workflow through one provider mutation", async () => {
    const persisted = runtime();
    const mutations = [];
    composition.current = {
      async loadRuntime() {
        return structuredClone(persisted);
      },
      async mutateRuntime(input) {
        mutations.push(input);
        expect(input.expectedRuntime).toEqual(persisted);
        input.mutate(persisted);
      },
    };

    const bindings = createApplicationRuntimeBindings();
    await bindings.readPersistedStore();
    const transaction = bindings.createUnitOfWork({
      now: () => new Date("2026-08-13T22:00:00.000Z"),
      createCommitId: () => "combined-command-1",
      lockContext: { operation: "compound-evidence-confirmation" },
    }).begin();
    await transaction.mutate((candidate) => {
      candidate.weightEntries.push({ id: "weight-2", value: 180 });
      return { accepted: true };
    });
    const receipt = await transaction.commit();

    expect(receipt).toMatchObject({ committed: true, revision: 8, commitId: "combined-command-1", result: { accepted: true } });
    expect(mutations).toHaveLength(1);
    expect(mutations[0].operation).toBe("compound-evidence-confirmation");
    expect(persisted).toMatchObject({ revision: 8, lastCommitId: "combined-command-1" });
    expect(persisted.weightEntries).toHaveLength(2);
    expect(bindings.liveStore).toEqual(persisted);
    expect(await loadApplicationCanonicalRuntime()).toEqual(persisted);
  });

  it("keeps the published runtime unchanged when PostgreSQL rejects the commit", async () => {
    const baseline = runtime();
    const liveStore = structuredClone(baseline);
    composition.current = {
      async mutateRuntime() {
        const error = new Error("authority tuple drift");
        error.code = "RUNTIME_AUTHORITY_MISMATCH";
        throw error;
      },
    };
    const transaction = createProviderFounderStoreUnitOfWork({
      liveStore,
      createCommitId: () => "combined-command-2",
    }).begin();
    await transaction.mutate((candidate) => candidate.weightEntries.push({ id: "weight-2", value: 180 }));

    await expect(transaction.commit()).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_MISMATCH" });
    expect(transaction.status).toBe("aborted");
    expect(liveStore).toEqual(baseline);
  });

  it("binds canonical commit directly to the bounded provider mutation without hydrating a live runtime", async () => {
    const loadRuntime = vi.fn(async () => runtime());
    const mutateRuntimeBounded = vi.fn(async (input) => ({
      committed: true,
      result: input.mutate(runtime(), { commandId: "bounded-commit" }),
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
      },
    }));
    composition.current = { loadRuntime, mutateRuntimeBounded };

    const bindings = await loadApplicationCanonicalCommitBindings();
    const receipt = await bindings.mutateCanonicalRuntime({
      operation: "evidence-review-canonical-commit",
      mutate(candidate) {
        candidate.weightEntries.push({ id: "weight-2", value: 180 });
        return { accepted: true };
      },
    });

    expect(loadRuntime).not.toHaveBeenCalled();
    expect(mutateRuntimeBounded).toHaveBeenCalledTimes(1);
    expect(receipt).toMatchObject({
      committed: true,
      result: { accepted: true },
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
      },
    });
  });
});

function runtime() {
  return {
    version: "synthetic-provider-runtime-v1",
    revision: 7,
    updatedAt: "2026-08-13T21:00:00.000Z",
    lastCommitId: "baseline-commit",
    weightEntries: [{ id: "weight-1", value: 181 }],
  };
}
