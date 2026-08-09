import {
  reconcileConfirmedEvidencePackage,
} from "./CanonicalEvidenceService";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";
import {
  createPILowerLevelConfidenceWorkEnqueueService,
} from "./PILowerLevelConfidenceWorkEnqueueService";
import { createPISemanticFingerprint } from "./PILowerLevelConfidenceContracts";
import { findCanonicalExerciseConflict } from "./CanonicalExerciseLibraryService";
import { registerRuntimeTrainingExercises } from "../models/trainingExerciseIdentity";

export const PILowerLevelSourceCommitOutcome = Object.freeze({
  SOURCE_COMMITTED_WORK_ENQUEUED: "source_committed_work_enqueued",
  SOURCE_COMMITTED_WORK_MATCHED: "source_committed_work_matched",
  SOURCE_MATCHED: "source_matched",
  BASELINE_CONFLICT: "baseline_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
});

export function createPILowerLevelCanonicalEvidenceCommitService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
  enqueueCoordinator = createPILowerLevelConfidenceWorkEnqueueService({ now }),
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Lower-level canonical commit requires a bound Founder store.");
  }
  return Object.freeze({
    async commitConfirmedEvidencePackage(
      evidencePackage,
      userId,
      { canonicalExerciseDefinitions = [] } = {}
    ) {
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: liveStore,
        now,
      }).begin();
      let reconciliation;
      const enqueueResults = [];
      try {
        await transaction.mutate((candidate) => {
          candidate.canonicalExerciseLibrary ??= [];
          for (const definition of canonicalExerciseDefinitions) {
            const conflict = findCanonicalExerciseConflict(
              definition,
              candidate.canonicalExerciseLibrary
            );
            if (conflict) {
              throw new Error(
                `"${definition.name}" matches the existing exercise "${conflict.name}".`
              );
            }
            candidate.canonicalExerciseLibrary.push({
              ...definition,
              created_at: definition.created_at ?? now().toISOString(),
              created_by: userId,
            });
          }
          reconciliation = reconcileConfirmedEvidencePackage({
            evidencePackage,
            existingCanonicalObjects: candidate.canonicalEvidenceObjects ?? [],
            userId,
          });
          if (reconciliation.changedObjects.length === 0) return;
          candidate.canonicalEvidenceObjects = applyChanges(
            candidate.canonicalEvidenceObjects,
            reconciliation.changedObjects
          );
          for (const record of reconciliation.changedObjects.filter(
            isEnergySource
          )) {
            const date = sourceDate(record);
            const counterpart = findCounterpart(
              candidate.canonicalEvidenceObjects,
              record,
              date
            );
            enqueueResults.push(
              enqueueCoordinator.stageEnergySourceChange(candidate, {
                domain: energyDomain(record),
                canonicalEvidenceId: record.canonicalId,
                changedLocalDate: date,
                sourceChangeType: sourceChangeType(record),
                sourceSemanticFingerprint: sourceSemanticFingerprint(record),
                linkedCounterpartId: counterpart?.canonicalId ?? null,
                evidenceCutoff: `${date}T23:59:59.999Z`,
                createdAt: now().toISOString(),
              })
            );
          }
          for (const rmr of reconciliation.changedObjects.filter(isRmrSource)) {
            for (const date of boundedRmrAffectedDates(
              candidate.canonicalEvidenceObjects,
              sourceDate(rmr)
            )) {
              const sources = candidate.canonicalEvidenceObjects.filter(
                (item) =>
                  isEnergySource(item) &&
                  item.quality?.status !== "superseded" &&
                  sourceDate(item) === date
              );
              const nutrition = sources.find(
                (item) => energyDomain(item) === "nutrition"
              );
              const activity = sources.find(
                (item) => energyDomain(item) === "activity"
              );
              const primary = nutrition ?? activity;
              if (!primary) continue;
              enqueueResults.push(
                enqueueCoordinator.stageEnergySourceChange(candidate, {
                  domain: energyDomain(primary),
                  canonicalEvidenceId: primary.canonicalId,
                  linkedCounterpartId:
                    (nutrition === primary ? activity : nutrition)
                      ?.canonicalId ?? null,
                  changedLocalDate: date,
                  sourceChangeType: "rmr_correction",
                  sourceSemanticFingerprint:
                    createPISemanticFingerprint(semanticRecord(rmr)),
                  rmrSourceId: rmr.canonicalId,
                  reason: "rmr_correction_committed",
                  evidenceCutoff: `${date}T23:59:59.999Z`,
                  createdAt: now().toISOString(),
                })
              );
            }
          }
        });
        if (
          (!reconciliation || reconciliation.changedObjects.length === 0) &&
          canonicalExerciseDefinitions.length === 0
        ) {
          transaction.abort();
          return sourceResult(
            PILowerLevelSourceCommitOutcome.SOURCE_MATCHED,
            reconciliation,
            enqueueResults
          );
        }
        const committed = await transaction.commit({
          finalizeCandidate({ stagedState, commitId }) {
            stampPendingSourceCommits(stagedState, commitId);
          },
          validateFinalized(candidate) {
            return reconciliation.changedObjects.every((record) =>
              candidate.canonicalEvidenceObjects?.some(
                (item) => item.canonicalId === record.canonicalId
              )
            ) && canonicalExerciseDefinitions.every((definition) =>
              candidate.canonicalExerciseLibrary?.some(
                (item) => item.id === definition.id
              )
            ) && enqueueResults.every((item) =>
              candidate.piEnergyConfidenceWorkItems?.some(
                (work) => work.id === item.workId &&
                  work.sourceCommitLinks?.every(
                    (link) => link.commitId !== "pending_source_commit"
                  )
              )
            );
          },
        });
        registerRuntimeTrainingExercises(liveStore.canonicalExerciseLibrary ?? []);
        return sourceResult(
          enqueueResults.every((item) => item.outcome === "matched")
            ? PILowerLevelSourceCommitOutcome.SOURCE_COMMITTED_WORK_MATCHED
            : PILowerLevelSourceCommitOutcome.SOURCE_COMMITTED_WORK_ENQUEUED,
          reconciliation,
          enqueueResults,
          {
            committed: true,
            revision: committed.revision,
            commitId: committed.commitId,
            report: {
              ...(reconciliation?.report ?? {}),
              newCanonicalExercises: canonicalExerciseDefinitions.map(
                ({ id, name }) => ({ id, name })
              ),
            },
          }
        );
      } catch (error) {
        if (
          error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
          error.committed
        ) {
          return sourceResult(
            PILowerLevelSourceCommitOutcome.COMMITTED_PUBLICATION_FAILURE,
            reconciliation,
            enqueueResults,
            { committed: true, commitId: error.commitId }
          );
        }
        return sourceResult(
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ||
          error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED ||
          error?.cause?.code === "NUTRITION_REVISION_STALE"
            ? PILowerLevelSourceCommitOutcome.BASELINE_CONFLICT
            : PILowerLevelSourceCommitOutcome.PERSISTENCE_FAILURE,
          reconciliation,
          enqueueResults,
          { errorCode: error?.code ?? "LOWER_LEVEL_SOURCE_COMMIT_FAILED" }
        );
      }
    },
    captureBaseline() {
      return {
        revision: liveStore.revision ?? 0,
        semanticDigest: createFounderRuntimeSemanticDigest(liveStore),
      };
    },
  });
}

