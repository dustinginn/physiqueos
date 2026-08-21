import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createPowerShellWindowsWorkerTransport } from "./PowerShellWindowsWorkerTransport.js";

describe("PowerShellWindowsWorkerTransport", () => {
  it("exposes only fixed known operations and invokes a fixed script without a shell", async () => {
    const execFile = vi.fn(async (_file, args, options) => ({
      stdout: JSON.stringify({ ok: true, operation: args[args.indexOf("-Operation") + 1], evidence: { taskName: "PhysiqueOS Runtime Monitor" } }),
      stderr: "",
    }));
    const transport = createPowerShellWindowsWorkerTransport({ execFile, scriptPath: "C:\\fixed\\worker.ps1" });
    expect(Object.keys(transport)).toEqual([
      "kind", "inspectRuntimeMonitor", "quiesceRuntimeMonitor", "restoreRuntimeMonitor",
      "inspectProductionServer", "retireProductionServer", "inspectNgrok", "retireNgrok",
    ]);
    await transport.inspectRuntimeMonitor({ operationId: "op-1" });
    const [_file, args, options] = execFile.mock.calls[0];
    expect(args).toContain("inspect-runtime-monitor");
    expect(options).toMatchObject({ windowsHide: true });
    expect(options).not.toHaveProperty("shell");
  });

  it("classifies unparseable mutation output as ambiguous without exposing output", async () => {
    const transport = createPowerShellWindowsWorkerTransport({ execFile: async () => ({ stdout: "Bearer should-never-escape" }) });
    const error = await capture(transport.quiesceRuntimeMonitor({ operationId: "op-1" }));
    expect(error).toMatchObject({ code: "WORKER_OUTCOME_AMBIGUOUS", classification: "WORKER_MUTATION_AMBIGUOUS" });
    expect(error.message).not.toContain("Bearer");
  });

  it("classifies a safe pre-mutation rejection as conclusive", async () => {
    const stdout = JSON.stringify({ ok: false, operation: "quiesce-runtime-monitor", classification: "rejected", code: "WORKER_IDENTITY_MISMATCH", message: "safe" });
    const failure = Object.assign(new Error("exit 1"), { stdout });
    const transport = createPowerShellWindowsWorkerTransport({ execFile: async () => { throw failure; } });
    await expect(transport.quiesceRuntimeMonitor({})).rejects.toMatchObject({ classification: "WORKER_MUTATION_REJECTED" });
  });

  it("the tracked bridge allowlists task identities and has no arbitrary command/task/process parameters", async () => {
    const source = await readFile(new URL("../../../../scripts/phase7bWindowsWorkerControl.ps1", import.meta.url), "utf8");
    expect(source).toContain('"PhysiqueOS Production Server"');
    expect(source).toContain('"PhysiqueOS Runtime Monitor"');
    expect(source).toContain('"PhysiqueOS Ngrok Tunnel"');
    const parameterBlock = source.slice(source.indexOf("param("), source.indexOf("\n)\n", source.indexOf("param(")) + 3);
    expect(parameterBlock).not.toMatch(/\$(?:TaskName|Executable|ProcessId|Command)\b/i);
    expect(source).not.toContain("Stop-Process");
    expect(source).not.toContain("Invoke-Expression");
  });
});

async function capture(promise) {
  try { await promise; throw new Error("Expected rejection."); } catch (error) { return error; }
}
