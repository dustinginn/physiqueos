import { createProviderProgressHubReport } from "../../domain/services/ProgressReportingService.js";

export function createProgressHubReadService({ store } = {}) {
  if (!store?.run) throw new Error("Progress hub requires a read store.");

  return Object.freeze({
    getProgressHub() {
      return store.run("progress.hub", async () => {
        const [
          userId,
          weights,
          dexaScans,
          photoInputs,
          protocols,
          nutritionContext,
          canonicalEvidenceObjects,
        ] = await Promise.all([
          store.getOwnerUserId(),
          store.listWeightEntries(),
          store.listDEXAScans(),
          store.getProgressHubPhotoInputs(),
          store.listProtocols(),
          store.getNutritionContext(),
          store.listProgressHubCanonicalEvidenceObjects(),
        ]);
        const hasPhotoEvidence = photoInputs.progressPhotos.length > 0 ||
          photoInputs.canonicalPhotoSessionObjects.length > 0;
        const evidencePackages = hasPhotoEvidence
          ? []
          : await store.listEvidencePackages();

        return createProviderProgressHubReport({
          canonicalPhotoSessionObjects: photoInputs.canonicalPhotoSessionObjects,
          canonicalEvidenceObjects,
          dexaScans,
          evidencePackages,
          nutritionContext,
          progressPhotos: photoInputs.progressPhotos,
          protocols,
          userId,
          weights,
        });
      });
    },
  });
}
