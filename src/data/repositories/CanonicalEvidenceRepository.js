import { reconcileEvidencePackageIntoCanonicalHistory } from "../../domain/services/CanonicalEvidenceService";

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

    // Explicit command retained for import/recovery workflows. Never call from a GET route.
    async reconcileFromEvidencePackages(userId) {
      return reconcileFromEvidencePackages(userId);
    },

    async upsertCanonicalEvidenceObjects(evidenceObjects = []) {
      evidenceObjects.forEach((evidenceObject) => {
        const existingIndex = canonicalEvidenceObjects.findIndex(
          (item) => item.canonicalId === evidenceObject.canonicalId
        );

        if (existingIndex >= 0) {
          canonicalEvidenceObjects[existingIndex] = evidenceObject;
        } else {
          canonicalEvidenceObjects.push(evidenceObject);
        }
      });

      options.onChange?.();

      return evidenceObjects;
    },
  };
}
