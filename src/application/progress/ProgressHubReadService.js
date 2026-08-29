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
          progressPhotos,
          protocols,
          nutritionContext,
          canonicalEvidenceObjects,
          analyses,
        ] = await Promise.all([
          store.getOwnerUserId(),
          store.listWeightEntries(),
          store.listDEXAScans(),
          store.listProgressPhotos(),
          store.listProtocols(),
          store.getNutritionContext(),
          store.listProgressHubCanonicalEvidenceObjects(),
          store.listAnalyses(),
        ]);
        const hasPhotoEvidence = progressPhotos.length > 0 ||
          canonicalEvidenceObjects.some((record) =>
            ["photo_session", "progress_photo"].includes(
              (record.payload ?? record).evidence_type
            )
          );
        const evidencePackages = hasPhotoEvidence
          ? []
          : await store.listEvidencePackages();

        return createProviderProgressHubReport({
          analyses,
          canonicalEvidenceObjects,
          dexaScans,
          evidencePackages,
          nutritionContext,
          progressPhotos,
          protocols,
          userId,
          weights,
        });
      });
    },
  });
}
