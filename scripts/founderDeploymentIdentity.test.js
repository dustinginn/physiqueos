import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCompleteClassification,
  assertExcludedPathsRemainBase,
  evaluateNgrokAgreement,
  evaluateProcessIsolation,
  validateDeploymentManifest,
  verifyPathHashes,
} from "./founderDeploymentIdentity.mjs";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";
import { collectMandatoryTestPaths } from "./runFounderDeploymentGate.mjs";

const temporary = [];
afterEach(() => {
  temporary.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true }));
});

describe("Founder deployment identity", () => {
  it("locks the reviewed 263/29/45 classification plus stabilization paths", () => {
    const manifest = readOperationalJsonFileSync(
      path.resolve(import.meta.dirname, "../deployment/founder-cutover-manifest.json"),
      { stage: "deployment_manifest_test" });
    const groups = validateDeploymentManifest(manifest);
    expect(groups.accepted).toHaveLength(263);
    expect(groups.required).toEqual(["src/domain/utils/localDate.js"]);
    expect(groups.excluded).toHaveLength(29);
    expect(groups.generated).toHaveLength(45);
    expect(groups.blocker).toHaveLength(22);
    expect(collectMandatoryTestPaths(manifest)).toHaveLength(83);
    expect(() => assertCompleteClassification(manifest, [
      ...groups.accepted, ...groups.excluded, ...groups.generated, ...groups.blocker,
    ])).not.toThrow();
    expect(() => assertCompleteClassification(manifest, [
      ...groups.accepted.slice(1), ...groups.excluded, ...groups.generated, ...groups.blocker,
      "src/unreviewed.js",
    ])).toThrow(/drifted/i);
  });

  it("fails closed on source hash drift and excluded-path leakage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "founder-deployment-test-"));
    temporary.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/accepted.js"), "accepted\n");
    const digest = createHash("sha256").update("accepted\n").digest("hex").toUpperCase();
    expect(verifyPathHashes(root, [{ path: "src/accepted.js", sha256: digest }])).toBe(true);
    fs.writeFileSync(path.join(root, "src/accepted.js"), "drifted\n");
    expect(() => verifyPathHashes(root, [{ path: "src/accepted.js", sha256: digest }]))
      .toThrow(/hash verification/i);
    expect(() => assertExcludedPathsRemainBase({ workspace: root, excludedStates: [{
      path: "src/excluded.js", trackedAtBase: false, baseSha256: null,
    }] })).not.toThrow();
    fs.writeFileSync(path.join(root, "src/excluded.js"), "leak\n");
    expect(() => assertExcludedPathsRemainBase({ workspace: root, excludedStates: [{
      path: "src/excluded.js", trackedAtBase: false, baseSha256: null,
    }] })).toThrow(/excluded-path/i);
  });

  it("protects the production PID while identifying only Next/npm development commands", () => {
    expect(() => evaluateProcessIsolation({ productionPid: 10476,
      developmentProcesses: [{ pid: 10476, commandLine: "next dev" }] }))
      .toThrow(/production PID/i);
    expect(evaluateProcessIsolation({ productionPid: 10476,
      developmentProcesses: [
        { pid: 14300, parentPid: 2416, commandLine: "npm-cli.js run dev -- --hostname 0.0.0.0" },
        { pid: 588, parentPid: 11748, commandLine: "next dev --hostname 0.0.0.0" },
        { pid: 21540, parentPid: 1, commandLine: "codex runtime" },
      ] }).developmentPids).toEqual([14300, 588]);
  });

  it("requires canonical running ngrok desired/actual agreement", () => {
    const valid = { desiredState: "running", canonicalProcessCount: 1,
      foreignProcessCount: 0, taskValid: true, tunnelHealthy: true,
      publicUrl: "https://example.ngrok-free.dev", upstream: "http://localhost:3000" };
    expect(evaluateNgrokAgreement(valid)).toEqual({ passes: true, issues: [] });
    expect(evaluateNgrokAgreement({ ...valid, desiredState: "stopped" }))
      .toMatchObject({ passes: false, issues: ["desired_state_not_running"] });
  });
});
