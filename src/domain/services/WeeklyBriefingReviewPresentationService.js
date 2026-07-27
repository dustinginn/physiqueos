import { adaptWeeklyArtifactForPresentation } from "./WeeklyBriefingPresentationService";

export async function prepareWeeklyBriefingReviewPresentation({
  artifact,
  repositories,
  userId,
  timeZone,
}) {
  const presented = await adaptWeeklyArtifactForPresentation({
    artifact,
    repositories,
    userId,
    timeZone,
  });
  return presented.briefing.weeklyNarrative;
}
