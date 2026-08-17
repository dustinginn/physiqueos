import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeBriefingService } from "./HomeBriefingService";
import { getPhaseAwareActiveGoalPreview } from "./PhaseAwareActiveGoalPreviewService";
import { getGoalsHub, mapGoalSummary } from "../../screens/GoalsHubScreen";
import { FounderRepositories } from "../../data/repositories/founderRepositories";

const storePath=path.resolve(process.cwd(),"private/founder/runtime-store.json");

describe("overall goal confidence parity",()=>{
  afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

  it("gives Home and the active-goal preview one canonical persisted truth without writing",async()=>{const before=fs.readFileSync(storePath,"utf8");const [home,preview]=await Promise.all([HomeBriefingService.getHomeBriefing(),getPhaseAwareActiveGoalPreview()]);const after=fs.readFileSync(storePath,"utf8");expect(after).toBe(before);expect(home.hero.confidence).toEqual(expect.any(Number));expect(preview.hero.confidence).toBe(`${home.hero.confidence}% confidence`);expect(preview.hero.confidenceBand).toBe(home.hero.confidenceState);expect(preview.hero.confidenceSource).toBe("canonical_confidence_v2_latest_briefing");expect(preview.hero.confidenceSource).toBe(home.hero.confidenceSource);expect(preview.hero.confidenceAssessmentId).toEqual(expect.any(String));});
  it("contains no preview-local confidence formula or hard-coded percentage",()=>{const source=fs.readFileSync("src/domain/services/PhaseAwareActiveGoalPreviewService.js","utf8");expect(source).toContain("resolveActiveGoalConfidencePresentation");expect(source).not.toContain("resolveOverallGoalConfidenceReadModel");expect(source).not.toMatch(/numericValue|44%|let score|score \+=/);});
  it("gives the Goals Hub the identical canonical value and source contract",async()=>{const [home,preview,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getPhaseAwareActiveGoalPreview(),getGoalsHub()]);const goal=hub.activeGoals[0];expect(goal.confidence.value).toBe(home.hero.confidence);expect(goal.confidence.band).toBe(home.hero.confidenceState.toLowerCase());expect(goal.confidence.source).toEqual(home.hero.confidenceSource);expect(goal.confidence.source).toEqual(preview.hero.confidenceSource);});
  it("does not recalculate canonical confidence at a UTC date boundary",async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T02:00:00.000Z"));
    const currentUser=await FounderRepositories.users.getCurrentUser();
    vi.spyOn(FounderRepositories.users,"getCurrentUser").mockResolvedValue({...currentUser,timeZone:undefined,timezone:"Pacific/Kiritimati"});
    const [home,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getGoalsHub()]);
    const goal=hub.activeGoals[0];
    expect(home.hero.confidenceSource).toBe("canonical_confidence_v2_latest_briefing");
    expect(goal.confidence.source).toBe(home.hero.confidenceSource);
    expect(goal.confidence.value).toBe(home.hero.confidence);
  });
  it("does not vary persisted confidence with the presentation timezone",async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T02:00:00.000Z"));
    const currentUser=await FounderRepositories.users.getCurrentUser();
    vi.spyOn(FounderRepositories.users,"getCurrentUser").mockResolvedValue({...currentUser,timeZone:"Pacific/Kiritimati",timezone:"America/Los_Angeles"});
    const [home,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getGoalsHub()]);
    const goal=hub.activeGoals[0];
    expect(home.hero.confidenceSource).toBe("canonical_confidence_v2_latest_briefing");
    expect(goal.confidence.source).toBe(home.hero.confidenceSource);
    expect(goal.confidence.value).toBe(home.hero.confidence);
  });
  it("never converts missing or malformed confidence to zero",()=>{const summary={id:"goal",title:"Goal",primary:true};expect(mapGoalSummary(summary,null,{id:"goal",status:"active"},null).confidence).toBeNull();expect(mapGoalSummary(summary,null,{id:"goal",status:"active"},{value:"bad"}).confidence).toBeNull();});
});
