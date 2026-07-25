import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { createMidweekBriefingService, getMidweekArtifactId } from "./MidweekBriefingService";

const wednesday = new Date("2026-07-22T19:00:00Z");
function harness({ fail = false } = {}) {
  const records = [], dailyBriefings = createDailyBriefingRepository(records), user = { id: "user-1", timeZone: "America/Los_Angeles" };
  const repositories = { users: { getCurrentUser: vi.fn(async()=>user), getUserById: vi.fn(async()=>user) }, dailyBriefings, canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async()=>fail ? Promise.reject(new Error("unavailable")) : []) }, weights: { listWeightEntries: vi.fn(async()=>[]) }, dexaScans: { listDEXAScans: vi.fn(async()=>[]) }, goals: { getActiveGoal: vi.fn(async()=>({ id:"goal-build", title:"Build Lean Mass", phases:[] })) } };
  return { records, service:createMidweekBriefingService({ repositories, now:()=>wednesday }) };
}
describe("production Midweek Briefing",()=>{
  it("persists one completed canonical Sunday-through-Tuesday artifact",async()=>{const {records,service}=harness();const result=await service.generateForCurrentWindow({asOf:wednesday});expect(result.state).toBe("completed");expect(result.artifact).toMatchObject({artifactType:"scheduled",cadence:"midweek",evidenceWindow:{startDate:"2026-07-19",endDate:"2026-07-21",briefingDate:"2026-07-22",sameDayEvidenceExcluded:true},lifecycle:{generationStatus:"completed"},briefing:{version:"midweek_briefing_v1",persistence:{artifactPersisted:true,threadsPersisted:true,lifecycleAdvanced:true}},piMemory:{schemaVersion:"pi_briefing_memory_v1",cadence:"midweek",briefingDate:"2026-07-22"}});expect(result.artifact.briefing.preview).toBeUndefined();expect(records).toHaveLength(1);expect(result.artifact.id).toBe(getMidweekArtifactId({userId:"user-1",window:result.artifact.evidenceWindow}));});
  it("returns the canonical artifact on duplicate generation",async()=>{const {records,service}=harness();const first=await service.generateForCurrentWindow({asOf:wednesday});const second=await service.generateForCurrentWindow({asOf:wednesday});expect(second).toMatchObject({state:"completed",idempotent:true,artifact:{id:first.artifact.id}});expect(records).toHaveLength(1);});
  it("does not backfill off-day or fall back to Daily on failure",async()=>{const off=harness();expect(await off.service.generateForCurrentWindow({asOf:new Date("2026-07-23T19:00:00Z")})).toMatchObject({state:"not_eligible",reason:"not_wednesday"});expect(off.records).toHaveLength(0);const failed=harness({fail:true});expect(await failed.service.generateForCurrentWindow({asOf:wednesday})).toMatchObject({state:"failed",reason:"midweek_generation_failed"});expect(failed.records[0]).toMatchObject({cadence:"midweek",briefing:null,lifecycle:{generationStatus:"failed"}});});
});
