import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { createDailyBriefingService } from "./DailyBriefingService";
import { resolveScheduledBriefingExpectation, retireLegacyDailyBriefingWork, selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService";

const zone="America/Los_Angeles";
const at=(date)=>new Date(`${date}T18:00:00Z`);

describe("twice-weekly routine cadence",()=>{
  it.each([
    ["2026-07-20","none"],["2026-07-21","none"],["2026-07-22","midweek"],
    ["2026-07-23","none"],["2026-07-24","none"],["2026-07-25","none"],["2026-07-26","weekly"],
  ])("maps %s to %s",(date,cadence)=>expect(selectScheduledBriefingCadence({now:at(date),timeZone:zone})).toBe(cadence));

  it.each([
    ["2026-01-01T07:30:00Z","2025-12-31","midweek"],
    ["2026-03-08T09:30:00Z","2026-03-08","weekly"],
    ["2026-11-01T08:30:00Z","2026-11-01","weekly"],
  ])("uses local boundaries for %s",(instant,localDate,cadence)=>expect(resolveScheduledBriefingExpectation({now:new Date(instant),timeZone:zone})).toMatchObject({localDate,cadence}));

  it("keeps Wednesday Sunday-through-Tuesday and excludes Wednesday",()=>expect(resolveScheduledBriefingExpectation({now:at("2026-07-22"),timeZone:zone})).toMatchObject({cadence:"midweek",evidenceWindow:{cadence:"midweek",startDate:"2026-07-19",endDate:"2026-07-21",sameDayEvidenceExcluded:true},productionRoutingStatus:"active"}));
  it("keeps Sunday as the full prior Sunday-through-Saturday week",()=>expect(resolveScheduledBriefingExpectation({now:at("2026-07-26"),timeZone:zone})).toMatchObject({cadence:"weekly",evidenceWindow:{startDate:"2026-07-19",endDate:"2026-07-25"}}));
  it("treats no-briefing days as a valid closed result without an artifact identity",()=>expect(resolveScheduledBriefingExpectation({now:at("2026-07-20"),timeZone:zone})).toMatchObject({cadence:"none",artifactId:null,windowId:null,dailyEligible:false,routineBriefingExpected:false,productionRoutingStatus:"not_scheduled"}));
});

describe("Daily retirement",()=>{
  it("fails closed before claims, composition, or persistence",async()=>{const create=vi.fn(),claim=vi.fn(),composer=vi.fn();const repositories={users:{getCurrentUser:vi.fn()},dailyBriefings:{createDailyBriefing:create,claimScheduledBriefing:claim}};const result=await createDailyBriefingService({repositories,scheduledComposer:composer}).generateScheduledDailyBriefingForClosedWindow({asOf:at("2026-07-20")});expect(result).toMatchObject({state:"retired",reason:"routine_daily_cadence_retired"});expect(create).not.toHaveBeenCalled();expect(claim).not.toHaveBeenCalled();expect(composer).not.toHaveBeenCalled();expect(repositories.users.getCurrentUser).not.toHaveBeenCalled();});
  it("retires direct scheduled generation while preserving Event generation",async()=>{const records=[];const repository=createDailyBriefingRepository(records);const user={id:"u",timeZone:zone};const service=createDailyBriefingService({repositories:{users:{getCurrentUser:async()=>user,getUserById:async()=>user},dailyBriefings:repository},scheduledComposer:async()=>({})});expect(await service.generateDailyBriefing({userId:"u"})).toMatchObject({state:"retired"});expect(records).toHaveLength(0);});
  it("retires stale Daily work idempotently and preserves unrelated jobs",()=>{const records=[{id:"daily",cadence:"daily",status:"pending"},{id:"weekly",cadence:"weekly",status:"pending"}];const once=retireLegacyDailyBriefingWork(records),twice=retireLegacyDailyBriefingWork(once);expect(twice).toEqual(once);expect(once[0]).toMatchObject({status:"retired",retirementReason:"routine_daily_cadence_retired"});expect(once[1]).toEqual(records[1]);});
  it("keeps historical Daily reads intact",async()=>{const records=[{id:"daily_briefing_old",userId:"u",artifactType:"scheduled",cadence:"daily",generatedAt:"2026-07-20T12:00:00Z",briefing:{hero:{title:"Historical"}}}];const repo=createDailyBriefingRepository(records);expect((await repo.getLatestScheduledDailyBriefing("u")).id).toBe("daily_briefing_old");expect(await repo.listDailyBriefings("u")).toEqual(records);});
});
