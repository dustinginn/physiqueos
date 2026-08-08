import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeBackup } from "./lib/founderRuntimeBackup.mjs";

const root = path.resolve(process.cwd());
const productionPath = path.join(root, "private/founder/runtime-store.json");
const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("execute Founder cutover stage", () => {
  it("requires the later production cutover to preserve running ngrok metadata", () => {
    const source = fs.readFileSync(
      path.join(root, "scripts/executeFounderCutoverStage.mjs"),
      "utf8"
    );
    expect(source).toContain('ngrokControl.ngrokDesiredState !== "running"');
    expect(source).toContain("Ngrok control is not intentionally running.");
  });

  it("commits exactly one authorized repair against an isolated full clone", () => {
    const productionBefore = sha(fs.readFileSync(productionPath));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "founder-cutover-cli-"));
    directories.push(directory);
    const storePath = path.join(directory, "runtime-store.json");
    fs.copyFileSync(productionPath, storePath);
    const legacy = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const legacyGoal = legacy.goals.find((item) => item.id.includes("objective_lean_mass"));
    legacy.revision = 58;
    legacyGoal.timeline.startDate = "2026-07-20";
    Object.assign(legacyGoal.phases[0], { startDate: "2026-07-20",
      startedAt: "2026-07-20", plannedReviewAt: "2026-08-16" });
    legacyGoal.phases[1].projectedNextPhaseStart = "2026-08-17";
    fs.writeFileSync(storePath, JSON.stringify(legacy));
    const backup = createFounderRuntimeBackup({ sourcePath: storePath,
      destinationRoot: path.join(directory, "backups"), operator: "operator-test",
      gitCommit: "test-commit", buildIdentity: "test-build" });
    const beforeBytes = fs.readFileSync(storePath);
    const result = spawnSync(process.execPath, [path.join(root, "scripts/executeFounderCutoverStage.mjs"),
      "--stage", "repair_phase_dates", "--expected-store-revision", "58",
      "--expected-source-hash", sha(beforeBytes), "--approval-id", "approval-repair-test",
      "--operator", "operator-test", "--backup-directory", backup.directory,
      "--store", storePath, "--isolated", "true"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "committed_verified",
      stage: "repair_phase_dates", startingRevision: 58, endingRevision: 59 });
    const after = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const goal = after.goals.find((item) => item.id.includes("objective_lean_mass"));
    expect(goal.phases[0]).toMatchObject({ status: "active", startedAt: "2026-07-19",
      plannedReviewAt: "2026-08-15" });
    expect(goal.phases[1]).toMatchObject({ status: "planned", startedAt: null,
      projectedNextPhaseStart: "2026-08-16" });
    expect(after.phaseReviewDecisions).toEqual([]);
    expect(sha(fs.readFileSync(productionPath))).toBe(productionBefore);
  }, 30_000);
});

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
