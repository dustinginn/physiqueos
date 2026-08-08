import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createActivationStagedRepositories } from "../../data/repositories/ActivationStagedRepositoryFactory";
import {
  buildGoalTransitionActivationTransactionPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import { validateGoalTransitionActivation } from "./GoalTransitionActivationValidator";
import {
  validateGoalTransitionActivationCoordinatorCompatibility,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  captureGoalTransitionActivationSourceSnapshot,
  revalidateGoalTransitionActivationPreCommit,
  revalidateGoalTransitionActivationPreExecution,
} from "./GoalTransitionActivationSourceSnapshot";
import {
  GoalTransitionActivationExecutionErrorCode as E,
  createGoalTransitionActivationCoordinator,
} from "./GoalTransitionActivationCoordinator";

const temporaryDirectories = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function syntheticStore() {
  const reviews = Array.from({ length: 15 }, (_, index) => ({
    id: `review-${index}`,
    sourceProtocolId: `historical-${index}`,
    sourceVersionId: `historical-${index}-v1`,
    category: index < 2 ? "peptide" : index < 6 ? "supplement" : `category-${index}`,
    intendedDisposition: index % 3 === 0 ? "replace" : index % 3 === 1 ? "update" : "keep",
    name: `Synthetic protocol ${index}`,
  }));
  const goalDraft = {
    id: "goal-transition",
    userId: "synthetic-user",
    sourceGoalId: "goal_visible_abs_at_rest",
    status: "ready",
    sourceGoalSnapshot: { status: "active", userDecisionPending: true },
    primaryObjective: { id: "goal_build_lean_mass", type: "build_lean_mass", title: "Build Lean Mass" },
    operatingState: { value: "calibration", label: "Maintenance calibration", accepted: true },
    guardrails: [{ id: "body-fat", text: "Maintain approximately 8â€“9% body fat.", accepted: true }],
    evidenceStrategy: {
      outcomeMeasures: [{ id: "lean-mass", role: "outcome", accepted: true }],
      predictiveSignals: [{ id: "training", role: "predictive", accepted: true }],
    },
    briefingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] },
  };
  const generatedCommitments = reviews.slice(0, 9).map((review, index) => ({
    id: `commitment-${index}`,
    sourceProtocolId: review.sourceProtocolId,
    requirement: `Synthetic routine ${index}`,
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
      id: `accepted-preview-${index}`,
      reviewId: review.id,
      sourceProtocolId: review.sourceProtocolId,
      sourceVersionId: review.sourceVersionId,
      status: "ready",
      payload: { cadence: "weekly", syntheticStrategy: index },
    })),
    generatedCommitments,
    generatedRoutine: generatedCommitments.map((commitment, index) => ({
      id: `routine-${index}`,
      frequency: commitment.frequency,
      text: commitment.requirement,
      sourcePreviewProtocolId: `accepted-preview-${index}`,
    })),
  };
  return {
    version: "synthetic-founder-v1",
    updatedAt: "2026-07-20T00:00:00.000Z",
    user: { id: "synthetic-user", timeZone: "America/Los_Angeles" },
    goals: [{
      id: goalDraft.sourceGoalId,
      userId: "synthetic-user",
      title: "Visible Abs",
      type: "visible_abs",
      primary: true,
      status: "active",
      historicalChapter: { synthetic: true },
    }],
    goalTransitionDrafts: [goalDraft],
    goalProtocolTransitionDrafts: [protocolDraft],
    protocols: reviews.map((review) => ({
      id: review.sourceProtocolId,
      userId: "synthetic-user",
      status: "active",
      currentVersionId: review.sourceVersionId,
      relatedGoalIds: [goalDraft.sourceGoalId],
    })),
    protocolVersions: reviews.map((review) => ({
      id: review.sourceVersionId,
      protocolId: review.sourceProtocolId,
      status: "active",
      syntheticHistoricalPayload: review.id,
    })),
    executionItems: [],
    reminders: [],
    operatingPlan: { coachingCadence: { type: "daily" } },
    evidenceRelationships: [{ evidenceId: "evidence-relationship", goalId: goalDraft.sourceGoalId }],
    completionRecommendation: { id: "recommendation", userDecisionPending: true, historicalText: "Synthetic." },
    currentBriefingCadence: null,
    dailyBriefings: [{ id: "historical-briefing", content: "Synthetic historical briefing." }],
    canonicalEvidenceObjects: [{ canonicalId: "synthetic-evidence", type: "measurement" }],
    evidencePackages: [],
    evidenceReviews: [],
    weightEntries: [],
    dexaScans: [],
    progressPhotos: [],
    dailyCheckIns: [],
    analyses: [],
  };
}

function validatorInput(store) {
  const goalDraft = store.goalTransitionDrafts.find((draft) => draft.status === "ready");
  const protocolDraft = store.goalProtocolTransitionDrafts.find((draft) => draft.status === "ready");
  return {
    userId: store.user.id,
    timeZone: store.user.timeZone,
    repositoryRevision: Number.isSafeInteger(store.revision) ? store.revision : 0,
    goals: store.goals,
    goalDraft,
    protocolDraft,
    goalTransitionDrafts: store.goalTransitionDrafts,
    protocols: store.protocols,
    protocolVersions: store.protocolVersions,
    executionItems: store.executionItems,
    reminders: store.reminders,
    evidenceRelationships: store.evidenceRelationships,
    completionRecommendation: store.completionRecommendation,
    currentBriefingCadence: store.currentBriefingCadence,
    proposedWriteSet: { evidence: [] },
  };
}

