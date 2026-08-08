import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFounderProductionCutoverPackage, applyFounderProductionCutoverStage,
  createProductionPhaseReviewDryRunRequest, inspectConfidenceCutoverState,
  classifyFounderCutoverRollback, FounderCutoverStage, FOUNDER_CUTOVER_STAGE_ORDER,
  FOUNDER_CUTOVER_STRATEGY_FINGERPRINT, FOUNDER_CUTOVER_TRAJECTORY_FINGERPRINT } from
  "./FounderProductionCutoverService";

const productionPath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Founder production cutover package", () => {
  it("builds the exact seven separately authorized stage plan without mutation", () => {
    const store = fixture(); const before = JSON.stringify(store);
    const plan = createFounderProductionCutoverPackage({ store });
    expect(JSON.stringify(store)).toBe(before);
    expect(plan.revisionPlan.map((item) => item.stage)).toEqual(FOUNDER_CUTOVER_STAGE_ORDER);
    expect(plan.activation.strategy.contentFingerprint).toBe(FOUNDER_CUTOVER_STRATEGY_FINGERPRINT);
    expect(plan.activation.trajectory.contentFingerprint).toBe(FOUNDER_CUTOVER_TRAJECTORY_FINGERPRINT);
    expect(plan.baseline.confidence.state).toBe("v2_already_canonical");
  });

  it("rejects repair precondition drift and is idempotent after repair", () => {
    const store = fixture(); const plan = createFounderProductionCutoverPackage({ store });
    const baselineRevision = store.revision;
    const drifted = structuredClone(store); drifted.goals.find((item) => item.id === plan.repair.goalId)
      .timeline.startDate = "2026-07-21";
    expect(() => apply(drifted, FounderCutoverStage.REPAIR, plan, baselineRevision))
      .toThrow(/fingerprint changed/i);
    const first = apply(store, FounderCutoverStage.REPAIR, plan, baselineRevision);
    first.candidate.revision = baselineRevision + 1;
    const replay = apply(first.candidate, FounderCutoverStage.REPAIR, plan, baselineRevision + 1);
    expect(replay.changed).toBe(false);
    expect(replay.candidate.phaseReviewDecisions).toEqual([]);
    expect(replay.candidate.phaseLifecycleReadModels).toEqual([]);
  }, 15_000);

  it("runs Strategy and trajectory through separate draft, review and acceptance stages", () => {
    let store = fixture(); const plan = createFounderProductionCutoverPackage({ store });
    const baselineRevision = store.revision;
    const confidenceBefore = structuredClone(store.goalConfidenceHistory);
    const snapshotsBefore = structuredClone(store.goalConfidenceSnapshots);
    const briefingsBefore = structuredClone(store.dailyBriefings);
    for (const [index, stage] of FOUNDER_CUTOVER_STAGE_ORDER.entries()) {
      const result = apply(store, stage, plan, baselineRevision + index);
      expect(result.changed).toBe(true);
      store = structuredClone(result.candidate); store.revision = baselineRevision + index + 1;
    }
    expect(store.phaseStrategies).toHaveLength(1);
    expect(store.phaseStrategies[0]).toMatchObject({ status: "accepted", revision: 2,
      acceptedBy: "user_founder_001", contentFingerprint: FOUNDER_CUTOVER_STRATEGY_FINGERPRINT });
    expect(store.phaseExpectedTrajectories).toHaveLength(1);
    expect(store.phaseExpectedTrajectories[0]).toMatchObject({ status: "accepted", revision: 2,
      acceptedBy: "user_founder_001", contentFingerprint: FOUNDER_CUTOVER_TRAJECTORY_FINGERPRINT });
    expect(store.phaseReviewDecisions).toEqual([]);
    expect(store.confidenceInitializationArtifacts ?? []).toHaveLength(0);
    expect(store.goalConfidenceHistory).toEqual(confidenceBefore);
    expect(store.goalConfidenceSnapshots).toEqual(snapshotsBefore);
    expect(store.dailyBriefings).toEqual(briefingsBefore);
  }, 30_000);

  it("rejects fingerprint conflicts, wrong revisions, duplicate records and wrong authorization", () => {
    const store = fixture(); const plan = createFounderProductionCutoverPackage({ store });
    const baselineRevision = store.revision;
    expect(() => applyFounderProductionCutoverStage({ store, stage: FounderCutoverStage.REPAIR,
      expectedStoreRevision: baselineRevision - 1, expectedGoalFingerprint: plan.baseline.goalFingerprint,
      authorization: auth(FounderCutoverStage.REPAIR) })).toThrow(/revision changed/i);
    expect(() => applyFounderProductionCutoverStage({ store, stage: FounderCutoverStage.REPAIR,
      expectedStoreRevision: baselineRevision, expectedGoalFingerprint: plan.baseline.goalFingerprint,
      authorization: auth(FounderCutoverStage.SEED_STRATEGY) })).toThrow(/authorization/i);
    const repaired = apply(store, FounderCutoverStage.REPAIR, plan, baselineRevision).candidate;
    repaired.revision = baselineRevision + 1;
    repaired.phaseStrategies = [structuredClone(plan.activation.strategy)];
    repaired.phaseStrategies[0].purpose = "conflicting semantic content";
    expect(() => apply(repaired, FounderCutoverStage.SEED_STRATEGY, plan, baselineRevision + 1))
      .toThrow(/conflicts/i);
    repaired.phaseStrategies = [structuredClone(plan.activation.strategy), structuredClone(plan.activation.strategy)];
    expect(() => apply(repaired, FounderCutoverStage.SEED_STRATEGY, plan, baselineRevision + 1)).toThrow(/Duplicate/i);
  });

  it("builds exact artifact-bound dry-run requests and classifies rollback safely", () => {
    const store = fixture(); const plan = createFounderProductionCutoverPackage({ store });
    const baselineRevision = store.revision;
    const repaired = apply(store, FounderCutoverStage.REPAIR, plan, baselineRevision).candidate;
    repaired.revision = baselineRevision + 1;
    const request = createProductionPhaseReviewDryRunRequest({ store: repaired,
      selectedOutcome: "extend_current_phase", originatingArtifactId: "artifact-authorized",
      approvalId: "approval-1", approvalToken: "secret-token", decisionId: "decision-dry-run",
      idempotencyKey: "dry-run-extend-2-weeks" });
    expect(request).toMatchObject({ selectedDuration: "2_weeks", expectedStoreRevision: baselineRevision + 1,
      expectedPhaseRevision: 0, currentPhaseId: plan.repair.preconditions.currentPhaseId });
    expect(classifyFounderCutoverRollback({ checkpoint: "A_before_write" }).action).toBe("abort");
    expect(classifyFounderCutoverRollback({ checkpoint: "C_after_activation_package" })
      .action).toBe("byte_backup_restore");
    expect(classifyFounderCutoverRollback({ checkpoint: "D_after_runtime_start",
      laterWriteExists: true }).action).toBe("compensating_transaction");
    expect(classifyFounderCutoverRollback({ checkpoint: "E_after_v2_publication" })
      .restoreAllowed).toBe(false);
  });

  it("recognizes the immutable existing V2 baseline rather than scheduling a false first publication", () => {
    expect(inspectConfidenceCutoverState(fixture())).toMatchObject({ state: "v2_already_canonical",
      publisherType: "weekly_briefing",
      originatingArtifactId: "weekly_briefing_2026-07-26_2026-08-01" });
  });
});

function fixture() {
  const store = JSON.parse(fs.readFileSync(productionPath, "utf8"));
  // Keep this a pre-cutover lifecycle fixture even after production has accepted the package.
  store.phaseStrategies = [];
  store.phaseExpectedTrajectories = [];
  return store;
}
function auth(stage) { return { authorized: true, scope: "founder_production_cutover_stage",
  stage, actorId: "user_founder_001", approvalId: `approval-${stage}` }; }
function apply(store, stage, plan, revision) { return applyFounderProductionCutoverStage({ store, stage,
  expectedStoreRevision: revision, expectedGoalFingerprint: plan.baseline.goalFingerprint,
  authorization: auth(stage), now: () => new Date("2026-08-15T18:30:00.000Z") }); }
