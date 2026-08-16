import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthorizedPhaseEstablishment } from "../src/domain/services/PhaseEstablishmentService";
import { createPhaseStrategy } from "../src/domain/models/phaseStrategy";
import { createPhaseExpectedTrajectory } from "../src/domain/models/phaseExpectedTrajectory";
import {
  computePreparationIntegrityHash,
  HARNESS_TRACKED_PATHS,
  HarnessSafetyError,
  PREPARATION_ARTIFACT_SCHEMA_VERSION,
  REAL_EXECUTION_AUTHORIZATION_SCOPE,
  readPreparationArtifact,
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
  describe("dry-run and default behavior (unchanged)", () => {
    it("cannot persist on a default invocation (no mode argument)", async () => {
      const { storePath, migrationControlPath, beforeBytes } = createIneligibleFixture();
      const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
      expect(result.mode).toBe("dry-run");
      expect(result.status).toBe("dry_run_complete");
      expect(result.persisted).toBe(false);
      expect(result.bytesUnchanged).toBe(true);
      expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
    });

    it("dry-run mode only ever invokes service.dryRun and never reports committed:true", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const result = await runPostPhase2CoreReconciliationHarness({
        mode: "dry-run", storePath, migrationControlPath, now: FIXED_NOW,
      });
      expect(result.result.committed).toBe(false);
      expect(result.storeHashBefore).toBe(result.storeHashAfter);
    });

    it("resolves every required command field through the full harness", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const result = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
      expect(Object.keys(result.command).sort()).toEqual([
        "activityExpenditureTarget", "caloricIntakeTarget", "currentStartDate", "decisionId",
        "energyProtocolId", "energyV1Id", "energyV2Id", "expectedStoreRevision", "goalId",
        "phase1Id", "phase2Id", "requestId", "strategyId", "targetStartDate", "trajectoryId",
        "transactionId",
      ]);
      expect(result.command.requestId).toBe(EXPECTED_REQUEST_ID);
    });

    it("re-reads Founder revision fresh on every call and pins it into the command immediately", async () => {
      const { storePath, migrationControlPath, store } = createIneligibleFixture();
      const first = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
      expect(first.command.expectedStoreRevision).toBe(store.revision);

      const advanced = { ...store, revision: store.revision + 7 };
      fs.writeFileSync(storePath, JSON.stringify(advanced));
      const second = await runPostPhase2CoreReconciliationHarness({ storePath, migrationControlPath, now: FIXED_NOW });
      expect(second.command.expectedStoreRevision).toBe(store.revision + 7);
    });

    it("wires migration-control state into the existing service guard rather than reimplementing it", async () => {
      const { storePath } = createIneligibleFixture();
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

    it("never hardcodes a real Founder production record identity or fixed August date", () => {
      const source = fs.readFileSync(
        path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
          "runPostPhase2CoreReconciliationHarness.mjs"), "utf8");
      for (const fragment of ["6353e12e1ef8fbc3", "objective_lean_mass", "2026-08-15", "2026-08-17"]) {
        expect(source).not.toContain(fragment);
      }
    });
  });

  describe("prepare mode", () => {
    it("resolves exactly one requestId, invokes dryRun with it, and writes a preparation artifact only for an eligible dry run", async () => {
      const { storePath, migrationControlPath } = createEligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = path.join(root, "preparation.json");
      const result = await runPostPhase2CoreReconciliationHarness({
        mode: "prepare", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        preparationArtifactPath,
      });
      expect(result.status).toBe("prepare_complete");
      expect(result.result.outcome).toBe("eligible");
      expect(result.command.requestId).toBe(result.preparationArtifactPath && result.preparation.requestId);
      expect(result.preparationArtifactPath).toBe(preparationArtifactPath);
      expect(fs.existsSync(preparationArtifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(preparationArtifactPath, "utf8"));
      expect(artifact.schemaVersion).toBe(PREPARATION_ARTIFACT_SCHEMA_VERSION);
      expect(artifact.requestId).toBe(result.command.requestId);
      expect(artifact.command).toEqual(result.command);
      expect(artifact.dryRun).toEqual({ outcome: "eligible", proposedChangeCount: result.proposedChangeCount });
      expect(artifact.expected).toEqual({
        productionSourceCommit: head, productionBuildId: BUILD_ID,
        harnessRepositoryHead: head, storeRevision: result.command.expectedStoreRevision,
      });
    });

    it("never writes a preparation artifact when the dry run is not eligible", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = path.join(root, "preparation.json");
      const result = await runPostPhase2CoreReconciliationHarness({
        mode: "prepare", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        preparationArtifactPath,
      });
      expect(result.status).toBe("prepare_not_eligible");
      expect(result.preparationArtifactPath).toBeNull();
      expect(fs.existsSync(preparationArtifactPath)).toBe(false);
    });

    it("refuses to prepare when expected production checkpoint values are not supplied", async () => {
      const { storePath, migrationControlPath } = createEligibleFixture();
      const { root } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({ mode: "prepare", storePath, migrationControlPath, root, now: FIXED_NOW }),
        "PREPARE_EXPECTED_CHECKPOINT_REQUIRED",
      );
    });
  });

  describe("preparation artifact integrity", () => {
    it("verifies a correctly produced artifact", () => {
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      expect(() => readPreparationArtifact(preparationPath)).not.toThrow();
    });

    it("fails closed when the artifact has been tampered with after hashing", () => {
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparation = buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID });
      preparation.command.caloricIntakeTarget = { value: 4000, unit: "kcal/day" }; // tamper after hashing
      const preparationPath = writeJson(root, "preparation.json", preparation);
      expect(() => readPreparationArtifact(preparationPath)).toThrow(HarnessSafetyError);
      try { readPreparationArtifact(preparationPath); } catch (error) {
        expect(error.code).toBe("REAL_EXECUTION_PREPARATION_INTEGRITY_FAILED");
      }
    });

    it("fails closed on a structurally malformed artifact", () => {
      const { root } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationPath = writeJson(root, "preparation.json", { schemaVersion: PREPARATION_ARTIFACT_SCHEMA_VERSION, requestId: "x" });
      try { readPreparationArtifact(preparationPath); throw new Error("expected malformed error"); } catch (error) {
        expect(error).toBeInstanceOf(HarnessSafetyError);
        expect(error.code).toBe("REAL_EXECUTION_PREPARATION_MALFORMED");
      }
    });

    it("fails closed on an unrecognized schema version", () => {
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparation = buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID });
      preparation.schemaVersion = "some_other_schema_v9";
      preparation.integrityHash = computePreparationIntegrityHash(preparation);
      const preparationPath = writeJson(root, "preparation.json", preparation);
      try { readPreparationArtifact(preparationPath); throw new Error("expected malformed error"); } catch (error) {
        expect(error.code).toBe("REAL_EXECUTION_PREPARATION_MALFORMED");
      }
    });
  });

  describe("real mode: preparation-gated, never mints a new requestId", () => {
    it("refuses without a preparation artifact, even with matching checkpoints", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PREPARATION_REQUIRED",
      );
    });

    it("refuses a malformed preparation artifact", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json", { not: "a preparation artifact" });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PREPARATION_MALFORMED",
      );
    });

    it("refuses a preparation artifact whose integrity hash fails", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparation = buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID });
      preparation.command.targetStartDate = "2100-01-01"; // tamper after hashing
      const preparationArtifactPath = writeJson(root, "preparation.json", preparation);
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
          confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PREPARATION_INTEGRITY_FAILED",
      );
    });

    it("refuses if the deployed production source has changed since preparation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      fs.writeFileSync(path.join(root, ".next/SOURCE_COMMIT"), "a-different-deployed-commit");
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PRODUCTION_CHECKPOINT_MISMATCH",
      );
    });

    it("refuses if the deployed production build has changed since preparation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      fs.writeFileSync(path.join(root, ".next/BUILD_ID"), "a-different-build-id");
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PRODUCTION_CHECKPOINT_MISMATCH",
      );
    });

    it("refuses if the caller supplies expected checkpoint values that drift from what was recorded at preparation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: "a-different-build-id-than-prepared",
        }),
        "REAL_EXECUTION_PREPARATION_CHECKPOINT_DRIFT",
      );
    });

    it("refuses if the administrative harness commit has changed since preparation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      // A legitimate later commit to the harness repo, after the artifact was prepared.
      execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "later commit"], { cwd: root });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_HARNESS_REPOSITORY_CHECKPOINT_MISMATCH",
      );
    });

    it("refuses if the harness's tracked tree is dirty", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true, dirty: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_TRACKED_TREE_DIRTY",
      );
    });

    it("refuses if Founder revision differs from the prepared expectedStoreRevision (freshness rule)", async () => {
      const { storePath, migrationControlPath, store } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID,
          expectedStoreRevision: store.revision + 1 }));
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_STALE_REVISION",
      );
    });

    it("refuses if authorization requestId differs from the prepared requestId", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: "a-stale-or-unrelated-request-id",
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
          confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_AUTHORIZATION_INVALID",
      );
    });

    it("refuses if authorization scope is not exactly post_phase_2_core_reconciliation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: "some_other_scope", requestId: EXPECTED_REQUEST_ID,
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
          confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_AUTHORIZATION_INVALID",
      );
    });

    it("refuses if authorized is not exactly true", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: "yes", scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
          confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_AUTHORIZATION_INVALID",
      );
    });

    it("refuses without the exact confirmation phrase, even with valid authorization and preparation", async () => {
      const { storePath, migrationControlPath } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
          confirmPhrase: "not the right phrase", now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_CONFIRMATION_REQUIRED",
      );
    });

    it("a preparation artifact alone (no authorization) cannot invoke persistence", async () => {
      const { storePath, migrationControlPath, beforeBytes } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = writeJson(root, "preparation.json",
        buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID }));
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_AUTHORIZATION_REQUIRED",
      );
      expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
    });

    it("an authorization file alone (no preparation artifact) cannot invoke persistence", async () => {
      const { storePath, migrationControlPath, beforeBytes } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
      });
      await expectSafetyCode(
        runPostPhase2CoreReconciliationHarness({
          mode: "real", storePath, migrationControlPath, root, authorizationPath,
          confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
          expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        }),
        "REAL_EXECUTION_PREPARATION_REQUIRED",
      );
      expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
    });

    it("reaches the service with the unmodified prepared command once every gate passes, and never persists against an ineligible pre-state", async () => {
      const { storePath, migrationControlPath, beforeBytes } = createIneligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparation = buildPreparation({ harnessRepositoryHead: head, productionSourceCommit: head, productionBuildId: BUILD_ID });
      const preparationArtifactPath = writeJson(root, "preparation.json", preparation);
      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: EXPECTED_REQUEST_ID,
      });
      const result = await runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
        confirmPhrase: realExecutionConfirmationPhrase(EXPECTED_REQUEST_ID), now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      });
      expect(result.status).toBe("real_execution_complete");
      expect(result.command).toEqual(preparation.command);
      expect(result.command.requestId).toBe(EXPECTED_REQUEST_ID);
      // The fixture is deliberately missing phaseLifecycleReadModels/etc., so the underlying
      // service reports it as ineligible and never opens a unit-of-work or writes a byte.
      expect(result.result.committed).toBe(false);
      expect(result.persisted).toBe(false);
      expect(fs.readFileSync(storePath).equals(beforeBytes)).toBe(true);
    });

    it("actually commits, end-to-end, when the prepared command is genuinely eligible — proving the exact prepared requestId satisfies the handshake", async () => {
      const { storePath, migrationControlPath } = createEligibleFixture();
      const { root, head } = createDeterministicHarnessRoot({ trackHarnessFiles: true });
      directories.push(root);
      const preparationArtifactPath = path.join(root, "preparation.json");
      const prepared = await runPostPhase2CoreReconciliationHarness({
        mode: "prepare", storePath, migrationControlPath, root, now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
        preparationArtifactPath,
      });
      expect(prepared.status).toBe("prepare_complete");
      expect(prepared.result.outcome).toBe("eligible");

      const authorizationPath = writeJson(root, "authorization.json", {
        authorized: true, scope: REAL_EXECUTION_AUTHORIZATION_SCOPE, requestId: prepared.command.requestId,
      });
      const executed = await runPostPhase2CoreReconciliationHarness({
        mode: "real", storePath, migrationControlPath, root, preparationArtifactPath, authorizationPath,
        confirmPhrase: realExecutionConfirmationPhrase(prepared.command.requestId), now: FIXED_NOW,
        expectedProductionSourceCommit: head, expectedProductionBuildId: BUILD_ID,
      });
      expect(executed.status).toBe("real_execution_complete");
      expect(executed.result.outcome).toBe("success");
      expect(executed.result.committed).toBe(true);
      expect(executed.persisted).toBe(true);
      expect(executed.result.requestId).toBe(prepared.command.requestId);
      expect(executed.command).toEqual(prepared.command); // no re-resolution, no new requestId

      const after = JSON.parse(fs.readFileSync(storePath, "utf8"));
      const goal = after.goals.find((item) => item.id === "goal-1");
      const phase2 = goal.phases.find((item) => item.id === "phase-2");
      expect(phase2.startDate).toBe("2099-01-01");
    });
  });
});

