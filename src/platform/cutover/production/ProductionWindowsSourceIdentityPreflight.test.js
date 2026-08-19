import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVerifyWindowsSourcePreflight } from "./ProductionWindowsSourceIdentityPreflight.js";
import { writeSyntheticFounderSource, syntheticBuildIdentityProvider, cleanCheckoutStatusProvider, dirtyCheckoutStatusProvider, SYNTHETIC_SOURCE_COMMIT, SYNTHETIC_BUILD_ID } from "./testSupport/productionCutoverFixtures.js";

async function withTempDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-cutover-source-"));
  try { return await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function expectedIdentity(runtimePath) {
  const bytes = await fs.readFile(runtimePath);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

function baseInput(overrides = {}) {
  return {
    expectedSourceCommit: SYNTHETIC_SOURCE_COMMIT, expectedBuildId: SYNTHETIC_BUILD_ID,
    expectedRuntimeRevision: 1, ...overrides,
  };
}

describe("ProductionWindowsSourceIdentityPreflight — construction", () => {
  it("requires a runtime path", () => {
    expect(() => createVerifyWindowsSourcePreflight({})).toThrow();
  });
});

describe("ProductionWindowsSourceIdentityPreflight — verifyWindowsSource", () => {
  it("passes when Windows build identity, checkout cleanliness, and Founder runtime identity all match", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root, revision: 1 });
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({
        runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider(),
      });
      const result = await preflight({ input: baseInput({ expectedRuntimeSha256: expected.sha256 }) });
      expect(result).toMatchObject({ ready: true, mutated: false, checkoutClean: true });
      expect(result.identity).toEqual({ commit: SYNTHETIC_SOURCE_COMMIT, buildId: SYNTHETIC_BUILD_ID });
      expect(result.runtime.sha256).toBe(expected.sha256);
      expect(result.runtime.size).toBe(expected.size);
      expect(result.inventory.unknownCollections).toEqual([]);
    });
  });

  it("rejects a source-commit mismatch", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedSourceCommit: "9".repeat(40), expectedRuntimeSha256: expected.sha256 }) }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH" });
    });
  });

  it("rejects a BUILD_ID mismatch", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedBuildId: "stale-build", expectedRuntimeSha256: expected.sha256 }) }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH" });
    });
  });

  it("rejects a dirty checkout even when identity otherwise matches", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: dirtyCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedRuntimeSha256: expected.sha256 }) }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_CHECKOUT_NOT_CLEAN" });
    });
  });

  it("rejects a Founder runtime revision mismatch", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root, revision: 1 });
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedRuntimeRevision: 999, expectedRuntimeSha256: expected.sha256 }) }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH" });
    });
  });

  it("rejects a Founder runtime hash mismatch", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedRuntimeSha256: "0".repeat(64) }) }))
        .rejects.toMatchObject({ code: "COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH" });
    });
  });

  it("fails closed on an internally inconsistent runtime source (unknown collection key)", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const runtime = JSON.parse(await fs.readFile(runtimePath, "utf8"));
      runtime.futureUnknownState = [];
      await fs.writeFile(runtimePath, JSON.stringify(runtime));
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await expect(preflight({ input: baseInput({ expectedRuntimeSha256: expected.sha256 }) })).rejects.toThrow(/Unknown runtime source keys/);
    });
  });

  it("never mutates the Founder runtime file it reads", async () => {
    await withTempDir(async (root) => {
      const { runtimePath } = await writeSyntheticFounderSource({ root });
      const before = await fs.readFile(runtimePath);
      const expected = await expectedIdentity(runtimePath);
      const preflight = createVerifyWindowsSourcePreflight({ runtimePath, buildIdentityProvider: syntheticBuildIdentityProvider(), checkoutStatusProvider: cleanCheckoutStatusProvider() });
      await preflight({ input: baseInput({ expectedRuntimeSha256: expected.sha256 }) });
      const after = await fs.readFile(runtimePath);
      expect(after.equals(before)).toBe(true);
    });
  });
});
