import { createHash } from "node:crypto";
import { CoordinatorErrorCode, coordinatorError, freeze, requireRunId } from "./combinedCutoverCoordinatorContract.js";

const TASKS = Object.freeze({ monitor: "PhysiqueOS Runtime Monitor", server: "PhysiqueOS Production Server", ngrok: "PhysiqueOS Ngrok Tunnel" });

export function createCoordinatorBSnapshot({ run, authority, snapshot, capturedAt }) {
  const safe = safeWorkerSnapshot(snapshot);
  const envelope = {
    schemaVersion: 1,
    runId: requireRunId(run?.runId),
    migrationOperationId: required(run?.migrationOperationId, "migrationOperationId"),
    authorityVersion: positiveInteger(authority?.version, "authority.version"),
    authority: required(authority?.authority, "authority.authority"),
    capturedAt: exactIso(capturedAt, "capturedAt"),
    snapshot: safe,
  };
  return freeze({ ...envelope, digest: snapshotDigest(envelope) });
}

export function validateCoordinatorBSnapshot(value, expected = {}) {
  if (!value || value.schemaVersion !== 1 || value.digest !== snapshotDigest({
    schemaVersion: value.schemaVersion, runId: value.runId, migrationOperationId: value.migrationOperationId,
    authorityVersion: value.authorityVersion, authority: value.authority, capturedAt: value.capturedAt, snapshot: value.snapshot,
  })) throw snapshotError("B snapshot digest is missing or invalid.");
  const normalized = createCoordinatorBSnapshot({
    run: { runId: value.runId, migrationOperationId: value.migrationOperationId },
    authority: { version: value.authorityVersion, authority: value.authority }, snapshot: value.snapshot, capturedAt: value.capturedAt,
  });
  if ((expected.runId && normalized.runId !== expected.runId) ||
      (expected.migrationOperationId && normalized.migrationOperationId !== expected.migrationOperationId) ||
      (expected.definitionSha256 && normalized.snapshot.runtimeMonitor.definitionSha256 !== expected.definitionSha256)) {
    throw snapshotError("B snapshot is bound to different run, operation, or task definition evidence.");
  }
  return normalized;
}

function safeWorkerSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || value.runtimeMonitor?.taskName !== TASKS.monitor ||
      typeof value.runtimeMonitor.enabled !== "boolean" || !["ready", "running", "disabled"].includes(String(value.runtimeMonitor.taskState)) ||
      !sha(value.runtimeMonitor.definitionSha256) || typeof value.cadencePresent !== "boolean" ||
      !["running", "stopped", "unknown"].includes(String(value.runtimeDesiredState)) ||
      !["running", "stopped", "unknown"].includes(String(value.ngrokDesiredState)) ||
      value.productionServer?.taskName !== TASKS.server || !sha(value.productionServer?.definitionSha256) ||
      typeof value.productionServer?.nodeOwnershipProven !== "boolean" || typeof value.productionServer?.runtimeMetadataMatches !== "boolean" ||
      value.ngrok?.taskName !== TASKS.ngrok || !sha(value.ngrok?.definitionSha256) || typeof value.ngrok?.processOwnershipProven !== "boolean") {
    throw snapshotError("B snapshot contains incomplete or unsafe worker evidence.");
  }
  return freeze({
    schemaVersion: 1,
    runtimeMonitor: freeze({ taskName: TASKS.monitor, enabled: value.runtimeMonitor.enabled, taskState: String(value.runtimeMonitor.taskState), definitionSha256: value.runtimeMonitor.definitionSha256 }),
    runtimeDesiredState: String(value.runtimeDesiredState), ngrokDesiredState: String(value.ngrokDesiredState), cadencePresent: value.cadencePresent,
    productionServer: freeze({ taskName: TASKS.server, taskState: String(value.productionServer.taskState ?? "unknown"), definitionSha256: value.productionServer.definitionSha256, listenerPid: positiveOrNull(value.productionServer.listenerPid), nodeOwnershipProven: value.productionServer.nodeOwnershipProven, runtimeMetadataMatches: value.productionServer.runtimeMetadataMatches }),
    ngrok: freeze({ taskName: TASKS.ngrok, taskState: String(value.ngrok.taskState ?? "unknown"), definitionSha256: value.ngrok.definitionSha256, processId: positiveOrNull(value.ngrok.processId), processOwnershipProven: value.ngrok.processOwnershipProven }),
  });
}
function snapshotDigest(value) { return createHash("sha256").update(stable(value)).digest("hex"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function sha(value) { return /^[0-9a-f]{64}$/.test(String(value ?? "")); }
function positiveInteger(value, field) { const number = Number(value); if (!Number.isInteger(number) || number < 0) throw snapshotError(`${field} is invalid.`); return number; }
function positiveOrNull(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function exactIso(value, field) { let exact = false; try { exact = typeof value === "string" && new Date(value).toISOString() === value; } catch { exact = false; } if (!exact) throw snapshotError(`${field} is invalid.`); return value; }
function required(value, field) { const result = String(value ?? "").trim(); if (!result) throw snapshotError(`${field} is required.`); return result; }
function snapshotError(message) { return coordinatorError(CoordinatorErrorCode.SNAPSHOT_CONFLICT, message); }
