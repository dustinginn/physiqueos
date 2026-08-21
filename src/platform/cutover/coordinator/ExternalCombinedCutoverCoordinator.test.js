import { describe, expect, it, vi } from "vitest";
import { createExternalCombinedCutoverCoordinator, coordinatorInputDigest } from "./ExternalCombinedCutoverCoordinator.js";
import { coordinatorStateDigest } from "./combinedCutoverCoordinatorAuthorization.js";
import { CoordinatorStepStatus } from "./combinedCutoverCoordinatorContract.js";
import { createMemoryCoordinatorStore } from "./testSupport/memoryCoordinatorStore.js";
import { createDeterministicAuthorityStore, createDeterministicCoordinatorServices } from "./testSupport/deterministicCoordinatorServices.js";

const RUN_ID = "phase7b-run-0001";
const OPERATION_ID = "migration-operation-1";
const NOW = "2026-08-21T06:00:00.000Z";
const GATED = new Set(["B","L","M","N_O"]);

describe("external resumable A-P coordinator", () => {
  it("runs the source-owned A/B/C-D/E/F-G/H-I-J/K/L/M/N-O/P sequence and reports all letters", async () => {
    const f = await fixture();
    for (let count = 0; count < 11; count += 1) await advanceCurrent(f);
    const report = await f.coordinator.inspect({ runId: RUN_ID, input: f.input });
    expect(report).toMatchObject({ durablePhase: "COMPLETE", nextLegalStep: "COMPLETE", mOccurred: true, rollbackToWindowsLegal: false, providerForwardRecoveryRequired: true, routingRole: "provider", workerRole: "provider" });
    expect(report.completedSteps).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"]);
    expect(f.deterministic.counts()).toMatchObject({ A: 1, "B:fence": 1, "B:capture": 1, "B:cadence": 1, C_D: 1, E: 1, F_G: 1, H_I_J: 1, K: 1, L: 1, M: 1, N_O: 1, P: 1 });
  });

  it("inspection is read-only and reports the exact next legal action before A", async () => {
    const f = await fixture();
    expect(await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).toMatchObject({ durablePhase: "A", nextLegalStep: "A", completedSteps: [], mOccurred: false, rollbackToWindowsLegal: true });
    expect(f.deterministic.counts()).toEqual({});
  });

  it("requires complete A preparation categories and does not falsely pass partial TLS evidence", async () => {
    const f = await fixture({ modes: { APartial: "tlsSni" } });
    const result = await f.coordinator.advance({ runId: RUN_ID, input: f.input });
    expect(result.classification).toBe(CoordinatorStepStatus.BLOCKED_PRECONDITION);
    expect((await f.store.readRun(RUN_ID)).run.currentStep).toBe("A");
  });

  it("persists the exact safe B snapshot before monitor mutation and touches neither server nor ngrok", async () => {
    const f = await fixture();
    await advanceCurrent(f); // A
    await advanceCurrent(f); // B
    const run = (await f.store.readRun(RUN_ID)).run;
    expect(run.bSnapshot).toMatchObject({ runId: RUN_ID, migrationOperationId: OPERATION_ID, snapshot: { runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor" }, productionServer: { listenerPid: 4100 }, ngrok: { processId: 4200 } } });
    expect(JSON.stringify(run.bSnapshot)).not.toMatch(/commandLine|taskXml|credential|token|environment/i);
    expect(f.deterministic.counts()).toMatchObject({ "B:fence": 1, "B:capture": 1, "B:cadence": 1 });
  });

  it("fails closed on a conflicting B snapshot and wrong-run snapshot binding", async () => {
    const f = await fixture();
    await advanceCurrent(f);
    const approval = await approvalFor(f, "B");
    let run = (await f.store.readRun(RUN_ID)).run;
    run = (await f.store.beginStep({ runId: RUN_ID, expectedVersion: run.version, step: "B", approvalFingerprint: approval.authorizationId })).run;
    const bad = { schemaVersion: 1, runId: "another-run-0001", migrationOperationId: OPERATION_ID, authorityVersion: 0, authority: "windows-legacy-authoritative", capturedAt: NOW, snapshot: f.deterministic.snapshot, digest: "f".repeat(64) };
    await expect(f.store.saveBSnapshot({ runId: RUN_ID, expectedVersion: run.version, snapshot: bad })).rejects.toMatchObject({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" });
  });

  it("binds dangerous approvals to run, step, prior version/digest, and expiry", async () => {
    const f = await fixture(); await advanceCurrent(f);
    const correct = await approvalFor(f, "B");
    for (const override of [{ runId: "different-run-0001" }, { step: "L" }, { expectedCoordinatorVersion: 999 }, { priorStateDigest: "0".repeat(64) }, { expiresAt: "2026-08-21T05:59:59.000Z" }]) {
      await expect(f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: { ...correct, ...override } })).rejects.toMatchObject({ code: "COORDINATOR_AUTHORIZATION_STALE" });
    }
    expect(f.deterministic.counts()["B:fence"]).toBeUndefined();
  });

  it("rejects future-issued, cross-phase, consumed, and replayed approvals before mutation", async () => {
    const f = await fixture(); await advanceCurrent(f);
    const approval = await approvalFor(f, "B");
    await expect(f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: { ...approval, authorizedAt: "2026-08-21T06:00:01.000Z" } })).rejects.toMatchObject({ code: "COORDINATOR_AUTHORIZATION_STALE" });
    await expect(f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: { ...approval, step: "M" } })).rejects.toMatchObject({ code: "COORDINATOR_AUTHORIZATION_STALE" });
    await f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: approval });
    await expect(f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: approval })).rejects.toMatchObject({ code: "COORDINATOR_AUTHORIZATION_STALE" });
    expect(f.deterministic.counts()["B:fence"]).toBe(1);
  });

  it("rejects a coordinator receipt or input from another run/operation", async () => {
    const f = await fixture();
    await expect(f.coordinator.inspect({ runId: RUN_ID, input: { ...f.input, migrationOperationId: "other-operation-1" } })).rejects.toMatchObject({ code: "COORDINATOR_IDENTITY_MISMATCH" });
  });

  it("uses durable M evidence after a lost response and never retries the first command", async () => {
    const f = await fixture({ modes: { M: "response-lost-applied" } });
    await advanceThrough(f, "L");
    const result = await advanceCurrent(f);
    expect(result.classification).toBe(CoordinatorStepStatus.IRREVERSIBLE_BOUNDARY_CROSSED);
    expect(f.deterministic.counts().M).toBe(1);
    expect((await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).mOccurred).toBe(true);
  });

  it("stops M ambiguous on a mismatched firstProviderCommandId and cannot cross N/O", async () => {
    const f = await fixture({ modes: { M: "ambiguous-unknown" } });
    await advanceThrough(f, "L");
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect((await f.store.readRun(RUN_ID)).run.currentStep).toBe("M");
    expect(f.deterministic.counts().N_O).toBeUndefined();
  });

  it.each([
    ["timestamp without command", { firstProviderCanonicalWriteAt: "2026-08-21T06:05:00.000Z", firstProviderCommandId: null }],
    ["command without timestamp", { firstProviderCanonicalWriteAt: null, firstProviderCommandId: "phase7b-coordinator:first-provider-command" }],
    ["mismatched command", { firstProviderCanonicalWriteAt: "2026-08-21T06:05:00.000Z", firstProviderCommandId: "another-command" }],
  ])("treats partial M evidence as ambiguous and dispatches no command: %s", async (_label, patch) => {
    const f = await fixture(); await advanceUntilCurrent(f, "M"); f.authority.patch(patch);
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect(f.deterministic.counts().M).toBeUndefined();
    expect(f.deterministic.counts().N_O).toBeUndefined();
  });

  it("treats a conclusively absent/rejected M command as retryable only on a later invocation", async () => {
    const f = await fixture({ modes: { M: "rejected" } }); await advanceUntilCurrent(f, "M");
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_CONCLUSIVE);
    expect(f.deterministic.counts().M).toBe(1);
    expect(f.deterministic.counts().N_O).toBeUndefined();
  });

  it("blocks M when provider authority drifted before the command", async () => {
    const f = await fixture(); await advanceUntilCurrent(f, "M"); f.authority.patch({ authority: "windows-legacy-authoritative" });
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.BLOCKED_PRECONDITION);
    expect(f.deterministic.counts().M).toBeUndefined();
  });

  it("does not retire Windows when provider deployment/worker evidence is wrong", async () => {
    const f = await fixture({ wrongDeployment: true });
    await advanceThrough(f, "M");
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.BLOCKED_PRECONDITION);
    expect(f.deterministic.counts().N_O).toBeUndefined();
  });

  it("requires every explicit P stabilization category rather than a timer", async () => {
    const f = await fixture({ modes: { PPartial: "backups" } });
    await advanceThrough(f, "N_O");
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.BLOCKED_PRECONDITION);
  });

  it("serializes concurrent advancement and performs one mutation", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.coordinator.advance({ runId: RUN_ID, input: f.input }),
      f.coordinator.advance({ runId: RUN_ID, input: f.input }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0].reason).toMatchObject({ code: "COORDINATOR_STALE_STATE" });
    expect(f.deterministic.counts().A).toBe(1);
  });

  it("rejects duplicate B authorization advancement through CAS and mutates once", async () => {
    const f = await fixture(); await advanceCurrent(f);
    const authorization = await approvalFor(f, "B");
    const results = await Promise.allSettled([
      f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization }),
      f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(f.deterministic.counts()["B:fence"]).toBe(1);
    expect(f.deterministic.counts()["B:cadence"]).toBe(1);
  });

  it("rejects routing evidence bound to another coordinator run", async () => {
    const f = await fixture({ wrongRoutingRun: true }); await advanceUntilCurrent(f, "L");
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.BLOCKED_PRECONDITION);
    expect(f.deterministic.counts().L).toBeUndefined();
  });

  it("serializes an M race so only one first provider command can execute", async () => {
    const f = await fixture(); await advanceUntilCurrent(f, "M");
    const authorization = await approvalFor(f, "M");
    const results = await Promise.allSettled([
      f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization }),
      f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(f.deterministic.counts().M).toBe(1);
  });

  it("uses only injected deterministic services and performs no live network call", async () => {
    const live = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("LIVE_NETWORK_DISABLED"));
    try {
      const f = await fixture();
      for (let count = 0; count < 11; count += 1) await advanceCurrent(f);
      expect(live).not.toHaveBeenCalled();
    } finally { live.mockRestore(); }
  });
});

