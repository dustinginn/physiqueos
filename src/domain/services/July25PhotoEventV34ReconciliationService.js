import crypto from "node:crypto";
import fs from "node:fs";
import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { composePhotoEventNarrative } from "./PhotoEventNarrativeService";
import { resolvePhotoEventContext } from "./PhotoEventContextService";

export const JULY25_PHOTO_RECONCILIATION = Object.freeze({
  markerId:"july_25_photo_event_v3_4_reconciliation_v1",
  eventId:"event_briefing_progress_photo_photo_session_user_founder_001_2026-07-25",
  sessionId:"photo_session_user_founder_001_2026-07-25",
  packageId:"evidence_submission_20260726030857919_progress_photos",
  reviewId:"evidence_review_20260726030858363",
  observedDate:"2026-07-25",
  sourceVersion:"photo_event_v3_3_0",
  replacementVersion:"photo_event_v3_4_0",
  comparisonCount:5,
  poseIds:["back-flexed","back-relaxed","front-flexed","front-relaxed","right-side-relaxed"],
});

export const July25PhotoReconciliationOutcome=Object.freeze({
  RECONCILED:"reconciled", MATCHED:"matched", SOURCE_INVALID:"source_invalid",
  TARGET_CONFLICT:"target_conflict", CONCURRENCY_CONFLICT:"concurrency_conflict",
  PERSISTENCE_FAILURE:"persistence_failure",
});

export function createJuly25PhotoEventV34ReconciliationService({
  runtimeStorePath, liveStore, readPersistedStore=()=>JSON.parse(fs.readFileSync(runtimeStorePath,"utf8")),
  now=()=>new Date(), createUnitOfWork=(options)=>createFounderStoreUnitOfWork(options), faults={},
}={}) {
  async function prepare(store=readPersistedStore()) {
    const source=validateSource(store);
    if(source.alreadyReconciled)return source;
    const repositories=readRepositories(store);
    const context=await resolvePhotoEventContext({repositories,userId:source.event.userId,evidenceDate:JULY25_PHOTO_RECONCILIATION.observedDate});
    const sessions=createPhotoSessionReadModels({
      canonicalObjects:store.canonicalEvidenceObjects??[],
      legacyPhotos:store.progressPhotos??[],
      weights:store.weightEntries??[],
      analyses:store.analyses??[],
    });
    const session=sessions.find((item)=>item.id===JULY25_PHOTO_RECONCILIATION.sessionId);
    if(!session)throw sourceError("canonical_session_unavailable");
    const sortedDexa=[...(store.dexaScans??[])].sort((a,b)=>String(a.measuredAt).localeCompare(String(b.measuredAt)));
    const latestDexa=sortedDexa.at(-1)??null;
    const priorDexa=sortedDexa.at(-2)??null;
    const baselineDexa=sortedDexa.find((item)=>String(item.measuredAt).slice(0,10)==="2026-05-24")??null;
    const narrative=composePhotoEventNarrative({
      session,goal:(store.goals??[]).find((goal)=>goal.userId===source.event.userId&&goal.primary)??null,
      goalContext:context,latestDexa,priorDexa,baselineDexa,milestone:context.futureMilestone,
      executionSupport:{},confirmationIntent:null,completionComparisons:null,
      generatedAt:source.event.generatedAt,
    });
    const candidate={...structuredClone(source.event),briefing:{...structuredClone(source.event.briefing),version:JULY25_PHOTO_RECONCILIATION.replacementVersion,photoEventNarrative:narrative}};
    const validation=validateCandidate(candidate,source,context);
    const marker={
      id:JULY25_PHOTO_RECONCILIATION.markerId,type:JULY25_PHOTO_RECONCILIATION.markerId,
      targetEventId:JULY25_PHOTO_RECONCILIATION.eventId,priorNarrativeVersion:JULY25_PHOTO_RECONCILIATION.sourceVersion,
      replacementNarrativeVersion:JULY25_PHOTO_RECONCILIATION.replacementVersion,
      sourceReviewId:JULY25_PHOTO_RECONCILIATION.reviewId,sourcePackageId:JULY25_PHOTO_RECONCILIATION.packageId,
      sourceCanonicalSessionId:JULY25_PHOTO_RECONCILIATION.sessionId,reusedAnalysisIds:source.analysisIds,
      currentPhotoIds:validation.currentPhotoIds,historicalPhotoIds:validation.historicalPhotoIds,
      comparisonCount:JULY25_PHOTO_RECONCILIATION.comparisonCount,reconciledAt:now().toISOString(),
      eventSemanticHash:semanticHash(candidate),
    };
    return {...source,context,candidate,marker,eventSemanticHash:marker.eventSemanticHash};
  }
  return {
    prepare,
    async execute() {
      let prepared;
      try { prepared=await prepare(); }
      catch(error){return typedResult(error,July25PhotoReconciliationOutcome.SOURCE_INVALID);}
      if(prepared.alreadyReconciled)return{outcome:July25PhotoReconciliationOutcome.MATCHED,committed:false,eventSemanticHash:prepared.eventSemanticHash};
      const transaction=createUnitOfWork({filePath:runtimeStorePath,liveStore,now,stageFrom:liveStore}).begin();
      try{
        const staged=await transaction.mutate((store)=>{
          faults.beforeMutation?.();
          const current=validateSource(store);
          if(current.alreadyReconciled||semanticHash(current.event)!==prepared.sourceEventSemanticHash)throw conflict("semantic_target_drift");
          const index=store.dailyBriefings.findIndex((item)=>item.id===JULY25_PHOTO_RECONCILIATION.eventId);
          store.migrationMarkers??=[];
          if(store.migrationMarkers.some((item)=>item.id===JULY25_PHOTO_RECONCILIATION.markerId))throw conflict("marker_already_exists");
          store.dailyBriefings[index]=structuredClone(prepared.candidate);
          store.migrationMarkers.push(structuredClone(prepared.marker));
          faults.afterMutation?.(store);
          return{eventIndex:index};
        });
        const committed=await transaction.commit({validateFinalized(store){
          faults.beforeVerification?.(store);
          const event=store.dailyBriefings[staged.eventIndex];
          const marker=store.migrationMarkers.find((item)=>item.id===JULY25_PHOTO_RECONCILIATION.markerId);
          return semanticHash(event)===prepared.eventSemanticHash&&marker?.eventSemanticHash===prepared.eventSemanticHash;
        }});
        return{outcome:July25PhotoReconciliationOutcome.RECONCILED,committed:true,previousRevision:committed.expectedRevision,committedRevision:committed.revision,eventSemanticHash:prepared.eventSemanticHash,markerId:prepared.marker.id};
      }catch(error){
        if(error?.photoReconciliationConflict)return{outcome:July25PhotoReconciliationOutcome.TARGET_CONFLICT,committed:false,reason:error.message};
        return{outcome:error?.code===FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT?July25PhotoReconciliationOutcome.CONCURRENCY_CONFLICT:July25PhotoReconciliationOutcome.PERSISTENCE_FAILURE,committed:false,reason:error.message};
      }
    },
  };
}

