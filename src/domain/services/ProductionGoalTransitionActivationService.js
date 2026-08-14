import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createActivationStagedRepositories } from "../../data/repositories/ActivationStagedRepositoryFactory";
import {
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore";
import { activationFingerprint } from "./GoalTransitionActivationCanonicalization";
import { createGoalTransitionActivationCoordinator } from "./GoalTransitionActivationCoordinator";
import {
  validateGoalTransitionActivationCoordinatorCompatibility,
} from "./GoalTransitionActivationCoordinatorContract";
import {
  captureGoalTransitionActivationSourceSnapshot,
  revalidateGoalTransitionActivationPreCommit,
  revalidateGoalTransitionActivationPreExecution,
} from "./GoalTransitionActivationSourceSnapshot";
import {
  buildGoalTransitionActivationTransactionPlan,
} from "./GoalTransitionActivationTransactionPlanBuilder";
import { validateGoalTransitionActivation } from "./GoalTransitionActivationValidator";
import {
  issueProductionGoalTransitionActivationCapability,
} from "./ProductionGoalTransitionActivationCapability";

export const ProductionGoalTransitionActivationErrorCode = Object.freeze({
  FOUNDER_CONTEXT_REQUIRED: "PRODUCTION_ACTIVATION_FOUNDER_CONTEXT_REQUIRED",
  TRANSITION_REQUIRED: "PRODUCTION_ACTIVATION_TRANSITION_REQUIRED",
  DRAFT_NOT_READY: "PRODUCTION_ACTIVATION_DRAFT_NOT_READY",
  REVIEW_TOKEN_INVALID: "PRODUCTION_ACTIVATION_REVIEW_TOKEN_INVALID",
  REVIEW_TOKEN_STALE: "PRODUCTION_ACTIVATION_REVIEW_TOKEN_STALE",
  FOUNDER_CONFIRMATION_REQUIRED: "PRODUCTION_ACTIVATION_FOUNDER_CONFIRMATION_REQUIRED",
  ALREADY_IN_PROGRESS: "PRODUCTION_ACTIVATION_ALREADY_IN_PROGRESS",
  PATH_INVALID: "PRODUCTION_ACTIVATION_PATH_INVALID",
});

const reviewTokens = new Map();
const activationLocks = new Set();
const TOKEN_TTL_MS = 10 * 60 * 1000;

export function createProductionGoalTransitionActivationService({
  runtimeStorePath = resolveFounderRuntimeStorePath(),
  readLiveStore = () => structuredClone(getFounderRuntimeStore()),
  readPersistedStore = () => JSON.parse(fs.readFileSync(runtimeStorePath, "utf8")),
  liveStore = getFounderRuntimeStore(),
  now = () => new Date(),
  createTokenId = () => randomUUID(),
  createUnitOfWork = createFounderStoreUnitOfWork,
  createCoordinator = createGoalTransitionActivationCoordinator,
  stagedRepositoryFactory = createActivationStagedRepositories,
} = {}) {
  const canonicalPath = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1"
    ? runtimeStorePath
    : resolveFounderRuntimeStorePath({
        cwd: process.cwd(),
        env: { ...process.env, PHYSIQUEOS_RUNTIME_STORE_PATH: runtimeStorePath },
      });

  return Object.freeze({
    async createFinalReview({ founderUserId, transitionId }) {
      requireFounder(founderUserId);
      const artifacts = await buildFreshArtifacts({
        transitionId,
        readLiveStore,
        readPersistedStore,
        runtimeStorePath: canonicalPath,
        now,
      });
      const tokenId = createTokenId();
      const issuedAt = now();
      const token = Object.freeze({
        id: tokenId,
        transitionId,
        goalDraftId: artifacts.validatorResult.validatedGoalDraft.id,
        goalDraftFingerprint: artifacts.validatorResult.sourceRevisions.goalDraft,
        protocolDraftId: artifacts.validatorResult.validatedProtocolDraft.id,
        protocolDraftFingerprint: artifacts.validatorResult.sourceRevisions.protocolDraft,
        planId: artifacts.plan.planId,
        planFingerprint: artifacts.plan.planFingerprint,
        compatibilityFingerprint: artifacts.compatibility.compatibilityFingerprint,
        sourceSnapshotId: artifacts.sourceSnapshot.snapshotId,
        sourceSnapshotFingerprint: artifacts.sourceSnapshot.snapshotFingerprint,
        normalizedRevision: artifacts.sourceSnapshot.normalizedRevision,
        targetGoalId: artifacts.plan.transitionIdentity.targetGoalDraftId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS).toISOString(),
      });
      reviewTokens.set(tokenId, { token, consumed: false });
      return {
        token,
        readiness: reviewReadiness(artifacts),
        summary: reviewSummary(artifacts),
      };
    },

    async activate({ founderUserId, transitionId, finalReviewToken, founderConfirmed }) {
      requireFounder(founderUserId);
      if (founderConfirmed !== true) {
        throw serviceError("FOUNDER_CONFIRMATION_REQUIRED", "Confirm activation to continue.");
      }
      if (!transitionId) throw serviceError("TRANSITION_REQUIRED", "Transition identity is required.");
      if (activationLocks.has(transitionId)) {
        throw serviceError("ALREADY_IN_PROGRESS", "This activation is already in progress.");
      }
      activationLocks.add(transitionId);
      try {
        const tokenRecord = validateToken(finalReviewToken, transitionId, now());
        const artifacts = await buildFreshArtifacts({
          transitionId,
          readLiveStore,
          readPersistedStore,
          runtimeStorePath: canonicalPath,
          now,
        });
        assertTokenBindings(tokenRecord.token, artifacts);
        tokenRecord.consumed = true;
        const productionCapability = issueProductionGoalTransitionActivationCapability({
          canonicalProductionStorePath: canonicalPath,
          transitionIdentity: artifacts.plan.transitionIdentity,
          finalReviewTokenIdentity: tokenRecord.token.id,
          founderConfirmed: true,
        });
        const unitOfWork = createUnitOfWork({
          filePath: canonicalPath,
          liveStore,
          binding: {
            storeIdentity: "founder_runtime_store",
            storeKind: "production",
            isolated: false,
            productionAllowed: true,
          },
          now,
        });
        const sourceSnapshotAdapter = createSourceSnapshotAdapter({
          readLiveStore,
          readPersistedStore,
          runtimeStorePath: canonicalPath,
        });
        return createCoordinator({
          validatorResult: artifacts.validatorResult,
          plan: artifacts.plan,
          compatibility: artifacts.compatibility,
          sourceSnapshot: artifacts.sourceSnapshot,
          sourceSnapshotAdapter,
          unitOfWork,
          stagedRepositoryFactory,
          productionCapability,
          finalReviewTokenIdentity: tokenRecord.token.id,
          externalEffectHandlers: {},
          clock: now,
        }).execute();
      } finally {
        activationLocks.delete(transitionId);
      }
    },
  });
}