function expectSafetyCode(promise, code) {
  return promise.then(
    () => { throw new Error(`Expected ${code} but the harness call succeeded.`); },
    (error) => {
      expect(error).toBeInstanceOf(HarnessSafetyError);
      expect(error.code).toBe(code);
    },
  );
}

// Builds a full, correctly-hashed preparation artifact matching createIneligibleFixture()'s
// resolver-derivable command, without going through prepare mode — used to unit-test the
// real-mode gate logic in isolation from dry-run eligibility.
function buildPreparation({
  requestId = EXPECTED_REQUEST_ID, expectedStoreRevision = 42, harnessRepositoryHead,
  productionSourceCommit, productionBuildId, outcome = "eligible", proposedChangeCount = 3,
} = {}) {
  const command = {
    requestId, expectedStoreRevision,
    goalId: "goal-1", phase1Id: "phase-1", phase2Id: "phase-2",
    decisionId: "decision-1", transactionId: "tx-1",
    strategyId: "strategy-1", trajectoryId: "trajectory-1",
    energyProtocolId: "protocol-1", energyV1Id: "v1-1", energyV2Id: "v2-1",
    currentStartDate: "2099-01-02", targetStartDate: "2099-01-01",
    caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
    activityExpenditureTarget: { value: 800, unit: "kcal/day" },
  };
  const preparation = {
    schemaVersion: PREPARATION_ARTIFACT_SCHEMA_VERSION,
    createdAt: "2030-01-01T00:00:00.000Z",
    requestId,
    command,
    expected: { productionSourceCommit, productionBuildId, harnessRepositoryHead, storeRevision: expectedStoreRevision },
    dryRun: { outcome, proposedChangeCount },
  };
  preparation.integrityHash = computePreparationIntegrityHash(preparation);
  return preparation;
}

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

