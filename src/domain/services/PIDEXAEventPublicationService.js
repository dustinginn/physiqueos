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

export const PI_DEXA_EVENT_PUBLICATION_VERSION =
  "pi_dexa_event_publication_v1";

export function createPIDEXAEventPublicationService(options = {}) {
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
          "Founder baseline changed after DEXA Event preparation.");
      }
      const existing = findEvent(baseline.store, command.artifact);
      const eventState = classifyEvent(existing, command);
      if (eventState.status === "conflict") {
        return failure("dexa_event_conflict", eventState.reason);
      }
      let confidencePrepared = null;
      if (command.confidencePublicationCommand) {
        confidencePrepared = preparePIGoalConfidencePublication(
          baseline.store, command.confidencePublicationCommand
        );
        if (confidencePrepared.result) {
          if (confidencePrepared.result.status !== "matched") {
            return failure("confidence_snapshot_conflict",
              confidencePrepared.result.error?.message ??
              confidencePrepared.result.status);
          }
          confidencePrepared = null;
        }
      }
      if (eventState.status === "matched" && !confidencePrepared) {
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
          if (confidencePrepared) {
            stagePreparedPIGoalConfidencePublication(candidate, confidencePrepared);
          }
          await createDailyBriefingRepository(candidate.dailyBriefings)
            .createDailyBriefing(structuredClone(command.artifact));
        });
        const committed = await transaction.commit({
          validate: (candidate) =>
            validateCandidate(candidate, command, confidencePrepared),
          finalizeCandidate: confidencePrepared
            ? ({ stagedState, commitId }) =>
              finalizePreparedPIGoalConfidencePublication(
                stagedState, confidencePrepared, commitId)
            : undefined,
          validateFinalized: (candidate, context) =>
            validateFinalized(candidate, command, confidencePrepared, context),
        });
        const operation = existing ? "regenerated" :
          command.operation === "reconcile" ? "reconciled" : "created";
        return {
          status: `dexa_event_${operation}_confidence_${
            confidencePrepared ? "published" : "matched"}`,
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
  if (command.schemaVersion !== PI_DEXA_EVENT_PUBLICATION_VERSION) {
    return "Unsupported DEXA Event publication contract.";
  }
  if (!["create", "regenerate", "reconcile"].includes(command.operation)) {
    return "DEXA Event publication operation is invalid.";
  }
  if (!["publish-successor", "matched-only"].includes(command.confidenceMode)) {
    return "DEXA Event confidence mode is invalid.";
  }
  if (command.operation !== "create" && command.replacementAuthorized !== true) {
    return "DEXA Event replacement requires explicit authorization.";
  }
  if (command.confidenceMode === "matched-only" &&
      command.confidencePublicationCommand) {
    return "Matched-only DEXA Event publication cannot publish confidence.";
  }
  const embedded = command.artifact?.briefing?.dexaEventNarrative?.goalConfidence;
  if (!embedded?.assessmentId ||
      embedded.assessmentId !== command.artifactConfidenceAssessmentId) {
    return "DEXA Event confidence identity is invalid.";
  }
  if (command.artifact?.trigger?.evidenceId !== command.canonicalDEXAId) {
    return "Canonical DEXA identity differs from the Event trigger.";
  }
  return null;
}
function classifyEvent(existing, command) {
  if (!existing) return { status: "absent" };
  if (command.operation === "create") {
    return sameEvent(existing, command.artifact)
      ? { status: "matched" }
      : { status: "conflict", reason: "DEXA Event occurrence has different semantics." };
  }
  return { status: "replace" };
}
function validateCandidate(candidate, command, prepared) {
  const artifact = findEvent(candidate, command.artifact);
  if (!artifact || eventConfidenceId(artifact) !==
      command.artifactConfidenceAssessmentId) return { valid: false };
  const snapshot = (candidate.goalConfidenceSnapshots ?? []).find((item) =>
    item.currentAssessmentId === command.artifactConfidenceAssessmentId);
  if (!snapshot) return { valid: false };
  if (prepared &&
      !validatePreparedPIGoalConfidencePublication(candidate, prepared).valid) {
    return { valid: false };
  }
  return { valid: true };
}
function validateFinalized(candidate, command, prepared, context) {
  if (!validateCandidate(candidate, command, prepared).valid) return { valid: false };
  if (candidate.revision !== context.candidateRevision) return { valid: false };
  if (prepared &&
      !validatePreparedPIGoalConfidencePublication(
        candidate, prepared, context).valid) return { valid: false };
  return { valid: true };
}
function findEvent(store, artifact) {
  return (store.dailyBriefings ?? []).find((item) =>
    item.id === artifact.id ||
    (item.trigger?.evidenceType === "dexa" &&
      item.trigger?.evidenceId === artifact.trigger?.evidenceId)) ?? null;
}
function eventConfidenceId(artifact) {
  return artifact.briefing?.dexaEventNarrative?.goalConfidence?.assessmentId;
}
function sameEvent(left, right) {
  return left.id === right.id &&
    left.trigger?.evidenceId === right.trigger?.evidenceId &&
    eventConfidenceId(left) === eventConfidenceId(right);
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
    status,
    committed,
    error: { code: status, message: String(error?.message ?? error) },
  };
}