async function buildFreshArtifacts({
  transitionId,
  readLiveStore,
  readPersistedStore,
  runtimeStorePath,
  now,
}) {
  const live = await readLiveStore();
  const persisted = await readPersistedStore();
  const goalDraft = (live.goalTransitionDrafts ?? []).find((draft) => draft.id === transitionId);
  const protocolDraft = (live.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.goalTransitionDraftId === transitionId
  );
  if (!goalDraft || !protocolDraft) {
    throw serviceError("TRANSITION_REQUIRED", "Matching transition drafts were not found.");
  }
  const validatorResult = validateGoalTransitionActivation({
    snapshot: validatorInput(live, goalDraft, protocolDraft, getFounderStoreRevision(persisted)),
    capabilities: productionValidationCapabilities(),
    evaluatedAt: now(),
  });
  if (!validatorResult.ready || !validatorResult.draftReady) {
    throw serviceError("DRAFT_NOT_READY", "The accepted transition is no longer ready.", {
      blockingReasons: validatorResult.blockingReasons,
    });
  }
  const plan = buildGoalTransitionActivationTransactionPlan({
    validationResult: validatorResult,
    builtAt: now(),
    executionCapabilities: {
      activationCoordinator: true,
      productionActivationBoundary: true,
      finalFingerprintRevalidation: true,
    },
  });
  const compatibility = validateGoalTransitionActivationCoordinatorCompatibility({
    plan,
    availability: {
      executingCoordinator: true,
      productionActivationBoundary: true,
    },
    evaluatedAt: now(),
  });
  const sourceSnapshot = await captureGoalTransitionActivationSourceSnapshot({
    readLiveStore,
    readPersistedStore,
    validatorResult,
    plan,
    coordinatorCompatibility: compatibility,
    sourceIdentity: {
      storeIdentity: "founder_runtime_store",
      readerIdentity: "founder_runtime_store",
      storePath: runtimeStorePath,
    },
    capturedAt: now(),
    availability: {
      executingCoordinator: true,
      productionActivationBoundary: true,
    },
  });
  if (!plan.executable || !sourceSnapshot.activationReady) {
    throw serviceError("DRAFT_NOT_READY", "Production activation artifacts are not executable.");
  }
  return { validatorResult, plan, compatibility, sourceSnapshot };
}

