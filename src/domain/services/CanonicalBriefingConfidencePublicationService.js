import fs from "node:fs";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { getBriefingOccurrenceIdentity } from
  "../../data/repositories/DailyBriefingHistory";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore";
import {
  ConfidencePublisherRegistry,
} from "../confidence/ConfidencePublisherRegistry";
import {
  validateCanonicalConfidenceAssessment,
} from "../confidence/CanonicalConfidenceAssessmentModel";
import {
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";

export const CANONICAL_BRIEFING_CONFIDENCE_PUBLICATION_VERSION =
  "canonical_briefing_confidence_publication_v2";

const BRIEFING_PUBLICATION_COLLECTIONS = Object.freeze([
  "dailyBriefings",
  "goalConfidenceSnapshots",
  "goalConfidenceHistory",
  "confidenceInitializationArtifacts",
]);

const REPLACE_CURRENT_ASSESSMENT = "replace-current-assessment";

export function createCanonicalBriefingConfidencePublicationService(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const liveStore = options.liveStore ?? getFounderRuntimeStore();
  const readText = options.readText ?? ((target) => fs.readFileSync(target, "utf8"));
  const unitOfWorkFactory = options.unitOfWorkFactory ?? createFounderStoreUnitOfWork;
  const mutateCanonicalRuntime = options.mutateCanonicalRuntime ?? null;
  const registry = options.registry ?? ConfidencePublisherRegistry;
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    captureBaseline() {
      return typeof mutateCanonicalRuntime === "function"
        ? captureLoadedStore(liveStore)
        : capture(filePath, readText);
    },
    async publish(command = {}) {
      if (command.confidenceMode === "matched-only") {
        return publishMatchedArtifact({ command, filePath, liveStore, readText,
          unitOfWorkFactory, mutateCanonicalRuntime, registry, now,
          unitOfWorkOptions: options.unitOfWorkOptions });
      }
      try {
        registry.assertAuthorization(command.authorization);
        validateCommand(command);
      } catch (error) {
        return failure(error.code ?? "semantic_conflict", error);
      }
      if (typeof mutateCanonicalRuntime === "function") {
        return publishBounded({ command, mutateCanonicalRuntime, now });
      }
      const baseline = capture(filePath, readText);
      if (command.expectedRevision != null &&
          baseline.revision !== command.expectedRevision ||
          command.expectedSemanticDigest != null &&
          baseline.semanticDigest !== command.expectedSemanticDigest) {
        return failure("baseline_conflict", "Founder baseline changed after finalization.");
      }
      const existingHistory = (baseline.store.goalConfidenceHistory ?? [])
        .find((item) => item.assessmentId === command.assessment.id ||
          item.assessment?.idempotencyKey === command.assessment.idempotencyKey);
      const existingArtifact = findArtifact(baseline.store, command.artifact);
      const existingOccurrence = findOccurrenceArtifact(
        baseline.store, command.artifact);
      if (existingHistory || existingArtifact) {
        if (existingHistory?.assessmentId === command.assessment.id &&
            existingArtifact?.confidencePublication?.assessmentId ===
              command.assessment.id) {
          return { status: "matched", committed: false,
            assessmentId: command.assessment.id, artifact: existingArtifact };
        }
        if (existingHistory) {
          return failure("publication_identity_conflict",
            "Publication idempotency identity already has different semantics.");
        }
      }
      const replacementTarget = existingOccurrence ?? existingArtifact;
      const completableClaim = isCompletableClaim(replacementTarget, command.artifact);
      if (replacementTarget && !completableClaim) {
        const lineage = command.assessment.replacementLineage;
        const replacedAssessmentId =
          replacementTarget.confidencePublication?.assessmentId ?? null;
        if (command.replacementAuthorized !== true ||
            lineage.replacesArtifactId !== replacementTarget.id ||
            lineage.replacesAssessmentId !== replacedAssessmentId) {
          return failure("replacement_lineage_conflict",
            "Existing briefing replacement requires explicit, exact lineage authorization.");
        }
      } else if (command.replacementAuthorized === true) {
        return failure("replacement_target_missing",
          "Authorized replacement target was not found.");
      }
      const current = currentSnapshot(baseline.store, command.assessment);
      const actualPrior = current?.currentAssessmentId ?? null;
      if (actualPrior !== (command.expectedPriorAssessmentId ?? null) ||
          !validAssessmentPredecessor({
            store: baseline.store, command, replacementTarget, actualPrior,
          })) {
        return failure("expected_prior_conflict", "Canonical predecessor changed.");
      }
      const priorAssessment = current ? findAssessment(
        baseline.store, current.currentAssessmentId) : null;
      const priorCutoff = priorAssessment?.sourceCutoff ??
        priorAssessment?.evidenceCutoff ?? null;
      if (priorCutoff && Date.parse(command.assessment.sourceCutoff) <
          Date.parse(priorCutoff)) {
        return failure("temporal_cutoff_conflict",
          "A canonical successor cannot move the evidence cutoff backward.");
      }
      if (command.replacementSemantics === REPLACE_CURRENT_ASSESSMENT &&
          priorCutoff !== command.assessment.sourceCutoff) {
        return failure("replacement_cutoff_conflict",
          "A canonical correction must preserve the replaced Confidence cutoff.");
      }
      if (current && command.replacementAuthorized !== true &&
          command.assessment.publisherType === "goal_initialization") {
        return failure("initialization_conflict", "Goal initialization cannot replace a series.");
      }
      const unit = unitOfWorkFactory({
        filePath, liveStore, stageFrom: baseline.store, now,
        validatePersistedBaseline: (candidate) => ({
          valid: getFounderStoreRevision(candidate) === baseline.revision &&
            createFounderRuntimeSemanticDigest(candidate) === baseline.semanticDigest,
        }),
        ...(options.unitOfWorkOptions ?? {}),
      });
      try {
        const transaction = unit.begin();
        await transaction.mutate(async (candidate) => {
          ensureCollections(candidate);
          stageAssessment(candidate, command.assessment);
          if (command.assessment.publisherType === "goal_initialization") {
            candidate.confidenceInitializationArtifacts.push(
              structuredClone(command.artifact));
          } else {
            const repository = createDailyBriefingRepository(candidate.dailyBriefings);
            if (isCompletableClaim(findArtifact(candidate, command.artifact),
                command.artifact)) {
              await repository.completeScheduledBriefing(
                structuredClone(command.artifact));
            } else {
              await repository.createDailyBriefing(
                structuredClone(command.artifact),
                {
                  replacementReason:
                    command.assessment.sourceLineage?.reason ?? null,
                }
              );
            }
          }
        });
        const committed = await transaction.commit({
          validate: (candidate) => validateCandidate(candidate, command),
          finalizeCandidate: ({ stagedState, commitId }) => {
            finalizeRecords(stagedState, command.assessment.id, commitId,
              stagedState.updatedAt);
          },
          validateFinalized: (candidate, context) =>
            validateCandidate(candidate, command, context),
        });
        return {
          status: command.assessment.priorAssessmentId
            ? command.assessment.movement === "no_meaningful_change"
              ? "published_reaffirmation" : "published_successor"
            : "published_initial",
          committed: true,
          assessmentId: command.assessment.id,
          artifact: structuredClone(command.artifact),
          revision: committed.revision,
          commitId: committed.commitId,
        };
      } catch (error) {
        if (error.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
          return failure("baseline_conflict", error);
        }
        if (error.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
            error.committed === true) {
          return failure("committed_publication_failure", error, true);
        }
        return failure("persistence_failure", error);
      }
    },
  });
}

