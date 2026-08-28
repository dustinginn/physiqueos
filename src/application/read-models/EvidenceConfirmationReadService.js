import { resolveEventBriefingPreferencesFromStore } from "../../domain/services/CoachingUpdatesReadService";
import { runRepositoryReadScope } from "./RepositoryReadScope";

export function createEvidenceConfirmationReadService({ repositories } = {}) {
  if (!repositories) throw new Error("Evidence confirmation reads require repositories.");
  return Object.freeze({
    async readGoalEvaluationInputs(userId) {
      return runRepositoryReadScope({
        repositories,
        readModel: "action.evidence-review-goal-evaluation",
        callback: async () => {
          const [goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext] = await Promise.all([
            repositories.goals.listGoals(userId),
            repositories.dexaScans.listDEXAScans(userId),
            repositories.weights.listWeightEntries(userId),
            repositories.progressPhotos.listPhotos(userId),
            repositories.protocols.listProtocols(userId),
            repositories.nutritionContext.getNutritionContext?.(userId),
          ]);
          return { goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext };
        },
      });
    },
    async readEventBriefingPreferences(userId) {
      return runRepositoryReadScope({
        repositories,
        readModel: "action.evidence-review-event-briefing-preferences",
        callback: async () => {
          const protocols = await repositories.protocols.listProtocols(userId);
          const active = protocols.find((item) =>
            item.status === "active" && (item.protocolType ?? item.category) === "briefings"
          );
          const currentVersion = active?.currentVersionId
            ? await repositories.protocolVersions.getVersionById(active.currentVersionId)
            : null;
          return resolveEventBriefingPreferencesFromStore({
            protocols,
            protocolVersions: currentVersion ? [currentVersion] : [],
          });
        },
      });
    },
  });
}
