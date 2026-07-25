import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Goal Edit wizard production foundation", () => {
  it("provides a dedicated active-goal route with an unavailable-state boundary", () => {
    const page = read("src/app/goals/[goalId]/edit/page.js");
    expect(page).toContain("getGoalById(goalId)");
    expect(page).toContain("goal.status !== \"active\"");
    expect(page).toContain("goal.primary !== true");
    expect(page).toContain("notFound()");
  });

  it("adds Edit Goal only to the independent active Build Lean Mass detail", () => {
    expect(read("src/app/goals/build-lean-mass/page.js")).toContain("PhaseAwareActiveGoalPreviewScreen");
    expect(read("src/screens/PhaseAwareActiveGoalPreviewScreen.jsx")).toContain("preview.hero.editHref");
    expect(read("src/app/goals/maintenance/page.js")).not.toContain("editHref");
    expect(read("src/app/goals/lean-mass/page.js")).not.toContain("editHref");
  });

  it("keeps Home unchanged and enables capability-gated phases", () => {
    expect(read("src/screens/HomeScreen.jsx")).not.toMatch(/GoalEdit|Edit Goal|goalId.*edit/);
    const wizard = read("src/screens/GoalEditWizardScreen.jsx");
    expect(wizard).toContain('["phases","Phases"]');
    expect(wizard).toContain("Phases unavailable");
    expect(wizard).toContain("requestPhaseRecommendation");
  });

  it("presents phases before a conversational overall destination", () => {
    const draft = read("src/domain/services/GoalEditDraftService.js");
    const wizard = read("src/screens/GoalEditWizardScreen.jsx");
    expect(draft).toContain("GoalEditSection.GOAL_AND_PURPOSE, GoalEditSection.PHASES, GoalEditSection.OVERALL_GOAL");
    expect(wizard).toContain('["overall_goal","Overall goal"]');
    expect(wizard).toContain('overall_goal:"Overall goal"');
    expect(wizard).toContain("Where would you like this journey to end?");
    expect(wizard).toContain("Goal outcome");
    expect(wizard).toContain("Journey begins");
    expect(wizard).toContain("Target date");
    expect(wizard).not.toContain("What kind of outcome are you setting?");
    expect(wizard).not.toContain("How should the overall timeline be framed?");
  });

  it("re-reads the live goal before review and delegates writes to the strict service", () => {
    const action = read("src/app/goals/[goalId]/edit/actions.js");
    expect(action).toContain("getGoalById(draft.sourceGoalId)");
    expect(action).toContain("ProductionGoalPlanUpdateService.createFinalReview");
    expect(action).toContain("ProductionGoalPlanUpdateService.commit");
    expect(action).not.toMatch(/\.saveGoal\(|\.updateGoal\(|persistFounderRuntimeStore\(/);
  });

  it("does not touch protocol, briefing, scheduler, activation, completion, or evidence services", () => {
    const action = read("src/app/goals/[goalId]/edit/actions.js");
    expect(action).not.toMatch(/FounderRepositories\.(protocol|briefing|scheduler|activation|completion|evidence)/i);
  });
});
