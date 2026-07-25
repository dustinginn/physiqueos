import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PlanningCompatibleValidationBlockers,
  buildGoalTransitionActivationTransactionPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import { validateGoalTransitionActivation } from "./GoalTransitionActivationValidator";
import {
  validateGoalTransitionActivationCoordinatorCompatibility,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  GoalTransitionActivationSourceSnapshotCode as C,
  GoalTransitionActivationSourceSnapshotError,
  captureGoalTransitionActivationSourceSnapshot,
  revalidateGoalTransitionActivationPreCommit,
  revalidateGoalTransitionActivationPreExecution,
} from "./GoalTransitionActivationSourceSnapshot";

function liveFixture() {
  const reviews = Array.from({ length: 15 }, (_, index) => ({
    id: `review-${index}`,
    sourceProtocolId: `historical-${index}`,
    sourceVersionId: `historical-${index}-v1`,
    category: index < 2 ? "peptide" : index < 6 ? "supplement" : `category-${index}`,
    intendedDisposition: index % 3 === 0 ? "replace" : index % 3 === 1 ? "update" : "keep",
    name: `Protocol ${index}`,
  }));
  const goalDraft = {
    id: "goal-transition",
    userId: "u",
    sourceGoalId: "goal_visible_abs_at_rest",
    status: "ready",
    sourceGoalSnapshot: { status: "active", userDecisionPending: true },
    primaryObjective: { id: "build-lean-mass", type: "build_lean_mass", title: "Build Lean Mass" },
    operatingState: { value: "calibration", accepted: true },
    guardrails: [{ text: "Maintain approximately 8â€“9% body fat.", accepted: true }],
    evidenceStrategy: {
      outcomeMeasures: [{ role: "outcome", accepted: true }],
      predictiveSignals: [{ role: "predictive", accepted: true }],
    },
    briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  };
  const generatedCommitments = reviews.slice(0, 9).map((review, index) => ({
    id: `commitment-${index}`,
    sourceProtocolId: review.sourceProtocolId,
    requirement: `Routine ${index}`,
    frequency: index % 2 ? "weekly" : "daily",
  }));
  const protocolDraft = {
    id: "protocol-transition",
    goalTransitionDraftId: goalDraft.id,
    sourceGoalId: goalDraft.sourceGoalId,
    pendingGoalDraftId: goalDraft.primaryObjective.id,
    status: "ready",
    readyForActivation: true,
    validation: { valid: true, preparedCount: 15, unresolvedCount: 0, unresolvedReviewIds: [] },
    protocolReviews: reviews,
    protocolDrafts: reviews.map((review, index) => ({
      id: `preview-${index}`,
      reviewId: review.id,
      sourceProtocolId: review.sourceProtocolId,
      status: "ready",
      payload: { strategy: `strategy-${index}` },
    })),
    generatedCommitments,
    generatedRoutine: generatedCommitments.map((commitment, index) => ({
      id: `routine-${index}`,
      frequency: commitment.frequency,
      text: commitment.requirement,
      sourcePreviewProtocolId: `preview-${index}`,
    })),
  };
  return {
    updatedAt: "2026-07-20T00:00:00.000Z",
    user: { id: "u", timeZone: "America/Los_Angeles" },
    goals: [{
      id: goalDraft.sourceGoalId,
      userId: "u",
      title: "Visible Abs",
      type: "visible_abs",
      primary: true,
      status: "active",
    }],
    goalTransitionDrafts: [goalDraft],
    goalProtocolTransitionDrafts: [protocolDraft],
    protocols: reviews.map((review) => ({
      id: review.sourceProtocolId,
      userId: "u",
      status: "active",
      currentVersionId: review.sourceVersionId,
      relatedGoalIds: [goalDraft.sourceGoalId],
    })),
    protocolVersions: reviews.map((review) => ({
      id: review.sourceVersionId,
      protocolId: review.sourceProtocolId,
      status: "active",
    })),
    executionItems: [],
    reminders: [],
    evidenceRelationships: [],
    completionRecommendation: { userDecisionPending: true },
    currentBriefingCadence: null,
  };
}

