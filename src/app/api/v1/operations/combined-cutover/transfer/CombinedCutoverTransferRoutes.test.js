// Real route/service boundary tests: actual Next.js Route Handlers driven with real Request
// objects, wired to the REAL `createCombinedCutoverTransferService` /
// `createCombinedCutoverManifestTransferService` (real authentication, real validation) but backed
// by an in-memory fake receipt store instead of PostgreSQL/Spaces. This proves body/stream parsing
// and header handling in the route layer cannot be used to bypass authentication or contract
// validation - the same guarantee `FoundationApiRoutes.test.js` and `middleware.test.js` establish
// for their own boundaries.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../../../../../platform/auth/credentialHash.js";
import { createCombinedCutoverTransferService } from "../../../../../../platform/cutover/transfer/combinedCutoverTransferService.js";
import { createCombinedCutoverManifestTransferService } from "../../../../../../platform/cutover/transfer/combinedCutoverManifestTransferService.js";
import { deriveTransferPackageId } from "../../../../../../platform/cutover/transfer/combinedCutoverTransferContract.js";
import { sha256Of } from "../../../../../../platform/cutover/transfer/combinedCutoverTransferStaging.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const digest = (character) => character.repeat(64);

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

let current = { transferService: null, manifestService: null };

vi.mock("../../../../../../platform/cutover/transfer/combinedCutoverTransferComposition.js", () => ({
  getCombinedCutoverTransferService: () => current.transferService,
  getCombinedCutoverManifestTransferService: () => current.manifestService,
}));

const { POST: declarePOST } = await import("./declare/route.js");
const { POST: chunkPOST } = await import("./chunk/route.js");
const { POST: completePOST } = await import("./complete/route.js");
const { GET: statusGET } = await import("./status/route.js");
const { POST: manifestDeclarePOST } = await import("./manifest/declare/route.js");
const { POST: manifestCompletePOST } = await import("./manifest/complete/route.js");
const { GET: manifestStatusGET } = await import("./manifest/status/route.js");

function inMemoryArtifactStore() {
  const rows = new Map();
  return {
    async declare(input) {
      const key = `${input.operationId}:${input.packageId}`;
      if (!rows.has(key)) rows.set(key, { ...input, receivedBytes: 0, receivedChunkCount: 0, status: "declared", schemaVersion: 1, receiptId: `cctr_${key}`, createdAt: "t", updatedAt: "t", completedAt: null, verifiedAt: null });
      return { outcome: "declared", receipt: rows.get(key) };
    },
    async receiveChunk({ operationId, packageId, chunkIndex, bytes }) {
      const row = rows.get(`${operationId}:${packageId}`);
      row.receivedBytes += bytes.length;
      row.receivedChunkCount += 1;
      row.status = "receiving";
      return { outcome: "received", chunkIndex, receipt: row };
    },
    async completeAndVerify({ operationId, packageId }) {
      const row = rows.get(`${operationId}:${packageId}`);
      row.status = "verified";
      return { outcome: "verified", receipt: row };
    },
    async status(operationId, packageId) {
      const row = rows.get(`${operationId}:${packageId}`);
      if (!row) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return { receipt: row };
    },
  };
}

function inMemoryManifestStore() {
  const rows = new Map();
  return {
    async declare(input) {
      rows.set(input.migrationOperationId, { ...input, status: "declared" });
      return { outcome: "declared", receipt: rows.get(input.migrationOperationId) };
    },
    async read(operationId) {
      const row = rows.get(operationId);
      if (!row) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return { receipt: row };
    },
    async verify({ migrationOperationId, receipt }) {
      const row = { ...rows.get(migrationOperationId), status: "verified", packageDigest: receipt.packageDigest };
      rows.set(migrationOperationId, row);
      return { outcome: "verified", receipt: row };
    },
  };
}

beforeEach(() => {
  const artifactReceiptStore = inMemoryArtifactStore();
  const manifestReceiptStore = inMemoryManifestStore();
  current = {
    transferService: createCombinedCutoverTransferService({ receiptStore: artifactReceiptStore, authConfig: authConfig() }),
    manifestService: createCombinedCutoverManifestTransferService({ manifestReceiptStore, artifactReceiptStore, authConfig: authConfig() }),
  };
});