function createIneligibleFixture() {
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

// A genuinely eligible fixture: same resolver-facing shape as createIneligibleFixture(), plus
// everything PostPhase2CoreReconciliationService's own invariant additionally requires
// (real domain-model strategy/trajectory objects and a phase lifecycle read model), built
// through the same production model constructors the app itself uses.
function createEligibleFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-harness-eligible-fixture-"));
  directories.push(dir);
  const goal = {
    id: "goal-1", userId: "user-1", title: "Synthetic quantitative goal", type: "quantitative",
    status: "active", primary: true, currentPhaseId: "phase-2",
    target: { type: "numeric_change", metric: "lean_mass", direction: "increase", amount: 10, unit: "lb", targetDate: "2099-04-30" },
    timeline: { startDate: "2099-01-01", targetDate: "2099-04-30", currentPhaseId: "phase-2", currentPhaseStartedAt: "2099-01-02" },
    guardrails: [{ text: "Maintain approximately 8-9% body fat.", accepted: true }],
    phases: [
      {
        id: "phase-1", name: "Synthetic Prior Phase", order: 0, status: "completed",
        reviewMilestone: { consumed: true, resolvedReviewId: "decision-1", earliestEligibleDate: "2099-01-01" },
      },
      { id: "phase-2", name: "Synthetic Current Phase", order: 1, status: "active", startDate: "2099-01-02", startedAt: "2099-01-02" },
    ],
  };
  const establishment = createAuthorizedPhaseEstablishment({
    goal, currentPhase: goal.phases[0], nextPhase: goal.phases[1], actorId: "user-1",
    decisionId: "decision-1", idempotencyKey: "idempotency-1", decidedAt: "2099-01-02T00:00:00.000Z",
    projectedStart: "2099-01-02", caloricIntakeTarget: 2500, activityExpenditureTarget: 800,
    sourceArtifactId: "artifact-1",
  });
  const strategy = structuredClone(createPhaseStrategy(establishment.strategy));
  const trajectory = structuredClone(createPhaseExpectedTrajectory(establishment.trajectory));
  const store = {
    revision: 42,
    goals: [goal],
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
    phaseStrategies: [strategy],
    phaseExpectedTrajectories: [trajectory],
    protocols: [{
      id: "protocol-1", status: "active", currentVersionId: "v2-1",
      effectiveStrategy: {
        phaseId: "phase-2", phaseStrategyId: strategy.id,
        caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
        activityExpenditureTarget: { value: 800, unit: "kcal/day" },
        evaluationCadence: "weekly",
      },
    }],
    protocolVersions: [
      { id: "v1-1", protocolId: "protocol-1", status: "active", effectiveAt: "2098-12-01", endedAt: null },
      {
        id: "v2-1", protocolId: "protocol-1", status: "active", effectiveAt: "2099-01-02", endedAt: null,
        change: {
          reviewedChanges: {
            caloricIntakeTarget: { value: 2500, unit: "kcal/day" },
            activityExpenditureTarget: { value: 800, unit: "kcal/day" },
            evaluationCadence: "weekly",
          },
        },
      },
    ],
    phaseLifecycleReadModels: [{ goalId: "goal-1", decisionId: "decision-1", activePhaseStartedAt: "2099-01-02" }],
    confidenceInitializationArtifacts: [{ id: "forecast-1", goalId: "goal-1", phaseId: "phase-2", occurrenceId: "decision-1" }],
    goalConfidenceHistory: [{ id: "confidence-1", goalId: "goal-1", phaseId: "phase-2", score: 62 }],
  };
  const storePath = path.join(dir, "runtime-store.json");
  fs.writeFileSync(storePath, JSON.stringify(store));
  const migrationControlPath = writeJson(dir, "migration-control.json", {
    state: {
      fenceState: "inactive", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json",
      readsEnabled: true, writesEnabled: true, migrationOperationId: null, firstPostgresWriteAt: null,
    },
  });
  return { dir, storePath, migrationControlPath, store };
}