export function validateJuly25PhotoReconciliationSource(store) { return validateSource(store); }

function validateSource(store){
  const c=JULY25_PHOTO_RECONCILIATION;
  const events=(store.dailyBriefings??[]).filter((item)=>item.id===c.eventId);
  if(events.length!==1)throw sourceError("target_event_identity");
  const event=events[0],version=event.briefing?.version;
  const markers=(store.migrationMarkers??[]).filter((item)=>item.id===c.markerId);
  if(version===c.replacementVersion){
    if(markers.length!==1||markers[0].eventSemanticHash!==semanticHash(event))throw conflict("v3_4_semantic_mismatch");
    return{alreadyReconciled:true,event,eventSemanticHash:semanticHash(event)};
  }
  if(version!==c.sourceVersion)throw sourceError("source_version");
  if(event.trigger?.evidenceId!==c.sessionId||event.briefing?.photoEventNarrative?.photoSessionId!==c.sessionId)throw sourceError("event_session");
  if(event.briefing.photoEventNarrative.eventDate!==c.observedDate)throw sourceError("observed_date");
  if(markers.length)throw sourceError("unexpected_marker");
  const review=(store.evidenceReviews??[]).find((item)=>item.id===c.reviewId);
  if(!review||review.status!=="confirmed"||review.interpretedEvidence?.package_id!==c.packageId)throw sourceError("source_review");
  const pkg=(store.evidencePackages??[]).find((item)=>item.package_id===c.packageId);
  if(!pkg)throw sourceError("source_package");
  const canonical=(store.canonicalEvidenceObjects??[]).find((item)=>item.canonicalId===c.sessionId);
  if(!canonical||canonical.payload?.id!==c.packageId||canonical.lastObservedAt!==c.observedDate)throw sourceError("canonical_session");
  const photos=(canonical.payload?.photos??[]).filter((item)=>item.status==="active");
  if(photos.length!==c.comparisonCount)throw sourceError("canonical_photo_count");
  const poseIds=photos.map((item)=>item.poseId).sort();
  if(JSON.stringify(poseIds)!==JSON.stringify(c.poseIds))throw sourceError("canonical_pose_set");
  const photoIds=photos.map((item)=>item.canonicalPhotoId);
  const analyses=(store.analyses??[]).filter((item)=>photoIds.includes(item.metadata?.canonicalPhotoId));
  if(analyses.length!==c.comparisonCount)throw sourceError("comparison_analysis_count");
  for(const analysis of analyses)if(!analysis.metadata?.priorComparisonId||!(analysis.metadata?.structuredObservations??[]).length)throw sourceError("malformed_comparison_analysis");
  const comparisons=event.briefing.photoEventNarrative.cardContent?.progress?.comparisons??[];
  if(comparisons.length!==c.comparisonCount)throw sourceError("persisted_comparison_count");
  for(const comparison of comparisons)if(comparison.previousDate!=="2026-07-18"||!comparison.imageHref||!comparison.previousImageHref||!(comparison.findings??[]).length)throw sourceError("malformed_persisted_comparison");
  return{alreadyReconciled:false,event,review,pkg,canonical,analyses,analysisIds:analyses.map((item)=>item.id).sort(),sourceEventSemanticHash:semanticHash(event)};
}