function artifacts(live = liveFixture()) {
  const goalDraft = live.goalTransitionDrafts[0];
  const protocolDraft = live.goalProtocolTransitionDrafts[0];
  const validatorResult = validateGoalTransitionActivation({
    snapshot: {
      userId: live.user.id,
      timeZone: live.user.timeZone,
      repositoryRevision: Number.isSafeInteger(live.revision) ? live.revision : 0,
      goals: live.goals,
      goalDraft,
      protocolDraft,
      goalTransitionDrafts: live.goalTransitionDrafts,
      protocols: live.protocols,
      protocolVersions: live.protocolVersions,
      executionItems: live.executionItems,
      reminders: live.reminders,
      evidenceRelationships: live.evidenceRelationships,
      completionRecommendation: live.completionRecommendation,
      currentBriefingCadence: live.currentBriefingCadence,
      proposedWriteSet: { evidence: [] },
    },
    capabilities: {},
  });
  expect(validatorResult.blockingReasons.map(({ code }) => code))
    .toEqual(PlanningCompatibleValidationBlockers);
  const plan = buildGoalTransitionActivationTransactionPlan({ validationResult: validatorResult });
  const coordinatorCompatibility =
    validateGoalTransitionActivationCoordinatorCompatibility({ plan });
  return { validatorResult, plan, coordinatorCompatibility };
}

function setup() {
  const live = liveFixture();
  const persisted = structuredClone(live);
  const locked = artifacts(live);
  const calls = { live: vi.fn(), persisted: vi.fn() };
  const options = {
    ...locked,
    capturedAt: new Date("2026-07-20T08:00:00.000Z"),
    readLiveStore: vi.fn(() => {
      calls.live();
      return live;
    }),
    readPersistedStore: vi.fn(() => {
      calls.persisted();
      return persisted;
    }),
  };
  return { live, persisted, calls, options, ...locked };
}

function codes(result) {
  return result.blockingReasons.map((reason) => reason.code);
}