describe("POST declare route", () => {
  it("rejects with no Authorization header", async () => {
    const request = new Request("https://provider.invalid/api/v1/operations/combined-cutover/transfer/declare", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: OPERATION_ID, packageId: deriveTransferPackageId("manifest.json"), overallDigest: digest("a"), expectedBytes: 10, expectedChunkCount: 1, chunkSizeBytes: 10 }),
    });
    const response = await declarePOST(request);
    expect(response.status).toBe(401);
  });

  it("rejects a non-JSON content type", async () => {
    const request = new Request("https://provider.invalid/.../declare", { method: "POST", headers: { "content-type": "text/plain", authorization: `Bearer ${SECRET}` }, body: "not json" });
    const response = await declarePOST(request);
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://provider.invalid/.../declare", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: "{not valid json" });
    const response = await declarePOST(request);
    expect(response.status).toBe(400);
  });

  it("rejects an oversized declare body before parsing it", async () => {
    const request = new Request("https://provider.invalid/.../declare", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ padding: "x".repeat(20_000) }) });
    const response = await declarePOST(request);
    expect(response.status).toBe(413);
  });

  it("accepts a valid authenticated declare", async () => {
    const request = new Request("https://provider.invalid/.../declare", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ operationId: OPERATION_ID, packageId: deriveTransferPackageId("manifest.json"), overallDigest: digest("a"), expectedBytes: 10, expectedChunkCount: 1, chunkSizeBytes: 10 }),
    });
    const response = await declarePOST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("declared");
  });

  it("reports not-configured when the channel is disabled", async () => {
    current.transferService = null;
    const request = new Request("https://provider.invalid/.../declare", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: "{}" });
    const response = await declarePOST(request);
    expect(response.status).toBe(503);
  });
});

describe("POST chunk route (binary body + header metadata)", () => {
  const packageId = deriveTransferPackageId("manifest.json");
  const bytes = Buffer.from("hello world!");

  async function declareArtifact() {
    await current.transferService.declare({ authorizationHeader: `Bearer ${SECRET}`, payload: { operationId: OPERATION_ID, packageId, overallDigest: sha256Of(bytes), expectedBytes: bytes.length, expectedChunkCount: 1, chunkSizeBytes: bytes.length } });
  }

  it("rejects with no Authorization header", async () => {
    await declareArtifact();
    const request = new Request("https://provider.invalid/.../chunk", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length), "x-physiqueos-operation-id": OPERATION_ID, "x-physiqueos-package-id": packageId, "x-physiqueos-chunk-index": "0", "x-physiqueos-chunk-digest": sha256Of(bytes) },
      body: bytes,
    });
    const response = await chunkPOST(request);
    expect(response.status).toBe(401);
  });

  it("rejects a non-octet-stream content type", async () => {
    const request = new Request("https://provider.invalid/.../chunk", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: bytes });
    const response = await chunkPOST(request);
    expect(response.status).toBe(400);
  });

  it("rejects a chunk whose actual body size disagrees with its declared Content-Length (413, not silently truncated/padded)", async () => {
    await declareArtifact();
    const request = new Request("https://provider.invalid/.../chunk", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream", "content-length": "999999", authorization: `Bearer ${SECRET}`,
        "x-physiqueos-operation-id": OPERATION_ID, "x-physiqueos-package-id": packageId, "x-physiqueos-chunk-index": "0", "x-physiqueos-chunk-digest": sha256Of(bytes),
      },
      body: bytes,
    });
    const response = await chunkPOST(request);
    expect(response.status).toBe(413);
  });

  it("rejects a path-traversal-shaped packageId header", async () => {
    const request = new Request("https://provider.invalid/.../chunk", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream", "content-length": String(bytes.length), authorization: `Bearer ${SECRET}`,
        "x-physiqueos-operation-id": OPERATION_ID, "x-physiqueos-package-id": "../../../etc/passwd", "x-physiqueos-chunk-index": "0", "x-physiqueos-chunk-digest": sha256Of(bytes),
      },
      body: bytes,
    });
    const response = await chunkPOST(request);
    expect(response.status).toBe(400);
  });

  it("accepts a valid chunk end to end", async () => {
    await declareArtifact();
    const request = new Request("https://provider.invalid/.../chunk", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream", "content-length": String(bytes.length), authorization: `Bearer ${SECRET}`,
        "x-physiqueos-operation-id": OPERATION_ID, "x-physiqueos-package-id": packageId, "x-physiqueos-chunk-index": "0", "x-physiqueos-chunk-digest": sha256Of(bytes),
      },
      body: bytes,
    });
    const response = await chunkPOST(request);
    expect(response.status).toBe(201);
  });
});

