const GOAL_ID = "goal_visible_abs_at_rest";
const DEXA_DATE = "2026-07-18";

export function createVisibleAbsGoalCompletionService({
  repositories,
  now = () => new Date(),
} = {}) {
  return {
    async complete({ userId, photoSessionId, photoEventBriefingId }) {
      const [goal, briefings, scans] = await Promise.all([
        repositories.goals.getGoalById(GOAL_ID),
        repositories.dailyBriefings.listDailyBriefings(userId),
        repositories.dexaScans.listDEXAScans(userId),
      ]);
      if (!goal || goal.userId !== userId || goal.primary !== true) {
        throw new Error("The active Visible Abs goal was not found.");
      }
      if (goal.completion?.recordId) return goal;
      if (goal.status !== "active") throw new Error("Visible Abs is not awaiting completion.");

      const event = briefings.find((item) =>
        item.id === photoEventBriefingId &&
        item.trigger?.evidenceType === "photo_session" &&
        item.trigger?.evidenceId === photoSessionId
      );
      const result = event?.briefing?.photoEventNarrative?.goalCompletionHandoff;
      if (result?.confirmationPurpose !== "visible_abs_completion") {
        throw new Error("This Photo Event is not a Visible Abs completion event.");
      }
      if (result.numericalThresholdComplete !== true) {
        throw new Error("The numerical completion threshold is not verified.");
      }
      if (result.visualCriterionStatus !== "confirmed" || result.goalCompletionRecommended !== true) {
        throw new Error("A confirmed visual result is required before completing the goal.");
      }

      const dexa = scans.find((item) => String(item.measuredAt).slice(0, 10) === DEXA_DATE);
      if (!dexa) throw new Error("The Jul 18 numerical completion DEXA was not found.");
      const dexaEvent = briefings.find((item) =>
        item.trigger?.evidenceType === "dexa" && item.trigger?.evidenceId === dexa.id
      );
      if (!dexaEvent) throw new Error("The Jul 18 DEXA Event Briefing was not found.");

      const confirmedAt = now().toISOString();
      const journeyStartPhotoId = event.briefing.photoEventNarrative.completionExperience?.journeyComparison?.first?.id ?? null;
      const completion = {
        recordId: `goal_completion_${GOAL_ID}`,
        goalId: GOAL_ID,
        status: "confirmed",
        userConfirmed: true,
        confirmedAt,
        completedAt: confirmedAt,
        evidence: {
          finalPhotoSessionId: photoSessionId,
          finalPhotoEventBriefingId: event.id,
          numericalDexaId: dexa.id,
          numericalDexaEventBriefingId: dexaEvent.id,
          journeyStartPhotoId,
        },
      };
      const milestoneRelationships = [
        relationship("numerical_completion", dexa.id, "dexa"),
        relationship("milestone_briefing", dexaEvent.id, "event_briefing"),
        relationship("visual_completion", photoSessionId, "photo_session"),
        relationship("completion_briefing", event.id, "event_briefing"),
        journeyStartPhotoId && relationship("journey_start_photo", journeyStartPhotoId, "progress_photo"),
        relationship("completion_confirmation", completion.recordId, "goal_completion"),
      ].filter(Boolean);

      return repositories.goals.updateGoal(GOAL_ID, {
        status: "completed",
        completedAt: confirmedAt,
        transitionReady: true,
        completion,
        milestoneRelationships,
      });
    },
  };
}

function relationship(role, targetId, targetType) {
  return { role, targetId, targetType };
}