async function harness({
  externalEffectHandlers = {},
  publish,
  serialize,
  stagedRepositoryFactory = createActivationStagedRepositories,
  unitOfWorkTransform,
  sourceAdapterTransform,
  isolationTransform,
  failOperationId,
  invariantMutation,
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-activation-"));
  temporaryDirectories.push(directory);
  const storePath = path.join(directory, "runtime-store.json");
  const productionStorePath = path.resolve("private/founder/runtime-store.json");
  const liveStore = syntheticStore();
  fs.writeFileSync(storePath, `${JSON.stringify(liveStore)}\n`);
  const readPersistedStore = vi.fn(() => JSON.parse(fs.readFileSync(storePath, "utf8")));
  const readLiveStore = vi.fn(() => liveStore);
  const validatorResult = validateGoalTransitionActivation({
    snapshot: validatorInput(liveStore),
    capabilities: {},
  });
  const plan = buildGoalTransitionActivationTransactionPlan({ validationResult: validatorResult });
  const compatibility = validateGoalTransitionActivationCoordinatorCompatibility({ plan });
  const sourceIdentity = {
    storeIdentity: "synthetic-goal-transition-store",
    storePath,
    storeKind: "synthetic",
  };
  const sourceSnapshot = await captureGoalTransitionActivationSourceSnapshot({
    readLiveStore,
    readPersistedStore,
    validatorResult,
    plan,
    coordinatorCompatibility: compatibility,
    sourceIdentity,
  });
  const isolation = {
    ...sourceIdentity,
    isolated: true,
    productionAllowed: false,
    productionActivationBoundaryAvailable: false,
    productionStorePath,
  };
  let unitOfWork = createFounderStoreUnitOfWork({
    filePath: storePath,
    liveStore,
    binding: isolation,
    now: () => new Date("2026-07-20T09:00:00.000Z"),
    createCommitId: () => "synthetic-commit-1",
    createTransactionId: () => "synthetic-transaction-1",
    ...(publish ? { publish } : {}),
    ...(serialize ? { serialize } : {}),
  });
  if (unitOfWorkTransform) unitOfWork = unitOfWorkTransform(unitOfWork, { storePath, liveStore });
  let sourceSnapshotAdapter = {
    binding: { storeIdentity: sourceIdentity.storeIdentity, storePath },
    preExecution: () => revalidateGoalTransitionActivationPreExecution({
      readLiveStore,
      readPersistedStore,
      validatorResult,
      plan,
      coordinatorCompatibility: compatibility,
      sourceIdentity,
    }),
    preCommit: ({ originalSnapshot, transactionExpectedRevision }) =>
      revalidateGoalTransitionActivationPreCommit({
        readLiveStore,
        readPersistedStore,
        validatorResult,
        plan,
        coordinatorCompatibility: compatibility,
        sourceIdentity,
        originalSnapshot,
        transactionExpectedRevision,
      }),
    confirmCommit: ({ committedRevision, commitId }) => {
      const persistedState = readPersistedStore();
      return {
        confirmed: persistedState.revision === committedRevision
          && liveStore.revision === committedRevision
          && persistedState.lastCommitId === commitId
          && liveStore.lastCommitId === commitId
          && JSON.stringify(persistedState) === JSON.stringify(liveStore),
      };
    },
  };
  if (sourceAdapterTransform) {
    sourceSnapshotAdapter = sourceAdapterTransform(sourceSnapshotAdapter, {
      storePath, liveStore, readPersistedStore, readLiveStore,
    });
  }
  const context = {
    validatorResult,
    plan,
    compatibility,
    sourceSnapshot,
    sourceSnapshotAdapter,
    unitOfWork,
    stagedRepositoryFactory: failOperationId
      ? operationFaultFactory(plan, failOperationId)
      : invariantMutation
        ? invariantMutationFactory(invariantMutation)
        : stagedRepositoryFactory,
    externalEffectHandlers,
    isolation: isolationTransform ? isolationTransform(isolation) : isolation,
    clock: () => new Date("2026-07-20T09:00:00.000Z"),
  };
  return {
    context,
    storePath,
    productionStorePath,
    liveStore,
    originalStore: syntheticStore(),
    readPersistedStore,
    readLiveStore,
  };
}

function operationFaultFactory(plan, failOperationId) {
  const stagedOperations = plan.operations.filter((operation) => [
    "PRESERVE_SOURCE_HISTORY",
    "COMPLETE_SOURCE_GOAL",
    "CREATE_TARGET_GOAL",
    "CREATE_FUTURE_PROTOCOL",
    "CREATE_PROTOCOL_VERSION",
    "CREATE_PROTOCOL_PROVENANCE",
    "LINK_PROTOCOL_TO_GOAL",
    "CREATE_COMMITMENT",
    "CREATE_REMINDER_INTENT",
    "CREATE_SCHEDULER_INTENT",
    "UPDATE_COACHING_CADENCE",
    "RESOLVE_COMPLETION_RECOMMENDATION",
    "ACTIVATE_TARGET_GOAL",
    "CONSUME_GOAL_TRANSITION_DRAFT",
    "CONSUME_PROTOCOL_TRANSITION_DRAFT",
  ].includes(operation.type));
  return (options) => {
    const repositories = createActivationStagedRepositories(options);
    let callIndex = 0;
    const mutationMethods = {
      goals: ["addFutureGoal", "updateLifecycle"],
      protocols: ["addFutureProtocol"],
      protocolVersions: ["addFutureVersion"],
      protocolRelationships: ["addProvenance", "linkFutureProtocolToGoal"],
      commitments: ["add"],
      reminders: ["add"],
      briefingCadence: ["set"],
      completionRecommendations: ["resolve"],
      goalTransitionDrafts: ["consume"],
      protocolTransitionDrafts: ["consume"],
    };
    const wrapped = { ...repositories };
    for (const [repositoryKey, methods] of Object.entries(mutationMethods)) {
      wrapped[repositoryKey] = {
        ...repositories[repositoryKey],
      };
      for (const methodName of methods) {
        wrapped[repositoryKey][methodName] = async (...args) => {
          const operation = stagedOperations[callIndex];
          callIndex += 1;
          if (operation?.id === failOperationId) {
            throw new Error(`Injected operation failure: ${failOperationId}`);
          }
          return repositories[repositoryKey][methodName](...args);
        };
      }
      wrapped[repositoryKey] = Object.freeze(wrapped[repositoryKey]);
    }
    return Object.freeze(wrapped);
  };
}

function invariantMutationFactory(mutate) {
  return (options) => {
    const repositories = createActivationStagedRepositories(options);
    let applied = false;
    return Object.freeze({
      ...repositories,
      assertIntegrity() {
        if (!applied) {
          applied = true;
          mutate(options.stagedFounderStore);
        }
        return repositories.assertIntegrity();
      },
    });
  };
}

function currentPlan() {
  const store = syntheticStore();
  const validatorResult = validateGoalTransitionActivation({
    snapshot: validatorInput(store),
    capabilities: {},
  });
  return buildGoalTransitionActivationTransactionPlan({ validationResult: validatorResult });
}

const auditedPlan = currentPlan();
const stagedOperationCases = auditedPlan.operations
  .filter((operation) => operation.sideEffectClass === "founder_store_staged")
  .map((operation) => [operation.id, operation.order]);

function persisted(storePath) {
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function injectedFactory({ failType, invariantFailure = false, constructionFailure = false } = {}) {
  return (options) => {
    if (constructionFailure) throw new Error("Synthetic staged construction failure.");
    const repositories = createActivationStagedRepositories(options);
    if (invariantFailure) {
      return Object.freeze({
        ...repositories,
        assertIntegrity: () => {
          throw new Error("Synthetic invariant failure.");
        },
      });
    }
    const mapping = {
      goal: ["goals", "updateLifecycle"],
      protocol: ["protocols", "addFutureProtocol"],
      commitment: ["commitments", "add"],
      reminder: ["reminders", "add"],
      cadence: ["briefingCadence", "set"],
      recommendation: ["completionRecommendations", "resolve"],
      activation: ["goals", "updateLifecycle"],
    };
    const target = mapping[failType];
    if (!target) return repositories;
    const [repositoryKey, methodName] = target;
    let calls = 0;
    return Object.freeze({
      ...repositories,
      [repositoryKey]: Object.freeze({
        ...repositories[repositoryKey],
        [methodName]: async (...args) => {
          calls += 1;
          const shouldFail = failType === "activation"
            ? calls === 3
            : failType === "goal"
              ? calls === 1
              : true;
          if (shouldFail) throw new Error(`Synthetic ${failType} failure.`);
          return repositories[repositoryKey][methodName](...args);
        },
      }),
    });
  };
}

describe("GoalTransitionActivationCoordinator isolated execution", () => {
  it("atomically executes the full plan and leaves the required scheduler pending by default", async () => {
    const { context, storePath, liveStore, originalStore } = await harness();
    const result = await createGoalTransitionActivationCoordinator(context).execute();
    const stored = persisted(storePath);

    expect(result).toMatchObject({
      status: "post_commit_pending",
      committed: true,
      completed: false,
      expectedRevision: 0,
      committedRevision: 1,
      commitId: "synthetic-commit-1",
      errorCode: E.EXTERNAL_EFFECT_PENDING,
    });
    expect(result.executedOperationIds).toHaveLength(97);
    expect(result.stateTransitions.map(({ state }) => state)).toEqual([
      "validating",
      "planning",
      "opening_transaction",
      "staging",
      "validating_staged_state",
      "committing",
      "committed",
      "publishing",
      "post_commit_pending",
    ]);
    expect(result.pendingExternalEffects).toHaveLength(1);
    expect(stored.revision).toBe(1);
    expect(stored.lastCommitId).toBe("synthetic-commit-1");
    expect(liveStore).toEqual(stored);

    const source = stored.goals.find((goal) => goal.id === "goal_visible_abs_at_rest");
    const target = stored.goals.find((goal) => goal.id === "goal_build_lean_mass");
    expect(source).toMatchObject({ status: "completed", primary: false });
    expect(target).toMatchObject({
      status: "active",
      primary: true,
      openingApproach: { value: "calibration", label: "Maintenance calibration" },
    });
    expect(target.guardrails[0].text).toMatch(/8.*9%/);
    expect(stored.goals.filter((goal) => goal.primary && goal.status === "active")).toHaveLength(1);
    expect(stored.protocols).toHaveLength(originalStore.protocols.length + 15);
    expect(stored.protocolVersions).toHaveLength(originalStore.protocolVersions.length + 15);
    expect(stored.protocols.filter((item) => item.activationProvenance)).toHaveLength(15);
    expect(stored.protocols.filter((item) => item.relatedGoalIds?.includes(target.id))).toHaveLength(15);
    expect(stored.executionItems).toHaveLength(9);
    expect(stored.reminders).toHaveLength(10);
    expect(stored.operatingPlan.coachingCadence.type).toBe("twice_weekly");
    expect(source.completionRecommendationResolution.transitionId).toBe("goal-transition");
    expect(stored.dailyBriefings).toEqual(originalStore.dailyBriefings);
    expect(stored.canonicalEvidenceObjects).toEqual(originalStore.canonicalEvidenceObjects);
    expect(stored.evidenceRelationships).toEqual(originalStore.evidenceRelationships);
    expect(stored.protocols.slice(0, 15)).toEqual(originalStore.protocols);
    expect(stored.protocolVersions.slice(0, 15)).toEqual(originalStore.protocolVersions);
    const consumedDrafts = [
      stored.goalTransitionDrafts[0],
      stored.goalProtocolTransitionDrafts[0],
    ];
    for (const draft of consumedDrafts) {
      expect(draft).toMatchObject({
        status: "applied",
        consumed: true,
        consumedAt: "2026-07-20T09:00:00.000Z",
        activationConsumption: {
          consumed: true,
          consumedByTransitionId: "goal-transition",
          activationPlanId: context.plan.planId,
          activationPlanFingerprint: context.plan.planFingerprint,
          sourceGoalId: "goal_visible_abs_at_rest",
          targetGoalId: "goal_build_lean_mass",
          activationCommitId: "synthetic-commit-1",
          activationCommittedRevision: 1,
          pendingCommitMetadata: false,
        },
      });
    }
  });

  it("reaches completed when an injected synthetic scheduler handler succeeds", async () => {
    let storePath;
    const scheduler = vi.fn(({ effect }) => {
      expect(persisted(storePath).revision).toBe(1);
      return { completed: true, idempotencyKey: effect.idempotencyKey };
    });
    const { context } = await harness({
      externalEffectHandlers: { EXTERNAL_SCHEDULER_EXECUTION: scheduler },
    });
    storePath = context.isolation.storePath;
    const result = await createGoalTransitionActivationCoordinator(context).execute();
    expect(result).toMatchObject({ status: "completed", committed: true, completed: true });
    expect(result.pendingExternalEffects).toEqual([]);
    expect(scheduler).toHaveBeenCalledTimes(1);
    expect(result.postCommitEffects.filter((effect) => effect.status === "deferred")).toHaveLength(5);
  });

  it.each([
    ["missing isolation metadata", () => null, E.ISOLATED_STORE_REQUIRED],
    ["production store path", (isolation) => ({ ...isolation, storePath: isolation.productionStorePath }), E.PRODUCTION_STORE_FORBIDDEN],
    ["store identity mismatch", (isolation) => ({ ...isolation, storeIdentity: "other" }), E.STORE_IDENTITY_MISMATCH],
    ["production capability", (isolation) => ({ ...isolation, productionAllowed: true }), E.ISOLATED_STORE_REQUIRED],
  ])("rejects %s before opening a transaction", async (_name, transform, code) => {
    const base = await harness();
    base.context.isolation = transform(base.context.isolation);
    const begin = vi.spyOn(base.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(base.context).execute();
    expect(result).toMatchObject({ status: "failed_pre_commit", committed: false, errorCode: code });
    expect(begin).not.toHaveBeenCalled();
    expect(persisted(base.storePath).revision).toBeUndefined();
  });

  it.each([
    ["artifact identity", (h) => { h.context.sourceSnapshot = { ...h.context.sourceSnapshot, sourceMatches: false }; }, E.ARTIFACT_MISMATCH],
    ["pre-execution revision drift", (h) => { h.liveStore.revision = 1; }, E.PRE_EXECUTION_REVALIDATION_FAILED],
    ["draft fingerprint drift", (h) => { h.liveStore.goalTransitionDrafts[0].guardrails[0].text = "drift"; }, E.PRE_EXECUTION_REVALIDATION_FAILED],
    ["source goal drift", (h) => { h.liveStore.goals[0].status = "completed"; }, E.PRE_EXECUTION_REVALIDATION_FAILED],
    ["target conflict", (h) => { h.liveStore.goals.push({ id: "goal_build_lean_mass", type: "build_lean_mass" }); }, E.PRE_EXECUTION_REVALIDATION_FAILED],
    ["prior consumption", (h) => { h.liveStore.goalTransitionDrafts[0].appliedAt = "external"; }, E.PRE_EXECUTION_REVALIDATION_FAILED],
  ])("rejects %s without opening a transaction", async (_name, mutate, code) => {
    const h = await harness();
    mutate(h);
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: code });
    expect(begin).not.toHaveBeenCalled();
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it.each([
    "validatorResult",
    "plan",
    "compatibility",
    "sourceSnapshot",
    "sourceSnapshotAdapter",
    "unitOfWork",
    "stagedRepositoryFactory",
  ])("rejects missing explicit %s input", async (field) => {
    const h = await harness();
    h.context[field] = null;
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: E.INPUT_INVALID });
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it.each([
    ["unknown operation", (plan) => { plan.operations[1].type = "UNKNOWN_OPERATION"; }],
    ["unsatisfied dependency", (plan) => { plan.operations[1].dependsOn = ["missing-operation"]; }],
    ["invalid payload", (plan) => { delete plan.operations[2].payload.status; }],
    ["historical mutation", (plan) => { plan.operations[1].action = "updateHistoricalProtocol"; }],
    ["grouped preview identity", (plan) => { plan.operations[3].entityId = "peptide-preview"; }],
    ["evidence repository", (plan) => { plan.operations[1].repository = "canonicalEvidence"; }],
    ["changed plan ID", (plan) => { plan.planId = "forged"; }],
    ["changed fingerprint", (plan) => { plan.planFingerprint = "f".repeat(64); }],
    ["removed operation", (plan) => { plan.operations.splice(10, 1); }],
    ["added operation", (plan) => { plan.operations.push(structuredClone(plan.operations[1])); }],
    ["reordered operations", (plan) => { [plan.operations[1], plan.operations[2]] = [plan.operations[2], plan.operations[1]]; }],
    ["duplicate operation ID", (plan) => { plan.operations[2].id = plan.operations[1].id; }],
    ["changed repository key", (plan) => { plan.operations[3].repository = "goals"; }],
    ["changed payload identity", (plan) => { plan.operations.find((item) => item.type === "CREATE_FUTURE_PROTOCOL").payload.id = "forged"; }],
    ["changed transition identity", (plan) => { plan.transitionIdentity.sourceGoalId = "forged"; }],
    ["changed expected revision", (plan) => { plan.preCommitRequirements.expectedFounderStoreRevision = 99; }],
    ["changed expected writes", (plan) => { plan.expectedWriteCounts.futureProtocolRecords = 14; }],
    ["changed invariant list", (plan) => { plan.stagedInvariants.pop(); }],
    ["removed historical invariant", (plan) => { plan.stagedInvariants = plan.stagedInvariants.filter((item) => !/HISTORICAL/.test(item.code)); }],
    ["removed evidence invariant", (plan) => { plan.stagedInvariants = plan.stagedInvariants.filter((item) => !/EVIDENCE/.test(item.code)); }],
    ["commit moved earlier", (plan) => { plan.operations.find((item) => item.type === "COMMIT_FOUNDER_STORE").order = 2; }],
    ["external effect moved before commit", (plan) => { plan.operations.find((item) => item.type === "DECLARE_EXTERNAL_EFFECT").order = 2; }],
    ["publication removed", (plan) => { plan.operations = plan.operations.filter((item) => item.type !== "PUBLISH_LIVE_RUNTIME"); }],
    ["second commit", (plan) => { plan.operations.push(structuredClone(plan.operations.find((item) => item.type === "COMMIT_FOUNDER_STORE"))); }],
    ["historical future identity", (plan) => { const item = plan.operations.find((op) => op.type === "CREATE_FUTURE_PROTOCOL"); item.entityId = item.sourceEntityId; item.payload.id = item.sourceEntityId; }],
    ["future identity collision", (plan) => { const roots = plan.operations.filter((op) => op.type === "CREATE_FUTURE_PROTOCOL"); roots[1].entityId = roots[0].entityId; roots[1].payload.id = roots[0].payload.id; }],
    ["evidence write inserted", (plan) => { const item = structuredClone(plan.operations[1]); item.id = "evidence-write"; item.repository = "canonicalEvidence"; item.writeCategory = "evidence_write"; plan.operations.push(item); }],
    ["historical mutation inserted", (plan) => { const item = structuredClone(plan.operations[1]); item.id = "historical-mutation"; item.action = "updateHistoricalProtocol"; plan.operations.push(item); }],
    ["later dependency", (plan) => { plan.operations[1].dependsOn = [plan.operations[10].id]; }],
    ["duplicate dependency", (plan) => { plan.operations[2].dependsOn.push(plan.operations[2].dependsOn[0]); }],
    ["dependency cycle", (plan) => { plan.operations[1].dependsOn = [plan.operations[2].id]; plan.operations[2].dependsOn = [plan.operations[1].id]; }],
    ["order changed", (plan) => { plan.operations[20].order = 3; }],
    ["target activation dependencies removed", (plan) => { plan.operations.find((item) => item.type === "ACTIVATE_TARGET_GOAL").dependsOn = []; }],
  ])("rejects structurally altered plan: %s", async (_name, mutate) => {
    const h = await harness();
    h.context.plan = structuredClone(h.context.plan);
    mutate(h.context.plan);
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: E.ARTIFACT_MISMATCH });
    expect(begin).not.toHaveBeenCalled();
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it("classifies transaction begin failure and publishes nothing", async () => {
    const h = await harness({
      unitOfWorkTransform: (unitOfWork) => ({
        ...unitOfWork,
        begin: () => { throw new Error("Synthetic begin failure."); },
      }),
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      status: "failed_pre_commit",
      committed: false,
      errorCode: E.TRANSACTION_OPEN_FAILED,
    });
    expect(persisted(h.storePath)).toEqual(h.originalStore);
  });

  it.each([
    ["repository construction", injectedFactory({ constructionFailure: true }), E.STAGED_REPOSITORY_CONSTRUCTION_FAILED],
    ["first goal mutation", injectedFactory({ failType: "goal" }), E.DISPATCH_FAILED],
    ["protocol creation", injectedFactory({ failType: "protocol" }), E.DISPATCH_FAILED],
    ["commitment creation", injectedFactory({ failType: "commitment" }), E.DISPATCH_FAILED],
    ["reminder creation", injectedFactory({ failType: "reminder" }), E.DISPATCH_FAILED],
    ["cadence mutation", injectedFactory({ failType: "cadence" }), E.DISPATCH_FAILED],
    ["recommendation resolution", injectedFactory({ failType: "recommendation" }), E.DISPATCH_FAILED],
    ["target activation", injectedFactory({ failType: "activation" }), E.DISPATCH_FAILED],
    ["final invariant", injectedFactory({ invariantFailure: true }), E.STAGED_INVARIANT_FAILED],
  ])("%s failure aborts and publishes nothing", async (_name, factory, expectedCode) => {
    const h = await harness({ stagedRepositoryFactory: factory });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ status: "failed_pre_commit", committed: false });
    expect([expectedCode, E.DISPATCH_FAILED]).toContain(result.errorCode);
    expect(persisted(h.storePath)).toEqual(h.originalStore);
    expect(h.liveStore).toEqual(h.originalStore);
  });

  it("pre-commit drift aborts before commit and ignores staged state", async () => {
    const h = await harness({
      sourceAdapterTransform: (adapter, { liveStore }) => ({
        ...adapter,
        preCommit: async (input) => {
          liveStore.goalTransitionDrafts[0].updatedAt = "external-drift";
          return adapter.preCommit(input);
        },
      }),
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      committed: false,
      errorCode: E.PRE_COMMIT_REVALIDATION_FAILED,
    });
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it.each(["revision drift", "draft drift", "transition consumption"])(
    "pre-commit %s response aborts before commit",
    async () => {
      const h = await harness({
        sourceAdapterTransform: (adapter) => ({
          ...adapter,
          preCommit: vi.fn(async () => ({ passed: false, blockingReasons: [{ code: "DRIFT" }] })),
        }),
      });
      const result = await createGoalTransitionActivationCoordinator(h.context).execute();
      expect(result).toMatchObject({
        committed: false,
        errorCode: E.PRE_COMMIT_REVALIDATION_FAILED,
      });
      expect(persisted(h.storePath).revision).toBeUndefined();
    }
  );

  it.each([
    ["serialization", () => { throw new Error("Synthetic serialization failure."); }],
    ["temporary write", null],
    ["atomic replacement", null],
    ["stale compare-and-swap", null],
  ])("%s commit failure remains pre-commit and runs no effect", async (_name, serializeFailure) => {
    const effect = vi.fn();
    const h = await harness({
      serialize: serializeFailure ?? undefined,
      externalEffectHandlers: { EXTERNAL_SCHEDULER_EXECUTION: effect },
      unitOfWorkTransform: serializeFailure
        ? undefined
        : (unitOfWork) => ({
            ...unitOfWork,
            begin() {
              const transaction = unitOfWork.begin();
              return {
                ...transaction,
                get status() { return transaction.status; },
                commit: () => { throw new Error(`Synthetic ${_name} failure.`); },
              };
            },
          }),
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: E.COMMIT_FAILED });
    expect(effect).not.toHaveBeenCalled();
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it("durable replacement plus publication failure preserves committed true", async () => {
    const h = await harness({
      publish: () => { throw new Error("Synthetic publication failure."); },
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      status: "failed_committed",
      committed: true,
      completed: false,
      committedRevision: 1,
      commitId: "synthetic-commit-1",
      errorCode: E.PUBLICATION_FAILED,
    });
    expect(persisted(h.storePath).revision).toBe(1);
    expect(persisted(h.storePath).goalTransitionDrafts[0].consumed).toBe(true);
    expect(persisted(h.storePath).goalProtocolTransitionDrafts[0].consumed).toBe(true);
    expect(h.liveStore.revision).toBeUndefined();
  });

  it("required scheduler failure remains committed and incomplete", async () => {
    const h = await harness({
      externalEffectHandlers: {
        EXTERNAL_SCHEDULER_EXECUTION: () => { throw new Error("Synthetic scheduler failure."); },
      },
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      status: "failed_committed",
      committed: true,
      completed: false,
      errorCode: E.POST_COMMIT_EFFECT_FAILED,
    });
    expect(persisted(h.storePath).revision).toBe(1);
  });

  it("optional reconciliation handler failure never rolls back or blocks completion", async () => {
    const h = await harness({
      externalEffectHandlers: {
        EXTERNAL_SCHEDULER_EXECUTION: ({ effect }) => ({
          completed: true,
          idempotencyKey: effect.idempotencyKey,
        }),
        HOME_RECONCILIATION: () => { throw new Error("Synthetic optional UI failure."); },
      },
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ status: "completed", committed: true, completed: true });
    expect(result.postCommitEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: "HOME_RECONCILIATION", status: "failed" }),
    ]));
    expect(persisted(h.storePath).revision).toBe(1);
  });

  it("opens and commits exactly once and never schedules before durable commit", async () => {
    let storePath;
    const scheduler = vi.fn(({ effect }) => {
      expect(persisted(storePath).revision).toBe(1);
      return { completed: true, idempotencyKey: effect.idempotencyKey };
    });
    const h = await harness({
      externalEffectHandlers: { EXTERNAL_SCHEDULER_EXECUTION: scheduler },
    });
    storePath = h.storePath;
    const originalBegin = h.context.unitOfWork.begin.bind(h.context.unitOfWork);
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    let commitCount = 0;
    begin.mockImplementation(() => {
      const transaction = originalBegin();
      const commit = transaction.commit.bind(transaction);
      transaction.commit = (...args) => {
        commitCount += 1;
        return commit(...args);
      };
      return transaction;
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result.completed).toBe(true);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(commitCount).toBe(1);
    expect(scheduler).toHaveBeenCalledTimes(1);
  });

  it("rejects a second call on the same execution instance", async () => {
    const h = await harness();
    const coordinator = createGoalTransitionActivationCoordinator(h.context);
    await coordinator.execute();
    await expect(coordinator.execute()).rejects.toMatchObject({ code: E.ALREADY_EXECUTED });
  });

  it("rejects a fresh retry after commit because the transition is consumed by source state", async () => {
    const h = await harness({
      externalEffectHandlers: {
        EXTERNAL_SCHEDULER_EXECUTION: ({ effect }) => ({
          completed: true,
          idempotencyKey: effect.idempotencyKey,
        }),
      },
    });
    await createGoalTransitionActivationCoordinator(h.context).execute();
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: E.PRE_EXECUTION_REVALIDATION_FAILED });
  });

  it("never opens or mutates the production runtime", async () => {
    const productionBefore = fs.readFileSync("private/founder/runtime-store.json");
    const h = await harness();
    await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(fs.readFileSync("private/founder/runtime-store.json").equals(productionBefore)).toBe(true);
    expect(path.resolve(h.storePath)).not.toBe(path.resolve(h.productionStorePath));
  }, 60_000);
});

