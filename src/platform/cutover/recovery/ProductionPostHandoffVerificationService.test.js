import { describe, expect, it } from "vitest";
import { createProductionPostHandoffVerificationService } from "./ProductionPostHandoffVerificationService.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createFakeHandoffReceiptPool } from "../handoff/testSupport/fakeHandoffReceiptPool.js";
import {
  digest, memoryAuthorityStore, windowsLegacyState, providerAuthoritativeState, firstWriteBoundaryState,
  recoveryRequiredState, OPERATION_ID, AUTHORIZATION_FINGERPRINT, FENCE_ID, PACKAGE_DIGEST, PROVIDER_DEPLOYMENT_ID, ROUTING_TARGET,
} from "./testSupport/recoveryFixtures.js";

function input(overrides = {}) {
  return { migrationOperationId: OPERATION_ID, authorizationFingerprint: AUTHORIZATION_FINGERPRINT, ...overrides };
}

async function verifiedReceiptStore({ packageDigest = PACKAGE_DIGEST } = {}) {
  const store = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
  await store.declare({
    migrationOperationId: OPERATION_ID, authorizationFingerprint: AUTHORIZATION_FINGERPRINT, fenceId: FENCE_ID,
    packageDigest, routingTarget: ROUTING_TARGET, providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
  });
  await store.recordAuthorityCommitted({ migrationOperationId: OPERATION_ID, expectedPackageDigest: packageDigest, resultingAuthority: "provider-authoritative" });
  await store.recordRoutingActivated({ migrationOperationId: OPERATION_ID, expectedPackageDigest: packageDigest });
  await store.recordRoutingVerified({ migrationOperationId: OPERATION_ID, expectedPackageDigest: packageDigest });
  return store;
}

function emptyReceiptStore() {
  return createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
}

describe("ProductionPostHandoffVerificationService — construction", () => {
  it("requires both collaborators", () => {
    expect(() => createProductionPostHandoffVerificationService({})).toThrow();
  });
});

describe("ProductionPostHandoffVerificationService — verifyPostHandoff", () => {
  it("reports ready for a clean provider handoff (authority transferred, routing verified, no write yet)", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await verifiedReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: true, classification: "PROVIDER_HANDED_OFF_PRE_WRITE", authority: "provider-authoritative", routingStatus: "verified" });
    expect(result.firstProviderCanonicalWriteAt).toBeNull();
  });

  it("reports not-ready when provider authority has not transferred", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const handoffReceiptStore = emptyReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: false, classification: "AUTHORITY_NOT_TRANSFERRED" });
  });

  it("reports not-ready when authority transferred but no handoff receipt exists yet (routing pending)", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = emptyReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: false, classification: "ROUTING_PENDING" });
  });

  it("reports not-ready when authority transferred and a receipt exists but routing is not yet verified", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool: createFakeHandoffReceiptPool() });
    await handoffReceiptStore.declare({
      migrationOperationId: OPERATION_ID, authorizationFingerprint: AUTHORIZATION_FINGERPRINT, fenceId: FENCE_ID,
      packageDigest: PACKAGE_DIGEST, routingTarget: ROUTING_TARGET, providerDeploymentId: PROVIDER_DEPLOYMENT_ID,
    });
    await handoffReceiptStore.recordAuthorityCommitted({ migrationOperationId: OPERATION_ID, expectedPackageDigest: PACKAGE_DIGEST, resultingAuthority: "provider-authoritative" });
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: false, classification: "ROUTING_PENDING", routingStatus: "pending" });
  });

  it("rejects a request for the wrong operation against an active durable authority row", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await verifiedReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    await expect(service.verifyPostHandoff({ input: input({ migrationOperationId: "combined-op-other" }) }))
      .rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
  });

  it("reports ready with FIRST_WRITE_BOUNDARY_CROSSED once the separate first-write action has run", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const handoffReceiptStore = await verifiedReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: true, classification: "FIRST_WRITE_BOUNDARY_CROSSED" });
    expect(result.firstProviderCanonicalWriteAt).not.toBeNull();
  });

  it("reports not-ready when runtime authority is already recovery-required", async () => {
    const authorityStore = memoryAuthorityStore(recoveryRequiredState());
    const handoffReceiptStore = await verifiedReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    const result = await service.verifyPostHandoff({ input: input() });
    expect(result).toMatchObject({ ready: false, classification: "RECOVERY_REQUIRED" });
  });

  it("rejects conflicting durable evidence: a handoff receipt with a different package digest than the fenced snapshot", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const handoffReceiptStore = await verifiedReceiptStore({ packageDigest: digest("9") });
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    await expect(service.verifyPostHandoff({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
  });

  it("never mutates authority or calls a routing operation - read-only by construction", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const before = (await authorityStore.read()).state;
    const handoffReceiptStore = await verifiedReceiptStore();
    const service = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });

    await service.verifyPostHandoff({ input: input() });
    const after = (await authorityStore.read()).state;
    expect(after.version).toBe(before.version);
  });
});
