import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GoalTransitionActivationCoordinatorErrorCode as E,
  GoalTransitionActivationCoordinatorState as S,
  GoalTransitionActivationDispatchRegistry,
  GoalTransitionActivationExecutionClass as C,
  GoalTransitionActivationInvariantRegistry,
  GoalTransitionActivationPostCommitEffectRegistry,
  validateGoalTransitionActivationCoordinatorCompatibility,
  validateGoalTransitionActivationCoordinatorResult,
  validateGoalTransitionActivationCoordinatorStateTransition,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  GoalTransitionActivationPlanOperationType as T,
  GoalTransitionActivationPlanPhase as P,
  PlanningCompatibleValidationBlockers,
  buildGoalTransitionActivationTransactionPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import { ActivationStagedRepositoryContract } from "../../data/repositories/ActivationStagedRepositoryFactory";

function validatorResult() {
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
    sourceGoalId: "visible-abs",
    primaryObjective: { id: "build-lean-mass", type: "build_lean_mass", title: "Build Lean Mass" },
    operatingState: { value: "calibration", accepted: true },
    guardrails: [{ text: "Maintain approximately 8–9% body fat.", accepted: true }],
    evidenceStrategy: { outcomeMeasures: [{}], predictiveSignals: [{}] },
    briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  };
  const protocolDraft = {
    id: "protocol-transition",
    goalTransitionDraftId: goalDraft.id,
    protocolReviews: reviews,
    protocolDrafts: reviews.map((review, index) => ({
      id: `preview-${index}`,
      reviewId: review.id,
      payload: { strategy: `strategy-${index}` },
    })),
    generatedCommitments: reviews.slice(0, 9).map((review, index) => ({
      id: `commitment-${index}`,
      sourceProtocolId: review.sourceProtocolId,
      requirement: `Routine ${index}`,
      frequency: index % 2 ? "weekly" : "daily",
    })),
  };
  const sourceRevisions = {
    founderStoreRevision: 0,
    goalDraft: "goal-fp",
    protocolDraft: "protocol-fp",
    activeGoalState: "active-fp",
    historicalProtocolOwnership: "history-fp",
    commitmentSourceState: "commitment-fp",
    schedulerIntentSourceState: "scheduler-fp",
    evidenceRelationshipState: "evidence-fp",
    activationCriticalState: "critical-fp",
  };
  return {
    ready: false,
    draftReady: true,
    infrastructureReady: false,
    blockingReasons: PlanningCompatibleValidationBlockers.map((code) => ({ code })),
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
      userId: "u",
      sourceGoalId: "visible-abs",
      targetGoalDraftId: "build-lean-mass",
      goalTransitionDraftId: goalDraft.id,
      protocolTransitionDraftId: protocolDraft.id,
    },
    futureProtocolPlan: reviews.map((review, index) => ({
      id: `future-${index}`,
      reviewId: review.id,
      sourceProtocolId: review.sourceProtocolId,
      sourceVersionId: review.sourceVersionId,
      provenanceSourceType: "historical_protocol",
      category: review.category,
      disposition: review.intendedDisposition,
      active: true,
    })),
  };
}

function plan() {
  return buildGoalTransitionActivationTransactionPlan({
    validationResult: validatorResult(),
    builtAt: new Date("2026-07-20T06:00:00.000Z"),
  });
}

function compatibility(options = {}) {
  return validateGoalTransitionActivationCoordinatorCompatibility({
    plan: options.plan ?? plan(),
    dispatchRegistry: options.dispatchRegistry,
    repositoryContract: options.repositoryContract,
    assertionRegistry: options.assertionRegistry,
    invariantRegistry: options.invariantRegistry,
    effectRegistry: options.effectRegistry,
    stateModel: options.stateModel,
    resultContract: options.resultContract,
    availability: options.availability,
    evaluatedAt: options.evaluatedAt,
  });
}

