import { describe, expect, it } from "vitest";
import { createProductionProviderForwardRecoveryService } from "./ProductionProviderForwardRecoveryService.js";
import { RuntimeAuthority } from "../CombinedRuntimeAuthorityState.js";
import {
  memoryAuthorityStore, providerAuthoritativeState, providerPreparedState, firstWriteBoundaryState, recoveryRequiredState,
  OPERATION_ID,
} from "./testSupport/recoveryFixtures.js";

function input(overrides = {}) {
  return { migrationOperationId: OPERATION_ID, ...overrides };
}

describe("ProductionProviderForwardRecoveryService — construction", () => {
  it("requires the runtime-authority store", () => {
    expect(() => createProductionProviderForwardRecoveryService({})).toThrow();
  });

  it("accepts no routing-control or canonical-record dependency at all - it cannot touch either by construction", () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    expect(() => createProductionProviderForwardRecoveryService({ authorityStore })).not.toThrow();
  });
});

describe("ProductionProviderForwardRecoveryService — post-boundary forward recovery", () => {
  it("activates forward recovery through the real REQUIRE_RECOVERY transition once firstProviderCanonicalWriteAt is set", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    const result = await service.enterProviderRecovery({ input: input() });
    expect(result).toMatchObject({ ready: true, classification: "FORWARD_REPAIR_REQUIRED", authority: RuntimeAuthority.RECOVERY_REQUIRED });
    expect(result.firstProviderCanonicalWriteAt).not.toBeNull();

    const after = (await authorityStore.read()).state;
    expect(after.authority).toBe(RuntimeAuthority.RECOVERY_REQUIRED);
    expect(after.lastAction).toBe("require-provider-recovery"); // proves the real state machine ran, not a direct row write
    expect(after.writesEnabled).toBe(false);
  });

  it("embeds the triggering failure code into the durable transition reason when supplied", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    await service.enterProviderRecovery({ input: input(), error: { code: "SYNTHETIC_FAILURE_workerHandoff" } });
    const after = (await authorityStore.read()).state;
    expect(after.reason).toContain("SYNTHETIC_FAILURE_workerHandoff");
  });
});

describe("ProductionProviderForwardRecoveryService — pre-boundary rejection", () => {
  it("refuses to activate forward recovery while rollback is still legal (no first-write boundary yet)", async () => {
    const authorityStore = memoryAuthorityStore(providerAuthoritativeState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    await expect(service.enterProviderRecovery({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_FORWARD_NOT_YET_REQUIRED" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER);
  });

  it("refuses when authority is still provider-prepared (well before any write boundary)", async () => {
    const authorityStore = memoryAuthorityStore(providerPreparedState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    await expect(service.enterProviderRecovery({ input: input() })).rejects.toMatchObject({ code: "RECOVERY_FORWARD_NOT_YET_REQUIRED" });
  });
});

describe("ProductionProviderForwardRecoveryService — operation binding", () => {
  it("rejects a forward-recovery request for a different operation than the durable owning one", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    await expect(service.enterProviderRecovery({ input: input({ migrationOperationId: "combined-op-other" }) }))
      .rejects.toMatchObject({ code: "RECOVERY_CONFLICTING_OPERATION" });
    expect((await authorityStore.read()).state.authority).toBe(RuntimeAuthority.PROVIDER); // untouched
  });
});

describe("ProductionProviderForwardRecoveryService — idempotency and boundary preservation", () => {
  it("a repeated call for an already recovery-required operation is a safe no-op", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    const first = await service.enterProviderRecovery({ input: input() });
    const versionAfterFirst = (await authorityStore.read()).state.version;
    const second = await service.enterProviderRecovery({ input: input() });

    expect(first.authority).toBe(RuntimeAuthority.RECOVERY_REQUIRED);
    expect(second.authority).toBe(RuntimeAuthority.RECOVERY_REQUIRED);
    expect((await authorityStore.read()).state.version).toBe(versionAfterFirst); // no second transition applied
  });

  it("is idempotent even when durable authority is already recovery-required on the very first call", async () => {
    const authorityStore = memoryAuthorityStore(recoveryRequiredState());
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    const result = await service.enterProviderRecovery({ input: input() });
    expect(result.authority).toBe(RuntimeAuthority.RECOVERY_REQUIRED);
  });

  it("never clears or alters firstProviderCanonicalWriteAt", async () => {
    const authorityStore = memoryAuthorityStore(firstWriteBoundaryState());
    const before = (await authorityStore.read()).state.firstProviderCanonicalWriteAt;
    const service = createProductionProviderForwardRecoveryService({ authorityStore });

    await service.enterProviderRecovery({ input: input() });
    const after = (await authorityStore.read()).state.firstProviderCanonicalWriteAt;
    expect(after).toBe(before);
  });
});