describe("GoalTransitionActivationCoordinator adversarial operation accounting", () => {
  it("reconciles every plan node exactly once by execution class", async () => {
    const h = await harness();
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    const executed = new Set(result.executedOperationIds);
    expect(h.context.plan.operations).toHaveLength(97);
    expect(stagedOperationCases).toHaveLength(87);
    expect(h.context.plan.operations.filter((operation) =>
      operation.type === "ASSERT_SOURCE_STATE")).toHaveLength(1);
    expect(h.context.plan.operations.filter((operation) =>
      operation.type === "VALIDATE_FINAL_STAGED_STATE")).toHaveLength(1);
    expect(h.context.plan.operations.filter((operation) =>
      operation.type === "COMMIT_FOUNDER_STORE")).toHaveLength(1);
    expect(h.context.plan.operations.filter((operation) =>
      operation.type === "PUBLISH_LIVE_RUNTIME")).toHaveLength(1);
    expect(h.context.plan.operations.filter((operation) =>
      operation.type === "DECLARE_EXTERNAL_EFFECT")).toHaveLength(6);
    expect(executed.size).toBe(97);
    expect([...executed].sort()).toEqual(h.context.plan.operations.map(({ id }) => id).sort());
    expect(result.skippedOperationIds).toEqual([]);
  });

  it.each(stagedOperationCases)(
    "fault injection at %s publishes nothing and stops at the exact boundary",
    async (operationId, order) => {
      const h = await harness({ failOperationId: operationId });
      const result = await createGoalTransitionActivationCoordinator(h.context).execute();
      expect(result).toMatchObject({
        status: "failed_pre_commit",
        committed: false,
        failedOperationId: operationId,
      });
      expect(result.executedOperationIds).toEqual(
        h.context.plan.operations.slice(0, order).map((operation) => operation.id)
      );
      expect(result.executedOperationIds).not.toContain(operationId);
      expect(persisted(h.storePath)).toEqual(h.originalStore);
      expect(h.liveStore).toEqual(h.originalStore);
    }
  );

  it("is deterministic for identical isolated state and deterministic dependencies", async () => {
    const first = await harness();
    const second = await harness();
    const a = await createGoalTransitionActivationCoordinator(first.context).execute();
    const b = await createGoalTransitionActivationCoordinator(second.context).execute();
    expect(a.executedOperationIds).toEqual(b.executedOperationIds);
    expect(a.skippedOperationIds).toEqual(b.skippedOperationIds);
    expect(a.pendingExternalEffects).toEqual(b.pendingExternalEffects);
    expect(a.errorCode).toBe(b.errorCode);
    const stateA = persisted(first.storePath);
    const stateB = persisted(second.storePath);
    expect({ ...stateA, updatedAt: null }).toEqual({ ...stateB, updatedAt: null });
  });
});

