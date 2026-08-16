import { adaptWeeklyArtifactForPresentation } from "./WeeklyBriefingPresentationService";

export async function prepareWeeklyBriefingReviewPresentation({
  artifact,
  repositories,
  userId,
  timeZone,
  phaseBoundary = null,
}) {
  const presented = await adaptWeeklyArtifactForPresentation({
    artifact,
    repositories,
    userId,
    timeZone,
    phaseBoundary,
  });
  return presented.briefing.weeklyNarrative;
}
