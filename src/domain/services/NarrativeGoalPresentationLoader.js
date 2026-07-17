import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getSupportingGoalDossier } from "../../screens/SupportingGoalScreen";
import { getVisibleAbsDossier } from "../../screens/VisibleAbsGoalScreen";
import { composeNarrativeGoalPreview } from "./NarrativeGoalPreviewService";
import {
  composeSupportingNarrativeGoalPreview,
  resolveSupportingGoalStartDate,
} from "./SupportingNarrativeGoalPreviewService";

export async function getNarrativeGoalPresentation(goalKey) {
  if (goalKey === "visibleAbs") {
    return composeNarrativeGoalPreview({
      goalId: "goal_visible_abs_at_rest",
      dossier: await getVisibleAbsDossier(),
    });
  }

  const dossier = await getSupportingGoalDossier(goalKey);
  const user = await FounderRepositories.users.getCurrentUser();
  const goals = await FounderRepositories.goals.listGoals(user?.id);
  const goalStartDate = resolveSupportingGoalStartDate(goals, goalKey);

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
