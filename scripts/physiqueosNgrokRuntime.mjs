export const NGROK_TASK_NAME = "PhysiqueOS Ngrok Tunnel";
export const NGROK_EXECUTABLE =
  "C:\\Users\\dusti\\AppData\\Local\\ngrok\\ngrok.exe";
export const NGROK_WORKING_DIRECTORY =
  "C:\\Users\\dusti\\AppData\\Local\\ngrok";
export const NGROK_ARGUMENTS = "http 3000";
export const NGROK_CONFIG =
  "C:\\Users\\dusti\\AppData\\Local\\ngrok\\ngrok.yml";

export function parseNgrokControlState(value) {
  if (!value || value.schemaVersion !== 1) return null;
  if (!["running", "stopped"].includes(value.ngrokDesiredState)) return null;
  return {
    schemaVersion: 1,
    ngrokDesiredState: value.ngrokDesiredState,
    ngrokChangedAt: value.ngrokChangedAt ?? null,
    ngrokChangedBy: value.ngrokChangedBy ?? null,
    lastNgrokRecoveryAttemptAt: value.lastNgrokRecoveryAttemptAt ?? null,
    lastNgrokRecoveryOutcome: value.lastNgrokRecoveryOutcome ?? null,
    consecutiveNgrokRecoveryFailures: Number.isInteger(value.consecutiveNgrokRecoveryFailures)
      ? Math.max(0, value.consecutiveNgrokRecoveryFailures)
      : 0,
    lastHealthyPublicUrl: value.lastHealthyPublicUrl ?? null,
    lastHealthyTunnelAt: value.lastHealthyTunnelAt ?? null,
  };
}

export function isCanonicalNgrokProcess(process, executable = NGROK_EXECUTABLE) {
  if (!process) return false;
  const path = String(process.executablePath ?? "").toLowerCase();
  const command = String(process.commandLine ?? "").toLowerCase();
  return path === executable.toLowerCase()
    && /\bhttp\s+(?:http:\/\/localhost:)?3000\b/.test(command);
}

export function decideNgrokMonitorAction({
  controlState,
  taskValid = true,
  executablePresent = true,
  taskState = "Ready",
  canonicalProcesses = [],
  foreignProcesses = [],
  tunnelHealthy = false,
  upstreamHealthy = true,
  withinStartupGrace = false,
  recoveryBackoffActive = false,
} = {}) {
  if (!controlState) return { outcome: "configuration_invalid", action: "none" };
  if (controlState.ngrokDesiredState === "stopped") {
    return { outcome: "intentionally_stopped", action: "none" };
  }
  if (!executablePresent) return { outcome: "executable_missing", action: "none" };
  if (!taskValid) return { outcome: "task_invalid", action: "none" };
  if (foreignProcesses.length) return { outcome: "foreign_process", action: "none" };
  if (canonicalProcesses.length > 1) return { outcome: "duplicate_tunnel", action: "none" };
  if (!upstreamHealthy) return { outcome: "upstream_unhealthy", action: "none" };
  if (canonicalProcesses.length === 1 && tunnelHealthy) {
    return { outcome: "healthy", action: "none" };
  }
  if (canonicalProcesses.length === 1) return { outcome: "tunnel_unhealthy", action: "none" };
  if (String(taskState).toLowerCase() === "running" || withinStartupGrace) {
    return { outcome: "starting", action: "none" };
  }
  if (recoveryBackoffActive) return { outcome: "recovery_failed", action: "none" };
  return { outcome: "recovery_pending", action: "start_task" };
}

export function redactNgrokSecrets(value) {
  return String(value ?? "")
    .replace(/((?:authtoken|token)(?:\s+|=|:\s*))\S+/gi, "$1<redacted>")
    .replace(/(Authorization:\s*(?:Bearer|Basic)\s+)\S+/gi, "$1<redacted>");
}
