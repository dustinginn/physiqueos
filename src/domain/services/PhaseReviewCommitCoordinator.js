import { getFounderStoreRevision } from "../../data/repositories/FounderStoreUnitOfWork";
import { createCanonicalGoalPhase, isActivePhaseStatus } from "../models/canonicalGoalPhase";
import {
  PhaseReviewUserDecision,
  createPhaseReviewDecision,
} from "../models/phaseReviewDecision";
import {
  PHASE_REVIEW_PARTICIPANT_ORDER,
  createCanonicalPhaseReviewParticipants,
  finalizePhaseReviewCandidate,
} from "./PhaseReviewCommitParticipants";

const PROTECTED_HISTORY = Object.freeze([
  "dailyBriefings",
  "canonicalEvidenceObjects",
  "evidencePackages",
  "dexaScans",
  "progressPhotos",
]);

export const PHASE_REVIEW_COMMIT_COORDINATOR_VERSION =
  "phase_review_commit_coordinator_v1";

export function createPhaseReviewCommitCoordinator({
  runtimeStorePath,
  liveStore,
  readPersistedStore,
  createUnitOfWork,
  participants = createCanonicalPhaseReviewParticipants(),
  binding = {
    storeIdentity: "phase_review_isolated_store",
    storeKind: "test_only",
    isolated: true,
    productionAllowed: false,
  },
  now = () => new Date(),
} = {}) {
  if (!runtimeStorePath || !liveStore || typeof readPersistedStore !== "function" ||
      typeof createUnitOfWork !== "function") {
    throw new TypeError("Phase Review Commit Coordinator requires an explicit store, reader, and unit of work.");
  }
  const orderedParticipants = validateParticipantRegistry(participants);
  const locks = new Set();

  return Object.freeze({
    version: PHASE_REVIEW_COMMIT_COORDINATOR_VERSION,
    participantNames: Object.freeze(orderedParticipants.map((item) => item.name)),
    async commit(input, { authorization, expectedStoreRevision = null,
      canonicalBaseline = null } = {}) {
      let decision;
      try { decision = createPhaseReviewDecision(input); }
      catch (error) { return rejected("PHASE_REVIEW_DECISION_INVALID", error.message); }
      if (!validAuthorization(authorization, decision)) {
        return rejected("PHASE_REVIEW_AUTHORIZATION_REQUIRED",
          "Explicit user authorization bound to this decision is required.");
      }
      if (locks.has(decision.goalId)) {
        return rejected("PHASE_REVIEW_CONCURRENT_MUTATION",
          "A Phase Review transaction is already in progress for this Goal.");
      }
      locks.add(decision.goalId);
      const lifecycle = [];
      const rollbackEvents = [];
      const preparedByName = new Map();
      let transaction = null;
      try {
        const initial = canonicalBaseline == null
          ? await readPersistedStore() : structuredClone(canonicalBaseline);
        const replay = findExisting(initial, decision);
        if (replay) return committedResult(replay, initial, true);
        const baselineRevision = getFounderStoreRevision(initial);
        if (expectedStoreRevision != null && expectedStoreRevision !== baselineRevision) {
          return rejected("PHASE_REVIEW_EXPECTED_STORE_REVISION_MISMATCH",
            "The Founder-store revision changed after authorization.");
        }
        const baseline = structuredClone(initial);
        const unit = createUnitOfWork({
          filePath: runtimeStorePath,
          liveStore,
          stageFrom: baseline,
          binding,
          now,
          validatePersistedBaseline: (candidate) => ({
            valid: getFounderStoreRevision(candidate) === baselineRevision &&
              expectedPhaseMatches(candidate, decision),
          }),
        });
        transaction = unit.begin();
        if (transaction.expectedRevision !== baselineRevision) {
          transaction.abort();
          return rejected("PHASE_REVIEW_EXPECTED_STORE_REVISION_MISMATCH",
            "The Founder store changed before the transaction opened.");
        }
        const baseContext = {
          baseline,
          decision,
          authorization,
          preparedByName,
          rollbackEvents,
          transactionId: transaction.transactionId,
        };

        try {
          for (const participant of orderedParticipants) {
            const prepared = await participant.prepare(baseContext);
            preparedByName.set(participant.name, prepared);
            lifecycle.push(event("prepared", participant.name, now));
          }
          for (const participant of orderedParticipants) {
            const valid = await participant.validate({
              ...baseContext,
              prepared: preparedByName.get(participant.name),
            });
            if (valid !== true) throw participantError(participant.name, "validate",
              "Participant validation rejected the transaction.");
            lifecycle.push(event("validated", participant.name, now));
          }
        } catch (error) {
          await rollbackParticipants(orderedParticipants, baseContext, lifecycle, now);
          if (transaction.status === "open") transaction.abort();
          return failed(error, lifecycle, rollbackEvents);
        }

        try {
          await transaction.mutate(async (stagedState) => {
            const commitContext = { ...baseContext, stagedState };
            for (const participant of orderedParticipants) {
              await participant.commit({
                ...commitContext,
                prepared: preparedByName.get(participant.name),
              });
              lifecycle.push(event("committed_to_stage", participant.name, now));
            }
            stagedState.phaseReviewTransactions ??= [];
            stagedState.phaseReviewTransactions.push({
              id: `phase_review_transaction|${decision.decisionId}`,
              schemaVersion: PHASE_REVIEW_COMMIT_COORDINATOR_VERSION,
              transactionId: transaction.transactionId,
              decisionId: decision.decisionId,
              idempotencyKey: decision.idempotencyKey,
              goalId: decision.goalId,
              selectedOutcome: decision.selectedOutcome,
              expectedStoreRevision: baselineRevision,
              expectedPhaseStatus: decision.expectedCurrentPhaseStatus,
              expectedPhaseRevision: decision.expectedCurrentPhaseRevision,
              expectedStrategyRevision: decision.expectedStrategyRevision,
              expectedTrajectoryRevision: decision.expectedTrajectoryRevision,
              participantOrder: [...PHASE_REVIEW_PARTICIPANT_ORDER],
              lifecycle: structuredClone(lifecycle),
              status: "staged",
              commitId: null,
              committedRevision: null,
              committedAt: null,
              lineage: {
                actorId: decision.actorId,
                originatingArtifactId: decision.originatingArtifactId,
                reasoningLineage: structuredClone(decision.reasoningLineage),
              },
            });
          });
        } catch (error) {
          await rollbackParticipants(orderedParticipants, baseContext, lifecycle, now);
          return failed(error, lifecycle, rollbackEvents);
        }

        let committed;
        try {
          committed = await transaction.commit({
            validate: (candidate) => validateCandidate({ baseline, candidate, decision }),
            finalizeCandidate: ({ stagedState, candidateRevision, commitId }) =>
              finalizePhaseReviewCandidate({ stagedState, decisionId: decision.decisionId,
                candidateRevision, commitId }),
            validateFinalized: (candidate, context) =>
              validateCandidate({ baseline, candidate, decision, finalized: context }),
          });
        } catch (error) {
          if (error?.committed !== true) {
            await rollbackParticipants(orderedParticipants, baseContext, lifecycle, now);
          }
          return failed(error, lifecycle, rollbackEvents);
        }
        lifecycle.push(event("atomic_commit", "coordinator", now));
        return deepFreeze({
          status: "committed",
          committed: true,
          idempotent: false,
          decisionId: decision.decisionId,
          selectedOutcome: decision.selectedOutcome,
          transactionId: transaction.transactionId,
          revision: committed.revision,
          commitId: committed.commitId,
          participantOrder: [...PHASE_REVIEW_PARTICIPANT_ORDER],
          lifecycle,
          rollbackEvents,
        });
      } catch (error) {
        if (transaction?.status === "open") transaction.abort();
        return failed(error, lifecycle, rollbackEvents);
      } finally {
        locks.delete(decision.goalId);
      }
    },
  });
}