function applyChanges(existing = [], changed = []) {
  const byId = new Map(existing.map((item) => [item.canonicalId, item]));
  changed.forEach((item) => byId.set(item.canonicalId, item));
  return [...byId.values()];
}
function isEnergySource(record) {
  return ["nutrition", "activity_day", "activity"].includes(
    energyType(record)
  );
}
function isRmrSource(record) {
  return ["dexa", "dexa_scan", "body_composition"].includes(
    energyType(record)
  ) && Number.isFinite(
    record.payload?.restingMetabolicRate?.value ??
    record.payload?.resting_metabolic_rate ??
    record.payload?.rmr
  );
}
function energyDomain(record) {
  return energyType(record) === "nutrition" ? "nutrition" : "activity";
}
function energyType(record) {
  return record.evidence_type ?? record.payload?.evidence_type;
}
function sourceDate(record) {
  return String(
    record.payload?.date ??
    record.payload?.observed_at ??
    record.lastObservedAt ??
    record.firstObservedAt
  ).slice(0, 10);
}
function findCounterpart(records, record, date) {
  const target = energyDomain(record) === "nutrition" ? "activity" : "nutrition";
  return records.find((item) =>
    isEnergySource(item) &&
    item.quality?.status !== "superseded" &&
    energyDomain(item) === target &&
    sourceDate(item) === date
  ) ?? null;
}
function sourceChangeType(record) {
  return record.quality?.status === "superseded"
    ? "supersession"
    : record.evidence_type === "nutrition" &&
        Number(record.nutritionRevision?.revision) > 1
      ? "canonical_revision"
    : record.payload?.correctsEvidenceId || record.payload?.supersedesEvidenceId
      ? "correction"
      : "canonical_commit";
}
function sourceSemanticFingerprint(record) {
  return record.evidence_type === "nutrition" &&
    record.nutritionRevision?.semanticFingerprint
    ? record.nutritionRevision.semanticFingerprint
    : createPISemanticFingerprint(semanticRecord(record));
}
function semanticRecord(record) {
  const {
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...semantic
  } = record;
  return semantic;
}
function boundedRmrAffectedDates(records, measuredDate) {
  return [...new Set(records.filter((item) =>
    isEnergySource(item) &&
    item.quality?.status !== "superseded" &&
    sourceDate(item) >= measuredDate
  ).map(sourceDate))].sort().slice(-7);
}
function stampPendingSourceCommits(store, commitId) {
  for (const collection of [
    "piEnergyConfidenceWorkItems",
    "piTrainingConfidenceWorkItems",
  ]) {
    for (const work of store[collection] ?? []) {
      work.sourceCommitLinks = (work.sourceCommitLinks ?? []).map((link) =>
        link.commitId === "pending_source_commit"
          ? { ...link, commitId }
          : link
      );
    }
  }
}
function sourceResult(outcome, reconciliation, enqueueResults, values = {}) {
  return {
    outcome,
    committed: false,
    reconciliationScope: reconciliation?.scope ?? null,
    changedObjects: reconciliation?.changedObjects ?? [],
    report: reconciliation?.report ?? {},
    lowerLevelWork: enqueueResults,
    ...values,
  };
}
