import { describe, expect, it } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { resolveBriefingReviewArtifact } from "./BriefingReviewArtifactResolver";

const make=(version,cadence="daily")=>({id:"stable",userId:"u",artifactType:cadence==="event"?"event":"scheduled",cadence,generatedAt:`2026-07-0${version}T12:00:00Z`,evidenceWindow:{id:`${cadence}:window`,cadence},trigger:cadence==="event"?{evidenceType:"photo_session"}:{},briefing:{version:`v${version}`,cards:{hero:{id:`hero-${version}`}},narrative:{id:`narrative-${version}`},...(cadence==="weekly"?{weeklyNarrative:{id:`weekly-${version}`,cards:{hero:{id:`weekly-hero-${version}`}}}}:{}),...(cadence==="event"?{photoEventNarrative:{id:`photo-${version}`,cardContent:{hero:{id:`photo-hero-${version}`}}}}:{})}});

describe("Briefing Review flat-history resolution",()=>{
  it.each(["daily","weekly","event"])("renders every archived %s version from the flat root history",async(cadence)=>{
    const records=[];const repository=createDailyBriefingRepository(records);
    for(let version=1;version<=6;version++)await repository.createDailyBriefing(make(version,cadence));
    for(let version=1;version<=5;version++){
      const artifact=resolveBriefingReviewArtifact(records,{artifactId:"stable",version:`v${version}`});
      expect(artifact.briefing.version).toBe(`v${version}`);
      expect(artifact.briefing.cards.hero.id).toBe(`hero-${version}`);
      expect(artifact.replacedBriefingHistory).toBeUndefined();
    }
    expect(resolveBriefingReviewArtifact(records,{artifactId:"stable"}).briefing.version).toBe("v6");
  });
  it("resolves an archived DEXA Event narrative without selecting it as the root",async()=>{const records=[];const repository=createDailyBriefingRepository(records);const makeDexa=(version)=>({id:"dexa_event_scan",userId:"u",artifactType:"event",cadence:"event",generatedAt:`2026-06-2${version}T12:00:00Z`,trigger:{evidenceType:"dexa",evidenceId:"scan"},briefing:{version:`dexa_event_v${version}`,dexaEventNarrative:{version:`dexa_event_v${version}`,hero:{title:`DEXA ${version}`}}}});await repository.createDailyBriefing(makeDexa(1));await repository.createDailyBriefing(makeDexa(2));expect(resolveBriefingReviewArtifact(records,{artifactId:"dexa_event_scan"}).briefing.version).toBe("dexa_event_v2");expect(resolveBriefingReviewArtifact(records,{artifactId:"dexa_event_scan",version:"dexa_event_v1"}).briefing.dexaEventNarrative.hero.title).toBe("DEXA 1");});
});
