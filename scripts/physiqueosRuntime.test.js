import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildRuntimeMetadata,
  buildTaskActionCommand,
  classifyRuntimeStatus,
  getRuntimePaths,
  decideMonitorAction,
  MONITOR_TASK_NAME,
  NODE_PATH,
  parseControlState,
  RESTART_COUNT,
  RESTART_INTERVAL_MINUTES,
  TASK_NAME,
} from "./physiqueosTaskRuntime.mjs";
import { parseNetstatOutput } from "./physiqueosRuntime.mjs";

const repoRoot = process.cwd();
const script = (name) => fs.readFileSync(path.join(repoRoot, "scripts", name), "utf8");

describe("PhysiqueOS production scheduled runtime", () => {
  it("uses one canonical task name and direct absolute node executable", () => {
    expect(TASK_NAME).toBe("PhysiqueOS Production Server");
    expect(NODE_PATH).toBe("C:\\Program Files\\nodejs\\node.exe");
    const action = buildTaskActionCommand("C:\\repo");
    expect(action).toEqual({
      execute: NODE_PATH,
      arguments: '"C:\\repo\\node_modules\\next\\dist\\bin\\next" start --hostname 0.0.0.0 --port 3000',
      workingDirectory: "C:\\repo",
    });
    expect(action.arguments).not.toMatch(/\bnpx\b|\bnpm\s+exec\b|powershell|cmd\.exe/i);
  });

  it("uses one canonical monitor task name", () => {
    expect(MONITOR_TASK_NAME).toBe("PhysiqueOS Runtime Monitor");
  });

  it("defines bounded failure restart settings", () => {
    expect(RESTART_COUNT).toBeGreaterThanOrEqual(3);
    expect(RESTART_INTERVAL_MINUTES).toBe(1);
    const content = script("startPhysiqueOS.ps1");
    expect(content).toContain("<RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure>");
    expect(content).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(content).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(content).toContain("<StopOnIdleEnd>false</StopOnIdleEnd>");
    expect(content).toContain("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
    expect(content).toContain("<Hidden>true</Hidden>");
  });

  it("start controls Task Scheduler and never spawns Node", () => {
    const content = script("startPhysiqueOS.ps1");
    expect(content).toContain("Start-ScheduledTask -TaskName $taskName");
    expect(content).not.toMatch(/Start-Process[\s\S]*node\.exe/i);
    expect(content).not.toContain("Invoke-Expression");
    expect(content).not.toMatch(/\bnpx(?:\.cmd)?\b|\bnpm\s+exec\b/i);
  });

  it("stop targets only the verified canonical task and has no process-kill fallback", () => {
    const content = script("stopPhysiqueOS.ps1");
    expect(content).toContain('$action.Execute -ne $nodePath');
    expect(content).toContain("Stop-ScheduledTask -TaskName $taskName");
    expect(content).not.toContain("Stop-Process");
    expect(content).not.toMatch(/Get-Process\s+node|taskkill/i);
  });

  it("status recognizes healthy, stale, foreign, and task mismatch states", () => {
    expect(classifyRuntimeStatus({
      taskInstalled: true, taskState: "Running", processAlive: true,
      listener: { pid: 12 }, localhostHealth: true,
    })).toBe("healthy");
    expect(classifyRuntimeStatus({
      taskInstalled: true, taskState: "Running", processAlive: false,
      listener: null, metadataPresent: true,
    })).toBe("stale_metadata");
    expect(classifyRuntimeStatus({ foreignListener: true })).toBe("foreign_listener");
    expect(classifyRuntimeStatus({ taskProcessMismatch: true })).toBe("task_process_mismatch");
    const content = `${script("statusPhysiqueOS.ps1")}\n${script("physiqueosRuntimeOwnership.ps1")}`;
    for (const state of [
      "healthy", "starting", "intentionally_stopped", "recovering", "recovery_pending",
      "recovery_failed", "foreign_listener", "task_invalid", "task_process_mismatch",
      "control_state_mismatch", "task_access_denied", "task_query_failed", "unhealthy",
    ]) {
      expect(content).toContain(`"${state}"`);
    }
  });

  it("uses one observational metadata file outside Founder storage", () => {
    const paths = getRuntimePaths(repoRoot);
    expect(paths.metadataFilePath).toBe(path.join(repoRoot, "logs", "physiqueos-runtime.json"));
    expect(paths.controlFilePath).toBe(path.join(repoRoot, "logs", "physiqueos-runtime-control.json"));
    expect(paths).not.toHaveProperty("pidFilePath");
    const metadata = buildRuntimeMetadata({
      pid: 5156, gitHead: "abc", buildId: "build", startedAt: "2026-07-27T00:00:00Z",
      healthCheckedAt: "2026-07-27T00:00:05Z", taskState: "Running",
      localUrl: "http://127.0.0.1:3000", repositoryRoot: "C:\\repo",
    });
    expect(metadata).toMatchObject({
      schemaVersion: 2,
      taskName: TASK_NAME,
      listenerPid: 5156,
      repositoryPath: "C:\\repo",
      nodePath: NODE_PATH,
    });
    expect(JSON.stringify(metadata)).not.toContain("private/founder");
  });

  it("parses running and stopped control states and rejects malformed state", () => {
    expect(parseControlState({ schemaVersion: 1, desiredState: "running" }).desiredState).toBe("running");
    expect(parseControlState({ schemaVersion: 1, desiredState: "stopped" }).desiredState).toBe("stopped");
    expect(parseControlState({ schemaVersion: 1, desiredState: "maybe" })).toBeNull();
    expect(parseControlState(null)).toBeNull();
  });

  it("keeps healthy, starting, stopped, foreign, missing-build, and invalid-task decisions safe", () => {
    const running = parseControlState({ schemaVersion: 1, desiredState: "running" });
    const stopped = parseControlState({ schemaVersion: 1, desiredState: "stopped" });
    expect(decideMonitorAction({ controlState: stopped })).toEqual({ outcome: "intentional_stop", action: "none" });
    expect(decideMonitorAction({ controlState: running, listener: { pid: 1 }, canonicalListener: true, healthOk: true }))
      .toEqual({ outcome: "healthy", action: "none" });
    expect(decideMonitorAction({ controlState: running, taskState: "Running" }))
      .toEqual({ outcome: "starting", action: "none" });
    expect(decideMonitorAction({ controlState: running, listener: { pid: 2 }, canonicalListener: false }))
      .toEqual({ outcome: "foreign_listener", action: "none" });
    expect(decideMonitorAction({ controlState: running, buildPresent: false }))
      .toEqual({ outcome: "build_missing", action: "none" });
    expect(decideMonitorAction({ controlState: running, taskValid: false }))
      .toEqual({ outcome: "task_invalid", action: "none" });
  });

  it("starts only the canonical task once when recovery is required", () => {
    const running = parseControlState({ schemaVersion: 1, desiredState: "running" });
    expect(decideMonitorAction({ controlState: running, taskState: "Ready" }))
      .toEqual({ outcome: "recovery_required", action: "start_task" });
    expect(decideMonitorAction({ controlState: running, taskState: "Ready", recoveryBackoffActive: true }))
      .toEqual({ outcome: "recovery_pending", action: "none" });
  });

  it("monitor is short-lived, bounded, and cannot own or kill production Node", () => {
    const content = script("monitorPhysiqueOS.ps1");
    expect(content).toContain('Start-ScheduledTask -TaskName $productionTaskName');
    expect(content).not.toMatch(/Start-Process|Stop-Process|taskkill|Invoke-Expression/i);
    expect(content).not.toMatch(/\bnpx(?:\.cmd)?\b|\bnpm\s+exec\b|tsx/i);
    expect(content).not.toMatch(/while\s*\(|do\s*\{/i);
    expect(content).toContain("Length -gt 1048576");
    expect(content).toContain("Invoke-BriefingCadenceRunner");
    expect(content).toContain("$nodePath $cadenceRunnerPath");
    expect(content).toContain('"--source=runtime_monitor"');
    expect(content.lastIndexOf('Save-Outcome $control "healthy"'))
      .toBeLessThan(content.lastIndexOf("Invoke-BriefingCadenceRunner"));
    expect(content).toContain("cadenceOutcome=isolated_failure");
    expect(content).toContain("outcomes=$outcomes");
    expect(content).not.toContain("result=$summary");
  });

  it("start and stop atomically establish desired state before lifecycle action", () => {
    const start = script("startPhysiqueOS.ps1");
    const stop = script("stopPhysiqueOS.ps1");
    expect(start).toContain('desiredState = "running"');
    expect(start.indexOf("Write-ControlState")).toBeLessThan(start.lastIndexOf("Start-ScheduledTask -TaskName $taskName"));
    expect(stop).toContain('desiredState = "stopped"');
    expect(stop.indexOf('desiredState = "stopped"')).toBeLessThan(stop.indexOf("Stop-ScheduledTask -TaskName $taskName"));
    expect(start).toContain("<Interval>PT1M</Interval>");
    expect(start).toContain("<ExecutionTimeLimit>PT30S</ExecutionTimeLimit>");
    expect(start).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
  });

  it("rotates the lifecycle log at one MiB with one retained archive", () => {
    const content = script("startPhysiqueOS.ps1");
    expect(content).toContain("Length -gt 1048576");
    expect(content).toContain('$archive = "$lifecycleLog.1"');
  });

  it("parses the port-3000 listener deterministically", () => {
    expect(parseNetstatOutput(
      " TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  5156", 3000
    )).toEqual([{ localAddress: "0.0.0.0", localPort: 3000, state: "LISTENING", pid: 5156 }]);
  });

  it("leaves exactly three user controls plus one short-lived monitor", () => {
    const controls = fs.readdirSync(path.join(repoRoot, "scripts"))
      .filter((name) => /^(start|stop|status)PhysiqueOS\.ps1$/i.test(name));
    expect(controls.sort()).toEqual([
      "startPhysiqueOS.ps1", "statusPhysiqueOS.ps1", "stopPhysiqueOS.ps1",
    ]);
    for (const obsolete of [
      "runPhysiqueOSRuntime.ps1",
      "installPhysiqueOSRuntimeTask.ps1",
      "uninstallPhysiqueOSRuntimeTask.ps1",
    ]) {
      expect(fs.existsSync(path.join(repoRoot, "scripts", obsolete))).toBe(false);
    }
    expect(fs.existsSync(path.join(repoRoot, "scripts", "monitorPhysiqueOS.ps1"))).toBe(true);
  });
});
