import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { materializeTemporaryCanonicalPackage, readVerifiedArtifact } from "./combinedCutoverArtifactAssembly.js";
import { deriveTransferPackageId } from "../transfer/combinedCutoverTransferContract.js";

describe("readVerifiedArtifact", () => {
  it("derives the packageId from the relative path and returns the verified bytes/receipt", async () => {
    const bytes = Buffer.from("hello");
    const artifactReceiptStore = { readVerifiedBytes: vi.fn(async () => ({ bytes, receipt: { status: "verified" } })) };
    const result = await readVerifiedArtifact({ artifactReceiptStore, operationId: "combined-op-1", relativePath: "canonical-runtime.json" });
    expect(artifactReceiptStore.readVerifiedBytes).toHaveBeenCalledWith({ operationId: "combined-op-1", packageId: deriveTransferPackageId("canonical-runtime.json") });
    expect(result.bytes.equals(bytes)).toBe(true);
    expect(result.relativePath).toBe("canonical-runtime.json");
  });

  it("propagates a rejection from the underlying receipt store (e.g. not yet verified)", async () => {
    const artifactReceiptStore = { readVerifiedBytes: vi.fn(async () => { throw Object.assign(new Error("not verified"), { code: "TRANSFER_INCOMPLETE" }); }) };
    await expect(readVerifiedArtifact({ artifactReceiptStore, operationId: "combined-op-1", relativePath: "manifest.json" }))
      .rejects.toMatchObject({ code: "TRANSFER_INCOMPLETE" });
  });
});

describe("materializeTemporaryCanonicalPackage", () => {
  it("writes manifest.json and canonical-runtime.json into a fresh temp directory and cleans up", async () => {
    const manifestBytes = Buffer.from(JSON.stringify({ a: 1 }));
    const runtimeBytes = Buffer.from(JSON.stringify({ b: 2 }));
    const { packageRoot, cleanup } = await materializeTemporaryCanonicalPackage({ manifestBytes, runtimeBytes });
    try {
      const manifestOnDisk = await readFile(join(packageRoot, "manifest.json"));
      const runtimeOnDisk = await readFile(join(packageRoot, "canonical-runtime.json"));
      expect(manifestOnDisk.equals(manifestBytes)).toBe(true);
      expect(runtimeOnDisk.equals(runtimeBytes)).toBe(true);
    } finally {
      await cleanup();
    }
    await expect(readFile(join(packageRoot, "manifest.json"))).rejects.toThrow();
  });

  it("produces a distinct directory for each call", async () => {
    const bytes = Buffer.from("x");
    const a = await materializeTemporaryCanonicalPackage({ manifestBytes: bytes, runtimeBytes: bytes });
    const b = await materializeTemporaryCanonicalPackage({ manifestBytes: bytes, runtimeBytes: bytes });
    expect(a.packageRoot).not.toBe(b.packageRoot);
    await a.cleanup();
    await b.cleanup();
  });
});
