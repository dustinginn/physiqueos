import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCombinedCutoverTransferManifest,
  createCombinedCutoverTransferHttpClient,
  createFileChunkReader,
  createProductionTransferSnapshotAdapter,
  transferArtifactBytes,
} from "./WindowsCombinedCutoverTransferClient.js";
import { deriveTransferPackageId } from "./combinedCutoverTransferContract.js";
import { sha256Of } from "./combinedCutoverTransferStaging.js";

const digest = (character) => character.repeat(64);
const OPERATION_ID = "combined-op-0001";

describe("createCombinedCutoverTransferHttpClient", () => {
  it("rejects a non-HTTPS base URL", () => {
    expect(() => createCombinedCutoverTransferHttpClient({ baseUrl: "http://provider.invalid/transfer/", credential: "x".repeat(40) })).toThrow();
  });

  it("sends the machine credential as a Bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createCombinedCutoverTransferHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/transfer/", credential: "s".repeat(40) });
    await client.statusArtifact({ operationId: OPERATION_ID, packageId: "p".repeat(32) });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${"s".repeat(40)}`);
  });

  it("retries a bounded number of times on a network-level failure, then raises a retryable transport error", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const client = createCombinedCutoverTransferHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/transfer/", credential: "s".repeat(40), maxAttempts: 3, retryDelayMs: 1 });
    await expect(client.statusArtifact({ operationId: OPERATION_ID, packageId: "p".repeat(32) })).rejects.toMatchObject({ code: "TRANSFER_TRANSPORT_FAILED" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a semantic authentication failure", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "TRANSFER_AUTHENTICATION_FAILED" }), { status: 401 }));
    const client = createCombinedCutoverTransferHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/transfer/", credential: "s".repeat(40), maxAttempts: 3, retryDelayMs: 1 });
    await expect(client.statusArtifact({ operationId: OPERATION_ID, packageId: "p".repeat(32) })).rejects.toMatchObject({ code: "TRANSFER_AUTHENTICATION_FAILED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a digest-conflict failure", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "TRANSFER_CHUNK_DIGEST_MISMATCH" }), { status: 409 }));
    const client = createCombinedCutoverTransferHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/transfer/", credential: "s".repeat(40), maxAttempts: 3, retryDelayMs: 1 });
    await expect(client.statusArtifact({ operationId: OPERATION_ID, packageId: "p".repeat(32) })).rejects.toMatchObject({ code: "TRANSFER_CHUNK_DIGEST_MISMATCH" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("transferArtifactBytes", () => {
  function fakeArtifactBytesClient(overrides = {}) {
    const uploaded = [];
    return {
      declareArtifact: vi.fn(async (declaration) => ({ ...declaration, receivedChunkCount: 0 })),
      uploadChunk: vi.fn(async (chunk) => { uploaded.push(chunk); return { outcome: "received" }; }),
      completeArtifact: vi.fn(async () => ({ status: "verified", overallDigest: overrides.completedDigest })),
      uploaded,
      ...overrides,
    };
  }

  it("splits bytes into the expected number of chunks, each digest-bound, and completes", async () => {
    const bytes = Buffer.from("0123456789abcdef"); // 16 bytes
    const sha256 = sha256Of(bytes);
    const client = fakeArtifactBytesClient({ completedDigest: sha256 });
    const chunks = [bytes.subarray(0, 8), bytes.subarray(8, 16)];
    const readChunk = vi.fn(async (offset, length) => bytes.subarray(offset, offset + length));

    const result = await transferArtifactBytes(client, { operationId: OPERATION_ID, relativePath: "canonical-runtime.json", readChunk, byteLength: bytes.length, sha256, chunkBytes: 8 });

    expect(client.declareArtifact).toHaveBeenCalledOnce();
    expect(client.uploaded).toHaveLength(2);
    expect(client.uploaded[0].chunkIndex).toBe(0);
    expect(client.uploaded[0].chunkDigest).toBe(sha256Of(chunks[0]));
    expect(client.uploaded[1].chunkDigest).toBe(sha256Of(chunks[1]));
    expect(result.packageId).toBe(deriveTransferPackageId("canonical-runtime.json"));
  });

  it("throws when the provider's declared digest does not match the local artifact", async () => {
    const bytes = Buffer.from("abc");
    const client = fakeArtifactBytesClient();
    client.declareArtifact = vi.fn(async () => ({ overallDigest: digest("9"), expectedBytes: bytes.length }));
    await expect(transferArtifactBytes(client, { operationId: OPERATION_ID, relativePath: "manifest.json", readChunk: async () => bytes, byteLength: bytes.length, sha256: sha256Of(bytes), chunkBytes: 8 }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_IDENTITY_MISMATCH" });
  });

  it("throws when the provider does not report the artifact as verified with a matching digest", async () => {
    const bytes = Buffer.from("abc");
    const sha256 = sha256Of(bytes);
    const client = fakeArtifactBytesClient({ completedDigest: digest("9") });
    await expect(transferArtifactBytes(client, { operationId: OPERATION_ID, relativePath: "manifest.json", readChunk: async () => bytes, byteLength: bytes.length, sha256, chunkBytes: 8 }))
      .rejects.toMatchObject({ code: "TRANSFER_ASSEMBLED_DIGEST_MISMATCH" });
  });

  it("re-sending all chunks on a resumed transfer is safe (each redelivery is independently idempotent server-side)", async () => {
    const bytes = Buffer.from("0123456789abcdef");
    const sha256 = sha256Of(bytes);
    const client = fakeArtifactBytesClient({ completedDigest: sha256 });
    const readChunk = async (offset, length) => bytes.subarray(offset, offset + length);
    await transferArtifactBytes(client, { operationId: OPERATION_ID, relativePath: "canonical-runtime.json", readChunk, byteLength: bytes.length, sha256, chunkBytes: 8 });
    await transferArtifactBytes(client, { operationId: OPERATION_ID, relativePath: "canonical-runtime.json", readChunk, byteLength: bytes.length, sha256, chunkBytes: 8 });
    expect(client.declareArtifact).toHaveBeenCalledTimes(2);
    expect(client.uploaded).toHaveLength(4);
  });
});

describe("createProductionTransferSnapshotAdapter — orchestrator contract preservation", () => {
  function fakeManifestAndArtifactClient() {
    const declaredArtifacts = new Map();
    let manifestDeclared = null;
    return {
      declareManifest: vi.fn(async (payload) => { manifestDeclared = payload; return { packageDigest: payload.packageDigest }; }),
      declareArtifact: vi.fn(async (declaration) => { declaredArtifacts.set(declaration.packageId, declaration); return declaration; }),
      uploadChunk: vi.fn(async () => ({ outcome: "received" })),
      completeArtifact: vi.fn(async ({ packageId }) => ({ status: "verified", overallDigest: declaredArtifacts.get(packageId).overallDigest })),
      completeManifest: vi.fn(async () => ({ status: "verified", packageDigest: manifestDeclared.packageDigest, outcome: "verified" })),
    };
  }

  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "physiqueos-cutover-transfer-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("preserves the synthetic transferSnapshot({ input, exported }) -> receipt interface with a packageDigest field", async () => {
    const manifestFile = join(dir, "manifest.json");
    const runtimeFile = join(dir, "canonical-runtime.json");
    await writeFile(manifestFile, JSON.stringify({ hello: "manifest" }));
    await writeFile(runtimeFile, JSON.stringify({ hello: "runtime" }));
    const manifestBytes = await import("node:fs/promises").then((fs) => fs.readFile(manifestFile));
    const runtimeBytes = await import("node:fs/promises").then((fs) => fs.readFile(runtimeFile));

    const packageDigest = "deterministic-package-digest".padEnd(64, "0").slice(0, 64);
    const exported = Object.freeze({
      manifest: Object.freeze({ semanticDigest: packageDigest, files: [] }),
      manifestFile,
      runtimeFile,
      sourceSha256: digest("d"),
    });
    const snapshot = Object.freeze({
      runtimeSha256: digest("d"), runtimeRevision: 140, mediaInventorySha256: digest("e"),
      migrationControlSha256: digest("f"), packageDigest,
    });

    const client = fakeManifestAndArtifactClient();
    const transferSnapshot = createProductionTransferSnapshotAdapter({ client, providerDeploymentId: "synthetic-deployment" });
    const input = { migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a") };
    const state = { fenceId: "fence-1" };

    const receipt = await transferSnapshot({ input, state, snapshot, exported });

    expect(receipt.migrationOperationId).toBe(OPERATION_ID);
    expect(receipt.packageDigest).toBe(packageDigest);
    expect(receipt.receiptId).toBe(`${OPERATION_ID}:${packageDigest}`);
    expect(client.declareManifest).toHaveBeenCalledOnce();
    expect(client.declareArtifact).toHaveBeenCalledTimes(2); // manifest.json + canonical-runtime.json
    expect(client.completeManifest).toHaveBeenCalledOnce();
    expect(manifestBytes.length).toBeGreaterThan(0);
    expect(runtimeBytes.length).toBeGreaterThan(0);
  });

  it("refuses to transfer when the exported package digest does not match the fenced snapshot's digest", async () => {
    const manifestFile = join(dir, "manifest.json");
    const runtimeFile = join(dir, "canonical-runtime.json");
    await writeFile(manifestFile, "{}");
    await writeFile(runtimeFile, "{}");
    const exported = Object.freeze({ manifest: Object.freeze({ semanticDigest: digest("1"), files: [] }), manifestFile, runtimeFile, sourceSha256: digest("d") });
    const snapshot = Object.freeze({ runtimeSha256: digest("d"), runtimeRevision: 140, mediaInventorySha256: digest("e"), migrationControlSha256: digest("f"), packageDigest: digest("2") });
    const client = fakeManifestAndArtifactClient();
    const transferSnapshot = createProductionTransferSnapshotAdapter({ client, providerDeploymentId: "synthetic-deployment" });

    await expect(transferSnapshot({ input: { migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a") }, state: { fenceId: "fence-1" }, snapshot, exported }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_IDENTITY_MISMATCH" });
    expect(client.declareManifest).not.toHaveBeenCalled();
  });
});

describe("createFileChunkReader and buildCombinedCutoverTransferManifest — real disk I/O", () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "physiqueos-cutover-transfer-io-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("reads exact byte ranges from disk without loading the whole file", async () => {
    const path = join(dir, "sample.bin");
    const bytes = Buffer.from("the quick brown fox jumps over the lazy dog");
    await writeFile(path, bytes);
    const reader = await createFileChunkReader(path);
    try {
      const first = await reader.read(0, 10);
      const second = await reader.read(10, 10);
      expect(Buffer.concat([first, second]).equals(bytes.subarray(0, 20))).toBe(true);
    } finally {
      await reader.close();
    }
  });

  it("builds a manifest whose file hashes match the bytes actually written to disk", async () => {
    const manifestFile = join(dir, "manifest.json");
    const runtimeFile = join(dir, "canonical-runtime.json");
    const manifestBytes = Buffer.from(JSON.stringify({ a: 1 }));
    const runtimeBytes = Buffer.from(JSON.stringify({ b: 2 }));
    await writeFile(manifestFile, manifestBytes);
    await writeFile(runtimeFile, runtimeBytes);
    const exported = { manifestFile, runtimeFile, manifest: { files: [{ relativePath: "photo.jpg", size: 5, sha256: digest("9") }] } };

    const manifest = await buildCombinedCutoverTransferManifest({ exported, mediaRoot: dir });

    expect(manifest.files[0]).toMatchObject({ relativePath: "manifest.json", byteLength: manifestBytes.length, sha256: sha256Of(manifestBytes) });
    expect(manifest.files[1]).toMatchObject({ relativePath: "canonical-runtime.json", byteLength: runtimeBytes.length, sha256: sha256Of(runtimeBytes) });
    expect(manifest.files[2]).toMatchObject({ relativePath: "media/photo.jpg", byteLength: 5, sha256: digest("9") });
  });
});
