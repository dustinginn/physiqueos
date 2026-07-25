import { describe, expect, it } from "vitest";
import { founderGoals } from "../../data/founderSeed/goals";
import { GoalEvaluationService } from "./GoalEvaluationService";
import { GoalIntelligenceService } from "./GoalIntelligenceService";
import { mapHomeHero } from "./HomeBriefingService";

const scans = [
  scan("2026-05-24", 180.9, 13.6, 24.7, 149.1, 7.1),
  scan("2026-06-20", 171.7, 10.7, 18.4, 146.2, 7.1),
  scan("2026-07-18", 167.4, 7.7, 12.8, 147.5, 7.1),
];

describe("goal terminal states after the Jul 18 DEXA", () => {
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals: founderGoals,
    dexaScans: scans,
    weightEntries: [],
    progressPhotos: [],
    protocols: [],
    now: new Date("2026-07-18T12:00:00-07:00"),
  });

  it("awaits visual confirmation without a stale percentage or time projection", () => {
    const evaluation = evaluations.find((item) => item.goalId === "goal_visible_abs_at_rest");
    expect(evaluation).toMatchObject({
      lifecycleState: "awaiting_confirmation",
      thresholdStatus: "complete",
      confirmationType: "relaxed_progress_photos",
      confirmationStatus: "pending",
      progress: null,
      projection: null,
      actionHref: "/goals/visible-abs",
    });
    expect(evaluation.goalProgress).toBeNull();
    const hero = mapHomeHero({ activeGoal: founderGoals[0], evaluation });
    expect(hero).toMatchObject({ mode: "terminal", actionHref: "/goals/visible-abs" });
    expect(hero).not.toHaveProperty("daysRemaining");
    expect(hero).not.toHaveProperty("projectedFinish");
  });

  it("marks maintenance transition-ready and explicitly below range", () => {
    const evaluation = evaluations.find((item) => item.goalId === "goal_maintain_8_9_body_fat");
    expect(evaluation).toMatchObject({
      current: "7.7%",
      target: "8-9%",
      lifecycleState: "transition_ready",
      transitionReady: true,
      presentation: { status: "Ready for next phase", detail: "Currently below target range" },
    });
  });

  it("marks lean-mass preservation achieved against May 24", () => {
    const evaluation = evaluations.find((item) => item.goalId === "goal_preserve_lean_mass");
    expect(evaluation).toMatchObject({
      lifecycleState: "achieved",
      transitionReady: true,
      current: "147.5 lb",
      presentation: { status: "Achieved", detail: "147.5 lb latest · −1.6 lb" },
      achievementEvidence: {
        baselineDate: "2026-05-24",
        baselineLeanMass: 149.1,
        currentDate: "2026-07-18",
        currentLeanMass: 147.5,
        delta: -1.6,
        preservationToleranceRatio: 0.95,
      },
    });
  });

  it("shares terminal presentation through Goal Intelligence", () => {
    const intelligence = GoalIntelligenceService.getGoalIntelligence({
      activeGoal: founderGoals[0],
      evaluations,
    });
    expect(intelligence.goals.find((item) => item.id === "goal_visible_abs_at_rest").presentation)
      .toMatchObject({ mode: "terminal_goal", status: "Awaiting visual confirmation" });
    expect(intelligence.goals.find((item) => item.id === "goal_maintain_8_9_body_fat").presentation)
      .toMatchObject({ mode: "terminal_goal", status: "Ready for next phase", detail: "Currently below target range" });
    expect(intelligence.goals.find((item) => item.id === "goal_preserve_lean_mass"))
      .toMatchObject({ current: "149.1 lb baseline", target: "Preserve", presentation: { mode: "terminal_goal", status: "Achieved", detail: "147.5 lb latest · −1.6 lb" } });
  });

  it("shows the bounded post-completion Home state only after explicit confirmation", () => {
    const completedGoal = {
      ...founderGoals[0],
      status: "completed",
      completion: {
        userConfirmed: true,
        completedAt: "2026-07-20T18:00:00Z",
        evidence: { finalPhotoSessionId: "photo_session_final" },
      },
    };
    const completedEvaluation = GoalEvaluationService.getGoalEvaluations({
      goals: [completedGoal, ...founderGoals.slice(1)],
      dexaScans: scans,
      weightEntries: [],
      progressPhotos: [],
      protocols: [],
      now: new Date("2026-07-20T12:00:00-07:00"),
    }).find((item) => item.goalId === completedGoal.id);
    expect(completedEvaluation).toMatchObject({
      lifecycleState: "achieved",
      confirmationStatus: "confirmed",
      transitionReady: true,
      actionLabel: "View completion",
      actionHref: "/briefings/photo/photo_session_final",
    });
    const hero = mapHomeHero({ activeGoal: completedGoal, evaluation: completedEvaluation });
    expect(hero).toMatchObject({
      headline: "Goal achieved.",
      actionLabel: "View completion",
      actionHref: "/briefings/photo/photo_session_final",
    });
    expect(hero.supportLine).toMatch(/complete.*7\.7%.*preserving lean mass/i);
    expect(hero).not.toHaveProperty("daysRemaining");
    expect(hero).not.toHaveProperty("projectedFinish");
  });
});

function scan(measuredAt, total, bodyFat, fat, lean, bone) {
  return {
    id: `dexa_${measuredAt}`,
    measuredAt,
    totalMass: { value: total, unit: "lb" },
    bodyFatPercentage: bodyFat,
    fatMass: { value: fat, unit: "lb" },
    leanMass: { value: lean, unit: "lb" },
    boneMineralContent: { value: bone, unit: "lb" },
  };
}