async function publishMatchedArtifact({ command, filePath, liveStore, readText,
  unitOfWorkFactory, mutateCanonicalRuntime, registry, now,
  unitOfWorkOptions } = {}) {
  try {
    registry.assertAuthorization(command.authorization);
    validateMatchedCommand(command);
  } catch (error) {
    return failure(error.code ?? "semantic_conflict", error);
  }
  if (typeof mutateCanonicalRuntime === "function") {
    return publishMatchedBounded({ command, mutateCanonicalRuntime });
  }
  const baseline = capture(filePath, readText);
  const relation = findHistoricalAssessment(
    baseline.store, command.matchedAssessmentId);
  if (!relation) return failure("matched_assessment_missing",
    "Historical Confidence relationship is unavailable.");
  const existing = findArtifact(baseline.store, command.artifact);
  if (existing) return sameMatchedArtifact(existing, command)
    ? { status: "matched", committed: false, artifact: existing }
    : failure("publication_identity_conflict",
      "Historical briefing identity already has different semantics.");
  const unit = unitOfWorkFactory({ filePath, liveStore, stageFrom: baseline.store,
    now, validatePersistedBaseline: (candidate) => ({ valid:
      getFounderStoreRevision(candidate) === baseline.revision &&
      createFounderRuntimeSemanticDigest(candidate) === baseline.semanticDigest }),
    ...(unitOfWorkOptions ?? {}) });
  try {
    const transaction = unit.begin();
    await transaction.mutate(async (candidate) => {
      if (!findHistoricalAssessment(candidate, command.matchedAssessmentId)) {
        throw semanticFailure("matched_assessment_missing",
          "Historical Confidence relationship changed before publication.");
      }
      await createDailyBriefingRepository(candidate.dailyBriefings)
        .createDailyBriefing(structuredClone(command.artifact));
    });
    const committed = await transaction.commit({
      validate: (candidate) => ({ valid: sameMatchedArtifact(
        findArtifact(candidate, command.artifact), command) }),
    });
    return { status: "published_historical_matched", committed: true,
      assessmentId: command.matchedAssessmentId,
      artifact: structuredClone(command.artifact), revision: committed.revision,
      commitId: committed.commitId };
  } catch (error) {
    if (error?.publicationStatus) return failure(error.publicationStatus, error);
    if (error.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
      return failure("baseline_conflict", error);
    }
    return failure("persistence_failure", error);
  }
}

