import { resolveBriefingReviewArtifact } from "../../domain/services/BriefingReviewArtifactResolver.js";

export function createBriefingNavigationReadService({ store } = {}) {
  if (!store?.getArtifact || !store?.listHistory) throw new Error("Briefing navigation requires a read store.");
  return Object.freeze({
    listHistory() {
      return store.listHistory();
    },
    async getArtifact({ artifactId, version = null } = {}) {
      const context = await store.getArtifact({ artifactId });
      const artifact = resolveBriefingReviewArtifact(context.artifact ? [context.artifact] : [], { artifactId, version });
      return Object.freeze({ ...context, artifact });
    },
    getDexaArtifact({ scanId } = {}) {
      return store.getDexaArtifact({ scanId });
    },
  });
}
