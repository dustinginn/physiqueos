import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GoalTransitionActivationPlanErrorCode as E,
  GoalTransitionActivationPlanOperationType as T,
  GoalTransitionActivationPlanPhase as P,
  GoalTransitionActivationStagedInvariantCode,
  PlanningCompatibleValidationBlockers,
  buildGoalTransitionActivationTransactionPlan,
  validateGoalTransitionActivationPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";

function validationResult() {
  const reviews = Array.from({ length: 15 }, (_, index) => ({
    id: `review-${index}`,
    sourceProtocolId: `historical-protocol-${index}`,
    sourceVersionId: `historical-version-${index}`,
    category: index < 2 ? "peptide" : index < 6 ? "supplement" : `category-${index}`,
    intendedDisposition: index % 3 === 0 ? "replace" : index % 3 === 1 ? "update" : "keep",
    reviewStatus: "accepted",
    name: `Protocol ${index}`,
  }));
  const protocolDrafts = reviews.map((review, index) => ({
    id: `accepted-preview-${index}`,
    reviewId: review.id,
    sourceProtocolId: review.sourceProtocolId,
    status: "ready",
    payload: { strategy: `reviewed-${index}`, cadence: "weekly" },
  }));
  const futureProtocolPlan = reviews.map((review, index) => ({
    id: `future-protocol-${index}`,
    reviewId: review.id,
    sourceProtocolId: review.sourceProtocolId,
    sourceVersionId: review.sourceVersionId,
    category: review.category,
    disposition: review.intendedDisposition,
    active: true,
  }));
  const generatedCommitments = reviews.slice(0, 9).map((review, index) => ({
    id: `future-commitment-${index}`,
    sourceProtocolId: review.sourceProtocolId,
    requirement: `Complete routine ${index}`,
    frequency: index % 3 === 0 ? "daily" : index % 3 === 1 ? "weekly" : "periodic",
  }));
  const goalDraft = {
    id: "goal-transition",
    userId: "synthetic-user",
    sourceGoalId: "source-visible-abs",
    status: "ready",
    primaryObjective: {
      id: "target-build-lean-mass",
      type: "build_lean_mass",
      title: "Build Lean Mass",
    },
    operatingState: { value: "calibration", accepted: true },
    guardrails: [{ id: "body-fat", accepted: true, text: "Maintain approximately 8–9% body fat." }],
    evidenceStrategy: {
      outcomeMeasures: [{ id: "lean-mass", accepted: true }],
      predictiveSignals: [{ id: "training", accepted: true }],
    },
    briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  };
  const protocolDraft = {
    id: "protocol-transition",
    goalTransitionDraftId: "goal-transition",
    sourceGoalId: "source-visible-abs",
    pendingGoalDraftId: "target-build-lean-mass",
    status: "ready",
    readyForActivation: true,
    protocolReviews: reviews,
    protocolDrafts,
    generatedCommitments,
    validation: { valid: true, preparedCount: 15, unresolvedReviewIds: [] },
  };
  const sourceRevisions = {
    founderStoreRevision: 0,
    goalDraft: "goal-fingerprint",
    protocolDraft: "protocol-fingerprint",
    activeGoalState: "active-goal-fingerprint",
    historicalProtocolOwnership: "history-fingerprint",
    commitmentSourceState: "commitment-fingerprint",
    schedulerIntentSourceState: "scheduler-fingerprint",
    evidenceRelationshipState: "evidence-fingerprint",
    activationCriticalState: "critical-fingerprint",
  };
  return {
    ready: false,
    draftReady: true,
    infrastructureReady: false,
    blockingReasons: PlanningCompatibleValidationBlockers.map((code) => ({ code, category: "infrastructure" })),
    warnings: [],
    validatedGoalDraft: { id: goalDraft.id, fingerprint: sourceRevisions.goalDraft, value: goalDraft },
    validatedProtocolDraft: { id: protocolDraft.id, fingerprint: sourceRevisions.protocolDraft, value: protocolDraft },
    expectedWriteCounts: {
      futureProtocolRecords: 15,
      activeReplacementProtocols: 15,
      pausedProtocols: 0,
      leftBehindProtocols: 0,
      provenanceRelationships: 15,
      activeProtocolGoalRelationships: 15,
      futureCommitments: 9,
      schedulerIntents: 1,
      reminderIntents: 9,
      briefingCadenceWrites: 1,
      evidenceWrites: 0,
      goalTransitionDraftConsumptions: 1,
      protocolTransitionDraftConsumptions: 1,
      transitionDraftConsumptions: 2,
    },
    sourceRevisions,
    transitionIdentity: {
      userId: "synthetic-user",
      sourceGoalId: "source-visible-abs",
      targetGoalDraftId: "target-build-lean-mass",
      goalTransitionDraftId: "goal-transition",
      protocolTransitionDraftId: "protocol-transition",
    },
    futureProtocolPlan,
    evaluatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function build(input = validationResult(), options = {}) {
  return buildGoalTransitionActivationTransactionPlan({
    validationResult: input,
    builtAt: options.builtAt ?? new Date("2026-07-20T05:00:00.000Z"),
    executionCapabilities: options.executionCapabilities ?? {},
  });
}

function operations(plan, type) {
  return plan.operations.filter((operation) => operation.type === type);
}

function indexOf(plan, type) {
  return plan.operations.find((operation) => operation.type === type)?.order ?? -1;
}

describe("GoalTransitionActivationTransactionPlanBuilder", () => {
  it("builds a complete, non-executable plan from authoritative draft-valid input", () => {
    const plan = build();
    expect(plan.planComplete).toBe(true);
    expect(plan.executionInfrastructureReady).toBe(false);
    expect(plan.executable).toBe(false);
    expect(plan.operations).toHaveLength(97);
    expect(validateGoalTransitionActivationPlan(plan)).toBe(true);
  });

  it("consumes both drafts after target activation and before final invariants", () => {
    const plan = build();
    const goal = operations(plan, "CONSUME_GOAL_TRANSITION_DRAFT");
    const protocol = operations(plan, "CONSUME_PROTOCOL_TRANSITION_DRAFT");
    const targetOrder = indexOf(plan, "ACTIVATE_TARGET_GOAL");
    const invariantOrder = indexOf(plan, "VALIDATE_FINAL_STAGED_STATE");
    expect(goal).toHaveLength(1);
    expect(protocol).toHaveLength(1);
    expect(goal[0]).toMatchObject({
      id: "activation_op_086_consume_goal_transition_draft",
      repository: "goalTransitionDrafts",
      action: "consume",
    });
    expect(protocol[0]).toMatchObject({
      id: "activation_op_087_consume_protocol_transition_draft",
      repository: "protocolTransitionDrafts",
      action: "consume",
    });
    expect(goal[0].order).toBeGreaterThan(targetOrder);
    expect(protocol[0].dependsOn).toContain(goal[0].id);
    expect(protocol[0].order).toBeLessThan(invariantOrder);
    expect(plan.generatedWriteCounts).toMatchObject({
      goalTransitionDraftConsumptions: 1,
      protocolTransitionDraftConsumptions: 1,
      transitionDraftConsumptions: 2,
      founderStoreMutationOperations: 87,
    });
  });

  it("is deterministic for identical semantic input", () => {
    const first = build();
    const second = build(structuredClone(validationResult()));
    expect({
      planId: first.planId,
      fingerprint: first.planFingerprint,
      operations: first.operations,
      graph: first.operationGraph,
      counts: first.generatedWriteCounts,
      invariants: first.stagedInvariants,
    }).toEqual({
      planId: second.planId,
      fingerprint: second.planFingerprint,
      operations: second.operations,
      graph: second.operationGraph,
      counts: second.generatedWriteCounts,
      invariants: second.stagedInvariants,
    });
  });

  it("excludes injected build timestamps from semantic identity", () => {
    const input = validationResult();
    const first = build(input, { builtAt: new Date("2026-01-01") });
    const second = build(input, { builtAt: new Date("2027-01-01") });
    expect(first.builtAt).not.toBe(second.builtAt);
    expect(first.planFingerprint).toBe(second.planFingerprint);
    expect(first.planId).toBe(second.planId);
  });

  it.each([
    ["goal draft", (input) => {
      input.sourceRevisions.goalDraft = "changed-goal";
      input.validatedGoalDraft.fingerprint = "changed-goal";
    }],
    ["protocol draft", (input) => {
      input.sourceRevisions.protocolDraft = "changed-protocol";
      input.validatedProtocolDraft.fingerprint = "changed-protocol";
    }],
    ["future protocol identity", (input) => { input.futureProtocolPlan[0].id = "changed-future-id"; }],
  ])("changes plan identity when %s changes", (_name, mutate) => {
    const baseline = build();
    const changed = validationResult();
    mutate(changed);
    expect(build(changed).planFingerprint).not.toBe(baseline.planFingerprint);
  });

  it.each([
    ["missing result", null, E.VALIDATION_RESULT_REQUIRED],
    ["draft not ready", (input) => { input.draftReady = false; }, E.DRAFT_NOT_READY],
    ["missing transition identity", (input) => { input.transitionIdentity = null; }, E.TRANSITION_IDENTITY_MISSING],
    ["missing source revisions", (input) => { input.sourceRevisions = null; }, E.SOURCE_REVISIONS_MISSING],
    ["missing future plan", (input) => { input.futureProtocolPlan = []; }, E.FUTURE_PROTOCOL_PLAN_MISSING],
    ["unsupported blocker", (input) => {
      input.blockingReasons.push({ code: "ACTIVE_GOAL_COUNT_INVALID" });
    }, E.BLOCKING_REASON_UNSUPPORTED],
    ["missing validated draft", (input) => { input.validatedGoalDraft = null; }, E.VALIDATED_DRAFT_MISSING],
  ])("rejects %s", (_name, mutation, code) => {
    if (mutation === null) {
      expect(() => buildGoalTransitionActivationTransactionPlan()).toThrow(expect.objectContaining({ code }));
      return;
    }
    const input = validationResult();
    mutation(input);
    expect(() => build(input)).toThrow(expect.objectContaining({ code }));
  });

  it("accepts only the explicit planning-compatible infrastructure blockers", () => {
    const plan = build();
    expect(plan.planComplete).toBe(true);
    expect(plan.metadata.planningCompatibleValidationBlockers)
      .toEqual(PlanningCompatibleValidationBlockers);
    expect(plan.executionBlockers.map((blocker) => blocker.code))
      .toEqual(expect.arrayContaining(PlanningCompatibleValidationBlockers));
  });

  it("keeps plan completeness separate from coordinator execution readiness", () => {
    const plan = build(validationResult(), {
      executionCapabilities: {
        activationCoordinator: true,
        productionActivationBoundary: true,
        finalFingerprintRevalidation: true,
      },
    });
    expect(plan.planComplete).toBe(true);
    expect(plan.executionInfrastructureReady).toBe(false);
    expect(plan.executable).toBe(false);
  });

  it("places preconditions first and commit/publication/external effects last", () => {
    const plan = build();
    expect(plan.operations[0].phase).toBe(P.PRECONDITION_ASSERTIONS);
    expect(indexOf(plan, T.VALIDATE_FINAL_STAGED_STATE)).toBeLessThan(indexOf(plan, T.COMMIT_FOUNDER_STORE));
    expect(indexOf(plan, T.COMMIT_FOUNDER_STORE)).toBeLessThan(indexOf(plan, T.PUBLISH_LIVE_RUNTIME));
    expect(operations(plan, T.DECLARE_EXTERNAL_EFFECT)
      .every((operation) => operation.order > indexOf(plan, T.COMMIT_FOUNDER_STORE))).toBe(true);
  });

  it("orders goal completion, target creation, and final activation safely", () => {
    const plan = build();
    const completion = indexOf(plan, T.COMPLETE_SOURCE_GOAL);
    const creation = indexOf(plan, T.CREATE_TARGET_GOAL);
    const activation = indexOf(plan, T.ACTIVATE_TARGET_GOAL);
    expect(completion).toBeLessThan(creation);
    expect(creation).toBeLessThan(activation);
    expect(operations(plan, T.LINK_PROTOCOL_TO_GOAL).every((operation) => operation.order < activation)).toBe(true);
    expect(operations(plan, T.CREATE_COMMITMENT).every((operation) => operation.order < activation)).toBe(true);
    expect(operations(plan, T.CREATE_REMINDER_INTENT).every((operation) => operation.order < activation)).toBe(true);
    expect(indexOf(plan, T.UPDATE_COACHING_CADENCE)).toBeLessThan(activation);
    expect(indexOf(plan, T.RESOLVE_COMPLETION_RECOMMENDATION)).toBeLessThan(activation);
  });

  it("orders every protocol root before its version, provenance, ownership, commitments, and reminders", () => {
    const plan = build();
    for (const root of operations(plan, T.CREATE_FUTURE_PROTOCOL)) {
      const downstream = plan.operations.filter((operation) =>
        operation.sourceEntityId === root.entityId
        || operation.targetEntityId === root.entityId
        || operation.payload?.sourceProtocolId === root.entityId
      );
      expect(downstream.every((operation) => operation.order > root.order)).toBe(true);
    }
  });

  it("reconciles the exact accepted transition write counts", () => {
    const plan = build();
    expect(plan.generatedWriteCounts).toMatchObject({
      futureProtocolRecords: 15,
      activeReplacementProtocols: 15,
      pausedProtocols: 0,
      leftBehindProtocols: 0,
      provenanceRelationships: 15,
      activeProtocolGoalRelationships: 15,
      futureCommitments: 9,
      goalTransitionDraftConsumptions: 1,
      protocolTransitionDraftConsumptions: 1,
      transitionDraftConsumptions: 2,
      reminderIntents: 9,
      schedulerIntents: 1,
      briefingCadenceWrites: 1,
      evidenceWrites: 0,
      protocolVersions: 15,
      goalCreations: 1,
      completionRecommendationWrites: 1,
    });
    expect(operations(plan, T.CREATE_FUTURE_PROTOCOL)).toHaveLength(15);
    expect(operations(plan, T.CREATE_PROTOCOL_PROVENANCE)).toHaveLength(15);
    expect(operations(plan, T.LINK_PROTOCOL_TO_GOAL)).toHaveLength(15);
    expect(operations(plan, T.CREATE_COMMITMENT)).toHaveLength(9);
    expect(operations(plan, T.CREATE_REMINDER_INTENT)).toHaveLength(9);
  });

  it("rejects expected-count drift rather than normalizing it", () => {
    const input = validationResult();
    input.expectedWriteCounts.futureCommitments = 8;
    expect(() => build(input)).toThrow(expect.objectContaining({
      code: E.EXPECTED_COUNT_MISMATCH,
      field: "futureCommitments",
      expected: 8,
      actual: 9,
    }));
  });

  it.each([
    ["keep", 2],
    ["update", 1],
    ["replace", 0],
  ])("%s produces a distinct root, version, provenance, and ownership sequence", (disposition, index) => {
    const plan = build();
    const protocolId = `future-protocol-${index}`;
    const root = operations(plan, T.CREATE_FUTURE_PROTOCOL).find((operation) => operation.entityId === protocolId);
    expect(root.payload.disposition).toBe(disposition);
    expect(operations(plan, T.CREATE_PROTOCOL_VERSION).some((operation) => operation.targetEntityId === protocolId)).toBe(true);
    expect(operations(plan, T.CREATE_PROTOCOL_PROVENANCE).some((operation) => operation.targetEntityId === protocolId)).toBe(true);
    expect(operations(plan, T.LINK_PROTOCOL_TO_GOAL).some((operation) => operation.sourceEntityId === protocolId)).toBe(true);
  });

  it.each([
    ["pause", "pausedProtocols"],
    ["leave_behind", "leftBehindProtocols"],
  ])("%s produces no target replacement operations", (disposition, countKey) => {
    const input = validationResult();
    const review = input.validatedProtocolDraft.value.protocolReviews[14];
    review.intendedDisposition = disposition;
    input.futureProtocolPlan = input.futureProtocolPlan.filter((item) => item.reviewId !== review.id);
    for (const key of [
      "futureProtocolRecords", "activeReplacementProtocols", "provenanceRelationships", "activeProtocolGoalRelationships",
    ]) input.expectedWriteCounts[key] -= 1;
    input.expectedWriteCounts[countKey] = 1;
    const plan = build(input);
    expect(plan.generatedWriteCounts[countKey]).toBe(1);
    expect(plan.operations.some((operation) => operation.sourceEntityId === review.sourceProtocolId
      && operation.type === T.CREATE_FUTURE_PROTOCOL)).toBe(false);
  });

  it.each(["peptide", "supplement"])("rejects grouped %s preview identities as production IDs", (category) => {
    const input = validationResult();
    input.futureProtocolPlan[0].id = `group_preview_${category}_cloned`;
    input.futureProtocolPlan[0].category = category;
    expect(() => build(input)).toThrow(expect.objectContaining({ code: E.GROUPED_PREVIEW_ID_FORBIDDEN }));
  });

  it("keeps grouped underlying records as independent sequences", () => {
    const plan = build();
    const groupedRoots = operations(plan, T.CREATE_FUTURE_PROTOCOL)
      .filter((operation) => ["peptide", "supplement"].includes(operation.payload.category));
    expect(groupedRoots).toHaveLength(6);
    expect(new Set(groupedRoots.map((operation) => operation.entityId)).size).toBe(6);
  });

  it("uses historical protocol IDs only as immutable sources or provenance targets", () => {
    const plan = build();
    expect(plan.operations.some((operation) =>
      ["updateHistoricalProtocol", "deleteHistoricalProtocol", "reassignHistoricalOwnership"]
        .includes(operation.action))).toBe(false);
    expect(operations(plan, T.CREATE_FUTURE_PROTOCOL)
      .every((operation) => operation.entityId !== operation.sourceEntityId)).toBe(true);
  });

  it("contains only earlier, existing dependencies and no cycle", () => {
    const plan = build();
    const byId = new Map(plan.operations.map((operation) => [operation.id, operation]));
    for (const operation of plan.operations) {
      for (const dependency of operation.dependsOn) {
        expect(byId.has(dependency)).toBe(true);
        expect(byId.get(dependency).order).toBeLessThan(operation.order);
      }
    }
  });

  it.each([
    ["duplicate operation ID", (plan) => { plan.operations[1].id = plan.operations[0].id; }, E.OPERATION_ID_DUPLICATE],
    ["invalid dependency", (plan) => { plan.operations[1].dependsOn = ["missing"]; }, E.DEPENDENCY_INVALID],
    ["unsupported repository", (plan) => { plan.operations[1].repository = "canonicalEvidence"; }, E.REPOSITORY_UNSUPPORTED],
    ["evidence mutation", (plan) => {
      plan.operations[1].repository = "canonicalEvidence";
      plan.operations[1].phase = P.SOURCE_GOAL_COMPLETION;
    }, E.REPOSITORY_UNSUPPORTED],
    ["commit before invariant", (plan) => {
      const commit = plan.operations.find((operation) => operation.type === T.COMMIT_FOUNDER_STORE);
      commit.order = 0;
    }, E.PHASE_ORDER_INVALID],
    ["external effect before commit", (plan) => {
      const effect = plan.operations.find((operation) => operation.type === T.DECLARE_EXTERNAL_EFFECT);
      effect.phase = P.PRECONDITION_ASSERTIONS;
    }, E.PHASE_ORDER_INVALID],
    ["missing invariant", (plan) => { plan.stagedInvariants.pop(); }, E.INVARIANT_SET_INCOMPLETE],
  ])("plan integrity rejects %s", (_name, mutate, code) => {
    const plan = structuredClone(build());
    mutate(plan);
    expect(() => validateGoalTransitionActivationPlan(plan))
      .toThrow(expect.objectContaining({ code }));
  });

  it("embeds every authoritative revision and fingerprint requirement", () => {
    const input = validationResult();
    const plan = build(input);
    expect(plan.preCommitRequirements).toMatchObject({
      expectedFounderStoreRevision: 0,
      activationCriticalFingerprint: input.sourceRevisions.activationCriticalState,
      goalDraftFingerprint: input.sourceRevisions.goalDraft,
      protocolDraftFingerprint: input.sourceRevisions.protocolDraft,
      activeGoalStateFingerprint: input.sourceRevisions.activeGoalState,
      historicalProtocolOwnershipFingerprint: input.sourceRevisions.historicalProtocolOwnership,
      commitmentSourceFingerprint: input.sourceRevisions.commitmentSourceState,
      schedulerSourceFingerprint: input.sourceRevisions.schedulerIntentSourceState,
      evidenceRelationshipFingerprint: input.sourceRevisions.evidenceRelationshipState,
      planFingerprint: plan.planFingerprint,
    });
  });

  it("includes the complete stable staged-invariant suite", () => {
    const plan = build();
    expect(plan.stagedInvariants.map((invariant) => invariant.code))
      .toEqual(Object.values(GoalTransitionActivationStagedInvariantCode));
  });

  it("keeps external scheduling post-commit and evidence repositories out of atomic operations", () => {
    const plan = build();
    const scheduler = plan.externalEffects.find((effect) => effect.type === "EXTERNAL_SCHEDULER_EXECUTION");
    expect(scheduler).toMatchObject({
      timing: "post_commit_only",
      retryModel: "idempotent_retry_from_persisted_intent",
      deferred: true,
    });
    expect(plan.operations.some((operation) =>
      /canonicalEvidence|evidencePackages|evidenceReviews/.test(operation.repository))).toBe(false);
    expect(plan.generatedWriteCounts.evidenceWrites).toBe(0);
  });

  it("is deeply immutable and returned payloads cannot be changed", () => {
    const plan = build();
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.operations)).toBe(true);
    expect(Object.isFrozen(plan.operations[0].payload)).toBe(true);
    expect(Object.isFrozen(plan.operations[0].dependsOn)).toBe(true);
    expect(() => plan.operations.push({})).toThrow();
    expect(() => { plan.operations[0].payload.changed = true; }).toThrow();
    expect(plan.operations[0].payload.changed).toBeUndefined();
  });

  it("performs no writes, opens no unit of work, and constructs no staged repositories", () => {
    const forbidden = {
      begin: vi.fn(), execute: vi.fn(), mutate: vi.fn(), commit: vi.fn(),
      save: vi.fn(), persist: vi.fn(), createStagedRepositories: vi.fn(),
    };
    build();
    Object.values(forbidden).forEach((operation) => expect(operation).not.toHaveBeenCalled());
  });

  it("leaves the production runtime byte-for-byte unchanged", () => {
    const production = "private/founder/runtime-store.json";
    const before = fs.readFileSync(production);
    build();
    expect(fs.readFileSync(production)).toEqual(before);
  }, 30_000);
});
