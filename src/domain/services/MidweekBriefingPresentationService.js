import { createMidweekConfidencePresentation } from "./BriefingGoalConfidencePresentationService";
import { createMidweekEditorialNarrative } from "./MidweekBriefingEditorialService";

export function prepareMidweekBriefingReviewPresentation({ artifact } = {}) {
  if (!artifact?.briefing) return null;
  const briefing = artifact.briefing;
  const editorial = createMidweekEditorialNarrative({
    energyBalance: briefing.energyBalance,
    training: briefing.training,
  });
  return {
    ...briefing,
    hero: { ...briefing.hero, ...editorial.hero },
    training: {
      ...briefing.training,
      interpretation: editorial.trainingInterpretation,
      watch: editorial.trainingWatch,
    },
    coachTake: editorial.coachTake,
    goalConfidence: createMidweekConfidencePresentation(
      briefing.goalConfidence,
      { briefing }
    ),
  };
}
