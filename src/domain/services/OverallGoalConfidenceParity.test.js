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

  it("gives Home and the active-goal preview one production-shaped confidence truth without writing",async()=>{const before=fs.readFileSync(storePath,"utf8");const [home,preview]=await Promise.all([HomeBriefingService.getHomeBriefing(),getPhaseAwareActiveGoalPreview()]);const after=fs.readFileSync(storePath,"utf8");expect(after).toBe(before);expect(home.hero.confidence).toBe(44);expect(preview.hero.confidence).toBe("44% confidence");expect(preview.hero.confidenceBand).toBe(home.hero.confidenceState);expect(preview.hero.confidenceDetail).toEqual({supportingFactors:home.hero.confidenceDetail.supportingFactors,limitingFactors:home.hero.confidenceDetail.limitingFactors,improvementFactors:home.hero.confidenceDetail.clarifyingFactors,uncertaintyStatement:home.hero.confidenceDetail.uncertaintyStatement,evidenceBasis:expect.any(Array)});expect(preview.hero.confidenceSource).toEqual(home.hero.confidenceSource);expect(preview.hero.confidenceSource).toMatchObject({version:"overall_goal_confidence_v1",goalId:expect.any(String),goalRevision:expect.any(String),phaseFingerprint:expect.stringMatching(/^fnv1a_/),evidenceFingerprint:expect.stringMatching(/^fnv1a_/),evaluatedAt:expect.any(String)});});
  it("contains no preview-local confidence formula or hard-coded percentage",()=>{const source=fs.readFileSync("src/domain/services/PhaseAwareActiveGoalPreviewService.js","utf8");expect(source).toContain("resolveOverallGoalConfidenceReadModel");expect(source).not.toMatch(/numericValue|44%|let score|score \+=/);});
  it("gives the Goals Hub the identical canonical value and source contract",async()=>{const [home,preview,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getPhaseAwareActiveGoalPreview(),getGoalsHub()]);const goal=hub.activeGoals[0];expect(goal.confidence.value).toBe(home.hero.confidence);expect(goal.confidence.band).toBe(home.hero.confidenceState);expect(goal.confidence.source).toEqual(home.hero.confidenceSource);expect(goal.confidence.source).toEqual(preview.hero.confidenceSource);});
  it("keeps Home and Goals Hub on the Pacific date at a UTC date boundary when the canonical timezone is absent",async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T02:00:00.000Z"));
    const currentUser=await FounderRepositories.users.getCurrentUser();
    vi.spyOn(FounderRepositories.users,"getCurrentUser").mockResolvedValue({...currentUser,timeZone:undefined,timezone:"Pacific/Kiritimati"});
    const [home,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getGoalsHub()]);
    const goal=hub.activeGoals[0];
    expect(home.hero.confidenceSource.evaluatedAt).toBe("2026-07-24");
    expect(goal.confidence.source.evaluatedAt).toBe("2026-07-24");
    expect(goal.confidence.source.goalId).toBe(home.hero.confidenceSource.goalId);
    expect(goal.confidence.source.evidenceFingerprint).toBe(home.hero.confidenceSource.evidenceFingerprint);
    expect(goal.confidence.value).toBe(home.hero.confidence);
  });
  it("honors an explicit canonical timezone on both Home and Goals Hub",async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T02:00:00.000Z"));
    const currentUser=await FounderRepositories.users.getCurrentUser();
    vi.spyOn(FounderRepositories.users,"getCurrentUser").mockResolvedValue({...currentUser,timeZone:"Pacific/Kiritimati",timezone:"America/Los_Angeles"});
    const [home,hub]=await Promise.all([HomeBriefingService.getHomeBriefing(),getGoalsHub()]);
    const goal=hub.activeGoals[0];
    expect(home.hero.confidenceSource.evaluatedAt).toBe("2026-07-25");
    expect(goal.confidence.source.evaluatedAt).toBe("2026-07-25");
    expect(goal.confidence.source.goalId).toBe(home.hero.confidenceSource.goalId);
    expect(goal.confidence.source.evidenceFingerprint).toBe(home.hero.confidenceSource.evidenceFingerprint);
    expect(goal.confidence.value).toBe(home.hero.confidence);
  });
  it("never converts missing or malformed confidence to zero",()=>{const summary={id:"goal",title:"Goal",primary:true};expect(mapGoalSummary(summary,null,{id:"goal",status:"active"},null).confidence).toBeNull();expect(mapGoalSummary(summary,null,{id:"goal",status:"active"},{value:"bad"}).confidence).toBeNull();});
});