describe("crash/resume and ambiguity", () => {
  it.each([
    ["E transfer", "E"], ["F/G import-preparation", "F_G"], ["L routing", "L"],
    ["N/O worker verification-retirement", "N_O"], ["P stabilization", "P"],
  ])("reconciles a crash after durable %s application without duplicating mutation", async (_label, target) => {
    const f = await fixture({ modes: { [target]: "crash-after-apply" } });
    await advanceUntilCurrent(f, target);
    await expect(advanceCurrent(f)).rejects.toMatchObject({ simulatedCrash: true });
    const restarted = createExternalCombinedCutoverCoordinator({ store: f.store, authorityStore: f.authority, services: f.deterministic.services, now: () => new Date(NOW) });
    await expect(restarted.advance({ runId: RUN_ID, input: f.input })).resolves.toMatchObject({ classification: target === "M" ? CoordinatorStepStatus.IRREVERSIBLE_BOUNDARY_CROSSED : CoordinatorStepStatus.COMPLETED });
    expect(f.deterministic.counts()[target]).toBe(1);
  });

  it("resumes a crash after fence acceptance before monitor mutation without refencing", async () => {
    const f = await fixture({ modes: { "B:fence": "crash-after-apply" } }); await advanceCurrent(f);
    await expect(advanceCurrent(f)).rejects.toMatchObject({ simulatedCrash: true });
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_CONCLUSIVE); // reconciliation only
    f.deterministic.setMode("B:fence", "accepted");
    await advanceCurrent(f);
    expect(f.deterministic.counts()).toMatchObject({ "B:fence": 1, "B:capture": 1, "B:cadence": 1 });
  });

  it("resumes a crash after monitor mutation using the already durable B snapshot", async () => {
    const f = await fixture({ modes: { "B:cadence": "crash-after-apply" } }); await advanceCurrent(f);
    await expect(advanceCurrent(f)).rejects.toMatchObject({ simulatedCrash: true });
    const during = (await f.store.readRun(RUN_ID)).run;
    expect(during.bSnapshotDigest).toMatch(/^[0-9a-f]{64}$/);
    await advanceCurrent(f);
    expect(f.deterministic.counts()["B:cadence"]).toBe(1);
  });

  it("proves the legal next step after A, K, L, and durable M restart boundaries", async () => {
    const f = await fixture();
    await advanceCurrent(f); expect((await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).nextLegalStep).toBe("B");
    await advanceThrough(f, "K"); expect((await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).nextLegalStep).toBe("L");
    await advanceCurrent(f); expect((await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).nextLegalStep).toBe("M");
    await advanceCurrent(f); expect((await f.coordinator.inspect({ runId: RUN_ID, input: f.input })).nextLegalStep).toBe("N_O");
  });

  it.each([["Runtime Monitor B", "B:cadence", "B"], ["routing L", "L", "L"], ["Production Server N/O", "N_O", "N_O"], ["Ngrok N/O", "N_O", "N_O"]])
  ("keeps ambiguous %s mutation reconciliation-only with zero retry", async (_label, modeKey, target) => {
    const f = await fixture({ modes: { [modeKey]: "ambiguous-unreadable" } });
    await advanceUntilCurrent(f, target);
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect(f.deterministic.counts()[modeKey]).toBe(1);
  });

  it("reconciles a crash immediately after durable M commit without a second first command", async () => {
    const f = await fixture({ modes: { M: "crash-after-apply" } }); await advanceUntilCurrent(f, "M");
    await expect(advanceCurrent(f)).rejects.toMatchObject({ simulatedCrash: true });
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.IRREVERSIBLE_BOUNDARY_CROSSED);
    expect(f.deterministic.counts().M).toBe(1);
  });

  it("a crash during provider-worker verification performs reconciliation before a separately authorized retry", async () => {
    const f = await fixture({ modes: { N_O: "crash-before-apply" } }); await advanceUntilCurrent(f, "N_O");
    await expect(advanceCurrent(f)).rejects.toMatchObject({ simulatedCrash: true });
    expect((await advanceCurrent(f)).classification).toBe(CoordinatorStepStatus.FAILED_CONCLUSIVE);
    expect(f.deterministic.completed()).not.toContain("N_O");
    f.deterministic.setMode("N_O", "accepted");
    await advanceCurrent(f);
    expect(f.deterministic.counts().N_O).toBe(2); // first call crashed before mutation; second was a new approved invocation
  });
});

