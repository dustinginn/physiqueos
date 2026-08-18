import { describe, expect, it } from "vitest";
import {
  createSyntheticCombinedCutoverRehearsal,
  createDeterministicClock,
  inspectCombinedCutoverRecovery,
  REHEARSAL_ENVIRONMENT,
  REHEARSAL_STAGES,
} from "./syntheticCombinedCutoverRehearsal.js";
import { RuntimeAuthority, RuntimeAuthorityAction } from "./CombinedRuntimeAuthorityState.js";

async function readyRehearsal(options = {}) {
  const rehearsal = createSyntheticCombinedCutoverRehearsal(options);
  await rehearsal.initializeAuthority();
  return rehearsal;
}

describe("synthetic combined cutover — success path", () => {
  it("completes the documented handoff and then crosses the boundary through the real write path", async () => {
    const rehearsal = await readyRehearsal();

    // 1. Windows begins authoritative, no provider write possible.
    const initial = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    expect(initial.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(initial.firstProviderCanonicalWriteAt).toBeNull();
    expect(rehearsal.world.windows.canonicalWrites).toBe(true);
    expect(rehearsal.world.provider.serving).toBe(false);

    const result = await rehearsal.execute();
    expect(result.classification).toBe("COMPLETED");

    // 2. Authority transferred exactly once, boundary still uncrossed.
    const afterHandoff = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    expect(afterHandoff.authority).toBe(RuntimeAuthority.PROVIDER);
    expect(afterHandoff.publicRuntimeAuthority).toBe("provider");
    expect(afterHandoff.firstProviderCanonicalWriteAt).toBeNull();

    // 3. No dual authority: Windows canonical writes are off while provider serves.
    expect(rehearsal.world.windows.canonicalWrites).toBe(false);
    expect(rehearsal.world.windows.serving).toBe(false);
    expect(rehearsal.world.provider.serving).toBe(true);
    expect(rehearsal.world.provider.worker).toBe("active");
    expect(rehearsal.world.provider.accessGate).toBe("founder-enabled");

    // 4. Boundary crossed by the real authority-protected transaction.
    await rehearsal.crossFirstWriteBoundary();
    const evidence = await rehearsal.evidence({ classification: "COMPLETED" });
    expect(evidence.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(evidence.firstProviderCommandId).toBe("synthetic:first-provider-command");
    expect(evidence.canonicalRecords).toBe(1);
    expect(evidence.rollbackLegal).toBe(false);
    expect(evidence.forwardRecoveryRequired).toBe(true);
    expect(evidence.mode).toBe("SYNTHETIC / NON-PRODUCTION");
    expect(evidence.auditActions).toEqual([
      "initialized",
      RuntimeAuthorityAction.BEGIN_CUTOVER,
      RuntimeAuthorityAction.ACKNOWLEDGE_PROVIDER,
      RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
      RuntimeAuthorityAction.RECORD_FIRST_PROVIDER_WRITE,
    ]);
  });

  it("records the transfer receipt bound to operation and package digest", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    const evidence = await rehearsal.evidence();
    expect(evidence.transferReceiptId).toBe(`${evidence.operationId}:${evidence.packageDigest}`);
  });

  it("does not create a second first-write marker on a later command", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary({ recordId: "first", commandId: "synthetic:cmd-1" });
    const firstBoundary = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT).firstProviderCanonicalWriteAt;
    await rehearsal.crossFirstWriteBoundary({ recordId: "second", commandId: "synthetic:cmd-2" });
    const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    expect(state.firstProviderCanonicalWriteAt).toBe(firstBoundary);
    expect(state.firstProviderCommandId).toBe("synthetic:cmd-1");
    expect(rehearsal.fixture.committedCanonicalRecords()).toHaveLength(2);
  });
});