function mutablePlan() {
  return structuredClone(plan());
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function mutableRegistry() {
  return structuredClone(GoalTransitionActivationDispatchRegistry);
}

describe("GoalTransitionActivationCoordinatorContract", () => {
  it("accounts for every current immutable plan node exactly once", () => {
    const result = compatibility();
    expect(result.compatible).toBe(true);
    expect(result.operationCoverage).toEqual({
      total: 97,
      accountedForExactlyOnce: 97,
      byExecutionClass: {
        [C.READ_ONLY_ASSERTION]: 1,
        [C.STAGED_REPOSITORY_MUTATION]: 87,
        [C.STAGED_INVARIANT_VALIDATION]: 1,
        [C.UNIT_OF_WORK_COMMIT]: 1,
        [C.RUNTIME_PUBLICATION]: 1,
        [C.POST_COMMIT_EXTERNAL_EFFECT]: 6,
      },
    });
    expect(result.unsupportedOperations).toEqual([]);
    expect(result.ambiguousOperations).toEqual([]);
  });

  it("maps all 87 founder-store mutations to one actual staged repository method", () => {
    const result = compatibility();
    const staged = result.operationMappings.filter((mapping) => mapping.executionClass === C.STAGED_REPOSITORY_MUTATION);
    expect(staged).toHaveLength(87);
    for (const mapping of staged) {
      expect(ActivationStagedRepositoryContract.repositories[mapping.repositoryKey].methods)
        .toContain(mapping.methodName);
    }
  });

  it("covers assertion, invariant, commit, publication, and all external obligations", () => {
    const result = compatibility();
    expect(result.assertionCoverage).toMatchObject({ operationCount: 1, handlers: ["assertSourceState"] });
    expect(result.invariantCoverage.operationCount).toBe(1);
    expect(result.invariantCoverage.recognizedCodes)
      .toEqual(Object.keys(GoalTransitionActivationInvariantRegistry.handlers));
    expect(result.commitBoundaryCompatible).toBe(true);
    expect(result.publicationBoundaryCompatible).toBe(true);
    expect(result.effectCoverage).toMatchObject({
      operationCount: 6,
      effects: Object.keys(GoalTransitionActivationPostCommitEffectRegistry.effects),
    });
  });

  it("dispatches no evidence operation", () => {
    const result = compatibility();
    expect(result.operationMappings.some((mapping) => /evidence/i.test(mapping.repositoryKey))).toBe(false);
    expect(result.repositoryCoverage.participatingRepositories).not.toContain("canonicalEvidence");
  });

  it("is deterministic and excludes evaluatedAt from its fingerprint", () => {
    const currentPlan = plan();
    const first = compatibility({ plan: currentPlan, evaluatedAt: new Date("2026-01-01") });
    const second = compatibility({ plan: currentPlan, evaluatedAt: new Date("2027-01-01") });
    expect(first.evaluatedAt).not.toBe(second.evaluatedAt);
    expect(first.compatibilityFingerprint).toBe(second.compatibilityFingerprint);
    expect(first.operationMappings).toEqual(second.operationMappings);
  });

  it.each([
    ["operation mapping", (options) => { options.dispatchRegistry[1].idempotencyKeyStrategy = "changed"; }],
    ["repository method", (options) => { options.dispatchRegistry[1].methodName = "addFutureGoal"; }],
    ["payload requirement", (options) => { options.dispatchRegistry[1].requiredPayloadPaths = ["activationHistory.transitionId"]; }],
    ["legal state transition", (options) => { options.stateModel.transitions.idle = ["aborted"]; }],
  ])("changes compatibility fingerprint when %s changes", (_name, mutate) => {
    const baseline = compatibility();
    const options = {
      dispatchRegistry: mutableRegistry(),
      stateModel: structuredClone(baseline.coordinatorStateModel),
    };
    mutate(options);
    const changed = compatibility(options);
    expect(changed.compatibilityFingerprint).not.toBe(baseline.compatibilityFingerprint);
  });

  it("rejects a missing, incomplete, or mutable plan", () => {
    expect(() => validateGoalTransitionActivationCoordinatorCompatibility())
      .toThrow(expect.objectContaining({ code: E.PLAN_REQUIRED }));
    expect(() => validateGoalTransitionActivationCoordinatorCompatibility({ plan: { planComplete: false } }))
      .toThrow(expect.objectContaining({ code: E.PLAN_INCOMPLETE }));
    expect(() => validateGoalTransitionActivationCoordinatorCompatibility({ plan: mutablePlan() }))
      .toThrow(expect.objectContaining({ code: E.PLAN_NOT_IMMUTABLE }));
  });

  it("rejects unknown, unmapped, and ambiguous operation types", () => {
    const unknown = mutablePlan();
    unknown.operations[0].type = "UNKNOWN_OPERATION";
    expect(() => compatibility({ plan: freeze(unknown) }))
      .toThrow(expect.objectContaining({ code: E.OPERATION_UNMAPPED }));

    const missing = mutableRegistry().filter((descriptor) => descriptor.operationType !== T.CREATE_TARGET_GOAL);
    expect(() => compatibility({ dispatchRegistry: missing }))
      .toThrow(expect.objectContaining({ code: E.OPERATION_UNMAPPED }));

    const ambiguous = mutableRegistry();
    ambiguous.push(structuredClone(ambiguous[0]));
    expect(() => compatibility({ dispatchRegistry: ambiguous }))
      .toThrow(expect.objectContaining({ code: E.OPERATION_AMBIGUOUS }));
  });

  it("rejects mutation-as-read-only and external-effect-as-staged classifications", () => {
    const mutationRegistry = mutableRegistry();
    const mutation = mutationRegistry.find((entry) => entry.operationType === T.COMPLETE_SOURCE_GOAL);
    mutation.executionClass = C.READ_ONLY_ASSERTION;
    mutation.boundaryKey = "assertions";
    mutation.repositoryKey = null;
    mutation.methodName = "assertSourceState";
    expect(() => compatibility({ dispatchRegistry: mutationRegistry }))
      .toThrow(expect.objectContaining({ code: E.OPERATION_CLASS_INVALID }));

    const externalRegistry = mutableRegistry();
    const external = externalRegistry.find((entry) => entry.operationType === T.DECLARE_EXTERNAL_EFFECT);
    external.executionClass = C.STAGED_REPOSITORY_MUTATION;
    external.repositoryKey = "reminders";
    external.methodName = "add";
    expect(() => compatibility({ dispatchRegistry: externalRegistry }))
      .toThrow(expect.objectContaining({ code: E.OPERATION_CLASS_INVALID }));
  });

  it("rejects unknown repositories and missing methods", () => {
    const unknownRepository = mutableRegistry();
    unknownRepository.find((entry) => entry.operationType === T.COMPLETE_SOURCE_GOAL).repositoryKey = "unknown";
    expect(() => compatibility({ dispatchRegistry: unknownRepository }))
      .toThrow(expect.objectContaining({ code: E.REPOSITORY_UNAVAILABLE }));

    const missingMethod = mutableRegistry();
    missingMethod.find((entry) => entry.operationType === T.COMPLETE_SOURCE_GOAL).methodName = "missing";
    expect(() => compatibility({ dispatchRegistry: missingMethod }))
      .toThrow(expect.objectContaining({ code: E.METHOD_UNAVAILABLE }));
  });

  it.each([
    ["missing payload", (candidate) => { delete candidate.operations.find((op) => op.type === T.CREATE_COMMITMENT).payload.sourceProtocolId; }, E.PAYLOAD_INVALID],
    ["missing entity identity", (candidate) => { candidate.operations.find((op) => op.type === T.CREATE_COMMITMENT).entityId = ""; }, E.PAYLOAD_INVALID],
    ["missing transition identity", (candidate) => { candidate.transitionIdentity = null; }, E.PAYLOAD_INVALID],
    ["grouped peptide preview", (candidate) => {
      candidate.operations.find((op) => op.type === T.CREATE_FUTURE_PROTOCOL).entityId = "group_preview_peptide";
    }, E.GROUPED_PREVIEW_ID_FORBIDDEN],
    ["grouped supplement preview", (candidate) => {
      candidate.operations.find((op) => op.type === T.CREATE_FUTURE_PROTOCOL).entityId = "group_preview_supplement";
    }, E.GROUPED_PREVIEW_ID_FORBIDDEN],
    ["historical ID reuse", (candidate) => {
      const operation = candidate.operations.find((op) => op.type === T.CREATE_FUTURE_PROTOCOL);
      operation.entityId = operation.sourceEntityId;
    }, E.HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN],
    ["unsupported phase", (candidate) => {
      candidate.operations.find((op) => op.type === T.CREATE_COMMITMENT).phase = P.TARGET_GOAL_CREATION;
    }, E.PHASE_UNSUPPORTED],
  ])("rejects %s", (_name, mutate, code) => {
    const candidate = mutablePlan();
    mutate(candidate);
    expect(() => compatibility({ plan: freeze(candidate) }))
      .toThrow(expect.objectContaining({ code }));
  });

  it("rejects historical mutation mappings and evidence repository dispatch", () => {
    const historical = mutableRegistry();
    historical.find((entry) => entry.operationType === T.CREATE_FUTURE_PROTOCOL).methodName = "updateHistoricalProtocol";
    expect(() => compatibility({ dispatchRegistry: historical }))
      .toThrow(expect.objectContaining({ code: E.HISTORICAL_PROTOCOL_MUTATION_FORBIDDEN }));

    const evidence = mutableRegistry();
    evidence.find((entry) => entry.operationType === T.CREATE_COMMITMENT).repositoryKey = "canonicalEvidence";
    expect(() => compatibility({ dispatchRegistry: evidence }))
      .toThrow(expect.objectContaining({ code: E.EVIDENCE_OPERATION_FORBIDDEN }));
  });

  it("rejects missing assertion and invariant handlers and unknown invariant codes", () => {
    const assertions = structuredClone(compatibility().coordinatorResultContract);
    expect(assertions).toBeTruthy();
    expect(() => compatibility({
      assertionRegistry: { version: "test", handlers: {} },
    })).toThrow(expect.objectContaining({ code: E.ASSERTION_HANDLER_MISSING }));

    const missingInvariant = structuredClone(GoalTransitionActivationInvariantRegistry);
    delete missingInvariant.handlers[Object.keys(missingInvariant.handlers)[0]];
    expect(() => compatibility({ invariantRegistry: missingInvariant }))
      .toThrow(expect.objectContaining({ code: E.INVARIANT_HANDLER_MISSING }));

    const candidate = mutablePlan();
    candidate.operations.find((op) => op.type === T.VALIDATE_FINAL_STAGED_STATE)
      .payload.invariantCodes.push("UNKNOWN_INVARIANT");
    expect(() => compatibility({ plan: freeze(candidate) }))
      .toThrow(expect.objectContaining({ code: E.INVARIANT_HANDLER_MISSING }));
  });

  it("rejects missing, duplicate, or incorrectly ordered commit/publication/effect boundaries", () => {
    const missing = mutablePlan();
    missing.operations = missing.operations.filter((op) => op.type !== T.COMMIT_FOUNDER_STORE);
    expect(() => compatibility({ plan: freeze(missing) }))
      .toThrow(expect.objectContaining({ code: E.COMMIT_BOUNDARY_INVALID }));

    const duplicate = mutablePlan();
    duplicate.operations.push(structuredClone(
      duplicate.operations.find((op) => op.type === T.COMMIT_FOUNDER_STORE)
    ));
    expect(() => compatibility({ plan: freeze(duplicate) }))
      .toThrow(expect.objectContaining({ code: E.COMMIT_BOUNDARY_INVALID }));

    const publication = mutablePlan();
    publication.operations.find((op) => op.type === T.PUBLISH_LIVE_RUNTIME).order = 0;
    expect(() => compatibility({ plan: freeze(publication) }))
      .toThrow(expect.objectContaining({ code: E.PUBLICATION_BOUNDARY_INVALID }));

    const external = mutablePlan();
    external.operations.find((op) => op.type === T.DECLARE_EXTERNAL_EFFECT).order = 0;
    expect(() => compatibility({ plan: freeze(external) }))
      .toThrow(expect.objectContaining({ code: E.EXTERNAL_EFFECT_ORDER_INVALID }));
  });

  it("classifies all post-commit effects as non-rollback and currently unavailable", () => {
    const effects = GoalTransitionActivationPostCommitEffectRegistry.effects;
    expect(effects.EXTERNAL_SCHEDULER_EXECUTION).toMatchObject({
      postCommitOnly: true,
      retryable: true,
      idempotencyRequired: true,
      failureRollsBackFounderStore: false,
      executionAvailable: false,
      failureBlocksCompletion: true,
    });
    for (const type of [
      "HOME_RECONCILIATION",
      "GOALS_RECONCILIATION",
      "PROTOCOLS_RECONCILIATION",
      "EVIDENCE_LANDING_RECONCILIATION",
    ]) {
      expect(effects[type]).toMatchObject({
        deferred: true,
        postCommitOnly: true,
        failureRollsBackFounderStore: false,
      });
    }
    expect(effects.BRIEFING_REGENERATION_OR_CATCH_UP).toMatchObject({
      deferred: true,
      automatic: false,
    });
  });

  it("accepts legal coordinator paths and rejects illegal state transitions", () => {
    const path = [
      S.IDLE,
      S.VALIDATING,
      S.PLANNING,
      S.OPENING_TRANSACTION,
      S.STAGING,
      S.VALIDATING_STAGED_STATE,
      S.COMMITTING,
      S.COMMITTED,
      S.PUBLISHING,
      S.POST_COMMIT_PENDING,
      S.COMPLETED,
    ];
    for (let index = 1; index < path.length; index += 1) {
      expect(validateGoalTransitionActivationCoordinatorStateTransition(path[index - 1], path[index]))
        .toBe(true);
    }
    expect(() => validateGoalTransitionActivationCoordinatorStateTransition(S.IDLE, S.COMMITTED))
      .toThrow(expect.objectContaining({ code: E.STATE_TRANSITION_INVALID }));
  });

  it("enforces pre-commit, committed-failure, post-commit, and completed result semantics", () => {
    expect(validateGoalTransitionActivationCoordinatorResult({
      status: S.FAILED_PRE_COMMIT,
      committed: false,
      completed: false,
      preCommitFailure: true,
    })).toBe(true);
    expect(() => validateGoalTransitionActivationCoordinatorResult({
      status: S.FAILED_PRE_COMMIT,
      committed: true,
      preCommitFailure: true,
    })).toThrow(expect.objectContaining({ code: E.RESULT_CONTRACT_INVALID }));
    expect(validateGoalTransitionActivationCoordinatorResult({
      status: S.FAILED_COMMITTED,
      committed: true,
      completed: false,
      postCommitFailure: true,
    })).toBe(true);
    expect(() => validateGoalTransitionActivationCoordinatorResult({
      status: S.FAILED_COMMITTED,
      committed: false,
      completed: false,
      postCommitFailure: true,
    })).toThrow(expect.objectContaining({ code: E.RESULT_CONTRACT_INVALID }));
    expect(() => validateGoalTransitionActivationCoordinatorResult({
      status: S.COMPLETED,
      committed: true,
      completed: true,
      pendingExternalEffects: [{ required: true }],
    })).toThrow(expect.objectContaining({ code: E.RESULT_CONTRACT_INVALID }));
    expect(validateGoalTransitionActivationCoordinatorResult({
      status: S.COMPLETED,
      committed: true,
      completed: true,
      pendingExternalEffects: [],
    })).toBe(true);
  });

  it("separates compatibility completeness from execution readiness", () => {
    const result = compatibility();
    expect(result).toMatchObject({
      compatible: true,
      coordinatorContractComplete: true,
      dispatchRegistryComplete: true,
      stagedRepositoryCoverageComplete: true,
      assertionCoverageComplete: true,
      invariantCoverageComplete: true,
      executingCoordinatorAvailable: false,
      productionActivationBoundaryAvailable: false,
      externalEffectExecutorsAvailable: false,
      executionReady: false,
    });
    expect(result.blockingReasons.map((reason) => reason.code)).toEqual([
      E.EXECUTOR_UNAVAILABLE,
      E.PRODUCTION_BOUNDARY_UNAVAILABLE,
      E.EXTERNAL_EXECUTOR_UNAVAILABLE,
    ]);
  });

  it("returns a deeply immutable compatibility result", () => {
    const result = compatibility();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.operationMappings)).toBe(true);
    expect(Object.isFrozen(result.coordinatorStateModel.transitions)).toBe(true);
    expect(() => result.operationMappings.push({})).toThrow();
  });

  it("performs zero writes and never opens a unit of work or staged repository factory", () => {
    const forbidden = {
      begin: vi.fn(),
      execute: vi.fn(),
      mutate: vi.fn(),
      commit: vi.fn(),
      abort: vi.fn(),
      createActivationStagedRepositories: vi.fn(),
      persist: vi.fn(),
      schedule: vi.fn(),
      publish: vi.fn(),
    };
    compatibility();
    Object.values(forbidden).forEach((operation) => expect(operation).not.toHaveBeenCalled());
  });

  it("leaves the production runtime byte-for-byte unchanged", () => {
    const production = "private/founder/runtime-store.json";
    const before = fs.readFileSync(production);
    compatibility();
    expect(fs.readFileSync(production)).toEqual(before);
  }, 30_000);
});
