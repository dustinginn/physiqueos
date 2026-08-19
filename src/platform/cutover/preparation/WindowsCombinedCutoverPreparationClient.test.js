import { describe, expect, it, vi } from "vitest";
import {
  createCombinedCutoverPreparationHttpClient,
  createProductionAcknowledgeProviderPreparedAdapter,
  createProductionImportProviderCanonicalStateAdapter,
  createProductionVerifyProviderParityAdapter,
} from "./WindowsCombinedCutoverPreparationClient.js";

const digest = (character) => character.repeat(64);
const OPERATION_ID = "combined-op-0001";

function context(overrides = {}) {
  return {
    input: { migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a") },
    state: { fenceId: "fence-1" },
    snapshot: { packageDigest: digest("c") },
    ...overrides,
  };
}

describe("createCombinedCutoverPreparationHttpClient", () => {
  it("rejects a non-HTTPS base URL", () => {
    expect(() => createCombinedCutoverPreparationHttpClient({ baseUrl: "http://provider.invalid/prepare/", credential: "s".repeat(40) })).toThrow();
  });

  it("sends the machine credential as a Bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ready: true }), { status: 200 }));
    const client = createCombinedCutoverPreparationHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/prepare/", credential: "s".repeat(40) });
    await client.status(OPERATION_ID);
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${"s".repeat(40)}`);
  });

  it("retries a bounded number of times on a network-level failure", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const client = createCombinedCutoverPreparationHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/prepare/", credential: "s".repeat(40), maxAttempts: 3, retryDelayMs: 1 });
    await expect(client.status(OPERATION_ID)).rejects.toMatchObject({ code: "PREPARATION_TRANSPORT_FAILED" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a semantic rejection (e.g. parity mismatch)", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: "PREPARATION_PARITY_MISMATCH" }), { status: 422 }));
    const client = createCombinedCutoverPreparationHttpClient({ fetchImpl, baseUrl: "https://provider.invalid/prepare/", credential: "s".repeat(40), maxAttempts: 3, retryDelayMs: 1 });
    await expect(client.parity({})).rejects.toMatchObject({ code: "PREPARATION_PARITY_MISMATCH" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createProductionImportProviderCanonicalStateAdapter", () => {
  it("posts the exact operation/fence/digest payload derived from orchestrator context", async () => {
    const client = { import: vi.fn(async () => ({ ready: true, records: 3 })) };
    const adapter = createProductionImportProviderCanonicalStateAdapter({ client });
    const result = await adapter(context());
    expect(client.import).toHaveBeenCalledWith({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", expectedPackageDigest: digest("c") });
    expect(result).toEqual({ ready: true, records: 3 });
  });

  it("throws when the provider does not report readiness", async () => {
    const client = { import: vi.fn(async () => ({ ready: false })) };
    const adapter = createProductionImportProviderCanonicalStateAdapter({ client });
    await expect(adapter(context())).rejects.toMatchObject({ code: "PREPARATION_IMPORT_FAILED" });
  });
});

describe("createProductionVerifyProviderParityAdapter", () => {
  it("posts the exact payload and returns the provider's parity result unchanged", async () => {
    const client = { parity: vi.fn(async () => ({ ready: true, readParity: "pass", commandReadiness: "pass" })) };
    const adapter = createProductionVerifyProviderParityAdapter({ client });
    const result = await adapter(context());
    expect(client.parity).toHaveBeenCalledWith({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", expectedPackageDigest: digest("c") });
    expect(result).toEqual({ ready: true, readParity: "pass", commandReadiness: "pass" });
  });
});

describe("createProductionAcknowledgeProviderPreparedAdapter", () => {
  it("returns exactly the acknowledgement shape CombinedRuntimeAuthorityState requires", async () => {
    const providerResponse = { migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", packageDigest: digest("c"), providerDeploymentId: "deployment-1" };
    const client = { acknowledge: vi.fn(async () => providerResponse) };
    const adapter = createProductionAcknowledgeProviderPreparedAdapter({ client });
    const result = await adapter(context());
    expect(result).toEqual(providerResponse);
  });

  it("rejects an incomplete acknowledgement response rather than passing it through", async () => {
    const client = { acknowledge: vi.fn(async () => ({ migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", packageDigest: digest("c") /* missing providerDeploymentId */ })) };
    const adapter = createProductionAcknowledgeProviderPreparedAdapter({ client });
    await expect(adapter(context())).rejects.toMatchObject({ code: "PREPARATION_ACKNOWLEDGE_NOT_ELIGIBLE" });
  });
});

describe("production adapter contract parity with the synthetic rehearsal", () => {
  it("acknowledgeProviderPrepared's production and synthetic shapes are both accepted by the same field-presence contract", async () => {
    const requiredFields = ["migrationOperationId", "authorizationFingerprint", "fenceId", "packageDigest", "providerDeploymentId"];
    const synthetic = { migrationOperationId: OPERATION_ID, authorizationFingerprint: digest("a"), fenceId: "fence-1", packageDigest: digest("c"), providerDeploymentId: "synthetic-deployment" };
    const client = { acknowledge: vi.fn(async () => ({ ...synthetic, providerDeploymentId: "real-deployment" })) };
    const production = await createProductionAcknowledgeProviderPreparedAdapter({ client })(context());
    for (const field of requiredFields) {
      expect(synthetic).toHaveProperty(field);
      expect(production).toHaveProperty(field);
    }
  });

  it("importProviderCanonicalState's production and synthetic shapes both satisfy {ready: true, ...}", async () => {
    const syntheticShape = { ready: true, records: 3 };
    const client = { import: vi.fn(async () => ({ ready: true, records: 3, collectionCounts: {} })) };
    const production = await createProductionImportProviderCanonicalStateAdapter({ client })(context());
    expect(syntheticShape.ready).toBe(true);
    expect(production.ready).toBe(true);
    expect(typeof production.records).toBe(typeof syntheticShape.records);
  });

  it("verifyProviderParity's production and synthetic shapes both satisfy {ready, readParity, commandReadiness}", async () => {
    const syntheticShape = { ready: true, readParity: "pass", commandReadiness: "pass" };
    const client = { parity: vi.fn(async () => ({ ready: true, readParity: "pass", commandReadiness: "pass", mediaValidated: true })) };
    const production = await createProductionVerifyProviderParityAdapter({ client })(context());
    for (const field of ["ready", "readParity", "commandReadiness"]) {
      expect(syntheticShape).toHaveProperty(field);
      expect(production).toHaveProperty(field);
    }
  });
});
