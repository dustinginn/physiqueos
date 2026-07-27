import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createJuly25PhotoEventV34ReconciliationService,
  JULY25_PHOTO_RECONCILIATION,
  July25PhotoReconciliationOutcome,
  semanticHash,
  validateJuly25PhotoReconciliationSource,
} from "./July25PhotoEventV34ReconciliationService";

const sourcePath=path.resolve("private/founder/runtime-store.json");
const dirs=[];
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

function fixture({mutate,faults,fileSystem}={}){
  const store=JSON.parse(fs.readFileSync(sourcePath,"utf8"));
  delete store.migrationMarkers;
  const target=store.dailyBriefings.find((item)=>item.id===JULY25_PHOTO_RECONCILIATION.eventId);
  target.briefing.version=JULY25_PHOTO_RECONCILIATION.sourceVersion;
  target.briefing.photoEventNarrative.provenance.version=JULY25_PHOTO_RECONCILIATION.sourceVersion;
  mutate?.(store);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"photo-v34-"));dirs.push(dir);
  const filePath=path.join(dir,"runtime-store.json");fs.writeFileSync(filePath,JSON.stringify(store));
  const liveStore=structuredClone(store);
  const service=createJuly25PhotoEventV34ReconciliationService({
    runtimeStorePath:filePath,liveStore,now:()=>new Date("2026-07-26T06:00:00Z"),faults,
    readPersistedStore:()=>JSON.parse(fs.readFileSync(filePath,"utf8")),
    createUnitOfWork:(options)=>createFounderStoreUnitOfWork({...options,fileSystem,createCommitId:()=>"photo-commit",createTransactionId:()=>"photo-tx"}),
  });
  return{store,liveStore,filePath,service};
}

describe("July25PhotoEventV34ReconciliationService",()=>{
  it("validates the exact bounded source and prepares v3.4 without losing five comparisons",async()=>{
    const f=fixture();const source=validateJuly25PhotoReconciliationSource(f.store);const prepared=await f.service.prepare(f.store);
    expect(source.analysisIds).toHaveLength(5);
    expect(prepared.context).toMatchObject({activeGoal:{title:"Build Lean Mass"},activePhase:{name:"Establish Maintenance"},operatingState:{value:"calibration"},futureMilestone:{date:"2026-08-15",source:"execution_item"}});
    const narrative=prepared.candidate.briefing.photoEventNarrative;
    expect(prepared.candidate.id).toBe(JULY25_PHOTO_RECONCILIATION.eventId);
    expect(prepared.candidate.briefing.version).toBe("photo_event_v3_4_0");
    expect(narrative.cardContent.progress.comparisons).toHaveLength(5);
    expect(narrative.completionExperience).toBeNull();
    expect(JSON.stringify(prepared.candidate)).not.toMatch(/continued progress toward visible abs|fat loss is continuing|the cut moves forward|aligned with the cut|upcoming DEXA|Next: DEXA on Saturday, Jul 18/i);
  });

  for(const [name,mutate,reason] of [
    ["wrong event ID",(s)=>{s.dailyBriefings.find((x)=>x.id===JULY25_PHOTO_RECONCILIATION.eventId).id="wrong";},"target_event_identity"],
    ["wrong review",(s)=>{s.evidenceReviews.find((x)=>x.id===JULY25_PHOTO_RECONCILIATION.reviewId).interpretedEvidence.package_id="wrong";},"source_review"],
    ["wrong package",(s)=>{s.evidencePackages=s.evidencePackages.filter((x)=>x.package_id!==JULY25_PHOTO_RECONCILIATION.packageId);},"source_package"],
    ["wrong session",(s)=>{s.dailyBriefings.find((x)=>x.id===JULY25_PHOTO_RECONCILIATION.eventId).trigger.evidenceId="wrong";},"event_session"],
    ["wrong date",(s)=>{s.dailyBriefings.find((x)=>x.id===JULY25_PHOTO_RECONCILIATION.eventId).briefing.photoEventNarrative.eventDate="2026-07-24";},"observed_date"],
    ["sixth photo",(s)=>{const c=s.canonicalEvidenceObjects.find((x)=>x.canonicalId===JULY25_PHOTO_RECONCILIATION.sessionId);c.payload.photos.push({...c.payload.photos[0],canonicalPhotoId:"sixth",poseId:"sixth"});},"canonical_photo_count"],
    ["missing analysis",(s)=>{const c=s.canonicalEvidenceObjects.find((x)=>x.canonicalId===JULY25_PHOTO_RECONCILIATION.sessionId);const id=c.payload.photos[0].canonicalPhotoId;s.analyses=s.analyses.filter((x)=>x.metadata?.canonicalPhotoId!==id);},"comparison_analysis_count"],
  ])it(`rejects ${name}`,()=>{const f=fixture({mutate});expect(()=>validateJuly25PhotoReconciliationSource(f.store)).toThrow(reason);});

  it("replaces event and marker atomically, then replays without a write",async()=>{
    const f=fixture(),before=structuredClone(f.store),first=await f.service.execute();
    expect(first).toMatchObject({outcome:July25PhotoReconciliationOutcome.RECONCILED,committed:true,previousRevision:23,committedRevision:24});
    const persisted=JSON.parse(fs.readFileSync(f.filePath,"utf8"));
    expect(persisted.dailyBriefings).toHaveLength(before.dailyBriefings.length);
    expect(persisted.dailyBriefings.find((x)=>x.id===JULY25_PHOTO_RECONCILIATION.eventId).briefing.version).toBe("photo_event_v3_4_0");
    expect(persisted.migrationMarkers.filter((x)=>x.id===JULY25_PHOTO_RECONCILIATION.markerId)).toHaveLength(1);
    const hash=semanticHash(persisted),revision=persisted.revision;
    const second=await f.service.execute();
    expect(second).toMatchObject({outcome:July25PhotoReconciliationOutcome.MATCHED,committed:false});
    const replay=JSON.parse(fs.readFileSync(f.filePath,"utf8"));expect(replay.revision).toBe(revision);expect(semanticHash(replay)).toBe(hash);
    const unchangedIds=before.dailyBriefings.filter((x)=>x.id!==JULY25_PHOTO_RECONCILIATION.eventId).map(semanticHash);
    expect(persisted.dailyBriefings.filter((x)=>x.id!==JULY25_PHOTO_RECONCILIATION.eventId).map(semanticHash)).toEqual(unchangedIds);
    for(const key of ["evidenceReviews","evidencePackages","canonicalEvidenceObjects","analyses","goals","dexaScans","trainingPerformanceEvents","protocols"])expect(persisted[key]).toEqual(before[key]);
  });

  it("rolls back event and marker together on persistence failure",async()=>{
    const f=fixture({faults:{beforeVerification(){throw new Error("injected verification failure");}}}),before=fs.readFileSync(f.filePath,"utf8");
    expect(await f.service.execute()).toMatchObject({outcome:July25PhotoReconciliationOutcome.PERSISTENCE_FAILURE,committed:false});
    expect(fs.readFileSync(f.filePath,"utf8")).toBe(before);
  });
});