function createSourceSnapshotAdapter({ readLiveStore, readPersistedStore, runtimeStorePath }) {
  const binding = Object.freeze({
    storeIdentity: "founder_runtime_store",
    storePath: runtimeStorePath,
  });
  return Object.freeze({
    binding,
    preExecution: (options) => revalidateGoalTransitionActivationPreExecution({
      ...options,
      readLiveStore,
      readPersistedStore,
      sourceIdentity: {
        storeIdentity: binding.storeIdentity,
        readerIdentity: binding.storeIdentity,
        storePath: binding.storePath,
      },
      availability: { executingCoordinator: true, productionActivationBoundary: true },
    }),
    preCommit: (options) => revalidateGoalTransitionActivationPreCommit({
      ...options,
      readLiveStore,
      readPersistedStore,
      sourceIdentity: {
        storeIdentity: binding.storeIdentity,
        readerIdentity: binding.storeIdentity,
        storePath: binding.storePath,
      },
      availability: { executingCoordinator: true, productionActivationBoundary: true },
    }),
    async confirmCommit({ committedRevision, commitId }) {
      const [live, persisted] = await Promise.all([readLiveStore(), readPersistedStore()]);
      return {
        confirmed: live.revision === committedRevision
          && persisted.revision === committedRevision
          && live.lastCommitId === commitId
          && persisted.lastCommitId === commitId,
      };
    },
  });
}

function validatorInput(store, goalDraft, protocolDraft, repositoryRevision) {
  const sourceGoal = (store.goals ?? []).find((goal) => goal.id === goalDraft.sourceGoalId);
  return {
    userId: store.user?.id,
    timeZone: store.user?.timeZone ?? store.user?.timezone,
    defaultTimeZone: "America/Los_Angeles",
    repositoryRevision,
    goals: store.goals ?? [],
    goalDraft,
    protocolDraft,
    goalTransitionDrafts: store.goalTransitionDrafts ?? [],
    protocols: store.protocols ?? [],
    protocolVersions: store.protocolVersions ?? [],
    executionItems: store.executionItems ?? [],
    reminders: store.reminders ?? [],
    evidenceRelationships: store.evidenceRelationships ?? [],
    completionRecommendation:
      store.completionRecommendation
      ?? sourceGoal?.completionRecommendation
      ?? { userDecisionPending: true },
    currentBriefingCadence: store.operatingPlan?.coachingCadence ?? null,
    operatingPlan: store.operatingPlan,
    proposedWriteSet: { evidence: [] },
  };
}

