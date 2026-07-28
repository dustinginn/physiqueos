import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NGROK_ARGUMENTS,
  NGROK_EXECUTABLE,
  NGROK_TASK_NAME,
  NGROK_WORKING_DIRECTORY,
  decideNgrokMonitorAction,
  isCanonicalNgrokProcess,
  parseNgrokControlState,
  redactNgrokSecrets,
} from "./physiqueosNgrokRuntime.mjs";

const script = (name) => fs.readFileSync(path.join(process.cwd(), "scripts", name), "utf8");

describe("PhysiqueOS ngrok runtime contract", () => {
  it("defines one direct stable task action", () => {
    expect(NGROK_TASK_NAME).toBe("PhysiqueOS Ngrok Tunnel");
    expect(NGROK_EXECUTABLE).toBe("C:\\Users\\dusti\\AppData\\Local\\ngrok\\ngrok.exe");
    expect(NGROK_ARGUMENTS).toBe("http 3000");
    expect(NGROK_WORKING_DIRECTORY).toBe("C:\\Users\\dusti\\AppData\\Local\\ngrok");
    expect(`${NGROK_EXECUTABLE} ${NGROK_ARGUMENTS}`).not.toMatch(/\b(?:npm|npx|cmd|powershell|pwsh|node)\b/i);
  });

  it("fails malformed control state safely", () => {
    expect(parseNgrokControlState({ schemaVersion: 1, ngrokDesiredState: "maybe" })).toBeNull();
    expect(parseNgrokControlState({ schemaVersion: 1, ngrokDesiredState: "stopped" }).ngrokDesiredState).toBe("stopped");
  });

  it("identifies canonical processes by path and invocation", () => {
    expect(isCanonicalNgrokProcess({
      executablePath: NGROK_EXECUTABLE,
      commandLine: `"${NGROK_EXECUTABLE}" http 3000`,
    })).toBe(true);
    expect(isCanonicalNgrokProcess({
      executablePath: "C:\\temp\\ngrok.exe",
      commandLine: "ngrok http 3000",
    })).toBe(false);
  });

  it("does nothing for healthy, stopped, starting, foreign, duplicate, and unhealthy upstream states", () => {
    const running = parseNgrokControlState({ schemaVersion: 1, ngrokDesiredState: "running" });
    const stopped = parseNgrokControlState({ schemaVersion: 1, ngrokDesiredState: "stopped" });
    expect(decideNgrokMonitorAction({ controlState: running, canonicalProcesses: [{}], tunnelHealthy: true })).toEqual({ outcome: "healthy", action: "none" });
    expect(decideNgrokMonitorAction({ controlState: stopped })).toEqual({ outcome: "intentionally_stopped", action: "none" });
    expect(decideNgrokMonitorAction({ controlState: running, taskState: "Running" }).action).toBe("none");
    expect(decideNgrokMonitorAction({ controlState: running, foreignProcesses: [{}] }).outcome).toBe("foreign_process");
    expect(decideNgrokMonitorAction({ controlState: running, canonicalProcesses: [{}, {}] }).outcome).toBe("duplicate_tunnel");
    expect(decideNgrokMonitorAction({ controlState: running, upstreamHealthy: false }).outcome).toBe("upstream_unhealthy");
  });

  it("starts one task only when running is desired and no conflict exists", () => {
    const running = parseNgrokControlState({ schemaVersion: 1, ngrokDesiredState: "running" });
    expect(decideNgrokMonitorAction({ controlState: running })).toEqual({ outcome: "recovery_pending", action: "start_task" });
    expect(decideNgrokMonitorAction({ controlState: running, recoveryBackoffActive: true })).toEqual({ outcome: "recovery_failed", action: "none" });
  });

  it("redacts authentication material", () => {
    expect(redactNgrokSecrets("authtoken: secret Authorization: Bearer abc")).not.toMatch(/secret|abc/);
  });

  it("keeps controls bounded and integrates the short-lived monitor", () => {
    const start = script("startPhysiqueOSNgrok.ps1");
    const stop = script("stopPhysiqueOSNgrok.ps1");
    const status = script("statusPhysiqueOSNgrok.ps1");
    const monitor = script("monitorPhysiqueOS.ps1");
    expect(start).toContain('ngrokDesiredState = "running"');
    expect(stop).toContain('ngrokDesiredState = "stopped"');
    expect(stop).not.toMatch(/Stop-Process\s+-Name|taskkill/i);
    expect(status).toContain("terminalIndependent");
    expect(monitor).toContain("Start-ScheduledTask -TaskName $ngrokTaskName");
    expect(monitor).not.toContain("Start-Process");
  });
});
