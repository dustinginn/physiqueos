import {
  reconcileConfirmedEvidencePackage,
  reconcileEvidencePackageIntoCanonicalHistory,
} from "../../domain/services/CanonicalEvidenceService";

export function createCanonicalEvidenceRepository(canonicalEvidenceObjects = [], options = {}) {
  async function reconcileFromEvidencePackages(userId) {
    const evidencePackages = options.evidencePackages ?? [];
    const packagesForUser = evidencePackages.filter(
      (evidencePackage) => !userId || !evidencePackage.userId || evidencePackage.userId === userId
    );

    if (packagesForUser.length === 0) return [];

    const reconciledObjects = packagesForUser.reduce(
      (objects, evidencePackage) =>
        reconcileEvidencePackageIntoCanonicalHistory({
          evidencePackage,
          existingCanonicalObjects: objects,
          userId: userId ?? evidencePackage.userId,
        }),
      canonicalEvidenceObjects
    );

    canonicalEvidenceObjects.splice(
      0,
      canonicalEvidenceObjects.length,
      ...reconciledObjects
    );
    options.onChange?.();

    return canonicalEvidenceObjects.filter(
      (evidenceObject) => !userId || evidenceObject.userId === userId
    );
  }

  return {
    async listCanonicalEvidenceObjects(userId) {
      return canonicalEvidenceObjects.filter(
        (evidenceObject) => !userId || evidenceObject.userId === userId
      );
    },

    // Compatibility alias for explicit recovery workflows. Never call from a GET route or routine confirmation.
    async reconcileFromEvidencePackages(userId) {
      return reconcileFromEvidencePackages(userId);
    },

    async reconcileCanonicalHistory(userId) {
      const beforeById = new Map(
        canonicalEvidenceObjects.map((object) => [object.canonicalId, JSON.stringify(object)])
      );
      const objects = await reconcileFromEvidencePackages(userId);
      const afterIds = new Set(objects.map((object) => object.canonicalId));

      return {
        objects,
        report: {
          addedCanonicalIds: objects
            .filter((object) => !beforeById.has(object.canonicalId))
            .map((object) => object.canonicalId),
          changedCanonicalIds: objects
            .filter((object) => beforeById.get(object.canonicalId) !== JSON.stringify(object))
            .map((object) => object.canonicalId),
          removedCanonicalIds: [...beforeById.keys()].filter((id) => !afterIds.has(id)),
          mutationReason: "explicit_canonical_history_maintenance",
        },
      };
    },

    async reconcileConfirmedEvidencePackage(evidencePackage, userId) {
      const result = reconcileConfirmedEvidencePackage({
        evidencePackage,
        existingCanonicalObjects: canonicalEvidenceObjects,
        userId,
      });

      if (result.changedObjects.length > 0) {
        await upsertCanonicalEvidenceObjects(result.changedObjects);
      }

      return result;
    },

    async upsertCanonicalEvidenceObjects(evidenceObjects = []) {
      return upsertCanonicalEvidenceObjects(evidenceObjects);
    },
  };

  async function upsertCanonicalEvidenceObjects(evidenceObjects = []) {
      let changed = false;
      evidenceObjects.forEach((evidenceObject) => {
        const existingIndex = canonicalEvidenceObjects.findIndex(
          (item) => item.canonicalId === evidenceObject.canonicalId
        );

        if (existingIndex >= 0) {
          if (JSON.stringify(canonicalEvidenceObjects[existingIndex]) !== JSON.stringify(evidenceObject)) {
            canonicalEvidenceObjects[existingIndex] = evidenceObject;
            changed = true;
          }
        } else {
          canonicalEvidenceObjects.push(evidenceObject);
          changed = true;
        }
      });

      if (changed) options.onChange?.();

      return evidenceObjects;
  }
}