async function publishMatchedBounded({ command, mutateCanonicalRuntime }) {
  try {
    const committed = await mutateCanonicalRuntime({
      operation: "briefing-historical-matched-publication",
      allowedCollections: ["dailyBriefings"],
      readCollections: ["dailyBriefings", "goalConfidenceHistory"],
      readApplicationContext: false,
      readImportMetadata: false,
      allowApplicationContextMutation: false,
      async mutate(candidate) {
        if (!findHistoricalAssessment(candidate, command.matchedAssessmentId)) {
          throw semanticFailure("matched_assessment_missing",
            "Historical Confidence relationship changed before publication.");
        }
        const existing = findArtifact(candidate, command.artifact);
        if (existing) {
          if (!sameMatchedArtifact(existing, command)) {
            throw semanticFailure("publication_identity_conflict",
              "Historical briefing identity already has different semantics.");
          }
          return { matched: true, artifact: structuredClone(existing) };
        }
        await createDailyBriefingRepository(candidate.dailyBriefings)
          .createDailyBriefing(structuredClone(command.artifact));
        return { matched: false, artifact: structuredClone(command.artifact) };
      },
    });
    return { status: committed.result.matched ? "matched" :
      "published_historical_matched", committed: !committed.result.matched,
      assessmentId: command.matchedAssessmentId,
      artifact: committed.result.artifact, revision: committed.revision,
      commitId: committed.commitId, memoryProfile: committed.memoryProfile };
  } catch (error) {
    if (error?.publicationStatus) return failure(error.publicationStatus, error);
    return failure(error.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
      ? "baseline_conflict" : "persistence_failure", error);
  }
}

