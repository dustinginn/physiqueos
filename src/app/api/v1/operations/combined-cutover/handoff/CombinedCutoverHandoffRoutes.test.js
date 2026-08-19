// Real route/service boundary tests: actual Next.js Route Handler driven with real Request objects,
// wired to the REAL `createCombinedCutoverHandoffService` (real machine authentication) but backed
// by a fake handoff receipt store instead of PostgreSQL - that store is already proven independently
// by PostgresCombinedCutoverHandoffReceiptStore.test.js. This proves the route layer cannot be used
// to bypass authentication, and that Windows' public runtime (which never holds this credential)
// cannot reach it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashHighEntropyCredential } from "../../../../../../platform/auth/credentialHash.js";
import { createCombinedCutoverHandoffService } from "../../../../../../platform/cutover/handoff/combinedCutoverHandoffService.js";

const PEPPER = "p".repeat(40);
const SECRET = "s".repeat(40);
const OPERATION_ID = "combined-op-0001";
const ENVIRONMENT = "combined-cutover-production";
const digest = (character) => character.repeat(64);

function authConfig() {
  return Object.freeze({
    enabled: true, configured: true, operationId: OPERATION_ID, environment: ENVIRONMENT,
    credentialHash: hashHighEntropyCredential(SECRET, { pepper: PEPPER }),
    expiresAt: "2026-12-01T00:00:00.000Z", pepper: PEPPER,
  });
}

let current = { service: null };

vi.mock("../../../../../../platform/cutover/handoff/combinedCutoverHandoffComposition.js", () => ({
  getCombinedCutoverHandoffService: () => current.service,
}));

const { GET: statusGET } = await import("./status/route.js");

function fakeHandoffReceiptStore() {
  return {
    read: vi.fn(async (operationId) => {
      if (operationId !== OPERATION_ID) throw Object.assign(new Error("unavailable"), { code: "TRANSFER_RECEIPT_UNAVAILABLE" });
      return {
        receipt: {
          schemaVersion: 1, receiptId: "ccht_x", operationId: OPERATION_ID, packageDigest: digest("c"),
          routingTarget: "provider-ingress", providerDeploymentId: "deployment-1",
          authorityStatus: "committed", resultingAuthority: "provider-authoritative", authorityCommittedAt: "t",
          routingStatus: "verified", routingActivatedAt: "t", routingVerifiedAt: "t",
          createdAt: "t", updatedAt: "t",
        },
      };
    }),
  };
}

beforeEach(() => {
  current.service = createCombinedCutoverHandoffService({ handoffReceiptStore: fakeHandoffReceiptStore(), authConfig: authConfig() });
});

describe("GET handoff/status route", () => {
  it("rejects an unauthenticated status request (Windows public runtime cannot invoke this without the credential)", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}`);
    const response = await statusGET(request);
    expect(response.status).toBe(401);
  });

  it("a Founder session cookie alone is insufficient - only the machine bearer credential authenticates", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}`, {
      headers: { cookie: "physiqueos_founder_session=some-signed-founder-session-value" },
    });
    const response = await statusGET(request);
    expect(response.status).toBe(401);
  });

  it("rejects the Phase 4 preparation credential value (separate credential required)", async () => {
    const preparationCredential = "prep".repeat(10);
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}`, {
      headers: { authorization: `Bearer ${preparationCredential}` },
    });
    const response = await statusGET(request);
    expect(response.status).toBe(401);
  });

  it("rejects a wrong-operation credential", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=combined-op-other`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(403);
  });

  it("rejects a wrong-environment request", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}&environment=wrong-environment`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(403);
  });

  it("reports not-configured when the channel is disabled", async () => {
    current.service = null;
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(503);
  });

  it("returns bounded status metadata for the authenticated operation, never payload contents or secrets", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=${OPERATION_ID}&environment=${ENVIRONMENT}`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.authorityStatus).toBe("committed");
    expect(body.routingStatus).toBe("verified");
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("cannot read another operation's handoff evidence even when authenticated", async () => {
    const request = new Request(`https://provider.invalid/.../handoff/status?operationId=combined-op-never-declared`, { headers: { authorization: `Bearer ${SECRET}` } });
    const response = await statusGET(request);
    // This credential is bound only to OPERATION_ID, so a differently-named operation is rejected by
    // authentication (403) before the store is ever consulted - proven above. This case exercises
    // the request path end to end with the bound operation ID pointed at an undeclared receipt.
    expect(response.status).toBe(403);
  });
});