describe("POST complete route", () => {
  it("rejects malformed JSON", async () => {
    const request = new Request("https://provider.invalid/.../complete", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: "{bad" });
    const response = await completePOST(request);
    expect(response.status).toBe(400);
  });
});

describe("GET status route — malformed IDs and cross-operation isolation", () => {
  it("rejects a malformed operationId query parameter", async () => {
    const request = new Request(`https://provider.invalid/.../status?operationId=${encodeURIComponent("../evil")}&packageId=${deriveTransferPackageId("x.json")}`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(400);
  });

  it("cannot read another operation's transfer state even with a structurally valid packageId", async () => {
    const request = new Request(`https://provider.invalid/.../status?operationId=${OPERATION_ID}&packageId=${deriveTransferPackageId("never-declared.json")}`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(404);
  });
});

describe("manifest routes — auth and happy path", () => {
  it("rejects manifest declare with no credential", async () => {
    const request = new Request("https://provider.invalid/.../manifest/declare", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const response = await manifestDeclarePOST(request);
    expect(response.status).toBe(401);
  });

  it("declares, transfers both artifacts, and completes the manifest end to end through real routes", async () => {
    const manifestBytes = Buffer.from("manifest-bytes");
    const runtimeBytes = Buffer.from("canonical-runtime-bytes");
    const filesPayload = [
      { path: "manifest.json", byteLength: manifestBytes.length, sha256: sha256Of(manifestBytes) },
      { path: "canonical-runtime.json", byteLength: runtimeBytes.length, sha256: sha256Of(runtimeBytes) },
    ];

    const declareManifestResponse = await manifestDeclarePOST(new Request("https://provider.invalid/.../manifest/declare", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("f"), fenceId: "fence-1",
        packageDigest: digest("c"), runtimeSha256: digest("d"), mediaInventorySha256: digest("e"), migrationControlSha256: digest("9"),
        providerDeploymentId: "deployment-1", manifest: { packageDigest: digest("c"), files: filesPayload },
      }),
    }));
    expect(declareManifestResponse.status).toBe(201);

    for (const [file, bytes] of [[filesPayload[0], manifestBytes], [filesPayload[1], runtimeBytes]]) {
      const packageId = deriveTransferPackageId(file.path);
      const declareArtifactResponse = await declarePOST(new Request("https://provider.invalid/.../declare", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ operationId: OPERATION_ID, packageId, overallDigest: file.sha256, expectedBytes: file.byteLength, expectedChunkCount: 1, chunkSizeBytes: file.byteLength }),
      }));
      expect(declareArtifactResponse.status).toBe(201);

      const chunkResponse = await chunkPOST(new Request("https://provider.invalid/.../chunk", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream", "content-length": String(bytes.length), authorization: `Bearer ${SECRET}`,
          "x-physiqueos-operation-id": OPERATION_ID, "x-physiqueos-package-id": packageId, "x-physiqueos-chunk-index": "0", "x-physiqueos-chunk-digest": sha256Of(bytes),
        },
        body: bytes,
      }));
      expect(chunkResponse.status).toBe(201);

      const completeArtifactResponse = await completePOST(new Request("https://provider.invalid/.../complete", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ operationId: OPERATION_ID, packageId }),
      }));
      expect(completeArtifactResponse.status).toBe(200);
    }

    const completeManifestResponse = await manifestCompletePOST(new Request("https://provider.invalid/.../manifest/complete", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ operationId: OPERATION_ID }),
    }));
    expect(completeManifestResponse.status).toBe(200);
    const completeBody = await completeManifestResponse.json();
    expect(completeBody.status).toBe("verified");

    const statusResponse = await manifestStatusGET(new Request(`https://provider.invalid/.../manifest/status?operationId=${OPERATION_ID}`, { headers: { authorization: `Bearer ${SECRET}` } }));
    expect(statusResponse.status).toBe(200);
    expect((await statusResponse.json()).status).toBe("verified");
  });
});
