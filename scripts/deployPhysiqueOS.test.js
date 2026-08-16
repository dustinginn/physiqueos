import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync(path.join(process.cwd(), "scripts", "deployPhysiqueOS.ps1"), "utf8");

describe("canonical deployment lifecycle", () => {
  it("builds and stages isolated source before stopping production", () => {
    const branch = between(
      'if ($UsesIsolatedSource) {',
      "\n    else {\n        Write-Step \"1. Stopping the current production runtime\"",
    );
    expect(branch.indexOf("Invoke-SourceBuild")).toBeGreaterThan(-1);
    expect(branch.indexOf("Stage-IsolatedBuild")).toBeGreaterThan(branch.indexOf("Invoke-SourceBuild"));
    expect(branch.indexOf("Invoke-ProductionStop")).toBeGreaterThan(branch.indexOf("Stage-IsolatedBuild"));
    expect(branch.indexOf("Promote-IsolatedBuild")).toBeGreaterThan(branch.indexOf("Invoke-ProductionStop"));
  });

  it("can promote the exact preflighted artifact only from clean matching isolated source", () => {
    expect(script).toContain("-UsePrebuiltArtifact requires an explicitly supplied isolated source root.");
    expect(script).toContain("Deployment source contains tracked working-tree changes.");
    expect(script).toContain("Canonical repository contains tracked working-tree changes.");
    expect(script).toContain("Using the explicitly supplied preflighted artifact.");
    expect(script).toContain("does not contain an immutable source identity");
    expect(script).toContain("does not match deployment source");
  });

  it("stops production before a canonical-source build", () => {
    const branch = between(
      "    else {\n        Write-Step \"1. Stopping the current production runtime\"",
      "    Write-Step \"3. Starting the canonical production runtime\"",
    );
    expect(branch.indexOf("Invoke-ProductionStop")).toBeGreaterThan(-1);
    expect(branch.indexOf("Invoke-SourceBuild")).toBeGreaterThan(branch.indexOf("Invoke-ProductionStop"));
  });

  it("fails closed on source, promoted build, and health identity mismatch", () => {
    expect(script).toContain("does not match canonical repository HEAD");
    expect(script).toContain("does not match promoted build");
    expect(script).toContain("does not match deployment source");
    expect(script).toContain("does not match expected build");
    expect(script).toContain("does not match expected source");
  });

  it("retains the exact HTTP failure evidence and bounds initial page retries", () => {
    const probe = functionBlock("Test-HttpEndpoint", "Format-HttpFailure");
    expect(probe).toContain("StatusCode  = $StatusCode");
    expect(probe).toContain("Content     = $Content");
    expect(probe).toContain("ElapsedMs   = $Stopwatch.ElapsedMilliseconds");
    expect(probe).toContain("$_.ErrorDetails.Message");
    expect(script).toContain("SHA-256 $Digest");
    expect(script).not.toContain("$Normalized.Substring(0, 512)");
    const pageWait = functionBlock("Wait-ForApplicationPage", "Wait-ForHealth");
    expect(pageWait).toContain("$MaximumAttempts = 3");
    expect(pageWait).toContain("Format-HttpFailure -Result $LastResult");
    expect(script).toContain("$PageResult = Wait-ForApplicationPage -Url $LocalUrl");
  });

  it("requires successful CSS and JavaScript responses with correct content types", () => {
    expect(script).toContain("^text/css(?:;|$)");
    expect(script).toContain("^(?:application|text)/javascript(?:;|$)");
    expect(script).toContain("failed status or content-type validation");
  });

  it("makes rollback use the canonical stop boundary before moving either build", () => {
    const rollback = finalCatch();
    const identity = rollback.indexOf("Get-BuildIdentity -BuildPath $RollbackBuildPath");
    const stop = rollback.indexOf("Invoke-ProductionStop");
    const preserve = rollback.indexOf("Move-Item -LiteralPath $CurrentBuildPath -Destination $FailedBuildPath");
    const restore = rollback.indexOf("Move-Item -LiteralPath $RollbackBuildPath -Destination $CurrentBuildPath");
    const start = rollback.indexOf("-File $StartScript");
    expect(identity).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(identity);
    expect(preserve).toBeGreaterThan(stop);
    expect(restore).toBeGreaterThan(preserve);
    expect(start).toBeGreaterThan(restore);
    expect(rollback).not.toContain("-File $StopScript | Out-Null");
  });

  it("accepts rollback only after a new exact canonical runtime serves Home and assets", () => {
    const acceptance = functionBlock("Assert-ProductionRuntime", null);
    expect(acceptance).toContain("Assert-HealthIdentity");
    expect(acceptance).toContain("Wait-ForApplicationPage");
    expect(acceptance).toContain("Assert-ReferencedStaticAssets");
    expect(acceptance).toContain("Get-VerifiedRuntimeStatus");
    expect(acceptance).toContain("listener PID $PreviousListenerPid was not replaced");
    expect(acceptance).toContain("$PublicResult = Test-HttpEndpoint");
    const rollback = finalCatch();
    expect(rollback).toContain("-BuildId $RollbackIdentity.BuildId");
    expect(rollback).toContain("-SourceCommit $RollbackIdentity.SourceCommit");
    expect(rollback).toContain("-PreviousListenerPid $AttemptedListenerPid");
    expect(rollback).toContain("Previous production build restored and fully accepted.");
    expect(rollback).not.toContain("Wait-ForHealth -Url $HealthUrl -MaximumWaitSeconds 60 | Out-Null");
  });

  it("fully accepts a previous runtime restart when promotion never happened", () => {
    const rollback = finalCatch();
    expect(rollback).toContain("$CurrentIdentity = Get-BuildIdentity");
    expect(rollback).toContain("$RestartAcceptance = Assert-ProductionRuntime");
    expect(rollback).toContain("Previous production runtime restarted and fully accepted.");
  });
});

function between(start, end) {
  const startIndex = script.indexOf(start);
  const endIndex = script.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return script.slice(startIndex, endIndex);
}

function functionBlock(name, nextName) {
  const start = script.indexOf(`function ${name} {`);
  expect(start).toBeGreaterThan(-1);
  if (!nextName) return script.slice(start, script.indexOf("\ntry {", start));
  const end = script.indexOf(`function ${nextName} {`, start);
  expect(end).toBeGreaterThan(start);
  return script.slice(start, end);
}

function finalCatch() {
  const start = script.lastIndexOf("\ncatch {");
  expect(start).toBeGreaterThan(-1);
  return script.slice(start);
}