describe("synthetic combined cutover — pre-boundary failure injection", () => {
  const preBoundaryStages = [
    "verifyAuthorization", "verifyWindowsSource", "verifyProviderBuild",
    "verifyTargetIsolation", "verifyBackups", "verifyCostCeiling",
    "activateWindowsWriteFence", "captureFinalSnapshot", "exportFinalPackage",
    "transferSnapshot", "importProviderCanonicalState", "verifyProviderParity",
    "acknowledgeProviderPrepared", "beforeTransferAuthority",
  ];

  for (const stage of preBoundaryStages) {
    it(`aborts to Windows when ${stage} fails, leaving no provider write boundary`, async () => {
      const rehearsal = await readyRehearsal({ failAt: stage });
      await expect(rehearsal.execute()).rejects.toBeTruthy();

      const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
      expect(state.firstProviderCanonicalWriteAt).toBeNull();
      expect(state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect(state.publicRuntimeAuthority).toBe("windows");

      const inspection = inspectCombinedCutoverRecovery(state);
      expect(inspection.rollbackLegal).toBe(true);
      expect(inspection.forwardRecoveryRequired).toBe(false);

      // Windows resumes; staged provider artifacts are cleared.
      expect(rehearsal.world.windows.canonicalWrites).toBe(true);
      expect(rehearsal.world.provider.serving).toBe(false);
      expect(rehearsal.world.provider.imported).toBeNull();
      expect(rehearsal.world.provider.media).toHaveLength(0);
      expect(rehearsal.world.provider.accessGate).toBe("enforced");
    });
  }

  it("aborts to Windows when the failure lands after TRANSFER_TO_PROVIDER but before the first write", async () => {
    const rehearsal = await readyRehearsal({ failAt: "afterTransferAuthority" });
    await expect(rehearsal.execute()).rejects.toBeTruthy();

    const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    expect(state.firstProviderCanonicalWriteAt).toBeNull();
    // The documented recovery matrix permits reversing authority while no provider write exists.
    expect(state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(inspectCombinedCutoverRecovery(state).rollbackLegal).toBe(true);
    expect(rehearsal.world.windows.canonicalWrites).toBe(true);
  });

  for (const stage of ["routingHandoff", "workerHandoff", "verifyPostHandoff"]) {
    it(`aborts to Windows when ${stage} fails before any provider canonical write`, async () => {
      const rehearsal = await readyRehearsal({ failAt: stage });
      await expect(rehearsal.execute()).rejects.toBeTruthy();
      const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
      expect(state.firstProviderCanonicalWriteAt).toBeNull();
      expect(state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
      expect(rehearsal.world.windows.canonicalWrites).toBe(true);
    });
  }
});

describe("synthetic combined cutover — first-write transaction failure injection", () => {
  for (const stage of ["beforeBoundaryClaim", "afterBoundaryClaimBeforeMutation", "afterMutationBeforeCommit"]) {
    it(`rolls back the whole boundary transaction when ${stage} fails`, async () => {
      const rehearsal = await readyRehearsal({ failAt: stage });
      await rehearsal.execute();
      await expect(rehearsal.crossFirstWriteBoundary()).rejects.toBeTruthy();

      const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
      expect(state.firstProviderCanonicalWriteAt).toBeNull();
      expect(state.firstProviderCommandId).toBeNull();
      expect(rehearsal.fixture.committedCanonicalRecords()).toHaveLength(0);
      // Authority stays provider; only the boundary failed. Rollback is still legal.
      expect(state.authority).toBe(RuntimeAuthority.PROVIDER);
      expect(inspectCombinedCutoverRecovery(state).rollbackLegal).toBe(true);
    });
  }
});

describe("synthetic combined cutover — post-boundary is forward-only", () => {
  it("classifies a failure after the boundary commit as forward recovery required", async () => {
    const rehearsal = await readyRehearsal({ failAt: "afterBoundaryCommit" });
    await rehearsal.execute();
    await expect(rehearsal.crossFirstWriteBoundary()).rejects.toBeTruthy();

    const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    // The transaction itself committed before the injected failure.
    expect(state.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(rehearsal.fixture.committedCanonicalRecords()).toHaveLength(1);

    const inspection = inspectCombinedCutoverRecovery(state);
    expect(inspection.classification).toBe("FORWARD_REPAIR_REQUIRED");
    expect(inspection.rollbackLegal).toBe(false);
    expect(inspection.forwardRecoveryRequired).toBe(true);
    expect(inspection.restartAdmissible).toBe(false);
  });

  it("PROOF: hard-crash ambiguity — provider evidence wins over a missing local mirror", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary();

    // Simulate the coordinating Windows process disappearing before any local mirror update:
    // no local migration-control state is consulted at all, only durable provider evidence.
    const durable = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    const localMirrorFirstPostgresWriteAt = null; // stale/never-written local value

    const inspection = inspectCombinedCutoverRecovery(durable);
    expect(localMirrorFirstPostgresWriteAt).toBeNull();
    expect(durable.firstProviderCanonicalWriteAt).not.toBeNull();
    expect(inspection.forwardRecoveryRequired).toBe(true);
    expect(inspection.rollbackLegal).toBe(false);
    expect(inspection.restartAdmissible).toBe(false);
  });

  it("refuses ABORT_TO_WINDOWS once the provider boundary is durable", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary();
    const state = (await rehearsal.authorityStore.read()).state;

    await expect(rehearsal.authorityStore.transition({
      action: RuntimeAuthorityAction.ABORT_TO_WINDOWS,
      expectedVersion: state.version,
      commandId: "synthetic:illegal-abort",
      migrationOperationId: rehearsal.identity.migrationOperationId,
      authorizationFingerprint: rehearsal.identity.authorizationFingerprint,
      reason: "Attempt illegal post-boundary rollback.",
    })).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_TRANSITION_REJECTED" });
  });
});

describe("synthetic combined cutover — 10-minute pre-write budget", () => {
  it("aborts without any provider write boundary when the budget expires mid-cutover", async () => {
    const clock = createDeterministicClock();
    // Burn the entire budget during packaging, after the fence but before authority transfer.
    const rehearsal = await readyRehearsal({
      clock,
      advanceAtStage: { stage: "exportFinalPackage", ms: 10 * 60_000 + 1 },
    });

    await expect(rehearsal.execute()).rejects.toMatchObject({
      code: "CUTOVER_WINDOW_EXCEEDED_BEFORE_FIRST_PROVIDER_WRITE",
    });

    const state = rehearsal.fixture.committedAuthority(REHEARSAL_ENVIRONMENT);
    expect(state.firstProviderCanonicalWriteAt).toBeNull();
    expect(state.authority).toBe(RuntimeAuthority.WINDOWS_LEGACY);
    expect(rehearsal.fixture.committedCanonicalRecords()).toHaveLength(0);
  });

  it("uses a 10-minute threshold and completes well inside it", async () => {
    const clock = createDeterministicClock();
    const rehearsal = await readyRehearsal({ clock });
    clock.advanceMs(60_000);
    const result = await rehearsal.execute();
    expect(result.classification).toBe("COMPLETED");
    const evidence = await rehearsal.evidence();
    expect(evidence.budgetThresholdMs).toBe(600_000);
    expect(evidence.budgetElapsedMs).toBeLessThan(600_000);
  });
});

describe("synthetic combined cutover — idempotency", () => {
  it("repeats authority initialization safely", async () => {
    const rehearsal = createSyntheticCombinedCutoverRehearsal();
    const first = await rehearsal.initializeAuthority();
    const second = await rehearsal.initializeAuthority();
    expect(first.outcome).toBe("initialized");
    expect(second.outcome).toBe("already-initialized");
  });

  it("replays an identical transfer delivery without duplicating the receipt", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    const receipts = rehearsal.timeline().filter((entry) => entry.stage === "transferSnapshot");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].outcome).toBe("received");
  });

  it("treats a byte-identical replay of an authority command as an idempotent replay", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    const state = (await rehearsal.authorityStore.read()).state;
    // A true replay carries the SAME expectedVersion the original command used, since
    // expectedVersion participates in the command fingerprint.
    const replay = await rehearsal.authorityStore.transition({
      action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
      expectedVersion: state.version - 1,
      commandId: "synthetic-cutover:transfer-to-provider",
      migrationOperationId: rehearsal.identity.migrationOperationId,
      authorizationFingerprint: rehearsal.identity.authorizationFingerprint,
      routingTarget: "synthetic-provider-ingress",
      reason: "Runtime, control, worker, persistence, and public routing authority transferred together.",
    });
    expect(replay.outcome).toBe("idempotent-replay");
    expect(replay.state.authority).toBe(RuntimeAuthority.PROVIDER);
  });

  it("fails closed when a command id is reused with different inputs", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    const state = (await rehearsal.authorityStore.read()).state;
    await expect(rehearsal.authorityStore.transition({
      action: RuntimeAuthorityAction.TRANSFER_TO_PROVIDER,
      expectedVersion: state.version - 1,
      commandId: "synthetic-cutover:transfer-to-provider",
      migrationOperationId: rehearsal.identity.migrationOperationId,
      authorizationFingerprint: rehearsal.identity.authorizationFingerprint,
      routingTarget: "a-different-route",
      reason: "Divergent replay.",
    })).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_COMMAND_REUSED" });
  });
});