async function publishBounded({ command, mutateCanonicalRuntime, now }) {
  try {
    const committed = await mutateCanonicalRuntime({
      operation: "briefing-confidence-publication",
      allowedCollections: BRIEFING_PUBLICATION_COLLECTIONS,
      readCollections: BRIEFING_PUBLICATION_COLLECTIONS,
      readApplicationContext: false,
      readImportMetadata: false,
      allowApplicationContextMutation: false,
      async mutate(candidate, { commandId }) {
        ensureCollections(candidate);
        const existingHistory = (candidate.goalConfidenceHistory ?? [])
          .find((item) => item.assessmentId === command.assessment.id ||
            item.assessment?.idempotencyKey === command.assessment.idempotencyKey);
        const existingArtifact = findArtifact(candidate, command.artifact);
        if (existingHistory || existingArtifact) {
          if (existingHistory?.assessmentId === command.assessment.id &&
              existingArtifact?.confidencePublication?.assessmentId ===
                command.assessment.id) {
            return { matched: true, artifact: structuredClone(existingArtifact) };
          }
          if (existingHistory) {
            throw semanticFailure("publication_identity_conflict",
              "Publication idempotency identity already has different semantics.");
          }
        }
        const existingOccurrence = findOccurrenceArtifact(
          candidate, command.artifact);
        const replacementTarget = existingOccurrence ?? existingArtifact;
        const completableClaim = isCompletableClaim(
          replacementTarget, command.artifact);
        if (replacementTarget && !completableClaim) {
          const lineage = command.assessment.replacementLineage;
          const replacedAssessmentId =
            replacementTarget.confidencePublication?.assessmentId ?? null;
          if (command.replacementAuthorized !== true ||
              lineage.replacesArtifactId !== replacementTarget.id ||
              lineage.replacesAssessmentId !== replacedAssessmentId) {
            throw semanticFailure("replacement_lineage_conflict",
              "Existing briefing replacement requires explicit, exact lineage authorization.");
          }
        } else if (command.replacementAuthorized === true) {
          throw semanticFailure("replacement_target_missing",
            "Authorized replacement target was not found.");
        }
        const current = currentSnapshot(candidate, command.assessment);
        const actualPrior = current?.currentAssessmentId ?? null;
        if (actualPrior !== (command.expectedPriorAssessmentId ?? null) ||
            !validAssessmentPredecessor({
              store: candidate, command, replacementTarget, actualPrior,
            })) {
          throw semanticFailure("expected_prior_conflict",
            "Canonical predecessor changed.");
        }
        const priorAssessment = current
          ? findAssessment(candidate, current.currentAssessmentId) : null;
        const priorCutoff = priorAssessment?.sourceCutoff ??
          priorAssessment?.evidenceCutoff ?? null;
        if (priorCutoff && Date.parse(command.assessment.sourceCutoff) <
            Date.parse(priorCutoff)) {
          throw semanticFailure("temporal_cutoff_conflict",
            "A canonical successor cannot move the evidence cutoff backward.");
        }
        if (command.replacementSemantics === REPLACE_CURRENT_ASSESSMENT &&
            priorCutoff !== command.assessment.sourceCutoff) {
          throw semanticFailure("replacement_cutoff_conflict",
            "A canonical correction must preserve the replaced Confidence cutoff.");
        }
        if (current && command.replacementAuthorized !== true &&
            command.assessment.publisherType === "goal_initialization") {
          throw semanticFailure("initialization_conflict",
            "Goal initialization cannot replace a series.");
        }

        stageAssessment(candidate, command.assessment);
        if (command.assessment.publisherType === "goal_initialization") {
          candidate.confidenceInitializationArtifacts = [
            ...(candidate.confidenceInitializationArtifacts ?? []),
            structuredClone(command.artifact),
          ];
        } else {
          const repository = createDailyBriefingRepository(candidate.dailyBriefings);
          if (isCompletableClaim(findArtifact(candidate, command.artifact),
              command.artifact)) {
            await repository.completeScheduledBriefing(
              structuredClone(command.artifact));
          } else {
            await repository.createDailyBriefing(
              structuredClone(command.artifact),
              { replacementReason:
                  command.assessment.sourceLineage?.reason ?? null }
            );
          }
        }
        const committedAt = now().toISOString();
        finalizeRecords(candidate, command.assessment.id, commandId, committedAt);
        if (validateCandidate(candidate, command, { commitId: commandId })
          ?.valid !== true) {
          throw semanticFailure("publication_validation_failed",
            "Finalized briefing publication candidate was rejected.");
        }
        return { matched: false, artifact: structuredClone(command.artifact) };
      },
    });
    if (committed.result.matched) {
      return {
        status: "matched",
        committed: false,
        assessmentId: command.assessment.id,
        artifact: committed.result.artifact,
        revision: committed.revision,
        commitId: committed.commitId,
        memoryProfile: committed.memoryProfile,
      };
    }
    return {
      status: command.assessment.priorAssessmentId
        ? command.assessment.movement === "no_meaningful_change"
          ? "published_reaffirmation" : "published_successor"
        : "published_initial",
      committed: true,
      assessmentId: command.assessment.id,
      artifact: committed.result.artifact,
      revision: committed.revision,
      commitId: committed.commitId,
      memoryProfile: committed.memoryProfile,
    };
  } catch (error) {
    if (error?.publicationStatus) {
      return failure(error.publicationStatus, error);
    }
    if (error.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ||
        error.code === "FOUNDER_STORE_REVISION_CONFLICT") {
      return failure("baseline_conflict", error);
    }
    return failure("persistence_failure", error);
  }
}

