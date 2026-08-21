import { describe, expect, it } from "vitest";
import { createCoordinatorBSnapshot, validateCoordinatorBSnapshot } from "./combinedCutoverBSnapshot.js";

const run = { runId: "phase7b-run-snapshot-1", migrationOperationId: "migration-operation-1" };
const authority = { version: 3, authority: "windows-legacy-authoritative" };
const capturedAt = "2026-08-21T06:00:00.000Z";
const snapshot = {
  schemaVersion: 1,
  runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor", enabled: true, taskState: "ready", definitionSha256: "a".repeat(64) },
  runtimeDesiredState: "running", ngrokDesiredState: "running", cadencePresent: false,
  productionServer: { taskName: "PhysiqueOS Production Server", taskState: "running", definitionSha256: "b".repeat(64), listenerPid: 4100, nodeOwnershipProven: true, runtimeMetadataMatches: true },
  ngrok: { taskName: "PhysiqueOS Ngrok Tunnel", taskState: "running", definitionSha256: "c".repeat(64), processId: 4200, processOwnershipProven: true },
};

describe("coordinator B restoration snapshot", () => {
  it("round-trips only exact source-owned bounded identity", () => {
    const envelope = createCoordinatorBSnapshot({ run, authority, snapshot, capturedAt });
    expect(validateCoordinatorBSnapshot(envelope, { runId: run.runId, migrationOperationId: run.migrationOperationId, definitionSha256: "a".repeat(64) })).toEqual(envelope);
    expect(JSON.stringify(envelope)).not.toMatch(/commandLine|taskXml|credential|token|environment/i);
  });

  it.each([
    ["wrong monitor task", { runtimeMonitor: { ...snapshot.runtimeMonitor, taskName: "Other Task" } }],
    ["wrong definition hash", { runtimeMonitor: { ...snapshot.runtimeMonitor, definitionSha256: "not-a-hash" } }],
    ["partial server", { productionServer: { ...snapshot.productionServer, nodeOwnershipProven: undefined } }],
    ["unexpected cadence shape", { cadencePresent: "false" }],
    ["wrong desired state", { runtimeDesiredState: "maybe" }],
    ["wrong ngrok ownership", { ngrok: { ...snapshot.ngrok, processOwnershipProven: undefined } }],
  ])("rejects %s", (_label, patch) => {
    expect(() => createCoordinatorBSnapshot({ run, authority, snapshot: { ...snapshot, ...patch }, capturedAt })).toThrow(expect.objectContaining({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" }));
  });

  it("rejects stale run/operation and any digest tampering", () => {
    const envelope = createCoordinatorBSnapshot({ run, authority, snapshot, capturedAt });
    expect(() => validateCoordinatorBSnapshot(envelope, { runId: "another-run-0001" })).toThrow(expect.objectContaining({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" }));
    expect(() => validateCoordinatorBSnapshot({ ...envelope, digest: "f".repeat(64) }, { runId: run.runId })).toThrow(expect.objectContaining({ code: "COORDINATOR_B_SNAPSHOT_CONFLICT" }));
  });
});
