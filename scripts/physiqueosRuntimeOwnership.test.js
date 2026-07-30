import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const helperPath = path.join(repoRoot, "scripts", "physiqueosRuntimeOwnership.ps1");
const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const nextPath = "C:\\repo\\node_modules\\next\\dist\\bin\\next";
const nodePath = "C:\\Program Files\\nodejs\\node.exe";
const expectedArguments = `"${nextPath}" start --hostname 0.0.0.0 --port 3000`;

function fixture(overrides = {}) {
  const process = overrides.process === null ? null : {
    pid: 100,
    parentPid: 200,
    name: "node.exe",
    commandLine: null,
    sessionId: 0,
    startedAt: "2026-07-29T01:00:01.250Z",
    ...overrides.process,
  };
  const parent = {
    pid: 200,
    parentPid: 300,
    name: "svchost.exe",
    commandLine: null,
    sessionId: 0,
    startedAt: "2026-07-28T00:00:00Z",
    ...overrides.parent,
  };
  const grandparent = {
    pid: 300,
    parentPid: 400,
    name: "services.exe",
    commandLine: null,
    sessionId: 0,
    startedAt: "2026-07-28T00:00:00Z",
    ...overrides.grandparent,
  };
  return {
    taskQueryStatus: overrides.taskQueryStatus ?? "readable",
    task: {
      State: "Running",
      Actions: [{
        Execute: nodePath,
        Arguments: expectedArguments,
        WorkingDirectory: "C:\\repo",
      }],
      ...overrides.task,
    },
    taskInfo: {
      LastRunTime: "2026-07-29T01:00:00.000Z",
      ...overrides.taskInfo,
    },
    listeners: overrides.listeners ?? [{ pid: 100, address: "0.0.0.0", port: 3000 }],
    process,
    ancestors: overrides.ancestors ?? [process, parent, grandparent],
    healthOk: overrides.healthOk ?? true,
  };
}

function evaluate(input) {
  const command = [
    `. '${helperPath.replaceAll("'", "''")}'`,
    "$fixture = $env:PHYSIQUEOS_OWNERSHIP_FIXTURE | ConvertFrom-Json",
    "$result = Get-PhysiqueOSRuntimeOwnershipDecision `",
    "  -TaskQueryStatus $fixture.taskQueryStatus `",
    "  -Task $fixture.task `",
    "  -TaskInfo $fixture.taskInfo `",
    "  -Listeners @($fixture.listeners) `",
    "  -Process $fixture.process `",
    "  -Ancestors @($fixture.ancestors) `",
    "  -HealthOk ([bool]$fixture.healthOk) `",
    `  -ExpectedNodePath '${nodePath}' \``,
    `  -ExpectedNextPath '${nextPath}' \``,
    "  -ExpectedRepositoryRoot 'C:\\repo'",
    "$result | ConvertTo-Json -Depth 8 -Compress",
  ].join("\n");
  const result = spawnSync(
    powershell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PHYSIQUEOS_OWNERSHIP_FIXTURE: JSON.stringify(input),
      },
    }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function evaluateOverall(overrides = {}) {
  const values = {
    taskQueryStatus: "readable",
    monitorTaskQueryStatus: "readable",
    taskDefinitionMatches: true,
    monitorDefinitionMatches: true,
    controlValid: true,
    listenerPresent: true,
    canonicalOwnership: true,
    desiredState: "running",
    taskState: "Running",
    forbiddenAncestor: false,
    healthOk: true,
    lastRecoveryOutcome: "healthy",
    consecutiveRecoveryFailures: 0,
    ...overrides,
  };
  const command = [
    `. '${helperPath.replaceAll("'", "''")}'`,
    "$fixture = $env:PHYSIQUEOS_OWNERSHIP_FIXTURE | ConvertFrom-Json",
    "Get-PhysiqueOSRuntimeOverallState `",
    "  -TaskQueryStatus $fixture.taskQueryStatus `",
    "  -MonitorTaskQueryStatus $fixture.monitorTaskQueryStatus `",
    "  -TaskDefinitionMatches ([bool]$fixture.taskDefinitionMatches) `",
    "  -MonitorDefinitionMatches ([bool]$fixture.monitorDefinitionMatches) `",
    "  -ControlValid ([bool]$fixture.controlValid) `",
    "  -ListenerPresent ([bool]$fixture.listenerPresent) `",
    "  -CanonicalOwnership ([bool]$fixture.canonicalOwnership) `",
    "  -DesiredState $fixture.desiredState `",
    "  -TaskState $fixture.taskState `",
    "  -ForbiddenAncestor ([bool]$fixture.forbiddenAncestor) `",
    "  -HealthOk ([bool]$fixture.healthOk) `",
    "  -LastRecoveryOutcome $fixture.lastRecoveryOutcome `",
    "  -ConsecutiveRecoveryFailures ([int]$fixture.consecutiveRecoveryFailures)",
  ].join("\n");
  const result = spawnSync(
    powershell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PHYSIQUEOS_OWNERSHIP_FIXTURE: JSON.stringify(values),
      },
    }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