describe("synthetic combined cutover — invalid start states", () => {
  it("refuses to execute without explicit production authorization", async () => {
    const rehearsal = await readyRehearsal();
    await expect(rehearsal.execute({ productionAuthorization: false }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_NOT_AUTHORIZED" });
  });

  it("refuses to start when the provider is already authoritative", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    await expect(rehearsal.execute({ commandPrefix: "synthetic-retry" }))
      .rejects.toMatchObject({ code: "CUTOVER_PREFLIGHT_AUTHORITY_REJECTED" });
  });

  it("refuses to start after the provider write boundary is durable", async () => {
    const rehearsal = await readyRehearsal();
    await rehearsal.execute();
    await rehearsal.crossFirstWriteBoundary();
    await expect(rehearsal.execute({ commandPrefix: "synthetic-retry" }))
      .rejects.toMatchObject({ code: "CUTOVER_PREFLIGHT_AUTHORITY_REJECTED" });
  });

  it("refuses to execute with a missing required identity field", async () => {
    const rehearsal = await readyRehearsal();
    await expect(rehearsal.execute({ routingTarget: "" }))
      .rejects.toMatchObject({ code: "COMBINED_CUTOVER_INPUT_INVALID" });
  });

  it("rejects a final snapshot that does not match the authorized Founder identity", async () => {
    const rehearsal = await readyRehearsal();
    await expect(rehearsal.execute({ expectedRuntimeRevision: 999 }))
      .rejects.toMatchObject({ code: "FINAL_SNAPSHOT_AUTHORIZATION_MISMATCH" });
  });
});

describe("synthetic combined cutover — recovery inspector", () => {
  it("treats a missing authority record as inadmissible rather than safe", () => {
    const inspection = inspectCombinedCutoverRecovery(null);
    expect(inspection.rollbackLegal).toBe(false);
    expect(inspection.restartAdmissible).toBe(false);
  });

  it("treats an explicit recovery-required authority as forward-only", () => {
    const inspection = inspectCombinedCutoverRecovery({
      authority: RuntimeAuthority.RECOVERY_REQUIRED, firstProviderCanonicalWriteAt: null,
    });
    expect(inspection.forwardRecoveryRequired).toBe(true);
    expect(inspection.rollbackLegal).toBe(false);
  });

  it("exposes every source-derived rehearsal stage", () => {
    expect(REHEARSAL_STAGES).toContain("beforeTransferAuthority");
    expect(REHEARSAL_STAGES).toContain("afterBoundaryClaimBeforeMutation");
    expect(REHEARSAL_STAGES.length).toBeGreaterThanOrEqual(23);
  });
});
