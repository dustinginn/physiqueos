import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  HARNESS_TRACKED_PATHS,
  HarnessSafetyError,
  REAL_EXECUTION_AUTHORIZATION_SCOPE,
  realExecutionConfirmationPhrase,
  runPostPhase2CoreReconciliationHarness,
} from "./runPostPhase2CoreReconciliationHarness.mjs";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

const FIXED_NOW = () => new Date("2030-01-01T00:00:00.000Z");
const EXPECTED_REQUEST_ID = "post_phase_2_core_reconciliation|decision-1|2030-01-01T00:00:00.000Z";
const BUILD_ID = "harness-test-build-id";

describe("Post-Phase-2 core reconciliation harness", () => {
  it("cannot persist on a default invocation (no mode argument)", async () => {
    const { storePath, migrationControlPath, beforeBytes } = createFixture();
    const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
    expect(result.mode).toBe("dry-run");
    expect(result.status).toBe("dry_run_complete");
    expect(result.persisted).toBe(false);
    expect(result.bytesUnchanged).toBe(true);
    expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
  });

  it("dry-run mode only ever invokes service.dryRun and never reports committed:true", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const result = await runPostPhase2CoreReconciliationHarness({
      mode: "dry-run", storePath, migrationControlPath, now: FIXED_NOW,
    });
    expect(result.result.committed).toBe(false);
    expect(result.storeHashBefore).toBe(result.storeHashAfter);
  });

  it("resolves every required command field through the full harness, not just the resolver in isolation", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
    expect(Object.keys(result.command).sort()).toEqual([
      "activityExpenditureTarget", "caloricIntakeTarget", "currentStartDate", "decisionId",
      "energyProtocolId", "energyV1Id", "energyV2Id", "expectedStoreRevision", "goalId",
      "phase1Id", "phase2Id", "requestId", "strategyId", "targetStartDate", "trajectoryId",
      "transactionId",
    ]);
    expect(result.command.requestId).toBe(EXPECTED_REQUEST_ID);
  });

  it("keeps the deployed production checkpoint and the harness's own repository checkpoint fully independent in dry-run", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    // A deployed production .next identity that has nothing to do with this harness commit.
    fs.writeFileSync(path.join(root, ".next/SOURCE_COMMIT"), "deployed-production-commit-unrelated-to-harness");
    const result = await runPostPhase2CoreReconciliationHarness({
      storePath, migrationControlPath, root, now: FIXED_NOW,
      expectedProductionSourceCommit: "deployed-production-commit-unrelated-to-harness",
      expectedProductionBuildId: BUILD_ID,
    });
    expect(result.status).toBe("dry_run_complete");
    expect(result.productionApplicationCheckpoint.sourceCommit).toBe("deployed-production-commit-unrelated-to-harness");
    expect(result.productionApplicationCheckpoint.matchesExpected).toBe(true);
    expect(result.harnessRepositoryCheckpoint.head).toBe(head);
    expect(result.harnessRepositoryCheckpoint.head).not.toBe(result.productionApplicationCheckpoint.sourceCommit);
    expect(result.harnessRepositoryCheckpoint.trackedTreeClean).toBe(true);
    expect(result.harnessRepositoryCheckpoint.allTracked).toBe(true);
  });

  it("dry-run proceeds and clearly reports a dirty tracked tree instead of throwing", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root } = createDeterministicHarnessRoot({ trackHarnessFiles: true, dirty: true });
    directories.push(root);
    const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, root, now: FIXED_NOW });
    expect(result.status).toBe("dry_run_complete");
    expect(result.harnessRepositoryCheckpoint.trackedTreeClean).toBe(false);
  });

  it("refuses real execution when expected production source/build are not explicitly supplied", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({ mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW }),
      "REAL_EXECUTION_EXPECTED_CHECKPOINT_REQUIRED",
    );
  });

  it("refuses real execution when the deployed production checkpoint does not match the explicitly expected one", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: "not-the-deployed-commit",
        expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_PRODUCTION_CHECKPOINT_MISMATCH",
    );
  });

  it("refuses real execution when the harness's own tracked tree is dirty, even with a matching production checkpoint", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true, dirty: true });
    directories.push(root);
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_TRACKED_TREE_DIRTY",
    );
  });

  it("refuses real execution when the harness/resolver files are not committed at HEAD", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: false });
    directories.push(root);
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_HARNESS_FILES_NOT_TRACKED",
    );
  });

  it("refuses real execution without an authorization file, even with matching checkpoints", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_AUTHORIZATION_REQUIRED",
    );
  });

  it("refuses real execution when authorization scope is not exactly post_phase_2_core_reconciliation", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    const authorizationPath = writeJson(root, "authorization.json", {
      authorized: true, scope: "some_other_scope", requestId: EXPECTED_REQUEST_ID,
    });
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, authorizationPath,
        confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_AUTHORIZATION_INVALID",
    );
  });

  it("refuses real execution when authorization requestId does not match the resolved command", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    const authorizationPath = writeJson(root, "authorization.json", {
      authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: "a-stale-or-unrelated-request-id",
    });
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, authorizationPath,
        confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_AUTHORIZATION_INVALID",
    );
  });

  it("refuses real execution without the exact confirmation phrase, even with valid authorization", async () => {
    const { storePath, migrationControlPath } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    const authorizationPath = writeJson(root, "authorization.json", {
      authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
    });
    await expectSafetyCode(
      runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, authorizationPath,
        confirmPhrase: "not the right phrase", now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      }),
      "REAL_EXECUTION_CONFIRMATION_REQUIRED",
    );
  });

  it("reaches the service only once every real-mode gate passes, and still never persists against an ineligible pre-state", async () => {
    const { storePath, migrationControlPath, beforeBytes } = createFixture();
    const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
    directories.push(root);
    const authorizationPath = writeJson(root, "authorization.json", {
      authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
    });
    const result = await runPostPhase2CoreReconciliationHarness({
      mode: "real", storePath, migrationControlPath, root, authorizationPath,
      confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
      expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
    });
    expect(result.status).toBe("real_execution_complete");
    // The fixture is deliberately missing phaseLifecycleReadModels/etc., so the underlying
    // service reports it as ineligible and never opens a unit-of-work or writes a byte.
    expect(result.result.committed).toBe(false);
    expect(result.persisted).toBe(false);
    expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
  });

  it("re-reads Founder revision fresh on every call and pins it into the command immediately", async () => {
    const { storePath, migrationControlPath, store } = createFixture();
    const first = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
    expect(first.command.expectedStoreRevision).toBe(store.revision);

    const advanced = { ...store, revision: store.revision + 7 };
    fs.writeFileSync(storePath, JSON.stringify(advanced));
    const second = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
    expect(second.command.expectedStoreRevision).toBe(store.revision + 7);
  });

  it("wires migration-control state into the existing service guard rather than reimplementing it", async () => {
    const { storePath } = createFixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-harness-unsafe-control-"));
    directories.push(root);
    const migrationControlPath = writeJson(root, "migration-control.json", {
      state: {
        fenceState: "inactive", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json",
        readsEnabled: true, writesEnabled: false, migrationOperationId: null, firstPostgresWriteAt: null,
      },
    });
    const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
    expect(result.result.outcome).toBe("migration_control_unsafe");
    expect(result.result.committed).toBe(false);
  });

  it("exposes no generic Founder mutation capability from its public surface", async () => {
    const harnessModule = await import("./runPostPhase2CoreReconciliationHarness.mjs");
    const forbidden = ["mutate", "write", "persist", "save", "update"];
    for (const exportName of Object.keys(harnessModule)) {
      const lower = exportName.toLowerCase();
      expect(forbidden.some((term) => lower.includes(term))).toBe(false);
    }
  });

  async function expectSafetyCode(promise, code) {
    try {
      await promise;
      throw new Error(`Expected ${code} but the harness call succeeded.`);
    } catch (error) {
      expect(error).toBeInstanceOf(HarnessSafetyError);
      expect(error.code).toBe(code);
    }
  }
});