function validateCandidate(candidate,source,context){
  const c=JULY25_PHOTO_RECONCILIATION,n=candidate.briefing.photoEventNarrative,comparisons=n.cardContent?.progress?.comparisons??[];
  if(candidate.id!==source.event.id||candidate.trigger?.evidenceId!==c.sessionId||n.photoSessionId!==c.sessionId||n.eventDate!==c.observedDate)throw sourceError("candidate_identity");
  if(candidate.briefing.version!==c.replacementVersion||n.provenance?.version!==c.replacementVersion)throw sourceError("candidate_version");
  if(comparisons.length!==c.comparisonCount||n.completionExperience||n.goalCompletionHandoff)throw sourceError("candidate_comparison_contract");
  if(context.activeGoal?.title!=="Build Lean Mass"||context.activePhase?.name!=="Establish Maintenance"||context.operatingState?.value!=="calibration")throw sourceError("candidate_goal_context");
  const text=JSON.stringify(candidate).toLowerCase();
  for(const phrase of ["continued progress toward visible abs","fat loss is continuing","the cut moves forward","aligned with the cut","upcoming dexa","next saturday’s dexa","next: dexa on saturday, jul 18"])if(text.includes(phrase))throw sourceError(`prohibited_phrase:${phrase}`);
  if(n.nextMilestone?.date&&n.nextMilestone.date<=c.observedDate)throw sourceError("invalid_future_milestone");
  const currentPhotoIds=[],historicalPhotoIds=[];
  for(const comparison of comparisons){
    if(comparison.previousDate!=="2026-07-18"||!comparison.imageHref||!comparison.previousImageHref||!(comparison.findings??[]).length)throw sourceError("candidate_comparison_loss");
    currentPhotoIds.push(comparison.id);historicalPhotoIds.push(source.analyses.find((item)=>item.metadata.canonicalPhotoId===comparison.id)?.metadata.priorComparisonId);
  }
  if(historicalPhotoIds.some((id)=>!id))throw sourceError("historical_photo_identity");
  return{currentPhotoIds:currentPhotoIds.sort(),historicalPhotoIds:historicalPhotoIds.sort()};
}

function readRepositories(store){const user=(id)=>(item)=>item.userId===id;return{
  goals:{getActiveGoal:async(id)=>(store.goals??[]).find((goal)=>user(id)(goal)&&goal.primary)??null,listGoals:async(id)=>(store.goals??[]).filter(user(id))},
  executionItems:{listExecutionItems:async(id)=>(store.executionItems??[]).filter(user(id))},
  dexaScans:{listDEXAScans:async(id)=>(store.dexaScans??[]).filter(user(id))},
};}
export function semanticHash(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").toUpperCase();}
function sourceError(reason){const error=new Error(reason);error.photoReconciliationSource=true;return error;}
function conflict(reason){const error=new Error(reason);error.photoReconciliationConflict=true;return error;}
function typedResult(error,fallback){return{outcome:error?.photoReconciliationConflict?July25PhotoReconciliationOutcome.TARGET_CONFLICT:fallback,committed:false,reason:error.message};}
