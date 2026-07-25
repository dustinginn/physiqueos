import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseGoalConfidenceArchitecture } from "./GoalConfidenceArchitectureDiagnosticService";
import { HomeBriefingService } from "./HomeBriefingService";
import { getGoalsHub } from "../../screens/GoalsHubScreen";
import { getPhaseAwareActiveGoalPreview } from "./PhaseAwareActiveGoalPreviewService";

const file = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

describe("goal confidence architecture diagnostic", () => {
  it("identifies the canonical owner and history limitations without writing", () => {
    const before = fs.readFileSync(file, "utf8");
    const result = diagnoseGoalConfidenceArchitecture(JSON.parse(before));
    expect(result.canonical.source.version).toBe("overall_goal_confidence_v1");
    expect(result.storage).toMatchObject({ persisted: false, snapshotCount: 0, causalDriverRecordCount: 0 });
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("reports actual fixture behavior and classifies current dimensions", () => {
    const result = diagnoseGoalConfidenceArchitecture(read());
    expect(result.fixtureMovement).toMatchObject({
      newlyActivatedInsufficientHistory: 24,
      oneStrongExecutionWeek: 44,
      incompleteDataWeek: 24,
      weightIncreaseWithoutPerformance: 24,
      productiveTrainingStableWeight: 29,
      bodyFatAboveGuardrail: 29,
      dexaConfirmedLeanGain: 29,
      contradictoryDexaAndScale: 29,
    });
    expect(result.dimensions.direction).toEqual([]);
    expect(result.weekly.hasPointChange).toBe(false);
  });

  it("keeps Home, Goals Hub, and Active Goal on one score", async () => {
    const [home, hub, goal] = await Promise.all([
      HomeBriefingService.getHomeBriefing(),
      getGoalsHub(),
      getPhaseAwareActiveGoalPreview(),
    ]);
    expect(hub.activeGoals[0].confidence.value).toBe(home.hero.confidence);
    expect(goal.hero.confidence).toBe(`${home.hero.confidence}% confidence`);
  });

  it("detects legacy and briefing paths while GET routes remain read-only", () => {
    const daily = fs.readFileSync("src/domain/services/DailyBriefingService.js", "utf8");
    const weekly = fs.readFileSync("src/domain/services/WeeklyNarrativeService.js", "utf8");
    const page = fs.readFileSync("src/app/goals/page.js", "utf8");
    expect(daily).toContain("primaryEvaluation?.confidence ?? 0");
    expect(weekly).not.toContain("resolveOverallGoalConfidenceReadModel");
    expect(page).not.toMatch(/save|persist|writeFile|complete/);
  });
});
