import fs from "node:fs";
import { createPhaseReviewCommitCoordinator } from "./PhaseReviewCommitCoordinator";
import { createCanonicalPhaseReviewParticipants } from "./PhaseReviewCommitParticipants";
import { validatePhaseReviewActionRequest, authorizePhaseReviewRequest } from
  "./PhaseReviewAuthorizationService";
import { verifyPhaseReviewPostCommit } from "./PhaseReviewPostCommitVerificationService";
import { createFounderStoreDryRunCapture, createFounderStoreDryRunUnitOfWork } from
  "../../data/repositories/FounderStoreDryRunUnitOfWork";

export const PHASE_REVIEW_APPLICATION_BOUNDARY_VERSION = "phase_review_application_boundary_v1";

export function createPhaseReviewApplicationBoundary({
  runtimeStorePath,
  liveStore,
  readPersistedStore,
  createUnitOfWork,
  lockService,
  actorResolver,
  acceptanceService = null,
  now = () => new Date(),
  binding = { storeIdentity: "phase_review_isolated_store", storeKind: "test_only",
    isolated: true, productionAllowed: false },
} = {}) {
  if (!runtimeStorePath || !liveStore || typeof readPersistedStore !== "function" ||
      typeof createUnitOfWork !== "function" || !lockService?.acquire ||
      typeof actorResolver !== "function") {
    throw new TypeError("Complete Phase Review application dependencies are required.");
  }
  const participants = createCanonicalPhaseReviewParticipants({ acceptanceService });
  return Object.freeze({
    version: PHASE_REVIEW_APPLICATION_BOUNDARY_VERSION,
    async execute(input) { return run(input, false); },
    async dryRun(input) { return run(input, true); },
    inspectLock: () => lockService.inspect(),
  });

  async function run(input, dryRun) {
    let request;
    try { request = validatePhaseReviewActionRequest(input); }
    catch (error) { return failure(error, false); }
    let actor;
    try { actor = await actorResolver(); }
    catch (error) { return failure(error, false, "PHASE_REVIEW_ACTOR_RESOLUTION_FAILED"); }
    let ownership;
    try {
      ownership = await lockService.acquire({ operation: dryRun
        ? "phase_review_dry_run" : "phase_review_commit",
      goalId: request.goalId, decisionId: request.decisionId,
      requestId: request.idempotencyKey, timeoutMs: 750, maxHoldMs: 5 * 60_000 });
    } catch (error) { return failure(error, false); }

    let response;
    let outcome = "failed";
    let startingRevision = null;
    let endingRevision = null;
    let errorCode = null;
    try {
      const baselineBytes = fs.readFileSync(runtimeStorePath);
      const baseline = await readPersistedStore();
      startingRevision = Number(baseline.revision ?? 0);
      const authorized = authorizePhaseReviewRequest({ store: baseline, request, actor, now });
      const capture = dryRun ? createFounderStoreDryRunCapture() : null;
      const coordinator = createPhaseReviewCommitCoordinator({
        runtimeStorePath,
        liveStore,
        readPersistedStore,
        participants,
        binding,
        now,
        createUnitOfWork: dryRun
          ? (options) => createFounderStoreDryRunUnitOfWork({ ...options, capture })
          : (options) => createUnitOfWork({ ...options, mutationLock: lockService,
            lockOwnership: ownership, lockContext: { operation: "phase_review_commit",
              goalId: request.goalId, decisionId: request.decisionId,
              requestId: request.idempotencyKey } }),
      });
      const result = await coordinator.commit(authorized.decision, {
        authorization: authorized.authorization,
        expectedStoreRevision: request.expectedStoreRevision,
      });
      if (result.status !== "committed" || result.committed !== true) {
        errorCode = result.reasonCode ?? "PHASE_REVIEW_COMMIT_FAILED";
        response = Object.freeze({ ok: false, dryRun, committed: false,
          code: errorCode, result });
      } else {
        const candidate = dryRun ? capture.get() : await readPersistedStore();
        const verification = verifyPhaseReviewPostCommit({ before: baseline,
          after: candidate, decision: authorized.decision, result });
        endingRevision = verification.endingRevision;
        if (dryRun && !fs.readFileSync(runtimeStorePath).equals(baselineBytes)) {
          const error = new Error("Dry run changed persisted Founder-store bytes.");
          error.code = "PHASE_REVIEW_DRY_RUN_PERSISTENCE_DETECTED";
          throw error;
        }
        outcome = dryRun ? "dry_run_verified" : result.idempotent
          ? "idempotent_replay_verified" : "committed_verified";
        response = Object.freeze({ ok: true, dryRun, committed: dryRun ? false : true,
          idempotent: result.idempotent, decisionId: authorized.decision.decisionId,
          selectedOutcome: authorized.decision.selectedOutcome,
          startingRevision, endingRevision: dryRun ? startingRevision : endingRevision,
          candidateRevision: dryRun ? endingRevision : null,
          verification,
          plannedMutation: summarize({ baseline, candidate,
            decision: authorized.decision, result }),
          ...(dryRun ? {} : { commitId: result.commitId, transactionId: result.transactionId }),
        });
      }
    } catch (error) {
      errorCode = error?.code ?? "PHASE_REVIEW_APPLICATION_FAILED";
      response = failure(error, error?.committed === true);
    } finally {
      try {
        await lockService.release(ownership, { outcome, startingStoreRevision: startingRevision,
          endingStoreRevision: endingRevision, errorCode });
      } catch (releaseError) {
        response = failure(releaseError, response?.committed === true,
          "PHASE_REVIEW_LOCK_RELEASE_CRITICAL");
      }
    }
    return response;
  }
}

function summarize({ baseline, candidate, decision, result }) {
  const beforeGoal = baseline.goals?.find((item) => item.id === decision.goalId);
  const afterGoal = candidate.goals?.find((item) => item.id === decision.goalId);
  const beforePhase = beforeGoal?.phases?.find((item) => item.id === decision.currentPhaseId);
  const afterPhase = afterGoal?.phases?.find((item) => item.id === decision.currentPhaseId);
  const next = afterGoal?.phases?.find((item) => item.id === decision.nextPhaseId);
  return Object.freeze({
    selectedOutcome: decision.selectedOutcome,
    replay: result.idempotent === true,
    goalId: decision.goalId,
    currentPhase: { phaseId: decision.currentPhaseId, fromStatus: beforePhase?.status ?? null,
      toStatus: afterPhase?.status ?? null, plannedReviewAt: afterPhase?.plannedReviewAt ?? null },
    nextPhase: { phaseId: decision.nextPhaseId, status: next?.status ?? null,
      projectedOrActualStart: next?.startedAt ?? next?.projectedNextPhaseStart ?? null },
    strategyId: afterGoal?.activePhaseStrategyId ?? null,
    expectedTrajectoryId: afterGoal?.activeExpectedTrajectoryId ?? null,
    startingForecastPlanned: decision.selectedOutcome === "begin_next_phase",
    protectedCollectionsChanged: false,
  });
}
function failure(error, committed = false, fallbackCode = null) {
  return Object.freeze({ ok: false, committed, critical: committed,
    code: error?.code ?? fallbackCode ?? "PHASE_REVIEW_APPLICATION_FAILED",
    error: error?.message ?? "Phase Review application boundary failed." });
}