function validateCommand(command) {
  validateCanonicalConfidenceAssessment(command.assessment);
  if (command.authorization.publisherType !== command.assessment.publisherType ||
      command.authorization.artifactId !== command.artifact?.id ||
      command.authorization.artifactId !== command.assessment.briefingArtifactId ||
      command.artifact?.confidencePublication?.assessmentId !== command.assessment.id) {
    throw new Error("Artifact, assessment, and publisher lineage disagree.");
  }
  if (command.replacementSemantics != null &&
      command.replacementSemantics !== REPLACE_CURRENT_ASSESSMENT) {
    throw new Error("Briefing replacement semantics are invalid.");
  }
  if (command.replacementSemantics === REPLACE_CURRENT_ASSESSMENT &&
      command.replacementAuthorized !== true) {
    throw new Error("Current-assessment replacement requires explicit authorization.");
  }
}
function validateMatchedCommand(command) {
  if (command.confidenceMode !== "matched-only" ||
      !command.matchedAssessmentId || !command.artifact?.id ||
      command.artifact.confidencePublication?.assessmentId !==
        command.matchedAssessmentId ||
      command.artifact.confidencePublication?.confidenceMode !== "matched-only" ||
      command.authorization?.artifactId !== command.artifact.id ||
      command.authorization?.publisherType !==
        command.artifact.confidencePublication?.publisherType) {
    throw new Error("Historical matched briefing publication is invalid.");
  }
}
function ensureCollections(store) {
  store.goalConfidenceSnapshots ??= [];
  store.goalConfidenceHistory ??= [];
  store.dailyBriefings ??= [];
  store.confidenceInitializationArtifacts ??= [];
}
function stageAssessment(store, assessment) {
  const history = {
    id: `goal_confidence_history_v2|${assessment.id}`,
    schemaVersion: "goal_confidence_history_record_v2",
    assessmentId: assessment.id,
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    predecessorAssessmentId: assessment.priorAssessmentId,
    originatingArtifactId: assessment.briefingArtifactId,
    publisherType: assessment.publisherType,
    persistedAt: null,
    commitId: null,
    assessment: structuredClone(assessment),
  };
  store.goalConfidenceHistory.push(history);
  const priorIndex = store.goalConfidenceSnapshots.findIndex((item) =>
    item.goalId === assessment.goalId && item.phaseId === assessment.phaseId);
  const snapshot = {
    id: `goal_confidence_snapshot_v2|${assessment.goalId}|${assessment.phaseId ?? "goal"}`,
    schemaVersion: "goal_confidence_snapshot_v2",
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    goalContractId: assessment.goalContract.id,
    goalContractVersion: assessment.goalContract.version,
    currentAssessmentId: assessment.id,
    currentScore: assessment.currentPercentage,
    scoreBand: assessment.confidenceBand,
    previousCanonicalAssessmentId: assessment.priorAssessmentId,
    historyRecordId: history.id,
    originatingArtifactId: assessment.briefingArtifactId,
    publisherType: assessment.publisherType,
    evidenceCutoff: assessment.sourceCutoff,
    createdAt: null,
    updatedAt: null,
  };
  if (priorIndex < 0) store.goalConfidenceSnapshots.push(snapshot);
  else store.goalConfidenceSnapshots.splice(priorIndex, 1, snapshot);
}
function finalizeRecords(store, assessmentId, commitId, committedAt) {
  const history = store.goalConfidenceHistory.find((item) =>
    item.assessmentId === assessmentId);
  const snapshot = store.goalConfidenceSnapshots.find((item) =>
    item.currentAssessmentId === assessmentId);
  if (!history || !snapshot) throw new Error("Staged confidence records are missing.");
  history.persistedAt = committedAt;
  history.commitId = commitId;
  snapshot.createdAt ??= committedAt;
  snapshot.updatedAt = committedAt;
  snapshot.commitId = commitId;
}
function validateCandidate(store, command, context = null) {
  const histories = (store.goalConfidenceHistory ?? []).filter((item) =>
    item.assessmentId === command.assessment.id);
  const snapshots = (store.goalConfidenceSnapshots ?? []).filter((item) =>
    item.goalId === command.assessment.goalId &&
    item.phaseId === command.assessment.phaseId);
  const artifact = findArtifact(store, command.artifact);
  const valid = histories.length === 1 && snapshots.length === 1 && artifact &&
    snapshots[0].currentAssessmentId === command.assessment.id &&
    artifact.confidencePublication?.assessmentId === command.assessment.id;
  if (!valid) return { valid: false };
  if (context && (histories[0].commitId !== context.commitId ||
      snapshots[0].commitId !== context.commitId)) return { valid: false };
  return { valid: true };
}
function findArtifact(store, artifact) {
  const collection = artifact?.confidencePublication?.publisherType ===
    "goal_initialization"
    ? store.confidenceInitializationArtifacts : store.dailyBriefings;
  return (collection ?? []).find((item) => item.id === artifact?.id) ?? null;
}
function findOccurrenceArtifact(store, artifact) {
  if (artifact?.confidencePublication?.publisherType === "goal_initialization") {
    return findArtifact(store, artifact);
  }
  const identity = getBriefingOccurrenceIdentity(artifact);
  if (!identity) return null;
  return (store.dailyBriefings ?? []).find((item) =>
    getBriefingOccurrenceIdentity(item) === identity) ?? null;
}
function isCompletableClaim(existing, artifact) {
  return Boolean(existing && artifact && existing.id === artifact.id &&
    existing.artifactType === "scheduled" && !existing.briefing &&
    existing.lifecycle?.generationStatus === "in_progress");
}
function currentSnapshot(store, assessment) {
  return (store.goalConfidenceSnapshots ?? []).find((item) =>
    item.goalId === assessment.goalId && item.phaseId === assessment.phaseId) ?? null;
}
function findAssessment(store, assessmentId) {
  return (store.goalConfidenceHistory ?? []).find((item) =>
    item.assessmentId === assessmentId)?.assessment ?? null;
}