function validateParticipantRegistry(participants) {
  if (!Array.isArray(participants)) throw new TypeError("Phase Review participants must be an array.");
  const byName = new Map(participants.map((item) => [item?.name, item]));
  if (byName.size !== participants.length ||
      PHASE_REVIEW_PARTICIPANT_ORDER.some((name) => !byName.has(name))) {
    throw new TypeError("The complete canonical Phase Review participant registry is required.");
  }
  return PHASE_REVIEW_PARTICIPANT_ORDER.map((name) => {
    const participant = byName.get(name);
    for (const method of ["prepare", "validate", "commit", "rollback"]) {
      if (typeof participant?.[method] !== "function") {
        throw new TypeError(`Phase Review participant ${name} requires ${method}.`);
      }
    }
    return participant;
  });
}

async function rollbackParticipants(participants, context, lifecycle, now) {
  const prepared = participants.filter((item) => context.preparedByName.has(item.name)).reverse();
  for (const participant of prepared) {
    try {
      await participant.rollback({ ...context,
        prepared: context.preparedByName.get(participant.name) });
      lifecycle.push(event("rolled_back", participant.name, now));
    } catch (error) {
      lifecycle.push({ ...event("rollback_failed", participant.name, now),
        message: String(error?.message ?? error) });
    }
  }
}