describe("recovery direction", () => {
  it("pre-M recovery uses the durable B snapshot and reports Windows restoration", async () => {
    const f = await fixture(); await advanceThrough(f, "B");
    const result = await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") });
    expect(result.classification).toBe(CoordinatorStepStatus.ABORTED_TO_WINDOWS);
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it.each(["route-restoration", "runtime-monitor-restoration"])("fails ambiguous %s closed and performs readback only on repeat", async () => {
    const f = await fixture({ modes: { windowsRecovery: "ambiguous" } }); await advanceThrough(f, "B");
    expect((await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") })).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect((await f.coordinator.recover({ runId: RUN_ID, input: f.input })).reconciliationOnly).toBe(true);
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it("after M refuses Windows rollback and enters provider-forward recovery", async () => {
    const f = await fixture(); await advanceThrough(f, "M");
    const report = await f.coordinator.inspect({ runId: RUN_ID, input: f.input });
    expect(report).toMatchObject({ rollbackToWindowsLegal: false, providerForwardRecoveryRequired: true });
    const result = await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "PROVIDER_FORWARD_RECOVERY") });
    expect(result.classification).toBe(CoordinatorStepStatus.PROVIDER_FORWARD_RECOVERY);
  });

  it("refuses both recovery directions while M durable evidence is mismatched", async () => {
    const f = await fixture({ modes: { M: "ambiguous-unknown" } }); await advanceThrough(f, "L"); await advanceCurrent(f);
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "PROVIDER_FORWARD_RECOVERY") })).rejects.toMatchObject({ code: "COORDINATOR_FIRST_WRITE_AMBIGUOUS" });
    expect(f.deterministic.state().recoveryCalls).toBe(0);
  });

  it("keeps ambiguous provider-forward recovery readback-only on restart", async () => {
    const f = await fixture({ modes: { providerRecovery: "ambiguous" } }); await advanceThrough(f, "M");
    expect((await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "PROVIDER_FORWARD_RECOVERY") })).classification).toBe(CoordinatorStepStatus.FAILED_AMBIGUOUS);
    expect((await f.coordinator.recover({ runId: RUN_ID, input: f.input })).reconciliationOnly).toBe(true);
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it("CAS-reserves pre-M recovery so concurrent callers perform one Windows mutation", async () => {
    const f = await fixture(); await advanceThrough(f, "B");
    const authorization = await approvalFor(f, "RECOVER_TO_WINDOWS");
    const results = await Promise.allSettled([
      f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization }),
      f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0].reason).toMatchObject({ code: "COORDINATOR_STALE_STATE" });
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it("CAS-reserves post-M recovery so concurrent callers perform one forward mutation", async () => {
    const f = await fixture(); await advanceThrough(f, "M");
    const authorization = await approvalFor(f, "PROVIDER_FORWARD_RECOVERY");
    const results = await Promise.allSettled([
      f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization }),
      f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0].reason).toMatchObject({ code: "COORDINATOR_STALE_STATE" });
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it.each([["pre-M", "windowsRecovery", "B", "RECOVER_TO_WINDOWS"], ["post-M", "providerRecovery", "M", "PROVIDER_FORWARD_RECOVERY"]])
  ("reconciles a crash after applied %s recovery without repeating mutation", async (_label, mode, through, recoveryStep) => {
    const f = await fixture({ modes: { [mode]: "crash-after-apply" } }); await advanceThrough(f, through);
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, recoveryStep) })).rejects.toMatchObject({ simulatedCrash: true });
    const restarted = createExternalCombinedCutoverCoordinator({ store: f.store, authorityStore: f.authority, services: f.deterministic.services, now: () => new Date(NOW) });
    await expect(restarted.recover({ runId: RUN_ID, input: f.input })).resolves.toMatchObject({ reconciliationOnly: true });
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it("keeps a crash-before-recovery-mutation reserved and inspection-only", async () => {
    const f = await fixture({ modes: { windowsRecovery: "crash-before-apply" } }); await advanceThrough(f, "B");
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") })).rejects.toMatchObject({ simulatedCrash: true });
    expect(await f.coordinator.recover({ runId: RUN_ID, input: f.input })).toMatchObject({ classification: "IN_PROGRESS_OR_UNRESOLVED", reconciliationOnly: true, mutationDispatched: false });
    expect(f.deterministic.state().recoveryCalls).toBe(1);
  });

  it("requires one fresh approval to clear proven-not-applied recovery and another to retry", async () => {
    const f = await fixture({ modes: { windowsRecovery: "crash-before-apply" } }); await advanceThrough(f, "B");
    const original = await approvalFor(f, "RECOVER_TO_WINDOWS");
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: original })).rejects.toMatchObject({ simulatedCrash: true });
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: original })).rejects.toMatchObject({ code: "COORDINATOR_AUTHORIZATION_STALE" });
    expect(await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") })).toMatchObject({ classification: "FAILED_CONCLUSIVE", reconciliationOnly: true, mutationDispatched: false });
    expect(f.deterministic.state().recoveryCalls).toBe(1);
    f.deterministic.setMode("windowsRecovery", "accepted");
    expect(await f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") })).toMatchObject({ classification: "ABORTED_TO_WINDOWS" });
    expect(f.deterministic.state().recoveryCalls).toBe(2);
  });

  it("refuses pre-M recovery before B produced a durable restoration snapshot", async () => {
    const f = await fixture();
    await expect(f.coordinator.recover({ runId: RUN_ID, input: f.input, authorization: await approvalFor(f, "RECOVER_TO_WINDOWS") })).rejects.toMatchObject({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" });
    expect((await f.store.readRun(RUN_ID)).run).toMatchObject({ version: 0, stepStatus: "NOT_STARTED" });
    expect(f.deterministic.state().recoveryCalls).toBe(0);
  });
});

