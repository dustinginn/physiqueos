import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getSupportingGoalDossier } from "../../screens/SupportingGoalScreen";
import { getVisibleAbsDossier } from "../../screens/VisibleAbsGoalScreen";
import { composeNarrativeGoalPreview } from "./NarrativeGoalPreviewService";
import {
  composeSupportingNarrativeGoalPreview,
  resolveSupportingGoalStartDate,
} from "./SupportingNarrativeGoalPreviewService";
import { loadProductionBoundedFounderReadContext } from "../../application/composition/productionApplicationComposition";

export async function getNarrativeGoalPresentation(goalKey) {
  if (goalKey === "visibleAbs") {
    return FounderRepositories.runInReadScope(
      () => getScopedNarrativeGoalPresentation(goalKey, FounderRepositories),
      { readModel: `goal.narrative.${goalKey}` },
    );
  }
  const { repositories } = await loadProductionBoundedFounderReadContext({
    collections: [
      "user", "goals", "dexaScans", "weightEntries", "progressPhotos",
      "protocols", "nutritionContext", "canonicalEvidenceObjects",
      "operatingPlan",
    ],
  });
  return getScopedNarrativeGoalPresentation(goalKey, repositories);
}

async function getScopedNarrativeGoalPresentation(goalKey, repositories) {
  if (goalKey === "visibleAbs") {
    return composeNarrativeGoalPreview({
      goalId: "goal_visible_abs_at_rest",
      dossier: await getVisibleAbsDossier(),
    });
  }

  const dossier = await getSupportingGoalDossier(goalKey, repositories);
  const user = await repositories.users.getCurrentUser();
  const goals = await repositories.goals.listGoals(user?.id);
  const operatingPlan = await repositories.operatingPlan?.getOperatingPlan?.(user?.id) ?? null;
  const goalStartDate = resolveSupportingGoalStartDate(goals, goalKey, {
    operatingPlan,
    ownerUserId: user?.id ?? null,
  });

  return composeSupportingNarrativeGoalPreview({
    goalKey,
    dossier: {
      ...dossier,
      data: {
        ...dossier.data,
        sourceFacts: {
          ...dossier.data.sourceFacts,
          goalStartDate,
        },
      },
    },
  });
}
