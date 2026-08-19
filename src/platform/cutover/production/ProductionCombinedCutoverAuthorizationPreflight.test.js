import { describe, expect, it, vi } from "vitest";
import { createVerifyAuthorizationPreflight } from "./ProductionCombinedCutoverAuthorizationPreflight.js";
import { TransferErrorCode } from "../transfer/combinedCutoverTransferContract.js";
import {
  memoryAuthorityStore, windowsLegacyState, providerAuthoritativeState, firstWriteBoundaryState, recoveryRequiredState,
  OPERATION_ID,
} from "../recovery/testSupport/recoveryFixtures.js";

const ENVIRONMENT = "synthetic";

function input(overrides = {}) {
  return { migrationOperationId: OPERATION_ID, ...overrides };
}

function unavailableEvidenceStore() {
  return { read: vi.fn(async () => { throw Object.assign(new Error("unavailable"), { code: TransferErrorCode.RECEIPT_UNAVAILABLE }); }) };
}
function existingEvidenceStore() {
  return { read: vi.fn(async () => ({ receipt: { operationId: OPERATION_ID } })) };
}

describe("ProductionCombinedCutoverAuthorizationPreflight — construction", () => {
  it("requires the authority store and environment", () => {
    expect(() => createVerifyAuthorizationPreflight({})).toThrow();
    expect(() => createVerifyAuthorizationPreflight({ authorityStore: memoryAuthorityStore(windowsLegacyState()) })).toThrow();
  });
});

describe("ProductionCombinedCutoverAuthorizationPreflight — verifyAuthorization", () => {
  it("passes for the exact pre-cutover Windows-authoritative state with no evidence conflicts", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT, preparationStore: unavailableEvidenceStore(), handoffReceiptStore: unavailableEvidenceStore() });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: true, mutated: false, classification: "WINDOWS_AUTHORITATIVE", operationId: OPERATION_ID });
  });

  it("passes without preparationStore/handoffReceiptStore injected (both optional)", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT });
    const result = await preflight({ input: input() });
    expect(result.ready).toBe(true);
  });

  it("rejects an environment mismatch", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: "a-different-environment" });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_AUTHORITY_ENVIRONMENT_MISMATCH" });
  });

  it("rejects when a combined cutover is already in progress (not windows-legacy-authoritative)", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_AUTHORITY_NOT_ELIGIBLE", classification: "PRE_BOUNDARY_CUTOVER_IN_PROGRESS" });
  });

  it("rejects once firstProviderCanonicalWriteAt is set (rollback no longer legal)", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_AUTHORITY_NOT_ELIGIBLE", classification: "FORWARD_REPAIR_REQUIRED" });
  });

  it("rejects when authority is already recovery-required", async () => {
    const authorityStore = memoryAuthorityStore(recoveryRequiredState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_AUTHORITY_NOT_ELIGIBLE", classification: "FORWARD_REPAIR_REQUIRED" });
  });

  it("rejects a migration operation ID already used by durable preparation evidence", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT, preparationStore: existingEvidenceStore() });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_OPERATION_ID_REUSED" });
  });

  it("rejects a migration operation ID already used by durable handoff evidence", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT, preparationStore: unavailableEvidenceStore(), handoffReceiptStore: existingEvidenceStore() });
    const result = await preflight({ input: input() });
    expect(result).toMatchObject({ ready: false, code: "COMBINED_CUTOVER_OPERATION_ID_REUSED" });
  });

  it("never mutates durable authority", async () => {
    const authorityStore = memoryAuthorityStore(windowsLegacyState());
    const before = (await authorityStore.read()).state;
    const preflight = createVerifyAuthorizationPreflight({ authorityStore, environment: ENVIRONMENT });
    await preflight({ input: input() });
    const after = (await authorityStore.read()).state;
    expect(after.version).toBe(before.version);
  });
});
