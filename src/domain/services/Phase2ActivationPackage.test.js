import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectFounderBuildLeanMassPhaseCorrection,
  isFounderBuildLeanMassGoal } from "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createPhaseStrategy, validatePhaseStrategy } from "../models/phaseStrategy";
import { validatePhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("canonical Founder Phase 2 activation package", () => {
  it("derives complete Strategy and trajectory drafts from accepted canonical sources", () => {
    const { drafts } = fixture();
    expect(() => validatePhaseStrategy(drafts.strategy)).not.toThrow();
    expect(() => validatePhaseExpectedTrajectory(drafts.trajectory)).not.toThrow();
    expect(Object.keys(drafts.strategy.domains).sort()).toEqual([
      "activity", "coaching", "energy", "guardrailResponse", "nutrition", "peptides",
      "recovery", "supplements", "training",
    ]);
    expect(drafts.strategy.domains.guardrailResponse).toMatchObject({
      acceptedBodyFatRange: { min: 8, max: 9 }, automaticCutAllowed: false,
      majorChangeRequiresUserAuthorization: true,
    });
    expect(drafts.strategy.domains.nutrition.proteinTargetBasis)
      .toBe("approximately_one_gram_per_pound_of_body_weight");
    expect(drafts.trajectory.objectiveTrajectory).toMatchObject({
      fullTargetIsPromise: false, partialProgressHasValue: true,
      repeatValidationRequired: true,
    });
    expect(drafts.trajectory.guardrailTrajectory.independentFromObjective).toBe(true);
    expect(drafts.trajectory.expectedTrajectory.segments.every((segment) =>
      segment.expectedObjectiveRanges.every((range) => range.min <= range.max))).toBe(true);
    expect(drafts.strategy.sourceLineage.map((item) => item.field)).toEqual(
      expect.arrayContaining(["purpose", "domains.energy", "domains.nutrition",
        "domains.training", "domains.activity", "domains.recovery", "domains.coaching",
        "domains.peptides", "domains.supplements", "domains.guardrailResponse",
        "strategyHypothesis"]));
  });

  it("rejects incomplete, wrong-identity, and Execution-owned Strategy semantics", () => {
    const { drafts } = fixture();
    const missing = structuredClone(drafts.strategy);
    delete missing.domains.energy;
    expect(() => createPhaseStrategy(missing)).toThrow(/domain energy/i);
    expect(() => validatePhaseStrategy(drafts.strategy, { expectedGoalId: "wrong" }))
      .toThrow(/Goal does not match/i);
    expect(() => validatePhaseStrategy(drafts.strategy, { expectedPhaseId: "wrong" }))
      .toThrow(/phase does not match/i);
    const executionOwned = structuredClone(drafts.strategy);
    executionOwned.domains.peptides.dosage = "not allowed";
    expect(() => createPhaseStrategy(executionOwned)).toThrow(/Execution-owned/i);
  });

  it("uses actor-bound, revision-checked, immutable, idempotent acceptance", () => {
    const { drafts } = fixture();
    const service = createPhaseActivationPackageAcceptanceService({
      now: () => new Date("2026-08-15T18:30:00.000Z"),
    });
    const ready = service.submitStrategyForReview(drafts.strategy, { expectedRevision: 0 });
    expect(ready).toMatchObject({ status: "ready_for_review", revision: 1 });
    const command = { actorId: "user_founder_001", expectedRevision: 1,
      idempotencyKey: "accept-founder-phase-2-strategy-v1",
      authorization: { authorized: true, scope: "phase_activation_package_acceptance",
        recordId: ready.id, actorId: "user_founder_001" } };
    const accepted = service.acceptStrategy(ready, command);
    expect(accepted).toMatchObject({ status: "accepted", idempotent: false,
      record: { status: "accepted", revision: 2, acceptedBy: "user_founder_001",
        acceptedRevision: 2 } });
    expect(service.acceptStrategy(ready, command).idempotent).toBe(true);
    expect(service.acceptStrategy(accepted.record, { ...command, expectedRevision: 2 }).idempotent)
      .toBe(true);
    expect(() => service.acceptStrategy(ready, { ...command, expectedRevision: 0 }))
      .toThrow(/expected record revision/i);
    const changed = structuredClone(accepted.record);
    changed.domains.energy.intent = "mutated";
    expect(() => service.assertAcceptedStrategyUnchanged(changed)).toThrow(/fingerprint/i);
  });

  it("accepts trajectory through the same lifecycle and keeps superseded records ineligible", () => {
    const { drafts } = fixture();
    const service = createPhaseActivationPackageAcceptanceService({
      now: () => new Date("2026-08-15T18:30:00.000Z"),
    });
    const ready = service.submitTrajectoryForReview(drafts.trajectory, { expectedRevision: 0 });
    const command = { actorId: "user_founder_001", expectedRevision: 1,
      idempotencyKey: "accept-founder-phase-2-trajectory-v1",
      authorization: { authorized: true, scope: "phase_activation_package_acceptance",
        recordId: ready.id, actorId: "user_founder_001" } };
    const accepted = service.acceptTrajectory(ready, command).record;
    expect(() => validatePhaseExpectedTrajectory(accepted)).not.toThrow();
    const superseded = service.supersedeTrajectory(accepted, {
      actorId: "user_founder_001", expectedRevision: 2, supersedesId: "trajectory-v2",
      authorization: command.authorization,
    });
    expect(superseded).toMatchObject({ status: "superseded", revision: 3,
      acceptedRevision: 2, supersedesId: "trajectory-v2" });
    expect(superseded.status).not.toBe("accepted");
  });
});

function fixture() {
  const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  const sourceGoal = store.goals.find(isFounderBuildLeanMassGoal);
  const goal = projectFounderBuildLeanMassPhaseCorrection(sourceGoal);
  const phase = goal.phases.find((item) => item.id === goal.projectedNextPhaseId) ??
    goal.phases.find((item) => item.name === "Lean Mass Build");
  return { store, goal, phase, drafts: createFounderPhase2ActivationPackageDrafts({
    store, goal, phase, createdAt: "2026-08-02T12:00:00.000Z" }) };
}
