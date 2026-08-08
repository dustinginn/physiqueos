import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createFounderBuildLeanMassPhaseRepairPlan,
  isFounderBuildLeanMassGoal,
} from "./FounderPhaseCorrectionService";
import { createPhaseReviewCommitCoordinator } from "./PhaseReviewCommitCoordinator";
import { createFullFounderMemoryProbe } from "../../testSupport/fullFounderMemoryProbe";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Phase Review coordinator production safety", () => {
  it("simulates the repaired Founder aggregate and fails closed without accepted Phase 2 records", async () => {
    const productionBefore = fs.readFileSync(productionPath);
    const memory = createFullFounderMemoryProbe({
      label: "PhaseReviewCommitProductionSafety",
      logicalStoreBytes: productionBefore.length,
      maxHeapUsedBytes: 1024 * 1024 * 1024,
      maxRssBytes: 1536 * 1024 * 1024,
    });
    const productionHash = sha256(productionBefore);
    const productionStore = JSON.parse(productionBefore.toString("utf8"));
    memory.checkpoint("production_store_parsed");
    const sourceGoal = productionStore.goals.find(isFounderBuildLeanMassGoal);
    const repair = createFounderBuildLeanMassPhaseRepairPlan(sourceGoal);
    const simulated = structuredClone(productionStore);
    simulated.goals.splice(simulated.goals.findIndex((item) => item.id === sourceGoal.id),
      1, structuredClone(repair.candidate));
    simulated.phaseReviewDecisions ??= [];
    simulated.phaseReviewTransactions ??= [];
    simulated.phaseStrategies = [];
    simulated.phaseExpectedTrajectories = [];
    simulated.phaseLifecycleReadModels ??= [];

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase-review-founder-simulation-"));
    directories.push(directory);
    const simulationPath = path.join(directory, "runtime-store.json");
    fs.writeFileSync(simulationPath, JSON.stringify(simulated));
    const simulationBefore = fs.readFileSync(simulationPath);
    const liveStore = structuredClone(simulated);
    memory.checkpoint("temporary_live_store_created");
    const first = repair.candidate.phases.find((item) => item.name === "Establish Maintenance");
    const second = repair.candidate.phases.find((item) => item.name === "Lean Mass Build");
    const decision = {
      decisionId: "simulation-founder-begin-phase-2",
      goalId: repair.goalId,
      currentPhaseId: first.id,
      nextPhaseId: second.id,
      originalPlannedReviewAt: "2026-08-15",
      recommendedOutcome: "begin_next_phase",
      recommendedDuration: null,
      recommendedReviewAt: null,
      rationale: "Simulation only; no production decision is authorized.",
      selectedOutcome: "begin_next_phase",
      selectedDuration: null,
      selectedReviewAt: null,
      projectedNextPhaseStart: "2026-08-16",
      decidedAt: "2026-08-15T19:00:00.000Z",
      decisionSource: "production_safety_simulation",
      originatingArtifactId: "simulation-artifact",
      originatingForecastId: "simulation-forecast",
      originatingInterpretationId: "simulation-interpretation",
      confidenceAssessmentId: "simulation-confidence",
      reasoningLineage: [{ id: "simulation-reasoning", type: "simulation" }],
      idempotencyKey: "simulation-founder-begin-phase-2",
      expectedCurrentPhaseStatus: "active",
      expectedCurrentPhaseRevision: first.revision,
      expectedStrategyRevision: 2,
      expectedTrajectoryRevision: 2,
      actorId: productionStore.user.id,
    };
    const coordinator = createPhaseReviewCommitCoordinator({
      runtimeStorePath: simulationPath,
      liveStore,
      readPersistedStore: () => JSON.parse(fs.readFileSync(simulationPath, "utf8")),
      now: () => new Date("2026-08-15T19:00:00.000Z"),
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({ ...options,
        createCommitId: () => "simulation-commit",
        createTransactionId: () => "simulation-transaction" }),
    });
    const result = await coordinator.commit(decision, { authorization: {
      authorized: true,
      scope: "phase_review_decision",
      decisionId: decision.decisionId,
      actorId: decision.actorId,
    } });
    memory.checkpoint("fail_closed_commit_completed");

    expect(result).toMatchObject({ status: "failed", committed: false,
      reasonCode: "PHASE_REVIEW_PARTICIPANT_ACCEPTED_STRATEGY_REQUIRED" });
    expect(fs.readFileSync(simulationPath).equals(simulationBefore)).toBe(true);
    expect(isDeepStrictEqual(liveStore, simulated)).toBe(true);
    expect(fs.readFileSync(productionPath).equals(productionBefore)).toBe(true);
    expect(sha256(fs.readFileSync(productionPath))).toBe(productionHash);
    memory.finish({ testOwnedFullStoreParses: 1, unitOfWorkFullStoreParses: 1,
      testOwnedFullStoreClones: 2, testOwnedFullStoreSerializations: 1,
      fullStoreDeepFreezes: 0,
      temporaryStoreInstances: 1, exactByteComparisons: 2 });
  }, 120000);
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
