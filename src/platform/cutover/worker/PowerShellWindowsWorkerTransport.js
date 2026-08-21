import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  WorkerMutationClassification,
  workerControlError,
  WorkerErrorCode,
} from "./combinedCutoverWorkerControl.js";

const OPERATIONS = Object.freeze({
  inspectRuntimeMonitor: Object.freeze({ command: "inspect-runtime-monitor", mutation: false }),
  quiesceRuntimeMonitor: Object.freeze({ command: "quiesce-runtime-monitor", mutation: true }),
  restoreRuntimeMonitor: Object.freeze({ command: "restore-runtime-monitor", mutation: true }),
  inspectProductionServer: Object.freeze({ command: "inspect-production-server", mutation: false }),
  retireProductionServer: Object.freeze({ command: "retire-production-server", mutation: true }),
  inspectNgrok: Object.freeze({ command: "inspect-ngrok", mutation: false }),
  retireNgrok: Object.freeze({ command: "retire-ngrok", mutation: true }),
});

const DEFAULT_SCRIPT_PATH = fileURLToPath(new URL("../../../../scripts/phase7bWindowsWorkerControl.ps1", import.meta.url));
const DEFAULT_POWERSHELL_PATH = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

/** Fixed-operation bridge. Migration code never receives a PowerShell command or task/process name. */
export function createPowerShellWindowsWorkerTransport({
  execFile = promisify(nodeExecFile),
  powershellPath = DEFAULT_POWERSHELL_PATH,
  scriptPath = DEFAULT_SCRIPT_PATH,
  timeoutMs = 30_000,
  maximumOutputBytes = 1024 * 1024,
} = {}) {
  if (typeof execFile !== "function") throw new Error("Windows worker transport requires execFile.");
  boundedInteger(timeoutMs, "timeoutMs", 1, 300_000);
  boundedInteger(maximumOutputBytes, "maximumOutputBytes", 1024, 1024 * 1024);

  async function invoke(operationName, payload = {}) {
    const operation = OPERATIONS[operationName];
    if (!operation) throw new Error("Unknown Windows worker operation.");
    const encoded = encodePayload(payload);
    let stdout;
    try {
      const result = await execFile(powershellPath, [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", scriptPath, "-Operation", operation.command, "-PayloadBase64", encoded,
      ], { timeout: timeoutMs, maxBuffer: maximumOutputBytes, windowsHide: true });
      stdout = result?.stdout;
    } catch (error) {
      const parsed = parseResult(error?.stdout, maximumOutputBytes);
      if (parsed?.ok === false && parsed.classification === "rejected") {
        throw transportError(operation.mutation ? WorkerMutationClassification.REJECTED : null, parsed.code, parsed.message);
      }
      throw transportError(operation.mutation ? WorkerMutationClassification.AMBIGUOUS : null,
        operation.mutation ? WorkerErrorCode.AMBIGUOUS : WorkerErrorCode.UNAVAILABLE,
        operation.mutation ? "Windows worker mutation outcome is ambiguous; bounded readback is required." : "Windows worker inspection failed.");
    }
    const parsed = parseResult(stdout, maximumOutputBytes);
    if (!parsed || parsed.ok !== true || parsed.operation !== operation.command || !parsed.evidence) {
      throw transportError(operation.mutation ? WorkerMutationClassification.AMBIGUOUS : null,
        operation.mutation ? WorkerErrorCode.AMBIGUOUS : WorkerErrorCode.UNAVAILABLE,
        operation.mutation ? "Windows worker mutation returned unclassifiable evidence." : "Windows worker inspection returned unclassifiable evidence.");
    }
    return Object.freeze({
      classification: operation.mutation ? WorkerMutationClassification.ACCEPTED : null,
      evidence: freeze(parsed.evidence),
    });
  }

  return Object.freeze({
    kind: "powershell-windows-worker-transport",
    inspectRuntimeMonitor: (payload) => invoke("inspectRuntimeMonitor", payload),
    quiesceRuntimeMonitor: (payload) => invoke("quiesceRuntimeMonitor", payload),
    restoreRuntimeMonitor: (payload) => invoke("restoreRuntimeMonitor", payload),
    inspectProductionServer: (payload) => invoke("inspectProductionServer", payload),
    retireProductionServer: (payload) => invoke("retireProductionServer", payload),
    inspectNgrok: (payload) => invoke("inspectNgrok", payload),
    retireNgrok: (payload) => invoke("retireNgrok", payload),
  });
}

function transportError(classification, code, message) {
  return workerControlError(code || WorkerErrorCode.UNAVAILABLE, message, classification ? { classification } : {});
}

function encodePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Windows worker payload must be an object.");
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > 64 * 1024) throw new Error("Windows worker payload exceeds 64 KiB.");
  return Buffer.from(json, "utf8").toString("base64");
}

function parseResult(value, maximumBytes) {
  const text = String(value ?? "").trim();
  if (!text || Buffer.byteLength(text) > maximumBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
}

function freeze(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
}
