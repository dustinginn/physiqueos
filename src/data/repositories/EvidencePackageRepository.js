import { latestByDate } from "./repositoryUtils";

export function createEvidencePackageRepository(evidencePackages = [], options = {}) {
  return {
    async listEvidencePackages(userId) {
      return evidencePackages.filter(
        (evidencePackage) => !userId || evidencePackage.userId === userId
      );
    },

    async getLatestEvidencePackage(userId) {
      return latestByDate(
        evidencePackages.filter(
          (evidencePackage) => !userId || evidencePackage.userId === userId
        ),
        "captured_at"
      );
    },

    async saveEvidencePackage(evidencePackage) {
      const existingIndex = evidencePackages.findIndex(
        (item) => item.package_id === evidencePackage.package_id
      );

      if (existingIndex >= 0) {
        evidencePackages[existingIndex] = evidencePackage;
      } else {
        evidencePackages.push(evidencePackage);
      }

      options.onChange?.();

      return evidencePackage;
    },
  };
}