describe("GoalTransitionActivationSourceSnapshot", () => {
  it("captures one matching immutable source snapshot while execution remains unavailable", async () => {
    const { options, calls } = setup();
    const result = await captureGoalTransitionActivationSourceSnapshot(options);

    expect(result.sourceMatches).toBe(true);
    expect(result.artifactsCompatible).toBe(true);
    expect(result.executionAvailable).toBe(false);
    expect(result.activationReady).toBe(false);
    expect(result.normalizedRevision).toBe(0);
    expect(result.revisionMetadata.compareAndSwapEligible).toBe(true);
    expect(result.revisionMetadata.legacyNormalized).toBe(true);
    expect(calls.live).toHaveBeenCalledTimes(1);
    expect(calls.persisted).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sourceState.goalDraft)).toBe(true);
  });

  it("is deterministic and excludes capturedAt from snapshot identity", async () => {
    const firstSetup = setup();
    const secondSetup = setup();
    secondSetup.options.capturedAt = new Date("2030-01-01T00:00:00.000Z");
    const first = await captureGoalTransitionActivationSourceSnapshot(firstSetup.options);
    const second = await captureGoalTransitionActivationSourceSnapshot(secondSetup.options);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.snapshotFingerprint).toBe(first.snapshotFingerprint);
    expect(second.capturedAt).not.toBe(first.capturedAt);
  });

  it("returns detached state that cannot follow later fixture mutation", async () => {
    const { options, live } = setup();
    const result = await captureGoalTransitionActivationSourceSnapshot(options);
    live.goals[0].status = "completed";
    expect(result.sourceState.goals[0].status).toBe("active");
  });

  it("normalizes legacy revision zero without writing and preserves diagnostics", async () => {
    const { options, persisted } = setup();
    const before = JSON.stringify(persisted);
    const result = await captureGoalTransitionActivationSourceSnapshot(options);
    expect(result.revisionMetadata.revisionPresent).toBe(false);
    expect(result.revisionMetadata.founderStoreUpdatedAt).toBe(persisted.updatedAt);
    expect(result.revisionMetadata.legacyRevisionToken).toBe(0);
    expect(JSON.stringify(persisted)).toBe(before);
    expect(result.normalizedRevision + 1).toBe(1);
  });

  it("uses a persisted integer over updatedAt", async () => {
    const context = setup();
    context.live.revision = 3;
    context.persisted.revision = 3;
    context.options = { ...context.options, ...artifacts(context.live) };
    const result = await captureGoalTransitionActivationSourceSnapshot(context.options);
    expect(result.normalizedRevision).toBe(3);
    expect(result.revisionMetadata.revisionSource).toBe("persisted_persisted_integer");
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["non-numeric", "1"],
  ])("rejects %s revisions", async (_name, revision) => {
    const context = setup();
    context.persisted.revision = revision;
    await expect(captureGoalTransitionActivationSourceSnapshot(context.options))
      .rejects.toMatchObject({ code: C.REVISION_INVALID });
  });

  it("fails closed on live and persisted revision mismatch", async () => {
    const context = setup();
    context.live.revision = 0;
    context.persisted.revision = 1;
    const result = await captureGoalTransitionActivationSourceSnapshot(context.options);
    expect(codes(result)).toContain(C.LIVE_PERSISTED_REVISION_MISMATCH);
    expect(result.sourceMatches).toBe(false);
  });

  it.each([
    ["goal draft", (c) => { c.live.goalTransitionDrafts[0].guardrails[0].text = "changed"; }, C.GOAL_DRAFT_MISMATCH],
    ["protocol draft", (c) => { c.live.goalProtocolTransitionDrafts[0].protocolDrafts[0].payload = { changed: true }; }, C.PROTOCOL_DRAFT_MISMATCH],
    ["transition identity", (c) => { c.live.goalTransitionDrafts[0].primaryObjective.id = "changed"; }, C.TRANSITION_IDENTITY_MISMATCH],
    ["active goal", (c) => { c.live.goals[0].title = "changed"; }, C.ACTIVE_GOAL_MISMATCH],
    ["historical ownership", (c) => { c.live.protocols[0].relatedGoalIds.push("changed"); }, C.HISTORICAL_PROTOCOL_OWNERSHIP_MISMATCH],
    ["commitment source", (c) => { c.live.executionItems.push({ id: "external" }); }, C.COMMITMENT_SOURCE_MISMATCH],
    ["scheduler source", (c) => { c.live.reminders.push({ id: "external" }); }, C.SCHEDULER_SOURCE_MISMATCH],
    ["evidence relationship", (c) => { c.live.evidenceRelationships.push({ evidenceId: "private", goalId: "changed" }); }, C.EVIDENCE_RELATIONSHIP_MISMATCH],
  ])("reports %s mismatch without exposing payloads", async (_name, mutate, code) => {
    const context = setup();
    mutate(context);
    const result = await captureGoalTransitionActivationSourceSnapshot(context.options);
    expect(codes(result)).toContain(code);
    expect(result.sourceMatches).toBe(false);
    expect(JSON.stringify(result.blockingReasons)).not.toContain("private");
  });

  it("supports optional completion and cadence fingerprint comparisons", async () => {
    const context = setup();
    context.validatorResult = structuredClone(context.validatorResult);
    context.validatorResult.sourceRevisions.completionRecommendationState = "wrong";
    context.validatorResult.sourceRevisions.cadenceSourceState = "wrong";
    const result = await captureGoalTransitionActivationSourceSnapshot({
      ...context.options,
      validatorResult: context.validatorResult,
    });
    expect(codes(result)).toEqual(expect.arrayContaining([
      C.COMPLETION_RECOMMENDATION_MISMATCH,
      C.CADENCE_SOURCE_MISMATCH,
    ]));
  });

  it.each([
    ["plan ID", (c) => { c.plan.planId = "changed"; }, C.PLAN_ID_MISMATCH],
    ["plan fingerprint", (c) => { c.plan.planFingerprint = "0".repeat(64); }, C.PLAN_FINGERPRINT_MISMATCH],
    ["plan revision", (c) => { c.plan.preCommitRequirements.expectedFounderStoreRevision = 42; }, C.PLAN_REVISION_MISMATCH],
    ["write counts", (c) => { c.validatorResult.expectedWriteCounts.futureCommitments = 8; }, C.EXPECTED_WRITE_COUNTS_MISMATCH],
    ["future identities", (c) => { c.validatorResult.futureProtocolPlan[0].id = "changed"; }, C.FUTURE_PROTOCOL_PLAN_MISMATCH],
    ["compatibility fingerprint", (c) => { c.coordinatorCompatibility.compatibilityFingerprint = "changed"; }, C.COMPATIBILITY_FINGERPRINT_MISMATCH],
  ])("reports %s artifact mismatch", async (_name, mutate, code) => {
    const context = setup();
    context.validatorResult = structuredClone(context.validatorResult);
    if ([C.PLAN_ID_MISMATCH, C.PLAN_FINGERPRINT_MISMATCH, C.PLAN_REVISION_MISMATCH].includes(code)) {
      context.plan = structuredClone(context.plan);
    }
    if (code === C.COMPATIBILITY_FINGERPRINT_MISMATCH) {
      context.coordinatorCompatibility = structuredClone(context.coordinatorCompatibility);
    }
    mutate(context);
    const result = await captureGoalTransitionActivationSourceSnapshot({
      ...context.options,
      validatorResult: context.validatorResult,
      plan: context.plan,
      coordinatorCompatibility: context.coordinatorCompatibility,
    });
    expect(codes(result)).toContain(code);
    expect(result.artifactsCompatible).toBe(false);
  });

  it.each([
    ["validator", (c) => { c.validatorResult.resultVersion = "future"; }],
    ["plan", (c) => { c.plan.planVersion = "future"; }],
    ["coordinator", (c) => { c.coordinatorCompatibility.coordinatorStateModel.version = "future"; }],
  ])("rejects unsupported %s versions", async (_name, mutate) => {
    const context = setup();
    context.validatorResult = structuredClone(context.validatorResult);
    context.plan = structuredClone(context.plan);
    context.coordinatorCompatibility = structuredClone(context.coordinatorCompatibility);
    mutate(context);
    await expect(captureGoalTransitionActivationSourceSnapshot({
      ...context.options,
      validatorResult: context.validatorResult,
      plan: context.plan,
      coordinatorCompatibility: context.coordinatorCompatibility,
    })).rejects.toMatchObject({ code: C.ARTIFACT_VERSION_UNSUPPORTED });
  });

  it.each([
    ["unaccepted goal draft", (c) => { c.live.goalTransitionDrafts[0].status = "draft"; }, C.TRANSITION_ALREADY_CONSUMED],
    ["consumed protocol draft", (c) => { c.live.goalProtocolTransitionDrafts[0].appliedAt = "now"; }, C.TRANSITION_ALREADY_CONSUMED],
    ["source no longer sole active primary", (c) => { c.live.goals.push({ id: "other", primary: true, status: "active" }); }, C.SOURCE_GOAL_STATE_CHANGED],
    ["target conflict", (c) => { c.live.goals.push({ id: "build-lean-mass", type: "build_lean_mass" }); }, C.TARGET_GOAL_CONFLICT],
    ["prior transition", (c) => { c.live.goals[0].transitionAppliedAt = "goal-transition"; }, C.TRANSITION_ALREADY_CONSUMED],
  ])("fails closed for %s", async (_name, mutate, code) => {
    const context = setup();
    mutate(context);
    const result = await captureGoalTransitionActivationSourceSnapshot(context.options);
    expect(codes(result)).toContain(code);
  });

  it("passes pre-execution revalidation and fails after source drift", async () => {
    const context = setup();
    expect((await revalidateGoalTransitionActivationPreExecution(context.options)).passed).toBe(true);
    context.live.goals[0].title = "drift";
    expect((await revalidateGoalTransitionActivationPreExecution(context.options)).passed).toBe(false);
  });

  it("pre-commit compares committed state and deliberately ignores staged mutations", async () => {
    const context = setup();
    const originalSnapshot =
      await captureGoalTransitionActivationSourceSnapshot(context.options);
    const stagedState = structuredClone(context.live);
    stagedState.goals[0].status = "completed";
    const result = await revalidateGoalTransitionActivationPreCommit({
      ...context.options,
      originalSnapshot,
      transactionExpectedRevision: 0,
      stagedState,
    });
    expect(result.passed).toBe(true);
    expect(result.stagedStateComparedToOriginalSource).toBe(false);
  });

  it("pre-commit fails after committed revision, draft, or consumption drift", async () => {
    const context = setup();
    const originalSnapshot =
      await captureGoalTransitionActivationSourceSnapshot(context.options);
    context.live.revision = 1;
    context.persisted.revision = 1;
    context.live.goalTransitionDrafts[0].updatedAt = "external";
    context.live.goalProtocolTransitionDrafts[0].appliedAt = "external";
    const result = await revalidateGoalTransitionActivationPreCommit({
      ...context.options,
      originalSnapshot,
      transactionExpectedRevision: 0,
    });
    expect(result.passed).toBe(false);
    expect(codes(result)).toEqual(expect.arrayContaining([
      C.PLAN_REVISION_MISMATCH,
      C.GOAL_DRAFT_MISMATCH,
      C.TRANSITION_ALREADY_CONSUMED,
    ]));
  });

  it.each([
    ["live read", { readLiveStore: () => { throw new Error("private live payload"); } }, C.LIVE_STATE_UNREADABLE],
    ["persisted read", { readPersistedStore: () => { throw new Error("private persisted payload"); } }, C.PERSISTED_STATE_UNREADABLE],
  ])("fails closed on %s failure", async (_name, override, code) => {
    const context = setup();
    await expect(captureGoalTransitionActivationSourceSnapshot({
      ...context.options,
      ...override,
    })).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining("private"),
    });
  });

  it("fails closed when canonicalization cannot interpret source structure", async () => {
    const context = setup();
    context.live.goalTransitionDrafts = {};
    await expect(captureGoalTransitionActivationSourceSnapshot(context.options))
      .rejects.toMatchObject({ code: C.CANONICALIZATION_FAILED });
  });

  it("orders mismatches and warnings deterministically", async () => {
    const first = setup();
    first.live.goals[0].title = "drift";
    first.live.reminders.push({ id: "new" });
    const second = setup();
    second.live.goals[0].title = "drift";
    second.live.reminders.push({ id: "new" });
    const a = await captureGoalTransitionActivationSourceSnapshot(first.options);
    const b = await captureGoalTransitionActivationSourceSnapshot(second.options);
    expect(codes(a)).toEqual(codes(b));
    expect(a.warnings.map(({ code }) => code)).toEqual(b.warnings.map(({ code }) => code));
  });

  it("has no mutation-capable dependency and performs no side effect", async () => {
    const context = setup();
    const forbidden = {
      begin: vi.fn(), execute: vi.fn(), createStagedRepositories: vi.fn(),
      save: vi.fn(), update: vi.fn(), persist: vi.fn(), schedule: vi.fn(),
      generateBriefing: vi.fn(), writeEvidence: vi.fn(),
    };
    await captureGoalTransitionActivationSourceSnapshot(context.options);
    Object.values(forbidden).forEach((method) => expect(method).not.toHaveBeenCalled());
  });

  it("leaves the production runtime byte-for-byte unchanged", async () => {
    const path = "private/founder/runtime-store.json";
    const before = fs.readFileSync(path);
    const context = setup();
    await captureGoalTransitionActivationSourceSnapshot(context.options);
    expect(fs.readFileSync(path)).toEqual(before);
  }, 30_000);

  it("uses stable input error codes", async () => {
    await expect(captureGoalTransitionActivationSourceSnapshot())
      .rejects.toBeInstanceOf(GoalTransitionActivationSourceSnapshotError);
    await expect(captureGoalTransitionActivationSourceSnapshot())
      .rejects.toMatchObject({ code: C.INPUT_REQUIRED });
  });
});
