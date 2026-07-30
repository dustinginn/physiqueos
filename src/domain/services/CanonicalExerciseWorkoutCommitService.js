import { reconcileConfirmedEvidencePackage } from "./CanonicalEvidenceService";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  canonicalDefinitionsPendingCreation,
  findCanonicalExerciseConflict,
} from "./CanonicalExerciseLibraryService";
import { registerRuntimeTrainingExercises } from "../models/trainingExerciseIdentity";

export function createCanonicalExerciseWorkoutCommitService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Canonical exercise commit requires a bound Founder store.");
  }
  return {
    async commit(evidencePackage, userId) {
      const definitions = canonicalDefinitionsPendingCreation(evidencePackage);
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        stageFrom: liveStore,
        now,
      }).begin();
      let reconciliation;
      await transaction.mutate((candidate) => {
        candidate.canonicalExerciseLibrary ??= [];
        for (const definition of definitions) {
          const conflict = findCanonicalExerciseConflict(
            definition,
            candidate.canonicalExerciseLibrary
          );
          const alreadyPersisted = candidate.canonicalExerciseLibrary.some(
            (item) => item.id === definition.id &&
              JSON.stringify(comparableDefinition(item)) ===
                JSON.stringify(comparableDefinition(definition))
          );
          if (conflict && !alreadyPersisted) {
            const error = new Error(
              `"${definition.name}" matches the existing exercise "${conflict.name}". Map to that exercise or edit the name.`
            );
            error.code = "CANONICAL_EXERCISE_DUPLICATE";
            throw error;
          }
          if (!candidate.canonicalExerciseLibrary.some((item) => item.id === definition.id)) {
            candidate.canonicalExerciseLibrary.push({
              ...definition,
              created_at: definition.created_at ?? now().toISOString(),
              created_by: userId,
            });
          }
        }
        reconciliation = reconcileConfirmedEvidencePackage({
          evidencePackage,
          existingCanonicalObjects: candidate.canonicalEvidenceObjects ?? [],
          userId,
        });
        candidate.canonicalEvidenceObjects = applyChanges(
          candidate.canonicalEvidenceObjects ?? [],
          reconciliation.changedObjects
        );
      });
      const committed = await transaction.commit({
        validateFinalized(candidate) {
          return definitions.every((definition) =>
            candidate.canonicalExerciseLibrary?.some((item) => item.id === definition.id)
          ) && reconciliation.changedObjects.every((record) =>
            candidate.canonicalEvidenceObjects?.some(
              (item) => item.canonicalId === record.canonicalId
            )
          );
        },
      });
      registerRuntimeTrainingExercises(liveStore.canonicalExerciseLibrary ?? []);
      return {
        committed: true,
        commitId: committed.commitId,
        revision: committed.revision,
        scope: reconciliation.scope,
        report: {
          ...reconciliation.report,
          newCanonicalExercises: definitions.map((item) => ({
            id: item.id,
            name: item.name,
          })),
        },
      };
    },
  };
}

function applyChanges(existing, changed) {
  const byId = new Map(existing.map((item) => [item.canonicalId, item]));
  changed.forEach((item) => byId.set(item.canonicalId, item));
  return [...byId.values()];
}
function comparableDefinition(item) {
  return {
    id: item.id,
    name: item.name,
    aliases: item.aliases ?? [],
    equipment: item.equipment,
    body_region: item.body_region,
    primary_muscle_groups: item.primary_muscle_groups ?? [],
    movement_pattern: item.movement_pattern,
    laterality: item.laterality,
  };
}
