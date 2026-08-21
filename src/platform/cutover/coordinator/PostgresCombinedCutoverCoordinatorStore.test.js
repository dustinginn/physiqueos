import { describe, expect, it } from "vitest";
import { createPostgresCombinedCutoverCoordinatorStore } from "./PostgresCombinedCutoverCoordinatorStore.js";
import { createCoordinatorBSnapshot } from "./combinedCutoverBSnapshot.js";

const identity = { runId: "phase7b-run-store-1", coordinatorOperationId: "coordinator-operation-1", migrationOperationId: "migration-operation-1", environment: "compatibility", authorizationFingerprint: "a".repeat(64), inputDigest: "b".repeat(64) };

describe("PostgresCombinedCutoverCoordinatorStore", () => {
  it("creates idempotently, CAS-advances, and rejects stale advancement", async () => {
    const fake = fakePool();
    const store = createPostgresCombinedCutoverCoordinatorStore({ pool: fake.pool });
    expect((await store.createRun(identity)).outcome).toBe("created");
    expect((await store.createRun(identity)).outcome).toBe("idempotent-replay");
    const begun = await store.beginStep({ runId: identity.runId, expectedVersion: 0, step: "A" });
    expect(begun.run).toMatchObject({ version: 1, currentStep: "A", stepStatus: "IN_PROGRESS_OR_UNRESOLVED" });
    await expect(store.beginStep({ runId: identity.runId, expectedVersion: 0, step: "A" })).rejects.toMatchObject({ code: "COORDINATOR_STALE_STATE" });
  });

  it("retains one exact B snapshot and rejects a conflict", async () => {
    const fake = fakePool(); const store = createPostgresCombinedCutoverCoordinatorStore({ pool: fake.pool });
    await store.createRun(identity);
    await store.recordStepOutcome({ runId: identity.runId, expectedVersion: 0, step: "A", status: "COMPLETED", completed: true });
    const begun = await store.beginStep({ runId: identity.runId, expectedVersion: 1, step: "B", approvalFingerprint: "c".repeat(64) });
    const snapshot = createCoordinatorBSnapshot({ run: begun.run, authority: { version: 3, authority: "windows-legacy-authoritative" }, capturedAt: "2026-08-21T06:00:00.000Z", snapshot: workerSnapshot() });
    const saved = await store.saveBSnapshot({ runId: identity.runId, expectedVersion: begun.run.version, snapshot });
    expect(saved.run.bSnapshotDigest).toBe(snapshot.digest);
    const changed = createCoordinatorBSnapshot({ run: begun.run, authority: { version: 4, authority: "windows-legacy-authoritative" }, capturedAt: "2026-08-21T06:00:01.000Z", snapshot: workerSnapshot() });
    await expect(store.saveBSnapshot({ runId: identity.runId, expectedVersion: saved.run.version, snapshot: changed })).rejects.toMatchObject({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" });
  });

  it("rejects a conflicting durable run identity", async () => {
    const store = createPostgresCombinedCutoverCoordinatorStore({ pool: fakePool().pool });
    await store.createRun(identity);
    await expect(store.createRun({ ...identity, environment: "other" })).rejects.toMatchObject({ code: "COORDINATOR_RUN_CONFLICT" });
  });

  it("CAS-reserves recovery before any external recovery mutation", async () => {
    const store = createPostgresCombinedCutoverCoordinatorStore({ pool: fakePool().pool });
    await store.createRun(identity);
    const reserved = await store.beginRecovery({ runId: identity.runId, expectedVersion: 0, approvalFingerprint: "c".repeat(64), recoveryStep: "RECOVER_TO_WINDOWS" });
    expect(reserved.run).toMatchObject({ version: 1, stepStatus: "IN_PROGRESS_OR_UNRESOLVED", failureCode: "COORDINATOR_RECOVERY_IN_PROGRESS", approvalFingerprints: { recovery: "c".repeat(64) } });
    await expect(store.beginRecovery({ runId: identity.runId, expectedVersion: 0, approvalFingerprint: "d".repeat(64), recoveryStep: "RECOVER_TO_WINDOWS" })).rejects.toMatchObject({ code: "COORDINATOR_STALE_STATE" });
  });
});

function fakePool() {
  let row = null;
  const query = async (sql, values = []) => {
    if (/INSERT INTO physiqueos\.combined_cutover_coordinator_runs/.test(sql)) {
      if (row) return { rows: [] };
      const now = new Date("2026-08-21T06:00:00.000Z");
      row = { run_id: values[0], schema_version: 1, coordinator_operation_id: values[1], migration_operation_id: values[2], environment: values[3], authorization_fingerprint: values[4], input_digest: values[5], version: 0, current_step: "A", step_status: "NOT_STARTED", completed_steps: [], evidence_refs: {}, approval_fingerprints: {}, b_snapshot: null, b_snapshot_digest: null, m_boundary_crossed: false, failure_code: null, created_at: now, updated_at: now };
      return { rows: [{ ...row }] };
    }
    if (/SELECT \* FROM physiqueos\.combined_cutover_coordinator_runs/.test(sql)) return { rows: row ? [{ ...row }] : [] };
    if (/UPDATE physiqueos\.combined_cutover_coordinator_runs SET/.test(sql)) {
      if (!row || row.version !== Number(values[10])) return { rows: [] };
      row = { ...row, version: row.version + 1, current_step: values[1], step_status: values[2], completed_steps: JSON.parse(values[3]), evidence_refs: JSON.parse(values[4]), approval_fingerprints: JSON.parse(values[5]), b_snapshot: values[6] == null ? null : JSON.parse(values[6]), b_snapshot_digest: values[7], m_boundary_crossed: values[8], failure_code: values[9], updated_at: new Date("2026-08-21T06:00:01.000Z") };
      return { rows: [{ ...row }] };
    }
    return { rows: [] };
  };
  const client = { query, release() {} };
  return { pool: { query, connect: async () => client } };
}
function workerSnapshot() { return { schemaVersion: 1, runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor", enabled: true, taskState: "ready", definitionSha256: "a".repeat(64) }, runtimeDesiredState: "running", ngrokDesiredState: "running", cadencePresent: false, productionServer: { taskName: "PhysiqueOS Production Server", taskState: "running", definitionSha256: "b".repeat(64), listenerPid: 4100, nodeOwnershipProven: true, runtimeMetadataMatches: true }, ngrok: { taskName: "PhysiqueOS Ngrok Tunnel", taskState: "running", definitionSha256: "c".repeat(64), processId: 4200, processOwnershipProven: true } }; }
