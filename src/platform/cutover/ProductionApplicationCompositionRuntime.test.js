import { describe, expect, it, vi } from "vitest";
import { createProductionApplicationCompositionRuntime } from "./ProductionApplicationCompositionRuntime.js";

describe("live production application composition runtime", () => {
  it("routes legacy reads/writes only to legacy adapters", async () => {
    const legacyWrite = vi.fn(async () => "legacy-write");
    const postgresWrite = vi.fn(async () => "postgres-write");
    const fixture = runtime({ mode: "legacy-json", epoch: "legacy-json", legacyWrite, postgresWrite });
    await expect(fixture.runtime.read("profile", {}, {})).resolves.toBe("legacy-read");
    await expect(fixture.runtime.execute({})).resolves.toBe("legacy-write");
    expect(legacyWrite).toHaveBeenCalledOnce();
    expect(postgresWrite).not.toHaveBeenCalled();
  });

  it("routes postgres reads/writes only to provider adapters without fallback or dual-write", async () => {
    const legacyWrite = vi.fn(async () => "legacy-write");
    const postgresWrite = vi.fn(async () => "postgres-write");
    const fixture = runtime({ mode: "postgres", epoch: "postgres-canonical", legacyWrite, postgresWrite });
    await expect(fixture.runtime.read("profile", {}, {})).resolves.toBe("postgres-read");
    await expect(fixture.runtime.execute({})).resolves.toBe("postgres-write");
    expect(postgresWrite).toHaveBeenCalledOnce();
    expect(legacyWrite).not.toHaveBeenCalled();
    expect(fixture.postgresFactory).toHaveBeenCalledOnce();
    await fixture.runtime.resolve();
    expect(fixture.postgresFactory).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["legacy-json", "postgres-canonical"],
    ["postgres", "legacy-json"],
    ["postgres", "migration-fence"],
  ])("fails closed for incompatible %s/%s state", async (mode, epoch) => {
    const fixture = runtime({ mode, epoch, legacyWrite: vi.fn(), postgresWrite: vi.fn() });
    await expect(fixture.runtime.resolve()).rejects.toMatchObject({ code: "CANONICAL_COMPOSITION_EPOCH_INVALID" });
    expect(fixture.legacyFactory).not.toHaveBeenCalled();
    expect(fixture.postgresFactory).not.toHaveBeenCalled();
  });

  it("rejects a command missing from the selected composition instead of falling back", async () => {
    const state = { compositionMode: "postgres", canonicalStoreEpoch: "postgres-canonical" };
    const runtime = createProductionApplicationCompositionRuntime({
      controlStore: { read: () => ({ state }) },
      createLegacyComposition: async () => ({ commands: { execute: vi.fn() } }),
      createPostgresComposition: async () => ({ readModels: {} }),
    });
    await expect(runtime.execute({})).rejects.toMatchObject({ code: "CANONICAL_COMPOSITION_INCOMPLETE" });
  });
});

function runtime({ mode, epoch, legacyWrite, postgresWrite }) {
  const state = { compositionMode: mode, canonicalStoreEpoch: epoch };
  const legacyFactory = vi.fn(async () => ({ readModels: { profile: async () => "legacy-read" }, commands: { execute: legacyWrite } }));
  const postgresFactory = vi.fn(async () => ({ readModels: { profile: async () => "postgres-read" }, commands: { execute: postgresWrite } }));
  return {
    runtime: createProductionApplicationCompositionRuntime({ controlStore: { read: () => ({ state }) }, createLegacyComposition: legacyFactory, createPostgresComposition: postgresFactory }),
    legacyFactory,
    postgresFactory,
  };
}