export function resolveStableConfidenceReplacementPredecessor({
  store, assessmentId,
} = {}) {
  let assessment = findAssessment(store, assessmentId);
  if (!assessment) return null;
  const visited = new Set();
  while (assessment?.replacementLineage?.replacesAssessmentId) {
    if (visited.has(assessment.id)) return null;
    visited.add(assessment.id);
    const replaced = findAssessment(
      store, assessment.replacementLineage.replacesAssessmentId);
    if (!sameReplacementOccurrence(assessment, replaced)) return null;
    assessment = replaced;
  }
  return assessment.priorAssessmentId
    ? findAssessment(store, assessment.priorAssessmentId) : null;
}

function validAssessmentPredecessor({
  store, command, replacementTarget, actualPrior,
}) {
  if (command.replacementSemantics !== REPLACE_CURRENT_ASSESSMENT) {
    return actualPrior === (command.assessment.priorAssessmentId ?? null);
  }
  const replacedAssessmentId =
    replacementTarget?.confidencePublication?.assessmentId ?? null;
  if (!replacedAssessmentId || replacedAssessmentId !== actualPrior) return false;
  const stable = resolveStableConfidenceReplacementPredecessor({
    store, assessmentId: replacedAssessmentId,
  });
  return Boolean(stable && stable.id === command.assessment.priorAssessmentId);
}

function sameReplacementOccurrence(left, right) {
  return Boolean(left && right &&
    left.publisherType === right.publisherType &&
    left.briefingArtifactId === right.briefingArtifactId &&
    left.evidenceWindowId === right.evidenceWindowId &&
    left.sourceCutoff === right.sourceCutoff);
}
function findHistoricalAssessment(store, assessmentId) {
  const matches = (store.goalConfidenceHistory ?? []).filter((item) =>
    item.assessmentId === assessmentId && item.assessment?.id === assessmentId);
  return matches.length === 1 ? matches[0] : null;
}
function sameMatchedArtifact(artifact, command) {
  return Boolean(artifact && artifact.id === command.artifact.id &&
    artifact.trigger?.evidenceType === command.artifact.trigger?.evidenceType &&
    artifact.trigger?.evidenceId === command.artifact.trigger?.evidenceId &&
    artifact.confidencePublication?.assessmentId === command.matchedAssessmentId &&
    artifact.confidencePublication?.confidenceMode === "matched-only");
}
function capture(filePath, readText) {
  const store = JSON.parse(readText(filePath));
  return { store, revision: getFounderStoreRevision(store),
    semanticDigest: createFounderRuntimeSemanticDigest(store) };
}
function captureLoadedStore(store) {
  return { store, revision: getFounderStoreRevision(store),
    semanticDigest: createFounderRuntimeSemanticDigest(store) };
}
function semanticFailure(publicationStatus, message) {
  return Object.assign(new Error(message), { publicationStatus });
}
function failure(status, error, committed = false) {
  return { status, committed, error: { code: status,
    message: String(error?.message ?? error) } };
}
