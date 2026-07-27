import fs from "node:fs";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
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
  createFounderRuntimeFileHash,
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";
import {
  finalizePreparedPIGoalConfidencePublication,
  preparePIGoalConfidencePublication,
  stagePreparedPIGoalConfidencePublication,
  validatePreparedPIGoalConfidencePublication,
} from "./PIGoalConfidencePersistenceService";

export const PI_PHOTO_EVENT_PUBLICATION_VERSION =
  "pi_photo_event_publication_v1";

export function createPIPhotoEventPublicationService(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const liveStore = options.liveStore ?? getFounderRuntimeStore();
  const readText = options.readText ?? ((target) => fs.readFileSync(target, "utf8"));
  const unitOfWorkFactory = options.unitOfWorkFactory ??
    createFounderStoreUnitOfWork;
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    captureBaseline: () => capture(filePath, readText),
    async publish(command = {}) {
      const invalid = validateCommand(command);
      if (invalid) return failure("semantic_conflict", invalid);
      const baseline = capture(filePath, readText);
      if (baseline.revision !== command.expectedRevision ||
          baseline.semanticDigest !== command.expectedSemanticDigest) {
        return failure("baseline_conflict",
          "Founder baseline changed after Photo Event preparation.");
      }
      const existing = findEvent(baseline.store, command.artifact);
      if (existing && command.operation === "create" &&
          !sameEvent(existing, command.artifact)) {
        return failure("photo_event_conflict",
          "Photo Event occurrence has different semantics.");
      }
      let prepared = null;
      if (command.confidencePublicationCommand) {
        prepared = preparePIGoalConfidencePublication(
          baseline.store, command.confidencePublicationCommand);
        if (prepared.result) {
          if (prepared.result.status !== "matched") {
            return failure("confidence_snapshot_conflict",
              prepared.result.error?.message ?? prepared.result.status);
          }
          prepared = null;
        }
      }
      if (existing && command.operation === "create" && !prepared) {
        return { status: "matched", committed: false, artifact: existing };
      }
      const unit = unitOfWorkFactory({
        filePath, liveStore, stageFrom: baseline.store, now,
        validatePersistedBaseline: (current) => ({
          valid: getFounderStoreRevision(current) === command.expectedRevision &&
            createFounderRuntimeSemanticDigest(current) ===
              command.expectedSemanticDigest,
        }),
        ...(options.unitOfWorkOptions ?? {}),
      });
      try {
        const transaction = unit.begin();
        await transaction.mutate(async (candidate) => {
          if (prepared) stagePreparedPIGoalConfidencePublication(candidate, prepared);
          await createDailyBriefingRepository(candidate.dailyBriefings)
            .createDailyBriefing(structuredClone(command.artifact));
        });
        const committed = await transaction.commit({
          validate: (candidate) => validateCandidate(candidate, command, prepared),
          finalizeCandidate: prepared
            ? ({ stagedState, commitId }) =>
              finalizePreparedPIGoalConfidencePublication(
                stagedState, prepared, commitId)
            : undefined,
          validateFinalized: (candidate, context) => {
            if (candidate.revision !== context.candidateRevision) {
              return { valid: false };
            }
            return validateCandidate(candidate, command, prepared, context);
          },
        });
        const operation = existing ? "regenerated" :
          command.operation === "reconcile" ? "reconciled" : "created";
        return {
          status: `photo_event_${operation}_confidence_${
            prepared ? "published" : "matched"}`,
          committed: true,
          artifact: structuredClone(command.artifact),
          assessmentId: command.artifactConfidenceAssessmentId,
          revision: committed.revision,
          commitId: committed.commitId,
          updatedAt: liveStore.updatedAt,
        };
      } catch (error) {
        if (error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
          return failure("baseline_conflict", error);
        }
        if (error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
            error.committed === true) {
          return failure("committed_publication_failure", error, true);
        }
        return failure("persistence_failure", error);
      }
    },
  });
}

function validateCommand(command) {
  if (command.schemaVersion !== PI_PHOTO_EVENT_PUBLICATION_VERSION) {
    return "Unsupported Photo Event publication contract.";
  }
  if (!["create", "regenerate", "reconcile"].includes(command.operation)) {
    return "Photo Event operation is invalid.";
  }
  if (!["publish-successor", "matched-only"].includes(command.confidenceMode)) {
    return "Photo Event confidence mode is invalid.";
  }
  if (command.operation !== "create" && command.replacementAuthorized !== true) {
    return "Photo Event replacement requires explicit authorization.";
  }
  if (command.confidenceMode === "matched-only" &&
      command.confidencePublicationCommand) {
    return "Matched-only Photo Event publication cannot publish confidence.";
  }
  const embedded = command.artifact?.briefing?.photoEventNarrative?.goalConfidence;
  if (!embedded?.assessmentId ||
      embedded.assessmentId !== command.artifactConfidenceAssessmentId) {
    return "Photo Event confidence identity is invalid.";
  }
  if (command.artifact?.trigger?.evidenceId !== command.photoSessionId) {
    return "Canonical PhotoSession identity differs from the Event trigger.";
  }
  return null;
}
function validateCandidate(candidate, command, prepared, context) {
  const artifact = findEvent(candidate, command.artifact);
  if (!artifact || confidenceId(artifact) !==
      command.artifactConfidenceAssessmentId) return { valid: false };
  const snapshot = (candidate.goalConfidenceSnapshots ?? []).find((item) =>
    item.currentAssessmentId === command.artifactConfidenceAssessmentId);
  if (!snapshot) return { valid: false };
  if (prepared && !validatePreparedPIGoalConfidencePublication(
    candidate, prepared, context).valid) return { valid: false };
  return { valid: true };
}
function findEvent(store, artifact) {
  return (store.dailyBriefings ?? []).find((item) =>
    item.id === artifact.id ||
    (item.trigger?.evidenceType === "photo_session" &&
      item.trigger?.evidenceId === artifact.trigger?.evidenceId)) ?? null;
}
function confidenceId(artifact) {
  return artifact.briefing?.photoEventNarrative?.goalConfidence?.assessmentId;
}
function sameEvent(left, right) {
  return left.id === right.id &&
    left.trigger?.evidenceId === right.trigger?.evidenceId &&
    confidenceId(left) === confidenceId(right);
}
function capture(filePath, readText) {
  const raw = readText(filePath);
  const store = JSON.parse(raw);
  return {
    fileHash: createFounderRuntimeFileHash(raw),
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    revision: getFounderStoreRevision(store),
    lastCommitId: store.lastCommitId ?? null,
    updatedAt: store.updatedAt ?? null,
    store,
  };
}
function failure(status, error, committed = false) {
  return {
    status, committed,
    error: { code: status, message: String(error?.message ?? error) },
  };
}