describe("strict S4U runtime ownership decision", () => {
  it("Case A accepts a visible matching command line without fallback", () => {
    const result = evaluate(fixture({
      process: {
        commandLine: `"${nodePath}" "${nextPath}" start --hostname 0.0.0.0 --port 3000`,
      },
    }));
    expect(result).toMatchObject({
      commandLineAvailable: true,
      commandLineMatches: true,
      s4uFallbackEligible: false,
      ownershipDecision: "canonical",
      ownershipReason: "command_line_match",
    });
  });

  it("Case B accepts a null command line only through the strict S4U fallback", () => {
    expect(evaluate(fixture())).toMatchObject({
      commandLineAvailable: false,
      s4uFallbackEligible: true,
      ownershipDecision: "canonical",
      ownershipReason: "s4u_strict_fallback",
      launchTimeDifferenceMilliseconds: 1250,
      launchTimeToleranceMilliseconds: 5000,
    });
  });

  it("Case C makes a visible mismatch authoritative and never falls back", () => {
    expect(evaluate(fixture({
      process: { commandLine: `"${nodePath}" dev --port 3000` },
    }))).toMatchObject({
      commandLineAvailable: true,
      commandLineMatches: false,
      s4uFallbackEligible: false,
      ownershipDecision: "foreign",
      ownershipReason: "command_line_mismatch",
    });
  });

  it.each([
    ["Case D wrong executable", { task: { Actions: [{ Execute: "C:\\other\\node.exe", Arguments: expectedArguments, WorkingDirectory: "C:\\repo" }] } }],
    ["Case E wrong arguments", { task: { Actions: [{ Execute: nodePath, Arguments: `"${nextPath}" dev --port 3000`, WorkingDirectory: "C:\\repo" }] } }],
    ["Case F wrong working directory", { task: { Actions: [{ Execute: nodePath, Arguments: expectedArguments, WorkingDirectory: "C:\\other" }] } }],
  ])("%s rejects the fallback", (_name, change) => {
    expect(evaluate(fixture(change))).toMatchObject({
      taskDefinitionMatches: false,
      ownershipDecision: "foreign",
    });
  });

  it("Case G rejects a listener when the task is not Running", () => {
    expect(evaluate(fixture({ task: { State: "Ready" } }))).toMatchObject({
      taskStateMatches: false,
      ownershipDecision: "foreign",
    });
  });

  it("Case H rejects Session 1", () => {
    expect(evaluate(fixture({ process: { sessionId: 1 } }))).toMatchObject({
      sessionMatches: false,
      ownershipDecision: "foreign",
      ownershipReason: "session_mismatch",
    });
  });

  it.each(["powershell.exe", "cmd.exe", "WindowsTerminal.exe", "npm.exe", "npx.exe"])(
    "Case I rejects forbidden ancestor %s",
    (name) => {
      expect(evaluate(fixture({ parent: { name } }))).toMatchObject({
        forbiddenAncestor: true,
        ownershipDecision: "foreign",
        ownershipReason: "ancestry_mismatch",
      });
    }
  );

  it("Case J rejects the wrong grandparent", () => {
    expect(evaluate(fixture({ grandparent: { name: "explorer.exe" } }))).toMatchObject({
      ancestryMatches: false,
      ownershipDecision: "foreign",
    });
  });

  it("Case K rejects multiple distinct listener PIDs", () => {
    expect(evaluate(fixture({
      listeners: [{ pid: 100 }, { pid: 101 }],
    }))).toMatchObject({
      listenerCountMatches: false,
      ownershipDecision: "foreign",
      ownershipReason: "listener_ownership_ambiguous",
    });
  });

  it("handles a stopped runtime with no listener or process records", () => {
    expect(evaluate(fixture({
      listeners: [],
      process: null,
      ancestors: [],
      healthOk: false,
    }))).toMatchObject({
      listenerCountMatches: false,
      sessionMatches: false,
      ownershipDecision: "foreign",
    });
  });

  it("Cases L and M enforce the five-second launch tolerance", () => {
    expect(evaluate(fixture({
      process: { startedAt: "2026-07-29T01:00:05.000Z" },
    })).launchTimeMatches).toBe(true);
    expect(evaluate(fixture({
      process: { startedAt: "2026-07-29T01:00:05.001Z" },
    }))).toMatchObject({
      launchTimeMatches: false,
      ownershipDecision: "foreign",
      ownershipReason: "launch_time_mismatch",
    });
  });

  it("Case N rejects the fallback when health fails", () => {
    expect(evaluate(fixture({ healthOk: false }))).toMatchObject({
      healthMatches: false,
      ownershipDecision: "foreign",
      ownershipReason: "health_check_failed",
    });
  });

  it("Cases O and P distinguish access denial from genuine absence", () => {
    expect(evaluate(fixture({
      taskQueryStatus: "access_denied",
      task: null,
    })).ownershipReason).toBe("task_access_denied");
    expect(evaluate(fixture({
      taskQueryStatus: "not_found",
      task: null,
    })).ownershipReason).toBe("task_not_found");
  });

  it("Cases Q and R distinguish stale stopped control from healthy running control", () => {
    expect(evaluateOverall({ desiredState: "stopped" })).toBe("control_state_mismatch");
    expect(evaluateOverall()).toBe("healthy");
  });

  it("Cases S and T permit only verified canonical stop classifications", () => {
    const stop = fs.readFileSync(
      path.join(repoRoot, "scripts", "stopPhysiqueOS.ps1"),
      "utf8"
    );
    expect(stop).toContain('"control_state_mismatch"');
    expect(stop).toContain("Refusing to stop: port 3000 is not owned by the canonical runtime.");
    expect(stop).not.toMatch(/Stop-Process|taskkill/i);
  });

  it("Cases U and V share ownership logic while preserving intentional stop authority", () => {
    const monitor = fs.readFileSync(
      path.join(repoRoot, "scripts", "monitorPhysiqueOS.ps1"),
      "utf8"
    );
    expect(monitor).toContain(". $ownershipHelper");
    expect(monitor).toContain("Get-PhysiqueOSRuntimeOwnershipDecision");
    expect(monitor.indexOf('$control.desiredState -eq "stopped"'))
      .toBeLessThan(monitor.indexOf("Get-PhysiqueOSTaskQueryResult -TaskName $productionTaskName"));
    expect(monitor).not.toMatch(/Start-Process|Stop-Process|taskkill/i);
  });
});
