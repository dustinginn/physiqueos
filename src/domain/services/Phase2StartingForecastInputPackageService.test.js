import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFounderBuildLeanMassGoal, projectFounderBuildLeanMassPhaseCorrection } from
  "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createPhase2StartingForecastInputPackage } from
  "./Phase2StartingForecastInputPackageService";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Phase 2 Starting Forecast input package", () => {
  it("is deterministic, accepted-only, lineage-complete, and excludes raw or V1 semantics", () => {
    const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
    const goal = projectFounderBuildLeanMassPhaseCorrection(store.goals.find(isFounderBuildLeanMassGoal));
    const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
    const drafts = createFounderPhase2ActivationPackageDrafts({ store, goal, phase,
      createdAt: "2026-08-02T12:00:00.000Z" });
    const acceptance = createPhaseActivationPackageAcceptanceService({
      now: () => new Date("2026-08-15T18:30:00.000Z") });
    const acceptedStrategy = accept(acceptance, "Strategy", drafts.strategy);
    const acceptedTrajectory = accept(acceptance, "Trajectory", drafts.trajectory);
    const activeGoal = structuredClone(goal);
    const activePhase = activeGoal.phases.find((item) => item.id === phase.id);
    activeGoal.phases.find((item) => item.id !== phase.id).status = "completed";
    activeGoal.phases.find((item) => item.id !== phase.id).completedAt = "2026-08-15T19:00:00.000Z";
    activePhase.status = "active";
    activePhase.startedAt = "2026-08-16";
    activePhase.startDate = "2026-08-16";
    activeGoal.currentPhaseId = activePhase.id;
    const decision = decisionFor(activeGoal, activePhase, acceptedStrategy, acceptedTrajectory);
    const one = createPhase2StartingForecastInputPackage({ store, goal: activeGoal, activePhase,
      acceptedStrategy, acceptedTrajectory, decision });
    const two = createPhase2StartingForecastInputPackage({ store, goal: activeGoal, activePhase,
      acceptedStrategy, acceptedTrajectory, decision });
    expect(one).toEqual(two);
    expect(one.inputFingerprint).toBe(two.inputFingerprint);
    expect(one.goalBaseline).toMatchObject({ observedOn: "2026-07-18",
      bodyFatPercentage: 7.7, leanMass: { value: 147.5 }, fatMass: { value: 12.8 },
      rawEvidenceIncluded: false });
    expect(one.goalContract.strategyHypothesis).toEqual(acceptedStrategy.strategyHypothesis);
    expect(one.goalContract.expectedTrajectory).toEqual(acceptedTrajectory.expectedTrajectory);
    expect(one.goalContract.provenance.inferredMetadata).not.toContain("strategy_hypothesis_from_goal");
    expect(one.goalContract.provenance.inferredMetadata).not.toContain("expected_trajectory_from_goal");
    expect(one.exclusions).toEqual(expect.objectContaining({ rawEvidenceRecords: true,
      briefingJSX: true, presentationCopy: true, syntheticDEXAValues: true,
      unacceptedStrategyDrafts: true, v1NumericConversionAsV2Meaning: true }));
    expect(one.latestConfidenceContext).toMatchObject({ v1NumericConversionUsed: false });
    expect(JSON.stringify(one)).not.toContain("source_artifact_refs");
  });

  it("fails closed for draft records and stale accepted revisions", () => {
    const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
    const goal = projectFounderBuildLeanMassPhaseCorrection(store.goals.find(isFounderBuildLeanMassGoal));
    const phase = goal.phases.find((item) => item.name === "Lean Mass Build");
    const drafts = createFounderPhase2ActivationPackageDrafts({ store, goal, phase });
    const activePhase = { ...phase, status: "active", startedAt: "2026-08-16" };
    expect(() => createPhase2StartingForecastInputPackage({ store, goal, activePhase,
      acceptedStrategy: drafts.strategy, acceptedTrajectory: drafts.trajectory,
      decision: { ...decisionFor(goal, activePhase, drafts.strategy, drafts.trajectory),
        expectedStrategyRevision: 0, expectedTrajectoryRevision: 0 } })).toThrow(/accepted/i);
  });
});

function accept(service, type, draft) {
  const ready = service[`submit${type}ForReview`](draft, { expectedRevision: 0 });
  return service[`accept${type}`](ready, { actorId: "user_founder_001", expectedRevision: 1,
    idempotencyKey: `accept-${type.toLowerCase()}`,
    authorization: { authorized: true, scope: "phase_activation_package_acceptance",
      recordId: ready.id, actorId: "user_founder_001" } }).record;
}
function decisionFor(goal, phase, strategy, trajectory) {
  return { decisionId: "phase-review-decision", idempotencyKey: "phase-review-decision",
    actorId: "user_founder_001", decidedAt: "2026-08-15T19:00:00.000Z",
    projectedNextPhaseStart: "2026-08-16", expectedStrategyRevision: strategy.revision,
    expectedTrajectoryRevision: trajectory.revision, reasoningLineage: [{ id: "reason", type: "review" }],
    originatingArtifactId: "dexa-briefing", originatingForecastId: "forecast",
    originatingInterpretationId: "interpretation", goalId: goal.id, nextPhaseId: phase.id };
}