async function fixture({ modes = {}, wrongDeployment = false, wrongRoutingRun = false } = {}) {
  const authority = createDeterministicAuthorityStore();
  const deterministic = createDeterministicCoordinatorServices({ authorityStore: authority, modes, wrongDeployment, wrongRoutingRun });
  const store = createMemoryCoordinatorStore({ now: () => new Date(NOW) });
  const coordinator = createExternalCombinedCutoverCoordinator({ store, authorityStore: authority, services: deterministic.services, now: () => new Date(NOW) });
  const input = inputFixture();
  await coordinator.createRun({ identity: { runId: RUN_ID, coordinatorOperationId: "coordinator-operation-1", migrationOperationId: OPERATION_ID, environment: "compatibility-phase7b", authorizationFingerprint: "a".repeat(64), inputDigest: coordinatorInputDigest(input) } });
  return { authority, deterministic, store, coordinator, input };
}
async function advanceCurrent(f) { const run = (await f.store.readRun(RUN_ID)).run; return f.coordinator.advance({ runId: RUN_ID, input: f.input, authorization: GATED.has(run.currentStep) ? await approvalFor(f, run.currentStep) : null }); }
async function advanceThrough(f, target) { while (!(await f.store.readRun(RUN_ID)).run.completedSteps.includes(target)) await advanceCurrent(f); }
async function advanceUntilCurrent(f, target) { while ((await f.store.readRun(RUN_ID)).run.currentStep !== target) await advanceCurrent(f); }
async function approvalFor(f, step) { const run = (await f.store.readRun(RUN_ID)).run; const authority = (await f.authority.read()).state; return { authorized: true, runId: RUN_ID, step, expectedCoordinatorVersion: run.version, authorizationId: `founder-${step.toLowerCase().replaceAll("_", "-")}-0001`, authorizedAt: NOW, expiresAt: "2026-08-21T06:10:00.000Z", priorStateDigest: coordinatorStateDigest(run, authority) }; }
function inputFixture() { return { migrationOperationId: OPERATION_ID, commandPrefix: "phase7b-coordinator", authorizationFingerprint: "a".repeat(64), expectedRuntimeSha256: "b".repeat(64), expectedRuntimeRevision: 358, providerDeploymentId: "deployment-exact-1", providerBuildId: "phase7b-build-exact", routingTarget: "provider", firstProviderCommandId: "phase7b-coordinator:first-provider-command" }; }