function validateCandidate({ baseline, candidate, decision, finalized = null }) {
  const decisions = (candidate.phaseReviewDecisions ?? []).filter((item) =>
    item.decisionId === decision.decisionId || item.idempotencyKey === decision.idempotencyKey);
  const transactions = (candidate.phaseReviewTransactions ?? []).filter((item) =>
    item.decisionId === decision.decisionId || item.idempotencyKey === decision.idempotencyKey);
  if (decisions.length !== 1 || transactions.length !== 1) return { valid: false };
  const goal = candidate.goals?.find((item) => item.id === decision.goalId);
  const current = goal?.phases?.find((item) => item.id === decision.currentPhaseId);
  const next = goal?.phases?.find((item) => item.id === decision.nextPhaseId);
  if (!goal || !current || !next) return { valid: false };
  try { goal.phases.forEach((phase) => createCanonicalGoalPhase(phase)); }
  catch { return { valid: false }; }
  if (goal.phases.filter((phase) => isActivePhaseStatus(phase.status)).length !== 1) {
    return { valid: false };
  }
  const readModels = (candidate.phaseLifecycleReadModels ?? []).filter((item) =>
    item.goalId === decision.goalId);
  if (readModels.length !== 1 || readModels[0].decisionId !== decision.decisionId) {
    return { valid: false };
  }
  if (decision.selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE) {
    const strategy = (candidate.phaseStrategies ?? []).filter((item) =>
      item.id === goal.activePhaseStrategyId && item.goalId === decision.goalId &&
      item.phaseId === decision.nextPhaseId && item.status === "accepted" &&
      item.revision === decision.expectedStrategyRevision);
    const trajectory = (candidate.phaseExpectedTrajectories ?? []).filter((item) =>
      item.id === goal.activeExpectedTrajectoryId && item.goalId === decision.goalId &&
      item.phaseId === decision.nextPhaseId && item.status === "accepted" &&
      item.revision === decision.expectedTrajectoryRevision);
    const snapshots = (candidate.goalConfidenceSnapshots ?? []).filter((item) =>
      item.goalId === decision.goalId && item.phaseId === decision.nextPhaseId);
    const artifacts = (candidate.confidenceInitializationArtifacts ?? []).filter((item) =>
      item.occurrenceId === decision.decisionId);
    if (current.status !== "completed" || next.status !== "active" ||
        goal.currentPhaseId !== next.id || strategy.length !== 1 || trajectory.length !== 1 ||
        snapshots.length !== 1 || artifacts.length !== 1) return { valid: false };
    const acceptedStrategy = decision.phaseEstablishment?.strategy ??
      (baseline.phaseStrategies ?? []).find((item) => item.id === strategy[0].id);
    const acceptedTrajectory = decision.phaseEstablishment?.trajectory ??
      (baseline.phaseExpectedTrajectories ?? []).find((item) => item.id === trajectory[0].id);
    if (!same(strategy[0], acceptedStrategy) || !same(trajectory[0], acceptedTrajectory)) {
      return { valid: false };
    }
    if (decision.phaseEstablishment) {
      const protocol = (candidate.protocols ?? []).find((item) =>
        item.phaseId === decision.nextPhaseId && item.phaseStrategyId === strategy[0].id &&
        item.currentVersionId);
      const version = (candidate.protocolVersions ?? []).find((item) =>
        item.id === protocol?.currentVersionId && item.phaseId === decision.nextPhaseId &&
        item.confirmation?.decisionId === decision.decisionId);
      if (!protocol || !version ||
          !same(version.change?.reviewedChanges?.caloricIntakeTarget,
            decision.phaseEstablishment.executionTargets.caloricIntake) ||
          !same(version.change?.reviewedChanges?.activityExpenditureTarget,
            decision.phaseEstablishment.executionTargets.activityExpenditure)) return { valid: false };
    }
  } else {
    if (!isActivePhaseStatus(current.status) || current.plannedReviewAt !== decision.selectedReviewAt ||
        next.status !== "planned" || next.projectedNextPhaseStart !== decision.selectedReviewAt) {
      return { valid: false };
    }
    for (const root of ["phaseStrategies", "phaseExpectedTrajectories",
      "goalConfidenceSnapshots", "goalConfidenceHistory", "confidenceInitializationArtifacts",
      "protocols", "protocolVersions"]) {
      if (!same(candidate[root] ?? [], baseline[root] ?? [])) return { valid: false };
    }
  }
  for (const root of PROTECTED_HISTORY) {
    if (!same(baseline[root] ?? [], candidate[root] ?? [])) return { valid: false };
  }
  if (decision.selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE) {
    if (!isPrefix(baseline.phaseStrategies ?? [], candidate.phaseStrategies ?? []) ||
        !isPrefix(baseline.phaseExpectedTrajectories ?? [], candidate.phaseExpectedTrajectories ?? []) ||
        !protocolVersionsRespectDecision(baseline, candidate, decision)) return { valid: false };
  } else if (!same(baseline.phaseStrategies ?? [], candidate.phaseStrategies ?? []) ||
      !same(baseline.phaseExpectedTrajectories ?? [], candidate.phaseExpectedTrajectories ?? []) ||
      !same(baseline.protocols ?? [], candidate.protocols ?? []) ||
      !same(baseline.protocolVersions ?? [], candidate.protocolVersions ?? [])) return { valid: false };
  for (const root of ["phaseReviewDecisions", "phaseReviewTransactions"]) {
    if (!isPrefix(baseline[root] ?? [], candidate[root] ?? [])) return { valid: false };
  }
  if (decision.selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE && (
      !isPrefix(baseline.goalConfidenceHistory ?? [], candidate.goalConfidenceHistory ?? []) ||
      !isPrefix(baseline.confidenceInitializationArtifacts ?? [],
        candidate.confidenceInitializationArtifacts ?? []))) {
    return { valid: false };
  }
  if (finalized && (transactions[0].status !== "committed" ||
      transactions[0].commitId !== finalized.commitId ||
      transactions[0].committedRevision !== finalized.candidateRevision)) {
    return { valid: false };
  }
  return { valid: true };
}
function protocolVersionsRespectDecision(beforeStore, afterStore, decision) {
  if (!decision.phaseEstablishment?.executionTargets) {
    return same(beforeStore.protocolVersions ?? [], afterStore.protocolVersions ?? []) &&
      same(beforeStore.protocols ?? [], afterStore.protocols ?? []);
  }
  return isProtocolVersionReplacement(beforeStore, afterStore, decision);
}