const invariantCases = [
  ["remove source goal", (s) => { s.goals = s.goals.filter((goal) => goal.id !== "goal_visible_abs_at_rest"); }],
  ["leave source active", (s) => { Object.assign(s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest"), { status: "active", primary: true }); }],
  ["leave source incomplete", (s) => { s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest").status = "paused"; }],
  ["remove target goal", (s) => { s.goals = s.goals.filter((goal) => goal.id !== "goal_build_lean_mass"); }],
  ["leave target inactive", (s) => { s.goals.find((goal) => goal.id === "goal_build_lean_mass").status = "paused"; }],
  ["make both goals active", (s) => { Object.assign(s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest"), { status: "active", primary: true }); }],
  ["make no goal active", (s) => { s.goals.forEach((goal) => { goal.status = "paused"; goal.primary = false; }); }],
  ["change opening approach", (s) => { s.goals.find((goal) => goal.id === "goal_build_lean_mass").openingApproach.value = "surplus"; }],
  ["remove guardrail", (s) => { s.goals.find((goal) => goal.id === "goal_build_lean_mass").guardrails = []; }],
  ["remove transition provenance", (s) => { delete s.goals.find((goal) => goal.id === "goal_build_lean_mass").createdFromTransitionId; }],
  ["change target identity", (s) => { s.goals.find((goal) => goal.id === "goal_build_lean_mass").id = "wrong-target"; }],
  ["mutate unrelated source history", (s) => { s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest").historicalChapter.synthetic = false; }],
  ["remove future protocol", (s) => { s.protocols.splice(s.protocols.findIndex((item) => item.activationIdentity), 1); }],
  ["add extra protocol", (s) => { s.protocols.push({ id: "unexpected-root", userId: "synthetic-user" }); }],
  ["remove future version", (s) => { s.protocolVersions.splice(s.protocolVersions.findIndex((item) => item.id.includes("_future_")), 1); }],
  ["add extra version", (s) => { s.protocolVersions.push({ id: "unexpected-version", protocolId: "missing" }); }],
  ["remove provenance", (s) => { delete s.protocols.find((item) => item.activationIdentity).activationProvenance; }],
  ["transfer historical ownership", (s) => { s.protocols.find((item) => item.activationIdentity).activationProvenance.ownershipTransferred = true; }],
  ["delete historical protocol", (s) => { s.protocols = s.protocols.filter((item) => item.id !== "historical-0"); }],
  ["mutate historical protocol", (s) => { s.protocols.find((item) => item.id === "historical-0").status = "deleted"; }],
  ["mutate historical version", (s) => { s.protocolVersions.find((item) => item.id === "historical-0-v1").status = "superseded"; }],
  ["reassign historical ownership", (s) => { s.protocols.find((item) => item.id === "historical-0").relatedGoalIds = ["goal_build_lean_mass"]; }],
  ["grouped preview production ID", (s) => { s.protocols.find((item) => item.activationIdentity).id = "peptide-preview"; }],
  ["wrong future ownership", (s) => { s.protocols.find((item) => item.activationIdentity).relatedGoalIds = ["wrong-goal"]; }],
  ["inactive future replacement", (s) => { s.protocols.find((item) => item.activationIdentity).status = "inactive"; }],
  ["remove commitment", (s) => { s.executionItems.pop(); }],
  ["add commitment", (s) => { s.executionItems.push({ id: "extra-commitment", sourceProtocolId: "historical-0" }); }],
  ["historical commitment owner", (s) => { s.executionItems[0].sourceProtocolId = "historical-0"; }],
  ["missing commitment owner", (s) => { s.executionItems[0].sourceProtocolId = "missing"; }],
  ["duplicate commitment", (s) => { s.executionItems.push(structuredClone(s.executionItems[0])); }],
  ["remove reminder", (s) => { s.reminders.splice(s.reminders.findIndex((item) => item.linkedEntityType === "commitment"), 1); }],
  ["add reminder", (s) => { s.reminders.push({ id: "extra-reminder" }); }],
  ["dangling reminder commitment", (s) => { s.reminders.find((item) => item.linkedEntityType === "commitment").linkedEntityId = "missing"; }],
  ["remove scheduler intent", (s) => { s.reminders = s.reminders.filter((item) => item.intentType !== "apply_goal_transition_schedule"); }],
  ["duplicate scheduler intent", (s) => { s.reminders.push(structuredClone(s.reminders.find((item) => item.intentType === "apply_goal_transition_schedule"))); }],
  ["modify scheduler identity", (s) => { s.reminders.find((item) => item.intentType === "apply_goal_transition_schedule").idempotencyKey = "wrong"; }],
  ["remove cadence", (s) => { delete s.operatingPlan.coachingCadence; }],
  ["change cadence", (s) => { s.operatingPlan.coachingCadence.type = "daily"; }],
  ["leave recommendation unresolved", (s) => { delete s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest").completionRecommendationResolution; }],
  ["alter recommendation history", (s) => { s.completionRecommendation.historicalText = "changed"; }],
  ["wrong recommendation transition", (s) => { s.goals.find((goal) => goal.id === "goal_visible_abs_at_rest").completionRecommendationResolution.transitionId = "wrong"; }],
  ["mutate evidence", (s) => { s.canonicalEvidenceObjects[0].type = "changed"; }],
  ["mutate evidence relationship", (s) => { s.evidenceRelationships[0].goalId = "changed"; }],
  ["delete evidence relationship", (s) => { s.evidenceRelationships = []; }],
  ["add evidence relationship", (s) => { s.evidenceRelationships.push({ evidenceId: "new", goalId: "new" }); }],
  ["mutate historical briefing", (s) => { s.dailyBriefings[0].content = "changed"; }],
  ["delete historical briefing", (s) => { s.dailyBriefings = []; }],
  ["add historical briefing", (s) => { s.dailyBriefings.push({ id: "unexpected" }); }],
];

describe("GoalTransitionActivationCoordinator invariant mutation matrix", () => {
  it.each(invariantCases)("%s is detected before commit", async (_name, mutate) => {
    const h = await harness({ invariantMutation: mutate });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      status: "failed_pre_commit",
      committed: false,
    });
    expect(result.errorCode).toBe(E.STAGED_INVARIANT_FAILED);
    expect(persisted(h.storePath)).toEqual(h.originalStore);
    expect(h.liveStore).toEqual(h.originalStore);
  });
});

describe("GoalTransitionActivationCoordinator artifact, commit, and isolation attacks", () => {
  it.each([
    ["snapshot fingerprint", (h) => { h.context.sourceSnapshot = deepClone(h.context.sourceSnapshot); h.context.sourceSnapshot.snapshotFingerprint = "0".repeat(64); }],
    ["snapshot ID", (h) => { h.context.sourceSnapshot = deepClone(h.context.sourceSnapshot); h.context.sourceSnapshot.snapshotId = "forged"; }],
    ["goal draft fingerprint", (h) => { h.context.sourceSnapshot = deepClone(h.context.sourceSnapshot); h.context.sourceSnapshot.sourceRevisions.goalDraft = "forged"; }],
    ["historical ownership fingerprint", (h) => { h.context.sourceSnapshot = deepClone(h.context.sourceSnapshot); h.context.sourceSnapshot.sourceRevisions.historicalProtocolOwnership = "forged"; }],
    ["snapshot version", (h) => { h.context.sourceSnapshot = deepClone(h.context.sourceSnapshot); h.context.sourceSnapshot.snapshotVersion = "future"; }],
  ])("rejects forged %s before begin", async (_name, mutate) => {
    const h = await harness();
    mutate(h);
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({ committed: false, errorCode: E.ARTIFACT_MISMATCH });
    expect(begin).not.toHaveBeenCalled();
  });

  it.each([
    ["committed false", { committed: false }],
    ["missing committed flag", { revision: 1, commitId: "fake" }],
    ["missing revision", { committed: true, commitId: "fake" }],
    ["missing commit ID", { committed: true, revision: 1 }],
    ["wrong revision", { committed: true, revision: 2, commitId: "fake" }],
    ["unconfirmed success", { committed: true, revision: 1, commitId: "fake" }],
  ])("fails closed for malformed commit result: %s", async (_name, fakeResult) => {
    const h = await harness({
      unitOfWorkTransform: (unitOfWork) => ({
        ...unitOfWork,
        begin() {
          const transaction = unitOfWork.begin();
          return {
            ...transaction,
            get status() { return transaction.status; },
            commit: vi.fn(async () => fakeResult),
          };
        },
      }),
    });
    const effect = vi.fn();
    h.context.externalEffectHandlers = { EXTERNAL_SCHEDULER_EXECUTION: effect };
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result.completed).toBe(false);
    expect(effect).not.toHaveBeenCalled();
    expect(result.committed).toBe(fakeResult.committed === true);
    expect(persisted(h.storePath).revision).toBeUndefined();
  });

  it("rejects malformed scheduler success and freezes approved handler input", async () => {
    let received;
    const h = await harness({
      externalEffectHandlers: {
        EXTERNAL_SCHEDULER_EXECUTION: (input) => {
          received = input;
          return { completed: true, idempotencyKey: "wrong" };
        },
      },
    });
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      status: "failed_committed",
      committed: true,
      errorCode: E.POST_COMMIT_EFFECT_FAILED,
    });
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received.effect)).toBe(true);
    expect(received).not.toHaveProperty("stagedFounderStore");
  });

  it("rejects concurrent execution on one instance", async () => {
    const h = await harness();
    const coordinator = createGoalTransitionActivationCoordinator(h.context);
    const first = coordinator.execute();
    await expect(coordinator.execute()).rejects.toMatchObject({ code: E.ALREADY_EXECUTED });
    await first;
  });

  it.each([
    ["relative production alias", (h) => { h.context.isolation.storePath = path.relative(process.cwd(), h.productionStorePath); }],
    ["separator alias", (h) => { h.context.isolation.storePath = h.productionStorePath.replaceAll(path.sep, path.sep === "/" ? "//" : "\\\\"); }],
    ["case alias", (h) => { h.context.isolation.storePath = h.productionStorePath.toUpperCase(); }],
    ["reader identity mismatch", (h) => { h.context.sourceSnapshotAdapter.binding.storeIdentity = "other"; }],
    ["reader path mismatch", (h) => { h.context.sourceSnapshotAdapter.binding.storePath = h.productionStorePath; }],
  ])("rejects isolation bypass: %s", async (_name, mutate) => {
    const h = await harness();
    mutate(h);
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result.committed).toBe(false);
    expect([E.PRODUCTION_STORE_FORBIDDEN, E.STORE_IDENTITY_MISMATCH]).toContain(result.errorCode);
    expect(begin).not.toHaveBeenCalled();
  });

  it("rejects a filesystem alias to production where symlink creation is available", async () => {
    const h = await harness();
    const aliasPath = path.join(path.dirname(h.storePath), "production-alias.json");
    try {
      fs.symlinkSync(h.productionStorePath, aliasPath, "file");
    } catch {
      return;
    }
    h.context.isolation.storePath = aliasPath;
    const begin = vi.spyOn(h.context.unitOfWork, "begin");
    const result = await createGoalTransitionActivationCoordinator(h.context).execute();
    expect(result).toMatchObject({
      committed: false,
      errorCode: E.PRODUCTION_STORE_FORBIDDEN,
    });
    expect(begin).not.toHaveBeenCalled();
  });
});

function deepClone(value) {
  return structuredClone(value);
}