// Builds an isolated throwaway git repository standing in for the harness's own
// repository root, independent of both the Founder store fixture and any real .next build.
function createDeterministicHarnessRoot({ trackHarnessFiles = true, dirty = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-harness-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "harness-test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  if (trackHarnessFiles) {
    for (const relativePath of HARNESS_TRACKED_PATHS) {
      const target = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `// synthetic committed content for ${relativePath}\n`);
    }
    execFileSync("git", ["add", ...HARNESS_TRACKED_PATHS], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "add harness files"], { cwd: root });
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (dirty) {
    const dirtyTarget = path.join(root, HARNESS_TRACKED_PATHS[0]);
    fs.mkdirSync(path.dirname(dirtyTarget), { recursive: true });
    fs.appendFileSync(dirtyTarget, "// uncommitted local edit\n");
  }
  fs.mkdirSync(path.join(root, ".next"), { recursive: true });
  fs.writeFileSync(path.join(root, ".next/SOURCE_COMMIT"), head);
  fs.writeFileSync(path.join(root, ".next/BUILD_ID"), BUILD_ID);
  return { root, head };
}

function writeJson(root, name, value) {
  const target = path.join(root, name);
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
  return target;
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-harness-fixture-"));
  directories.push(dir);
  const store = {
    revision: 42,
    goals: [{
      id: "goal-1",
      status: "active",
      primary: true,
      currentPhaseId: "phase-2",
      timeline: { currentPhaseId: "phase-2", currentPhaseStartedAt: "2099-01-02" },
      phases: [
        {
          id: "phase-1", status: "completed", name: "Synthetic Prior Phase",
          reviewMilestone: { consumed: true, resolvedReviewId: "decision-1", earliestEligibleDate: "2099-01-01" },
        },
        {
          id: "phase-2", status: "active", name: "Synthetic Current Phase",
          startDate: "2099-01-02", startedAt: "2099-01-02",
        },
      ],
    }],
    phaseReviewDecisions: [{
      decisionId: "decision-1", goalId: "goal-1", currentPhaseId: "phase-1", nextPhaseId: "phase-2",
      selectedOutcome: "begin_next_phase",
      phaseEstablishment: {
        executionTargets: {
          caloricIntake: { value: 2500, unit: "kcal/day" },
          activityExpenditure: { value: 800, unit: "kcal/day" },
        },
      },
    }],
    phaseReviewTransactions: [{ id: "tx-1", goalId: "goal-1", decisionId: "decision-1", status: "committed" }],
    phaseStrategies: [{ id: "strategy-1", goalId: "goal-1", phaseId: "phase-2", status: "accepted" }],
    phaseExpectedTrajectories: [{ id: "trajectory-1", goalId: "goal-1", phaseId: "phase-2", status: "accepted" }],
    protocols: [{
      id: "protocol-1", status: "active", currentVersionId: "v2-1",
      effectiveStrategy: {
        phaseId: "phase-2", phaseStrategyId: "strategy-1",
        caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" },
      },
    }],
    protocolVersions: [
      { id: "v1-1", protocolId: "protocol-1", status: "active", endedAt: null },
      {
        id: "v2-1", protocolId: "protocol-1", status: "active", endedAt: null,
        change: {
          reviewedChanges: {
            caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
            activityExpenditureTarget: { value: 800, unit: "kcal/day" },
          },
        },
      },
    ],
    confidenceInitializationArtifacts: [{
      id: "forecast-1", goalId: "goal-1", phaseId: "phase-2", occurrenceId: "decision-1",
    }],
    goalConfidenceHistory: [{ id: "confidence-1", goalId: "goal-1", phaseId: "phase-2" }],
  };
  const storePath = path.join(dir, "runtime-store.json");
  fs.writeFileSync(storePath, JSON.stringify(store));
  const migrationControlPath = writeJson(dir, "migration-control.json", {
    state: {
      fenceState: "inactive", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json",
      readsEnabled: true, writesEnabled: true, migrationOperationId: null, firstPostgresWriteAt: null,
    },
  });
  return { dir, storePath, migrationControlPath, store, beforeBytes: fs.readFileSync(storePath) };
}