function productionValidationCapabilities() {
  return {
    crossRepositoryTransaction: true,
    atomicCommit: true,
    rollback: true,
    stagedWrites: true,
    revisionLocking: true,
    persistenceErrorsPropagate: true,
  };
}

function reviewReadiness({ validatorResult, plan, compatibility, sourceSnapshot }) {
  return {
    draftReady: validatorResult.draftReady,
    infrastructureReady: validatorResult.infrastructureReady,
    ready: validatorResult.ready,
    planComplete: plan.planComplete,
    executable: plan.executable,
    compatible: compatibility.compatible,
    sourceMatches: sourceSnapshot.sourceMatches,
    artifactsCompatible: sourceSnapshot.artifactsCompatible,
    activationReady: sourceSnapshot.activationReady,
  };
}

function reviewSummary({ validatorResult, plan }) {
  return {
    transitionIdentity: plan.transitionIdentity,
    currentGoal: "Visible Abs",
    targetGoal: "Build Lean Mass",
    openingPhase: "Maintenance calibration",
    guardrail: "Maintain approximately 8–9% body fat",
    coachingCadence: "Twice weekly",
    protocolsPrepared: validatorResult.expectedWriteCounts.futureProtocolRecords,
    commitmentsToCreate: validatorResult.expectedWriteCounts.futureCommitments,
    reminderIntentsToCreate: validatorResult.expectedWriteCounts.reminderIntents,
    draftConsumptions: validatorResult.expectedWriteCounts.transitionDraftConsumptions,
  };
}

function validateToken(tokenId, transitionId, currentTime) {
  const record = reviewTokens.get(tokenId);
  if (!record || record.consumed || record.token.transitionId !== transitionId) {
    throw serviceError("REVIEW_TOKEN_INVALID", "Final review is no longer valid.");
  }
  if (new Date(record.token.expiresAt).getTime() <= currentTime.getTime()) {
    throw serviceError("REVIEW_TOKEN_STALE", "Final review expired. Refresh before activating.");
  }
  return record;
}

function assertTokenBindings(token, { validatorResult, plan, compatibility, sourceSnapshot }) {
  const current = {
    transitionId: plan.transitionIdentity.goalTransitionDraftId,
    goalDraftId: validatorResult.validatedGoalDraft.id,
    goalDraftFingerprint: validatorResult.sourceRevisions.goalDraft,
    protocolDraftId: validatorResult.validatedProtocolDraft.id,
    protocolDraftFingerprint: validatorResult.sourceRevisions.protocolDraft,
    planId: plan.planId,
    planFingerprint: plan.planFingerprint,
    compatibilityFingerprint: compatibility.compatibilityFingerprint,
    sourceSnapshotId: sourceSnapshot.snapshotId,
    sourceSnapshotFingerprint: sourceSnapshot.snapshotFingerprint,
    normalizedRevision: sourceSnapshot.normalizedRevision,
    targetGoalId: plan.transitionIdentity.targetGoalDraftId,
  };
  for (const [key, value] of Object.entries(current)) {
    if (token[key] !== value) {
      throw serviceError("REVIEW_TOKEN_STALE", "Production state changed. Refresh final review.");
    }
  }
}

function requireFounder(founderUserId) {
  if (founderUserId !== "user_founder_001") {
    throw serviceError("FOUNDER_CONTEXT_REQUIRED", "Trusted founder context is required.");
  }
}

function serviceError(shortCode, message, details = {}) {
  const error = new Error(message);
  error.name = "ProductionGoalTransitionActivationError";
  error.code = ProductionGoalTransitionActivationErrorCode[shortCode] ?? shortCode;
  Object.assign(error, details);
  return error;
}

export const ProductionGoalTransitionActivationServiceInternals = Object.freeze({
  activationFingerprint,
  tokenTtlMs: TOKEN_TTL_MS,
});
