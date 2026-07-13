import { describe, expect, it } from "vitest";
import { createDailyBriefingRepository } from "./DailyBriefingRepository";
import { assertFlatBriefingHistory, getBriefingOccurrenceIdentity, normalizeDailyBriefingRecords } from "./DailyBriefingHistory";

const artifact = (id, overrides = {}) => ({ id, userId: "founder", artifactType: "scheduled", cadence: "daily", generatedAt: `2026-07-12T${id.padStart(2,"0")}:00:00Z`, evidenceWindow: { id: "daily:2026-07-11", cadence: "daily" }, lifecycle: { openedAt: null }, trigger: {}, briefing: { version: id, text: `briefing ${id}` }, ...overrides });

describe("Daily Briefing flat replacement history", () => {
  it("archives one replacement without nesting", async () => {
    const records=[]; const repo=createDailyBriefingRepository(records);
    await repo.createDailyBriefing(artifact("01")); await repo.createDailyBriefing(artifact("02"));
    expect(records).toHaveLength(1); expect(records[0].replacedBriefingHistory).toHaveLength(1);
    expect(records[0].replacedBriefingHistory[0].artifact.id).toBe("01");
    expect(records[0].replacedBriefingHistory[0].artifact.replacedBriefingHistory).toBeUndefined();
    expect(records[0].replacedBriefingHistory[0].previousEntry).toBeUndefined();
    expect(assertFlatBriefingHistory(records)).toBe(true);
  });

  it("grows linearly across repeated replacement", async () => {
    const records=[]; const repo=createDailyBriefingRepository(records); const sizes=[];
    for(let index=0;index<11;index++){await repo.createDailyBriefing(artifact(String(index).padStart(2,"0")));sizes.push(JSON.stringify(records).length);}
    expect(records).toHaveLength(1); expect(records[0].replacedBriefingHistory).toHaveLength(10);
    expect(assertFlatBriefingHistory(records)).toBe(true);
    const increments=sizes.slice(1).map((size,index)=>size-sizes[index]);
    expect(Math.max(...increments)).toBeLessThan(Math.min(...increments)*1.5);
  });

  it("carries valid existing history exactly once", async () => {
    const prior=artifact("00"); const current={...artifact("01"),replacedBriefingHistory:[{artifact:prior,replacedAt:prior.generatedAt,reason:"prior",replacedByArtifactId:"01"}]};
    const records=[current]; await createDailyBriefingRepository(records).createDailyBriefing(artifact("02"));
    expect(records[0].replacedBriefingHistory.map((entry)=>entry.artifact.id)).toEqual(["00","01"]);
  });

  it.each(["briefing","previousEntry"])("flattens legacy %s wrappers without losing descendants", (wrapper) => {
    const oldest=artifact("00"); const previous={...artifact("01"),replacedBriefingHistory:[{[wrapper]:oldest,replacedAt:oldest.generatedAt}]};
    const root={...artifact("02"),replacedBriefingHistory:[{[wrapper]:previous,replacedAt:previous.generatedAt}]};
    const normalized=normalizeDailyBriefingRecords([root]);
    expect(normalized[0].replacedBriefingHistory.map((entry)=>entry.artifact.id)).toEqual(["00","01"]);
    expect(assertFlatBriefingHistory(normalized)).toBe(true);
  });

  it("keeps same-day categories and distinct events separate", () => {
    const daily=artifact("daily");
    const weekly=artifact("weekly",{cadence:"weekly",evidenceWindow:{id:"weekly:2026-W28",cadence:"weekly"}});
    const monthly=artifact("monthly",{cadence:"monthly",evidenceWindow:{id:"monthly:2026-07",cadence:"monthly"}});
    const photo=artifact("photo",{artifactType:"event",cadence:"event",trigger:{evidenceType:"photo_session"}});
    const dexa=artifact("dexa",{artifactType:"event",cadence:"event",trigger:{evidenceType:"dexa"}});
    const normalized=normalizeDailyBriefingRecords([daily,weekly,monthly,photo,dexa]);
    expect(normalized).toHaveLength(5);
    expect(new Set(normalized.map(getBriefingOccurrenceIdentity)).size).toBe(5);
  });

  it.each(["weekly","monthly"])("replaces the same %s evidence window with flat history", async (cadence) => {
    const records=[];const repo=createDailyBriefingRepository(records);const make=(id)=>artifact(id,{cadence,evidenceWindow:{id:`${cadence}:window`,cadence}});
    await repo.createDailyBriefing(make("01"));await repo.createDailyBriefing(make("02"));
    expect(records).toHaveLength(1);expect(records[0].replacedBriefingHistory).toHaveLength(1);expect(assertFlatBriefingHistory(records)).toBe(true);
  });

  it("is normalization and serialization-cycle idempotent", () => {
    const legacy={...artifact("02"),replacedBriefingHistory:[{briefing:{...artifact("01"),replacedBriefingHistory:[{previousEntry:artifact("00")}]} }]};
    const first=normalizeDailyBriefingRecords([legacy]);const second=normalizeDailyBriefingRecords(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);expect(JSON.stringify(second)).toHaveLength(JSON.stringify(first).length);
  });

  it("preserves conflicting same-ID roots and distinct missing-ID roots", () => {
    const conflictA=artifact("same",{briefing:{value:"a"}});const conflictB=artifact("same",{briefing:{value:"b"}});
    const missingA={...artifact("a"),id:"",artifactType:"unknown",cadence:"unknown",briefing:{value:"a"}};
    const missingB={...missingA,briefing:{value:"b"}};
    expect(normalizeDailyBriefingRecords([conflictA,conflictB,missingA,missingB])).toHaveLength(4);
  });
});
