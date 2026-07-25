import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createMidweekBriefingPreviewService } from "./MidweekBriefingPreviewService";

const storePath=path.resolve(process.cwd(),"private/founder/runtime-store.json");

describe("production-shaped Midweek preview safety",()=>{
  it("reads current Sunday–Tuesday evidence without writing runtime or briefing lifecycle",async()=>{
    const before=fs.readFileSync(storePath,"utf8"),store=JSON.parse(before),briefingCount=(store.dailyBriefings??[]).length;
    const user=await FounderRepositories.users.getCurrentUser();
    const result=await createMidweekBriefingPreviewService({repositories:FounderRepositories,now:()=>new Date("2026-07-22T19:00:00Z")}).preview({userId:user.id,previewDate:"2026-07-22"});
    const after=fs.readFileSync(storePath,"utf8"),current=JSON.parse(after);
    expect(after).toBe(before);
    expect(result).toMatchObject({preview:true,briefingType:"midweek_briefing",briefingDate:"2026-07-22",evidenceWindow:{startDate:"2026-07-19",endDate:"2026-07-21"},coachingDecision:{type:"hold_and_gather"},persistence:{artifactPersisted:false,threadsPersisted:false,lifecycleAdvanced:false}});
    expect(result.activePhase.name).toBe("Establish Maintenance");
    expect(result.charts.weight).toBeNull();
    expect((current.dailyBriefings??[]).length).toBe(briefingCount);
    expect(current.revision).toBe(store.revision);
    expect(current.lastCommitId).toBe(store.lastCommitId);
  });
});
