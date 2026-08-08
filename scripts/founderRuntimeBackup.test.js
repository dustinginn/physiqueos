import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderRuntimeBackup, verifyFounderRuntimeBackup } from
  "./lib/founderRuntimeBackup.mjs";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Founder runtime backup", () => {
  it("creates an immutable byte-exact backup and complete manifest", () => {
    const fixture = createFixture();
    const result = createFounderRuntimeBackup({ sourcePath: fixture.source,
      destinationRoot: fixture.destination, operator: "operator_test",
      gitCommit: "abc123", buildIdentity: "build-test",
      now: () => new Date("2026-08-02T20:00:00.000Z") });
    expect(fs.readFileSync(result.backupPath).equals(fs.readFileSync(fixture.source))).toBe(true);
    expect(result.manifest).toMatchObject({ operator: "operator_test",
      founderStore: { revision: 58, activeGoalId: "goal-1", currentPhaseId: "phase-1",
        latestConfidenceAssessmentId: "assessment-1" },
      application: { gitCommit: "abc123", buildIdentity: "build-test" } });
    expect(verifyFounderRuntimeBackup({ backupDirectory: result.directory }).valid).toBe(true);
    expect(() => createFounderRuntimeBackup({ sourcePath: fixture.source,
      destinationRoot: fixture.destination, operator: "operator_test",
      gitCommit: "abc123", buildIdentity: "build-test",
      now: () => new Date("2026-08-02T20:00:00.000Z") })).toThrow(/already exists/i);
  });

  it("detects a source change during copying and publishes no backup", () => {
    const fixture = createFixture();
    expect(() => createFounderRuntimeBackup({ sourcePath: fixture.source,
      destinationRoot: fixture.destination, operator: "operator_test",
      gitCommit: "abc123", buildIdentity: "build-test",
      testHooks: { afterCopy: () => fs.appendFileSync(fixture.source, " ") } }))
      .toThrow(/changed during backup/i);
    expect(fs.readdirSync(fixture.destination)).toEqual([]);
  });

  it("rejects hash mismatch and active mutation artifacts", () => {
    const fixture = createFixture();
    fs.writeFileSync(`${fixture.source}.mutation.lock`, "owned");
    expect(() => createFounderRuntimeBackup({ sourcePath: fixture.source,
      destinationRoot: fixture.destination, operator: "operator_test",
      gitCommit: "abc123", buildIdentity: "build-test" })).toThrow(/ownership is active/i);
  });
});

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "founder-backup-test-"));
  directories.push(directory);
  const source = path.join(directory, "runtime-store.json");
  const destination = path.join(directory, "backups");
  fs.mkdirSync(destination);
  fs.writeFileSync(source, `${JSON.stringify({ revision: 58, lastCommitId: "commit-1",
    goals: [{ id: "goal-1", userId: "user_founder_001", primary: true, status: "active",
      currentPhaseId: "phase-1", phases: [{ id: "phase-1", status: "active" }] }],
    goalConfidenceSnapshots: [{ goalId: "goal-1", currentAssessmentId: "assessment-1" }],
    goalConfidenceHistory: [{ assessmentId: "assessment-1", score: 74 }] })}\n`);
  return { directory, source, destination };
}
