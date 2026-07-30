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

export const PI_CADENCE_BRIEFING_PUBLICATION_VERSION =
  "pi_cadence_briefing_publication_v1";

export function createPICadenceBriefingPublicationService(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const liveStore = options.liveStore ?? getFounderRuntimeStore();
  const readText = options.readText ?? ((target) => fs.readFileSync(target, "utf8"));
  const unitOfWorkFactory = options.unitOfWorkFactory ?? createFounderStoreUnitOfWork;
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    captureBaseline: () => capture(filePath, readText),
    async publish(command = {}) {
      const invalid = validateCommand(command);
      if (invalid) return failure("semantic_conflict", invalid);
      const baseline = capture(filePath, readText);
      if (baseline.revision !== command.expectedRevision ||
          baseline.semanticDigest !== command.expectedSemanticDigest) {
        return failure("baseline_conflict", "Founder baseline changed after cadence preparation.");
      }
      const existing = findOccurrence(baseline.store, command.artifact);
      const briefingState = classifyBriefing(existing, command);
      if (briefingState.status === "conflict") {
        return failure("briefing_artifact_conflict", briefingState.reason);
      }
      let confidencePrepared = null;
      if (command.confidencePublicationCommand) {
        confidencePrepared = preparePIGoalConfidencePublication(
          baseline.store, command.confidencePublicationCommand
        );
        if (confidencePrepared.result) {
          if (confidencePrepared.result.status !== "matched") {
            return failure("confidence_snapshot_conflict",
              confidencePrepared.result.error?.message ?? confidencePrepared.result.status);
          }
          confidencePrepared = null;
        }
      }
      if (briefingState.status === "matched" && !confidencePrepared) {
        return { status: "matched", committed: false, artifact: existing };
      }
      const unit = unitOfWorkFactory({
        filePath, liveStore, stageFrom: baseline.store, now,
        validatePersistedBaseline: (current) => ({
          valid: getFounderStoreRevision(current) === command.expectedRevision &&
            createFounderRuntimeSemanticDigest(current) === command.expectedSemanticDigest,
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
          validate: (candidate) => validateCandidate(
            candidate, command, confidencePrepared),
          finalizeCandidate: confidencePrepared
            ? ({ stagedState, commitId }) =>
              finalizePreparedPIGoalConfidencePublication(
                stagedState, confidencePrepared, commitId)
            : undefined,
          validateFinalized: (candidate, context) =>
            validateFinalized(candidate, command, confidencePrepared, context),
        });
        const operation = existing ? "regenerated" : "created";
        const confidence = confidencePrepared ? "published" : "matched";
        return {
          status: `briefing_${operation}_confidence_${confidence}`,
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
  if (command.schemaVersion !== "pi_cadence_briefing_publication_v1") {
    return "Unsupported cadence publication contract.";
  }
  if (!["midweek", "weekly", "monthly"].includes(command.cadence) ||
      command.artifact?.cadence !== command.cadence) return "Cadence identity is invalid.";
  if (!["create", "catch_up", "regenerate"].includes(command.operation)) {
    return "Cadence publication operation is invalid.";
  }
  if (command.operation === "regenerate" && command.replacementAuthorized !== true) {
    return "Regeneration requires explicit replacement authorization.";
  }
  const embedded = command.cadence === "midweek"
    ? command.artifact?.briefing?.goalConfidence
    : command.cadence === "weekly"
      ? command.artifact?.briefing?.weeklyNarrative?.goalConfidence
      : command.artifact?.briefing?.monthlyNarrative?.confidence;
  if (!embedded?.assessmentId ||
      embedded.assessmentId !== command.artifactConfidenceAssessmentId) {
    return "Briefing confidence identity is invalid.";
  }
  return null;
}
function classifyBriefing(existing, command) {
  if (!existing) return { status: "absent" };
  if (command.operation !== "regenerate") {
    return sameSemanticArtifact(existing, command.artifact)
      ? { status: "matched" }
      : { status: "conflict", reason: "Cadence occurrence already has different semantics." };
  }
  return { status: "replace" };
}
function validateCandidate(candidate, command, confidencePrepared) {
  const artifact = findOccurrence(candidate, command.artifact);
  if (!artifact || artifactConfidenceId(artifact) !==
      command.artifactConfidenceAssessmentId) return { valid: false };
  if (confidencePrepared &&
      !validatePreparedPIGoalConfidencePublication(candidate, confidencePrepared).valid) {
    return { valid: false };
  }
  return { valid: true };
}
function validateFinalized(candidate, command, prepared, context) {
  if (!validateCandidate(candidate, command, prepared).valid) return { valid: false };
  if (candidate.revision !== context.candidateRevision) return { valid: false };
  if (prepared &&
      !validatePreparedPIGoalConfidencePublication(candidate, prepared, context).valid) {
    return { valid: false };
  }
  return { valid: true };
}
function findOccurrence(store, artifact) {
  return (store.dailyBriefings ?? []).find((item) =>
    item.id === artifact.id || (
      item.userId === artifact.userId &&
      item.cadence === artifact.cadence &&
      item.evidenceWindow?.id === artifact.evidenceWindow?.id
    )) ?? null;
}
function artifactConfidenceId(artifact) {
  return artifact.cadence === "midweek"
    ? artifact.briefing?.goalConfidence?.assessmentId
    : artifact.cadence === "weekly"
      ? artifact.briefing?.weeklyNarrative?.goalConfidence?.assessmentId
      : artifact.briefing?.monthlyNarrative?.confidence?.assessmentId;
}
function sameSemanticArtifact(left, right) {
  return left.id === right.id &&
    left.evidenceWindow?.id === right.evidenceWindow?.id &&
    artifactConfidenceId(left) === artifactConfidenceId(right);
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
    error: {
      code: status,
      message: String(error?.message ?? error),
    },
  };
}
