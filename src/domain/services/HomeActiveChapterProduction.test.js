import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HomeBriefingService } from "./HomeBriefingService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("production-shaped Home active chapter read", () => {
  it("projects committed Build Lean Mass state without writing founder data", async () => {
    const before = fs.readFileSync(storePath, "utf8");
    const store = JSON.parse(before);
    const model = await HomeBriefingService.getHomeBriefing();
    const after = fs.readFileSync(storePath, "utf8");

    expect(after).toBe(before);
    expect(model.hero).toMatchObject({
      goalLabel: "Build Lean Mass",
      goalIcon: "dumbbell",
      headline: "Establish Maintenance",
      confidenceState: "Moderate",
      mode: "phase_trajectory",
      plannedReviewDate: "2026-08-17",
    });
    expect(model.goals).toHaveLength(1);
    expect(model.goals[0]).toMatchObject({
      title: "Build Lean Mass",
      primary: true,
      icon: "dumbbell",
      href: "/goals/build-lean-mass",
      presentation: { mode: "phase_trajectory_goal" },
    });
    expect(model.goals[0].presentation.trajectory.phases[1].progress).toMatchObject({ progressType: "outcome", baselineValue: 147.5, baselineDate: "2026-07-18", latestValue: null, targetAmount: 10, status: "awaiting_follow_up", clampedProgressPercentage: 0, evidenceSource: "DEXA" });
    expect(model.latestAnalysis.sectionLabel).toMatch(/Midweek Briefing|Weekly Briefing|Previous Chapter Briefing/);
    expect(model.nextBestAction.title).not.toMatch(/Foam Roll/);
    expect(JSON.stringify(model)).not.toMatch(/Projected Finish: Unavailable|Days Remaining: Unavailable|Pending → Pending|0% complete/i);

    expect(JSON.parse(after).revision).toBe(store.revision);
    expect(JSON.parse(after).lastCommitId).toBe(store.lastCommitId);
    expect(store.goals.filter((goal) => goal.primary && goal.status === "active").map((goal) => goal.title)).toEqual(["Build Lean Mass"]);
    expect(store.goals.find((goal) => goal.id === "goal_visible_abs_at_rest")).toMatchObject({ status: "completed", primary: false });
  });
});
