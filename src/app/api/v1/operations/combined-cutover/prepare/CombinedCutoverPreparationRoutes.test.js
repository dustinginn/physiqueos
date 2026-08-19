// Real route/service boundary tests: actual Next.js Route Handlers driven with real Request
// objects, wired to the REAL `createCombinedCutoverPreparationService` (real machine
// authentication, real request parsing) but backed by fake import/parity/acknowledge services and a
// fake preparation store instead of PostgreSQL/Spaces/real domain logic - those are already proven
// independently by ProductionCanonicalImportService.test.js, ProductionProviderParityService.test.js,
// and ProductionAcknowledgeProviderPreparedService.test.js. This proves body/header parsing and
// authentication in the route layer cannot be used to bypass the preparation contract, and that
// Windows' public runtime (which never holds this credential) cannot reach it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../../../../../platform/auth/credentialHash.js";
import { createCombinedCutoverPreparationService } from "../../../../../../platform/cutover/preparation/combinedCutoverPreparationService.js";

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

let current = { service: null };

vi.mock("../../../../../../platform/cutover/preparation/combinedCutoverPreparationComposition.js", () => ({
  getCombinedCutoverPreparationService: () => current.service,
}));

const { POST: importPOST } = await import("./import/route.js");
const { POST: parityPOST } = await import("./parity/route.js");
const { POST: acknowledgePOST } = await import("./acknowledge/route.js");
const { GET: statusGET } = await import("./status/route.js");

function fakeServices() {
  return {
    importService: { import: vi.fn(async () => ({ ready: true, outcome: "imported", records: 3, collectionCounts: { goals: 3 }, mediaObjectCount: 1 })) },
    parityService: { verifyParity: vi.fn(async () => ({ ready: true, outcome: "verified", readParity: "pass", commandReadiness: "pass", mediaValidated: true })) },
    acknowledgeService: { acknowledge: vi.fn(async () => ({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", packageDigest: digest("c"), providerDeploymentId: "deployment-1" })) },
    preparationStore: { read: vi.fn(async (operationId) => {
      if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return { receipt: { schemaVersion: 1, receiptId: "ccpr_x", operationId, packageDigest: digest("c"), importStatus: "succeeded", importedCollectionCounts: { goals: 3 }, mediaStatus: "succeeded", mediaObjectCount: 1, parityStatus: "passed", preparedStatus: "pending", createdAt: "t", updatedAt: "t" } };
    }) },
  };
}

beforeEach(() => {
  current.service = createCombinedCutoverPreparationService({ ...fakeServices(), authConfig: authConfig() });
});

describe("POST prepare/import route", () => {
  it("rejects with no Authorization header (unauthenticated request rejected)", async () => {
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ migrationOperationId: OPERATION_ID }) });
    const response = await importPOST(request);
    expect(response.status).toBe(401);
  });

  it("rejects a non-JSON content type", async () => {
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "text/plain", authorization: `Bearer ${SECRET}` }, body: "nope" });
    const response = await importPOST(request);
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: "{not json" });
    const response = await importPOST(request);
    expect(response.status).toBe(400);
  });

  it("rejects an oversized body before parsing it", async () => {
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ padding: "x".repeat(10_000) }) });
    const response = await importPOST(request);
    expect(response.status).toBe(413);
  });

  it("reports not-configured when the channel is disabled", async () => {
    current.service = null;
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: "{}" });
    const response = await importPOST(request);
    expect(response.status).toBe(503);
  });

  it("accepts a valid authenticated import request", async () => {
    const request = new Request("https://provider.invalid/.../prepare/import", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", expectedPackageDigest: digest("c") }) });
    const response = await importPOST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ready).toBe(true);
  });
});

describe("POST prepare/parity route", () => {
  it("rejects a wrong-operation credential", async () => {
    const request = new Request("https://provider.invalid/.../prepare/parity", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ migrationOperationId: "combined-op-other" }) });
    const response = await parityPOST(request);
    expect(response.status).toBe(403);
  });

  it("accepts a valid authenticated parity request and returns a bounded response shape", async () => {
    const request = new Request("https://provider.invalid/.../prepare/parity", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ migrationOperationId: OPERATION_ID }) });
    const response = await parityPOST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ready: true, outcome: "verified", readParity: "pass", commandReadiness: "pass", mediaValidated: true });
  });
});

describe("POST prepare/acknowledge route", () => {
  it("rejects with no Authorization header", async () => {
    const request = new Request("https://provider.invalid/.../prepare/acknowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ migrationOperationId: OPERATION_ID }) });
    const response = await acknowledgePOST(request);
    expect(response.status).toBe(401);
  });

  it("succeeds with a valid credential and returns exactly the acknowledgement shape", async () => {
    const request = new Request("https://provider.invalid/.../prepare/acknowledge", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ migrationOperationId: OPERATION_ID }) });
    const response = await acknowledgePOST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", packageDigest: digest("c"), providerDeploymentId: "deployment-1" });
  });
});

describe("GET prepare/status route — auth and cross-operation isolation", () => {
  it("rejects an unauthenticated status request (Windows public runtime cannot invoke this without the credential)", async () => {
    const request = new Request(`https://provider.invalid/.../prepare/status?operationId=${OPERATION_ID}`);
    const response = await statusGET(request);
    expect(response.status).toBe(401);
  });

  it("a Founder session cookie alone is insufficient - only the machine bearer credential authenticates", async () => {
    const request = new Request(`https://provider.invalid/.../prepare/status?operationId=${OPERATION_ID}`, {
      headers: { cookie: "physiqueos_founder_session=some-signed-founder-session-value" },
    });
    const response = await statusGET(request);
    expect(response.status).toBe(401);
  });

  it("cannot read another operation's preparation state even when authenticated for its own", async () => {
    const request = new Request(`https://provider.invalid/.../prepare/status?operationId=combined-op-other`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(403); // credential itself is bound to OPERATION_ID only
  });

  it("returns bounded status metadata for the authenticated operation, never payload contents", async () => {
    const request = new Request(`https://provider.invalid/.../prepare/status?operationId=${OPERATION_ID}`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.importStatus).toBe("succeeded");
    expect(body).not.toHaveProperty("targetDatabase");
  });
});