function isProtocolVersionReplacement(beforeStore, afterStore, decision) {
  const before = beforeStore.protocolVersions ?? [];
  const after = afterStore.protocolVersions ?? [];
  if (after.length !== before.length + 1) return false;
  const previousId = decision.phaseEstablishment?.executionTargets
    ? after.at(-1)?.change?.previousVersionId : null;
  return before.every((item, index) => {
    if (item.id !== previousId) return same(item, after[index]);
    const replacement = after[index];
    return replacement.id === item.id && replacement.status === "superseded" &&
      replacement.endedAt === decision.projectedNextPhaseStart &&
      replacement.supersededByVersionId === after.at(-1)?.id &&
      Object.entries(item).every(([key, value]) => ["status", "endedAt",
        "supersededByVersionId"].includes(key) || same(value, replacement[key]));
  }) && after.at(-1)?.status === "active" &&
    after.at(-1)?.change?.previousVersionId === previousId;
}

function expectedPhaseMatches(store, decision) {
  const goal = store.goals?.find((item) => item.id === decision.goalId);
  const phase = goal?.phases?.find((item) => item.id === decision.currentPhaseId);
  const originalReview = phase?.originalPlannedReviewAt ??
    phase?.reviewMilestone?.originatingMilestoneAt ??
    phase?.reviewMilestone?.plannedAt ?? phase?.plannedReviewAt;
  return goal?.status === "active" && goal.primary === true &&
    phase?.status === decision.expectedCurrentPhaseStatus &&
    Number(phase?.revision ?? 0) === decision.expectedCurrentPhaseRevision &&
    originalReview === decision.originalPlannedReviewAt;
}
function validAuthorization(value, decision) {
  return value?.authorized === true && value?.scope === "phase_review_decision" &&
    value?.decisionId === decision.decisionId && value?.actorId === decision.actorId;
}
function findExisting(store, decision) {
  return (store.phaseReviewDecisions ?? []).find((item) =>
    item.decisionId === decision.decisionId || item.idempotencyKey === decision.idempotencyKey) ?? null;
}
function committedResult(decision, store, idempotent) {
  const transaction = (store.phaseReviewTransactions ?? []).find((item) =>
    item.decisionId === decision.decisionId || item.idempotencyKey === decision.idempotencyKey);
  return deepFreeze({ status: "committed", committed: true, idempotent,
    decisionId: decision.decisionId, selectedOutcome: decision.selectedOutcome,
    transactionId: transaction?.transactionId ?? null,
    revision: getFounderStoreRevision(store), commitId: transaction?.commitId ?? null,
    participantOrder: [...PHASE_REVIEW_PARTICIPANT_ORDER], lifecycle: [], rollbackEvents: [] });
}
function rejected(reasonCode, message) {
  return deepFreeze({ status: "rejected", committed: false, reasonCode, message });
}
function failed(error, lifecycle, rollbackEvents) {
  const authoritative = deepestCodedError(error);
  return deepFreeze({ status: error?.committed === true ? "failed_committed" : "failed",
    committed: error?.committed === true,
    reasonCode: authoritative?.code ?? error?.code ?? "PHASE_REVIEW_COMMIT_FAILED",
    message: authoritative?.message ?? error?.message ?? String(error),
    lifecycle: [...lifecycle], rollbackEvents: [...rollbackEvents] });
}
function deepestCodedError(error) {
  let current = error;
  let coded = error?.code ? error : null;
  const seen = new Set();
  while (current?.cause && !seen.has(current.cause)) {
    seen.add(current);
    current = current.cause;
    if (current?.code) coded = current;
  }
  return coded;
}
function participantError(name, stage, message) {
  const error = new Error(`${name} ${stage}: ${message}`);
  error.code = `PHASE_REVIEW_PARTICIPANT_${name.toUpperCase()}_${stage.toUpperCase()}_FAILED`;
  return error;
}
function event(stage, participant, now) {
  return Object.freeze({ stage, participant, at: now().toISOString() });
}
function isPrefix(before, after) {
  return before.length <= after.length && before.every((item, index) => same(item, after[index]));
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
