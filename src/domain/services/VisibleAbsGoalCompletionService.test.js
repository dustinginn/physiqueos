import { describe, expect, it, vi } from "vitest";
import { createGoalRepository } from "../../data/repositories/GoalRepository";
import { createVisibleAbsGoalCompletionService } from "./VisibleAbsGoalCompletionService";

const userId = "user";
const goalFixture = {
  id: "goal_visible_abs_at_rest",
  userId,
  title: "Visible abs at rest",
  type: "body_composition",
  primary: true,
  status: "active",
  startDate: "2026-05-24",
  metricKey: "visualDefinition",
  source: { type: "manual" },
};
const photoSessionId = "photo_session_final";
const photoEventBriefingId = `event_briefing_progress_photo_${photoSessionId}`;
const dexaId = "dexa_jul_18";
const dexaEventId = `dexa_event_${dexaId}`;

function setup(status = "confirmed") {
  const goals = [{ ...goalFixture }];
  const repository = createGoalRepository(goals);
  const updateGoal = vi.spyOn(repository, "updateGoal");
  const briefings = [
    { id: dexaEventId, trigger: { evidenceType: "dexa", evidenceId: dexaId } },
    {
      id: photoEventBriefingId,
      trigger: { evidenceType: "photo_session", evidenceId: photoSessionId },
      briefing: {
        photoEventNarrative: {
          goalCompletionHandoff: {
            confirmationPurpose: "visible_abs_completion",
            numericalThresholdComplete: true,
            visualCriterionStatus: status,
            goalCompletionRecommended: status === "confirmed",
          },
          completionExperience: {
            journeyComparison: { first: { id: "canonical_photo_first" } },
          },
        },
      },
    },
  ];
  const repositories = {
    goals: repository,
    dailyBriefings: { listDailyBriefings: async () => briefings },
    dexaScans: { listDEXAScans: async () => [{ id: dexaId, measuredAt: "2026-07-18" }] },
  };
  return { goals, repositories, updateGoal };
}

describe("VisibleAbsGoalCompletionService", () => {
  it("requires the explicit completion operation and a confirmed visual result", async () => {
    const { goals, repositories } = setup("uncertain");
    const service = createVisibleAbsGoalCompletionService({ repositories });
    expect(goals[0].status).toBe("active");
    await expect(service.complete({ userId, photoSessionId, photoEventBriefingId })).rejects.toThrow(/confirmed visual result/i);
    expect(goals[0].status).toBe("active");
    expect(goals[0].completion).toBeUndefined();
  });

  it("records a bounded, auditable completion and stable milestone IDs", async () => {
    const { goals, repositories } = setup();
    const beforeDefinition = { title: goals[0].title, type: goals[0].type, startDate: goals[0].startDate, metricKey: goals[0].metricKey, source: goals[0].source };
    const service = createVisibleAbsGoalCompletionService({ repositories, now: () => new Date("2026-07-20T18:00:00Z") });
    const completed = await service.complete({ userId, photoSessionId, photoEventBriefingId });
    expect(completed).toMatchObject({
      status: "completed",
      completedAt: "2026-07-20T18:00:00.000Z",
      transitionReady: true,
      completion: {
        userConfirmed: true,
        confirmedAt: "2026-07-20T18:00:00.000Z",
        evidence: {
          finalPhotoSessionId: photoSessionId,
          finalPhotoEventBriefingId: photoEventBriefingId,
          numericalDexaId: dexaId,
          numericalDexaEventBriefingId: dexaEventId,
          journeyStartPhotoId: "canonical_photo_first",
        },
      },
    });
    expect({ title: completed.title, type: completed.type, startDate: completed.startDate, metricKey: completed.metricKey, source: completed.source }).toEqual(beforeDefinition);
    expect(completed.milestoneRelationships.map((item) => item.role)).toEqual(["numerical_completion", "milestone_briefing", "visual_completion", "completion_briefing", "journey_start_photo", "completion_confirmation"]);
    expect(JSON.stringify(completed.milestoneRelationships)).not.toMatch(/briefing\s*":\s*\{|payload|artifact\s*":\s*\{/i);
  });

  it("is idempotent and creates or archives no goals", async () => {
    const { goals, repositories, updateGoal } = setup();
    const service = createVisibleAbsGoalCompletionService({ repositories, now: () => new Date("2026-07-20T18:00:00Z") });
    const first = await service.complete({ userId, photoSessionId, photoEventBriefingId });
    const second = await service.complete({ userId, photoSessionId, photoEventBriefingId });
    expect(second).toBe(first);
    expect(updateGoal).toHaveBeenCalledTimes(1);
    expect(goals).toHaveLength(1);
    expect(goals[0].status).toBe("completed");
  });
});
