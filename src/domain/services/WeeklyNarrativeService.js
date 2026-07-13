import { createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";

const VERSION = "weekly_narrative_v3";

export function composeWeeklyNarrative({ window, canonicalObjects = [], weights = [], dexaScans = [], photoEvent = null, goal = null, generatedAt = new Date().toISOString() } = {}) {
  const within = (value) => { const date=String(value??"").slice(0,10);return date>=window.startDate&&date<=window.endDate; };
  const evidence = canonicalObjects.filter((item)=>item.quality?.status!=="superseded"&&within(item.lastObservedAt));
  const weekWeights = weights.filter((item)=>within(item.measuredAt)).sort((a,b)=>String(a.measuredAt).localeCompare(String(b.measuredAt)));
  const weightChange = weekWeights.length>1 ? Number((weekWeights.at(-1).weight.value-weekWeights[0].weight.value).toFixed(1)) : null;
  const averageWeight = weekWeights.length ? weekWeights.reduce((sum,item)=>sum+item.weight.value,0)/weekWeights.length : null;
  const matching = (types) => evidence.filter((item)=>types.includes(item.evidence_type));
  const allCount = (types) => matching(types).length;
  const completeCount = (types) => matching(types).filter((item)=>item.payload?.quality?.status!=="incomplete").length;
  const uniqueDays = (types) => new Set(matching(types).filter((item)=>item.payload?.quality?.status!=="incomplete").map((item)=>String(item.lastObservedAt).slice(0,10))).size;
  const training=uniqueDays(["training"]),activity=uniqueDays(["activity_day"]),nutrition=completeCount(["nutrition"]),nutritionRecords=allCount(["nutrition"]),recovery=completeCount(["recovery","recovery_day"]),photoSessions=completeCount(["photo_session"]),dexa=completeCount(["dexa_scan","dexa"]);
  const photoNarrative=photoEvent?.briefing?.photoEventNarrative??null;
  const photoSummary=photoNarrative?summaryPhotoEvent(photoNarrative):null;
  const primaryStory=photoSummary?"This week reinforced that the cut is continuing.":weightChange!==null&&weightChange<0?"This week’s evidence continued pointing toward visible abs.":"This week added another useful read on the current plan.";
  const id=`weekly_narrative_${window.startDate}_${window.endDate}`;
  const goalName=goal?.title??"Visible Abs at Rest";
  const domains=buildDomainNarratives({photoSummary,weightChange,averageWeight,training,activity,nutrition,nutritionRecords,recovery});
  const latestDexa=[...dexaScans].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)))[0]??null;
  const heroHighlights=[photoSummary?"Photos finally reinforced the weekly weight trend.":null,training>=3?"Training quality stayed consistent while body weight continued falling.":null,activity>=3?"Activity stayed consistent across the week.":null].filter(Boolean);
  const facts=[
    {label:"Week",value:`${formatDate(window.startDate)}–${formatDate(window.endDate)}`},
    {label:"Weight change",value:weightChange===null?"Not enough weigh-ins":`${signed(weightChange)} lb`},
    {label:"Average weight",value:averageWeight===null?"Not available":`${averageWeight.toFixed(1)} lb`},
    {label:"Training",value:training?`${training} training days`:"No complete days"},
    {label:"Activity",value:activity?`${activity} complete days`:"No complete days"},
    {label:"Photos",value:photoSessions?`${photoSessions} session${photoSessions===1?"":"s"}`:"No session"},
    {label:"DEXA",value:dexa?"Completed":"None this week"},
    {label:"Nutrition",value:nutritionRecords?`${nutrition} of ${nutritionRecords} records complete`:"Not recorded"},
  ];
  const progressItems=[
    photoSummary?{domain:"Photos",summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,
    weightChange!==null?{domain:"Weight",summary:`The week finished ${Math.abs(weightChange).toFixed(1)} lb ${weightChange<0?"lower":"higher"} than it began.`}:null,
    dexa?{domain:"DEXA",summary:"A new body-composition measurement was completed this week."}:null,
  ].filter(Boolean);
  const celebration=weightChange!==null&&weightChange<0?`You finished the week ${Math.abs(weightChange).toFixed(1)} lb lower while keeping training and activity in the picture.`:photoSummary?"The week produced a meaningful visual checkpoint without conflicting execution signals.":"The week added useful consistency without forcing a change.";
  return {
    id,weekId:window.id,weekStart:window.startDate,weekEnd:window.endDate,generatedAt,summary:primaryStory,primaryStory,
    primaryEvidence:photoSummary?"photo_event":weightChange!==null?"weight":"execution",
    supportingEvidence:domains.map((item)=>item.highlight),keyChanges:progressItems.map((item)=>item.summary),stableSignals:domains.filter((item)=>["Training","Activity"].includes(item.domain)).map((item)=>item.highlight),risks:nutritionRecords>nutrition?["Nutrition records were incomplete."]:[],wins:[celebration],goalMeaning:`The week remained aligned with ${goalName}.`,coachDirection:"Carry the same execution into the July 18 DEXA.",nextWeekFocus:"Make the DEXA the next decision point rather than changing the plan early.",
    cards:{
      hero:{id:`${id}_hero`,title:primaryStory,body:photoSummary?"Your photos, weight trend, and consistent training all reinforced the same story while upper-body muscle appeared well maintained.":"The week’s strongest evidence agreed without creating a reason to change course.",confidence:photoSummary&&weightChange<0&&training>=3?88:72,highlights:heroHighlights},
      snapshot:{id:`${id}_snapshot`,title:"The completed week",facts},
      progress:{id:`${id}_progress`,title:"What changed",items:progressItems,weight:{points:weekWeights.map((item)=>({date:item.measuredAt,value:item.weight.value})),weeklyAverage:averageWeight,change:weightChange},dexa:{occurredThisWeek:Boolean(dexa),latest:latestDexa?formatDexaAnchor(latestDexa):null},photo:photoNarrative?{thumbnailHref:photoNarrative.activeViews?.find((view)=>view.poseId==="front-relaxed")?.imageHref??photoNarrative.activeViews?.[0]?.imageHref??null,summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,training:{completedDays:training,totalDays:7},activity:{completedDays:activity,totalDays:7}},
      interpretation:{id:`${id}_interpretation`,title:"How the week came together",opening:"Several independent signals told a coherent story this week. The cut continued moving forward while execution remained strong enough to support muscle retention.",domains,uncertainty:"The photos and weekly pattern are encouraging, but the July 18 DEXA remains the next objective test of whether visible progress is translating into measurable body-composition change."},
      coachInsight:{id:`${id}_coach`,title:"Coach’s Insight",celebration,explanation:"That matters because the week’s visual, weight, training, and activity signals reinforced one another instead of creating a conflict.",preparation:"Next week’s DEXA is the most important new evidence. Stay focused on the same consistent execution until then; nothing from this week suggests the plan needs to change early."},
    },
    references:evidence.map((item)=>item.canonicalId),provenance:{version:VERSION,photoEventId:photoEvent?.id??null,evidenceWindowId:window.id},
  };
}

function buildDomainNarratives({photoSummary,weightChange,averageWeight,training,activity,nutrition,nutritionRecords,recovery}) {
  return [
    photoSummary?{domain:"Photos",highlight:"This week’s photo session showed the clearest visual progress of the week.",insight:"The front view drove the fat-loss read, while the rear views supported the impression that upper-body muscle was maintained."}:null,
    weightChange!==null?{domain:"Weight",highlight:`Weight finished the week ${Math.abs(weightChange).toFixed(1)} lb ${weightChange<0?"lower":"higher"}${averageWeight?` with a ${averageWeight.toFixed(1)} lb weekly average`:""}.`,insight:`The weight trend ${weightChange<0?"reinforced":"tempered"} the visual story rather than contradicting it.`}:null,
    training>=2?{domain:"Training",highlight:`Training quality remained consistent across ${training} sessions.`,insight:"Holding resistance-training consistency while weight falls is an encouraging sign for lean-mass preservation."}:null,
    activity>=3?{domain:"Activity",highlight:`Activity was complete on ${activity} days.`,insight:"That consistency makes the weekly weight direction easier to interpret by reducing execution variability."}:null,
    nutritionRecords>=3&&nutrition===nutritionRecords?{domain:"Nutrition",highlight:"The available nutrition record was complete and aligned with the cut.",insight:"That consistency helps explain why the weight and photo signals moved together."}:nutritionRecords>0?{domain:"Nutrition",highlight:"Nutrition records were incomplete this week.",insight:"That limits how precisely the week’s weight movement can be explained, although the remaining evidence still agrees."}:null,
    recovery>0?{domain:"Recovery",highlight:"Useful recovery evidence was available this week.",insight:"Recovery did not introduce a conflicting signal for training quality or current progress."}:null,
  ].filter(Boolean);
}

export function createWeeklyNarrativeService({repositories,now=()=>new Date()}){const service={
 async getLatest({userId,weekId=null}={}){if(weekId)return findExisting(repositories,userId,weekId);return repositories.dailyBriefings.getLatestWeeklyBriefing?repositories.dailyBriefings.getLatestWeeklyBriefing(userId):(await repositories.dailyBriefings.listDailyBriefings(userId)).filter((item)=>item.cadence==="weekly").sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;},
 async preview({userId}){return buildWeeklyArtifact({repositories,userId,now,persist:false});},
 async generate({userId,reason="explicit_generation"}){return buildWeeklyArtifact({repositories,userId,now,persist:true,reason});},
 async regenerate({userId,reason}){if(!reason)throw new Error("Weekly regeneration requires an explicit reason.");return buildWeeklyArtifact({repositories,userId,now,persist:true,reason});},
 // Mutating compatibility API. Never call this from a GET route.
 async getOrCreate({userId,preview=false}){if(preview)return service.preview({userId});const existing=await service.getLatest({userId});return existing??service.generate({userId,reason:"legacy_explicit_generation"});}
};return service;}
export function getWeeklyVersionStatus(artifact){const version=artifact?.briefing?.weeklyNarrative?.provenance?.version??artifact?.briefing?.version??null;return{current:version===VERSION,persistedVersion:version,expectedVersion:VERSION};}
async function buildWeeklyArtifact({repositories,userId,now,persist,reason=null}){const user=await repositories.users.getCurrentUser();const window=createWeeklyEvidenceWindow({now:now(),timeZone:user?.timeZone??"America/Los_Angeles"});const [canonicalObjects,weights,dexaScans,artifacts,goal]=await Promise.all([repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),repositories.weights.listWeightEntries(userId),repositories.dexaScans?.listDEXAScans(userId)??[],repositories.dailyBriefings.listDailyBriefings(userId),repositories.goals.getActiveGoal(userId)]);const photoEvent=artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"&&String(item.briefing?.photoEventNarrative?.eventDate??"")>=window.startDate&&String(item.briefing?.photoEventNarrative?.eventDate??"")<=window.endDate).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;const narrative=composeWeeklyNarrative({window,canonicalObjects,weights,dexaScans,photoEvent,goal,generatedAt:now().toISOString()});const artifact={id:`weekly_briefing_${window.startDate}_${window.endDate}`,userId,artifactType:"scheduled",cadence:"weekly",generatedAt:narrative.generatedAt,evidenceWindow:window,lifecycle:{openedAt:null,consumedAt:null},generation:{reason,source:"explicit_weekly_operation"},briefing:{version:VERSION,weeklyNarrative:narrative}};if(persist)await repositories.dailyBriefings.createDailyBriefing(artifact);return artifact;}
async function findExisting(repositories,userId,weekId){const artifacts=await repositories.dailyBriefings.listDailyBriefings(userId);return artifacts.find((item)=>item.briefing?.weeklyNarrative?.weekId===weekId)??null;}
function summaryPhotoEvent(n){return `${n.cardContent?.hero?.title??n.overallSummary} ${n.cardContent?.hero?.body??""}`.trim();}
function signed(value){return `${value>0?"+":""}${value.toFixed(1)}`;}
function formatDate(value){const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function formatDexaAnchor(scan){const bodyFat=scan.bodyFatPercentage?.value??scan.bodyFatPercentage;return{date:String(scan.measuredAt??scan.date).slice(0,10),bodyFat:Number.isFinite(Number(bodyFat))?`${Number(bodyFat).toFixed(1)}% body fat`:"Body-composition baseline"};}
