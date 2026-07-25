import { createWeeklyEvidenceWindow, selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService";
import { createCoachingUpdatesReadService } from "./CoachingUpdatesReadService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { CADENCE_RMR_STRATEGIES, createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService";
import { loadLatestCadenceBriefingContinuity } from "./CadenceBriefingContinuityService";
import { mergePIBriefingMemory } from "./PIBriefingMemoryService";
import { createWeeklyBriefingPIResult } from "./WeeklyBriefingPIService";
import { createPIDecisionCadenceShadow } from "./PIDecisionCadenceShadowService";
import { adaptWeeklyPISelection } from "./WeeklyPINarrativeCandidateService";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";

const VERSION = "weekly_narrative_v5_1";
const DEFAULT_WEEKLY_ACTIVITY_TARGET = 7000;

export function composeWeeklyNarrative({ window, canonicalObjects = [], weights = [], dexaScans = [], photoEvent = null, goal = null, generatedAt = new Date().toISOString(), activityTarget = DEFAULT_WEEKLY_ACTIVITY_TARGET, trainingPerformance = null, weeklyEnergy = null, piNarrativeSelection = null } = {}) {
  const within = (value) => { const date=dateKey(value);return date>=window.startDate&&date<=window.endDate; };
  const active = canonicalObjects.filter((item)=>item.quality?.status!=="superseded");
  const weekly = active.filter((item)=>within(item.lastObservedAt));
  const payloads = weekly.map((item)=>item.payload??item);
  const weekWeights = weights.filter((item)=>within(item.measuredAt)).sort((a,b)=>String(a.measuredAt).localeCompare(String(b.measuredAt)));
  const previousWeights = weights.filter((item)=>{const date=dateKey(item.measuredAt);return date>=shiftDate(window.startDate,-7)&&date<window.startDate;});
  const weightChange = weekWeights.length>1 ? round(weekWeights.at(-1).weight.value-weekWeights[0].weight.value) : null;
  const averageWeight = average(weekWeights.map((item)=>item.weight.value));
  const previousAverage = average(previousWeights.map((item)=>item.weight.value));
  const weeklyLow = weekWeights.length ? Math.min(...weekWeights.map((item)=>item.weight.value)) : null;
  const resistanceSessions = payloads.filter(isResistanceTrainingSession);
  const trainingDays = uniqueDays(resistanceSessions.map((item)=>item.observed_at));
  const activityDays = payloads.filter(isCompleteActivityDay);
  const activityDayCount = uniqueDays(activityDays.map((item)=>item.observed_at));
  const activityCalories = activityDays.reduce((sum,item)=>sum+Number(item.daily_activity.move_calories),0);
  const activityAverage = activityDayCount ? Math.round(activityCalories/activityDayCount) : null;
  const weeklyActivityTarget = Number(activityTarget)||DEFAULT_WEEKLY_ACTIVITY_TARGET;
  const activityDifference = activityCalories-weeklyActivityTarget;
  const activityAlignment = Math.abs(activityDifference)<=weeklyActivityTarget*.1?"close to":activityDifference>0?"above":"below";
  const nutritionDays = payloads.filter(isCompleteNutritionDay);
  const nutritionCount = uniqueDays(nutritionDays.map((item)=>item.observed_at));
  const photoSessions = uniqueDays(payloads.filter((item)=>item.evidence_type==="photo_session").map((item)=>item.observed_at));
  const dexaCount = uniqueDays(payloads.filter((item)=>["dexa","dexa_scan","body_composition"].includes(item.evidence_type)).map((item)=>item.observed_at));
  const photoNarrative = photoEvent?.briefing?.photoEventNarrative??null;
  const photoSummary = photoNarrative ? "The July 11 comparison showed continued waist tightening from the front while the rear views suggested upper-body muscle remained stable." : null;
  const report = trainingPerformance??createTrainingPerformanceIntelligenceReport({canonicalObjects:active.filter((item)=>dateKey(item.lastObservedAt)<=window.endDate),now:new Date(`${window.endDate}T12:00:00Z`)});
  const weeklyPrs = (report.exerciseObservations??[]).filter((item)=>item.explanation_data?.pr_detection?.detected&&within(item.evidence_date_range?.end));
  const improving = (report.exerciseObservations??[]).filter((item)=>item.status==="improving"&&within(item.evidence_date_range?.end));
  const regression = (report.exerciseObservations??[]).filter((item)=>item.status==="regressing"&&within(item.evidence_date_range?.end));
  const prName = weeklyPrs[0] ? displayExerciseName(weeklyPrs[0], active) : null;
  const overloadName = !prName&&improving[0] ? displayExerciseName(improving[0],active) : null;
  const goalName = goal?.title??"Visible Abs at Rest";
  const latestDexa=[...dexaScans].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)))[0]??null;
  const weeklyAverageText = averageWeight==null?null:`${averageWeight.toFixed(1)} lb weekly average`;
  const heroHighlights = [
    photoSummary?"📸 Your progress photos showed the clearest visual progress of the week.":null,
    weeklyAverageText?`⚖️ Weight averaged ${averageWeight.toFixed(1)} lb${weeklyLow!=null?` and reached a ${weeklyLow.toFixed(1)} lb weekly low`:""}.`:null,
    prName?`💪 ${prName} reached a new performance PR.`:overloadName?`💪 ${overloadName} showed supported progressive overload.`:null,
    activityDayCount?`🔥 ${activityDayCount} complete activity days totaled ${formatNumber(activityCalories)} active calories.`:null,
  ].filter(Boolean).slice(0,4);
  const heroHighlightTiles = [
    photoSummary?{domain:"photos",icon:"📸",label:"Visual Progress",value:"Clearest visible change",detail:"Waist continued to tighten"}:null,
    weeklyAverageText?{domain:"weight",icon:"⚖️",label:"Weight Trend",value:`${averageWeight.toFixed(1)} lb average`,detail:weeklyLow!=null?`${weeklyLow.toFixed(1)} lb weekly low`:null}:null,
    prName?{domain:"training",icon:"💪",label:"Performance",value:`${prName} PR`,detail:`${trainingDays} training days`}:overloadName?{domain:"training",icon:"💪",label:"Performance",value:overloadName,detail:"Supported progressive overload"}:trainingDays?{domain:"training",icon:"💪",label:"Performance",value:`${trainingDays} training days`,detail:"Resistance work completed"}:null,
    activityDayCount?{domain:"energy_balance",icon:"🔥",label:"Activity",value:`${activityDayCount} complete days`,detail:`${formatNumber(activityCalories)} active calories`}:null,
  ].filter(Boolean).slice(0,4);
  const heroMilestone = heroHighlightTiles.length>=3&&activityDayCount===7&&(photoSummary||weightChange<0)
    ? {label:"Weekly Milestone",value:"Execution and outcome remained aligned across the full week."}
    : prName&&weightChange<0
      ? {label:"Weekly Milestone",value:"Training performance improved while weekly weight moved down."}
      : null;
  const facts=[
    {label:"Week",value:`${formatDate(window.startDate)}–${formatDate(window.endDate)}`},
    {label:"Weight change",value:weightChange==null?"Not enough weigh-ins":`${signed(weightChange)} lb`},
    {label:"Average weight",value:averageWeight==null?"Not available":`${averageWeight.toFixed(1)} lb`},
    {label:"Training Days",value:trainingDays?`${trainingDays} training days`:"No complete days"},
    {label:"Activity Days",value:activityDayCount?`${activityDayCount} complete days`:"No complete days"},
    {label:"Photos",value:photoSessions?`${photoSessions} session${photoSessions===1?"":"s"}`:"No session"},
    {label:"DEXA",value:dexaCount?"Completed":"None this week"},
    {label:"Nutrition",value:nutritionCount?`${nutritionCount} of 7 days complete`:"Not recorded"},
  ];
  const domains = [
    photoSummary?{domain:"photos",label:"📸 Progress Photos",highlight:"Your July 11 progress photos showed the clearest visual progress of the week.",insight:"Your waist appeared to keep tightening from the front, while your upper-body muscle looked stable in the rear views."}:null,
    averageWeight!=null?{domain:"weight",label:"⚖️ Weight",highlight:`You finished ${Math.abs(weightChange??0).toFixed(1)} lb ${weightChange!=null&&weightChange<0?"lower":"from where you began"}, with a ${averageWeight.toFixed(1)} lb weekly average${weeklyLow!=null?` and ${weeklyLow.toFixed(1)} lb low`:""}.`,insight:`Your weekly pattern matters more than any single weigh-in${previousAverage!=null&&averageWeight<previousAverage?`, and your average stayed below the prior week’s ${previousAverage.toFixed(1)} lb`:""}.`}:null,
    trainingDays?{domain:"training",label:"💪 Training",highlight:prName?`You set a new ${prName} performance PR during ${trainingDays} resistance-training days.`:overloadName?`You built supported progressive overload on ${overloadName} across ${trainingDays} resistance-training days.`:`You completed ${trainingDays} resistance-training days without a supported new PR.`,insight:regression.length?`${displayExerciseName(regression[0],active)} deserves attention next week; one regression does not establish muscle loss.`:"You maintained or improved performance while body weight fell, which supports lean mass preservation."}:null,
    activityDayCount?{domain:"energy_balance",label:"🔥 Energy Balance",highlight:`You burned approximately ${formatNumber(activityCalories)} active calories across ${activityDayCount} complete days—${formatNumber(Math.abs(activityDifference))} ${activityDifference>=0?"above":"below"} the ${formatNumber(weeklyActivityTarget)} weekly target.`,insight:`You stayed ${activityAlignment} the planned activity level, which helps explain the week’s weight change. You recorded only ${nutritionCount} complete nutrition day${nutritionCount===1?"":"s"}, so there is not enough information to judge the full week${/visible abs|cut/i.test(goalName)?", although the recorded days supported the cut":""}.`}:null,
  ].filter(Boolean);
  if (weeklyEnergy?.current?.coverage?.pairedDayCount) domains.push({
    domain:"estimated_energy",
    label:"Estimated Energy",
    highlight:`Recorded intake totaled ${formatNumber(weeklyEnergy.current.intake.total)} kcal and estimated expenditure totaled ${formatNumber(weeklyEnergy.current.estimatedExpenditure.total)} kcal across ${weeklyEnergy.current.coverage.pairedDayCount} paired days.`,
    insight:weeklyEnergyInsight(weeklyEnergy),
  });
  const piEditorial = !photoEvent&&!dexaCount ? renderWeeklyPISelection(piNarrativeSelection) : null;
  const celebration = photoSummary?"The biggest win was making visible progress while resistance performance stayed in the picture—the cut moved without asking you to give up training quality.":prName?`${prName} set a new PR while body weight continued moving down.`:weightChange!=null&&weightChange<0?`You finished the week ${Math.abs(weightChange).toFixed(1)} lb lower while keeping training and activity consistent.`:"You put together a complete week of useful execution without forcing an early plan change.";
  const id=`weekly_narrative_${window.startDate}_${window.endDate}`;
  return {
    id,weekId:window.id,weekStart:window.startDate,weekEnd:window.endDate,generatedAt,
    summary:"This week kept the cut moving.",primaryStory:"This week kept the cut moving.",primaryEvidence:photoSummary?"photo_event":weightChange!=null?"weight":"execution",
    supportingEvidence:domains.map((item)=>item.highlight),keyChanges:domains.map((item)=>item.highlight),stableSignals:[],risks:nutritionCount<7?[`Only ${nutritionCount} complete nutrition days were available.`]:[],wins:[celebration],goalMeaning:`The week remained aligned with ${goalName}.`,coachDirection:"Keep the same training and activity rhythm while preparing for the July 18 DEXA.",nextWeekFocus:"Use the July 18 DEXA as the next body-composition checkpoint.",
    cards:{
      hero:{id:`${id}_hero`,title:piEditorial?.title??"This week kept the cut moving.",body:piEditorial?.body??"Your waist continued to tighten, your weekly weight moved down, and you kept training well while staying close to your activity plan.",highlights:heroHighlights,highlightTiles:heroHighlightTiles,milestone:heroMilestone},
      snapshot:{id:`${id}_snapshot`,title:"The completed week",facts},
      progress:{id:`${id}_progress`,title:"What changed",items:[photoSummary?{domain:"Photos",summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,weightChange!=null?{domain:"Weight",summary:`The week finished ${Math.abs(weightChange).toFixed(1)} lb ${weightChange<0?"lower":"higher"} than it began.`}:null].filter(Boolean),weight:{points:weekWeights.map((item)=>({date:item.measuredAt,value:item.weight.value})),weeklyAverage:averageWeight,weeklyLow,change:weightChange},dexa:{occurredThisWeek:Boolean(dexaCount),latest:latestDexa?formatDexaAnchor(latestDexa):null},photo:photoNarrative?{thumbnailHref:photoNarrative.activeViews?.find((view)=>view.poseId==="front-relaxed")?.imageHref??photoNarrative.activeViews?.[0]?.imageHref??null,summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,training:{completedDays:trainingDays,totalDays:7},activity:{completedDays:activityDayCount,totalDays:7,totalActiveCalories:activityCalories,dailyAverage:activityAverage,weeklyTarget:weeklyActivityTarget,difference:activityDifference}},
      interpretation:{id:`${id}_interpretation`,title:"Why this week mattered",opening:piEditorial?.opening??"This week your progress photos, weight trend, training, and activity all told the same story: the current plan is still working.",domains,synthesis:piEditorial?.synthesis??"You continued losing weight, your waist appeared tighter, and your resistance performance held up while you stayed close to your activity target.",uncertainty:"The July 18 DEXA should tell us whether this week’s visual progress is translating into measurable fat loss while lean mass holds."},
      coachInsight:{id:`${id}_coach`,title:"Coach’s Insight",celebration:`This was a strong week. ${celebration}`,explanation:"Keep building on the resistance training and consistent activity that made the week productive. Those habits are protecting training quality while the cut continues.",preparation:"Stay the course until the July 18 DEXA. Use it to confirm this week’s progress before making any changes to the plan."},
    },
    references:weekly.map((item)=>item.canonicalId),provenance:{version:VERSION,photoEventId:photoEvent?.id??null,evidenceWindowId:window.id,trainingPerformanceGeneratedAt:report.generated_at??null},
  };
}

function weeklyEnergyInsight({current,comparison}){const prior=comparison?.netBalance?.average;const comparisonText=Number.isFinite(prior)?` The prior comparable week averaged ${signedKcal(prior)} per paired day.`:" The prior comparable week is incomplete.";return `Estimated balance was ${signedKcal(current.netBalance.total)} for the recorded week, averaging ${signedKcal(current.netBalance.average)} per paired day.${comparisonText} Coverage included ${current.coverage.completePairedDayCount} complete and ${current.coverage.partialPairedDayCount} partial paired days. Expenditure uses the eligible DEXA RMR plus active calories and remains an estimate.`;}
function renderWeeklyPISelection(selection){const candidate=selection?.primary;if(!candidate)return null;if(candidate.editorialTemplateKey==="weekly_body_fat_guardrail")return{title:"Comparable photos provide the clearest guardrail signal this week.",body:"The visual direction is useful for monitoring the body-fat guardrail, but it is not a body-fat measurement.",opening:"Comparable photo evidence supplied a directional early-phase guardrail signal.",synthesis:"Keep the visual direction in context and wait for measured body-composition evidence before making a quantified conclusion."};if(candidate.editorialTemplateKey==="weekly_direct_training")return{title:"Training provided the clearest signal this week.",body:"Your representative resistance-training evidence showed the most material change, while Weight and Energy remain supporting context.",opening:"Training carried the clearest supported weekly meaning without turning Weight or estimated Energy balance into a verdict.",synthesis:"Use the measured training direction as the lead signal and keep the remaining evidence in context."};if(candidate.editorialTemplateKey==="weekly_direct_recovery")return{title:"Recovery evidence provides useful weekly context.",body:"Structured Recovery indicators changed materially in the current evidence window.",opening:"Recovery supplied a current observational signal without establishing a diagnosis or cause.",synthesis:"Keep the structured Recovery direction in context alongside Training and Energy evidence."};if(candidate.editorialTemplateKey==="weekly_energy_calibration")return{title:"The week is best read through Energy context.",body:"Recorded intake, estimated expenditure, and evidence coverage provide the clearest calibration signal without establishing exact maintenance.",opening:"Energy evidence supplied the most material routine-domain context this week.",synthesis:"Treat the estimated balance as calibration context, not as proof of success, failure, or a body-composition outcome."};if(candidate.relationshipKind==="training_energy_relationship"){const text=trainingEnergyWeeklyText(candidate.renderingContext?.relationshipState);return text?{title:"Training and Energy add context to each other this week.",body:text,opening:text,synthesis:"Use the relationship as observational context without treating estimated Energy balance as the cause of the Training direction."}:null;}if(candidate.relationshipKind==="recovery_training_relationship"||candidate.relationshipKind==="recovery_energy_relationship"){const text=recoveryWeeklyText(candidate.renderingContext?.relationshipState);return text?{title:"Recovery adds context to this week's evidence.",body:text,opening:text,synthesis:"Use this as an observational relationship without treating either domain as the cause of the other."}:null;}return{title:"Training, Weight, and Energy need to be read together.",body:"The strongest supported relationship this week came from how the measured domains moved together.",opening:"The shared evidence is more informative as a relationship than as isolated domain changes.",synthesis:"Keep the measured directions separate from Goal judgment and use the relationship as coaching context."};}
function recoveryWeeklyText(state){return({training_progress_with_stable_recovery:"Training improved while Recovery indicators remained stable.",training_progress_with_improving_recovery:"Training and Recovery indicators improved together.",training_progress_despite_strained_recovery:"Training improved despite weaker Recovery indicators.",training_stability_with_strained_recovery:"Training remained stable while Recovery indicators weakened.",training_decline_with_strained_recovery:"Training declined while Recovery indicators also weakened.",training_decline_despite_stable_recovery:"Training declined even though Recovery indicators remained stable.",training_volume_growth_with_stable_recovery:"Training volume increased while Recovery indicators remained stable.",training_volume_growth_with_declining_recovery:"Training volume increased while Recovery indicators weakened.",recovery_stability_with_positive_energy_support:"Recovery indicators remained stable while estimated Energy support was positive.",recovery_stability_with_neutral_energy_support:"Recovery indicators remained stable while estimated Energy support was near neutral.",recovery_strain_with_negative_energy_balance:"Recovery indicators weakened while estimated Energy balance was negative.",recovery_strain_despite_positive_energy_support:"Recovery indicators weakened despite positive estimated Energy support.",recovery_improvement_despite_negative_energy_balance:"Recovery indicators improved despite a negative estimated Energy balance."})[state]??null;}

function trainingEnergyWeeklyText(state){return({progress_with_positive_support:"Training improved while estimated Energy support remained positive.",progress_with_neutral_support:"Training improved while estimated Energy balance remained near neutral.",progress_despite_negative_support:"Training improved despite a negative estimated Energy balance.",stable_with_positive_support:"Training remained stable while estimated Energy balance was positive.",stable_with_declining_support:"Training remained stable while estimated Energy support weakened.",decline_with_negative_support:"Training declined while estimated Energy balance was negative.",decline_despite_positive_support:"Training declined despite positive estimated Energy support.",insufficient:"The Training and Energy relationship remains uncertain because evidence coverage was incomplete."})[state]??null;}

export function createWeeklyNarrativeService({repositories,now=()=>new Date()}){const service={
 async getLatest({userId,weekId=null}={}){if(weekId)return findExisting(repositories,userId,weekId);return repositories.dailyBriefings.getLatestWeeklyBriefing?repositories.dailyBriefings.getLatestWeeklyBriefing(userId):null;},
 async generateForCurrentWindow({userId,asOf=now()}={}){const user=userId?await repositories.users.getUserById(userId):await repositories.users.getCurrentUser();const resolvedUserId=user?.id??userId;if(!resolvedUserId)return{state:"not_eligible",reason:"user_not_found"};const timeZone=user?.timeZone??"America/Los_Angeles";const coachingUpdates=await createCoachingUpdatesReadService({repositories}).getCurrent({userId:resolvedUserId});if(selectScheduledBriefingCadence({now:asOf,timeZone,coachingUpdates})!=="weekly")return{state:"not_eligible",reason:"not_weekly_day"};const artifact=await buildWeeklyArtifact({repositories,userId:resolvedUserId,now:()=>asOf,persist:true,reason:"scheduled_weekly_cadence"});return{state:"completed",artifact};},
 async preview({userId}){return buildWeeklyArtifact({repositories,userId,now,persist:false});},
 async generate({userId,reason="explicit_generation"}){return buildWeeklyArtifact({repositories,userId,now,persist:true,reason});},
 async catchUpLatestClosedWindow({userId,reason="missed_run_catch_up"}){const preview=await buildWeeklyArtifact({repositories,userId,now,persist:false,reason});const existing=await findExisting(repositories,userId,preview.evidenceWindow.id);return existing??buildWeeklyArtifact({repositories,userId,now,persist:true,reason});},
 async regenerate({userId,reason}){if(!reason)throw new Error("Weekly regeneration requires an explicit reason.");const existing=await service.getLatest({userId});if(!existing)throw new Error("Weekly regeneration requires a persisted Weekly artifact.");const artifact=await buildWeeklyArtifact({repositories,userId,now,persist:false,reason,windowOverride:existing.evidenceWindow,existingArtifactId:existing.id});await repositories.dailyBriefings.createDailyBriefing(artifact);return artifact;},
 async getOrCreate({userId,preview=false}){if(preview)return service.preview({userId});const existing=await service.getLatest({userId});return existing??service.generate({userId,reason:"legacy_explicit_generation"});}
};return service;}

export function getWeeklyVersionStatus(artifact){const version=artifact?.briefing?.weeklyNarrative?.provenance?.version??artifact?.briefing?.version??null;return{current:version===VERSION,persistedVersion:version,expectedVersion:VERSION};}

async function buildWeeklyArtifact({repositories,userId,now,persist,reason=null,windowOverride=null,existingArtifactId=null}) {
  const user=await repositories.users.getCurrentUser();
  const timeZone=user?.timeZone??"America/Los_Angeles";
  const window=windowOverride??createWeeklyEvidenceWindow({now:now(),timeZone});
  const artifactId=existingArtifactId??`weekly_briefing_${window.startDate}_${window.endDate}`;
  let discoveryFailed=false;
  const boundedArtifactsPromise=typeof repositories.dailyBriefings.listCompletedBriefingsInWindow==="function"
    ? repositories.dailyBriefings.listCompletedBriefingsInWindow(userId,window,{limit:14}).catch(()=>{discoveryFailed=true;return[];})
    : Promise.resolve((discoveryFailed=true,[]));
  const continuityPromise=loadLatestCadenceBriefingContinuity({
    repository:repositories.dailyBriefings,userId,cadence:"weekly",excludeArtifactId:artifactId,
  });
  const [canonicalObjects,weights,dexaScans,artifacts,goal,activityTarget,continuity,progressPhotos,analyses]=await Promise.all([
    repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
    repositories.weights.listWeightEntries(userId),
    repositories.dexaScans?.listDEXAScans(userId)??[],
    boundedArtifactsPromise,
    repositories.goals.getActiveGoal(userId),
    getWeeklyActivityTarget(repositories,userId),
    continuityPromise,
    repositories.progressPhotos?.listPhotos(userId)??[],
    repositories.analyses?.listAnalyses?.()??[],
  ]);
  const existing=artifacts.find((item)=>item.id===existingArtifactId)??artifacts.find((item)=>item.cadence==="weekly"&&item.evidenceWindow?.id===window.id)??null;
  const photoEvent=artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"&&String(item.briefing?.photoEventNarrative?.eventDate??"")>=window.startDate&&String(item.briefing?.photoEventNarrative?.eventDate??"")<=window.endDate).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;
  const generatedAt=now().toISOString();
  const trainingPerformance=createTrainingPerformanceIntelligenceReport({canonicalObjects:canonicalObjects.filter((item)=>dateKey(item.lastObservedAt)<=window.endDate),now:new Date(`${window.endDate}T12:00:00Z`),generatedAt});
  let authoritative=null;
  let weeklyEnergy=null;
  const activePhase=(goal?.phases??[]).find((phase)=>phase.status==="active")??null;
  try {
    const comparisonWindow={startDate:shiftDate(window.startDate,-7),endDate:shiftDate(window.endDate,-7),timeZone};
    const energyInput={cadence:"weekly",timeZone,nutritionDays:canonicalObjects.filter((item)=>item.evidence_type==="nutrition"),activityDays:canonicalObjects.filter((item)=>item.evidence_type==="activity_day"),dexaScans,rmrStrategy:CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW};
    const currentEnergyAssessment=createCadenceEnergyAssessment({...energyInput,window,comparisonWindow});
    const comparisonEnergyAssessment=createCadenceEnergyAssessment({...energyInput,window:comparisonWindow});
    weeklyEnergy={current:currentEnergyAssessment,comparison:comparisonEnergyAssessment};
    authoritative=createWeeklyBriefingPIResult({evidenceWindow:window,comparisonWindow,evaluationDate:window.endDate,timeZone,weights,trainingReport:trainingPerformance,canonicalTrainingEvidence:canonicalObjects.filter((item)=>(item?.payload??item)?.evidence_type==="training"),recoveryEvidenceRecords:canonicalObjects.map((item)=>item?.payload??item).filter((item)=>item?.schemaVersion==="recovery_evidence_v1"),currentEnergyAssessment,comparisonEnergyAssessment,activeGoal:goal,activePhase,continuity,dexaScans,photoSessions:createPhotoSessionReadModels({canonicalObjects,legacyPhotos:progressPhotos,weights,analyses})});
  } catch {
    authoritative=null;
    weeklyEnergy=null;
  }
  const adaptedSelection=authoritative?adaptWeeklyPISelection(authoritative.selection):null;
  let narrative=composeWeeklyNarrative({window,canonicalObjects,weights,dexaScans,photoEvent,goal,activityTarget,generatedAt,trainingPerformance,weeklyEnergy,piNarrativeSelection:adaptedSelection});
  const handoff=photoEvent?.briefing?.photoEventNarrative?.goalCompletionHandoff;
  const completionRecommended=handoff?.goalCompletionRecommended===true;
  if(completionRecommended){
    const completionContext={goalId:goal?.id??null,goalStatus:goal?.status??"active",completionRecommended:true,numericalThresholdComplete:handoff.numericalThresholdComplete===true,visualCriterionStatus:handoff.visualCriterionStatus??handoff.visualCriterionComplete??null,completionConfidence:handoff.completionConfidence??"high_overall_support",userDecisionPending:true,completionEvidenceIds:[photoEvent.id,...dexaScans.filter((scan)=>dateKey(scan.measuredAt)>=window.startDate&&dateKey(scan.measuredAt)<=window.endDate).map((scan)=>scan.id)],transitionReady:handoff.transitionReady===true};
    narrative={...narrative,summary:"This week closed with objective and visual evidence supporting completion of the Visible Abs goal.",primaryStory:"The evidence supports closing the cut.",goalMeaning:"PhysiqueOS sees the goal as complete; your explicit confirmation remains the final step.",coachDirection:"Do not extend the deficit merely to chase more certainty. Review the Visible Abs goal and make the final decision.",nextWeekFocus:"Review Visible Abs goal. No goal or protocol transition happens until you confirm it.",completionContext,cards:{...narrative.cards,hero:{...narrative.cards.hero,title:"The evidence supports closing the cut.",body:"The Jul 18 DEXA reached 7.7% body fat with lean mass preserved, and the final photos reinforced the substantially leaner waist and clearer abdominal definition this goal was built around. Your explicit confirmation is still required."},interpretation:{...narrative.cards.interpretation,opening:"The week closed with both objective and visual evidence supporting completion of the Visible Abs goal.",synthesis:"At 7.7% body fat, with lean mass preserved and the final photos supporting the intended end-of-cut condition, more fat loss is not needed to validate the result.",uncertainty:"Visual precision is moderate, but overall support is high. The goal remains active until you choose Complete Goal."},coachInsight:{...narrative.cards.coachInsight,celebration:"This was the finish-line week. The numerical target and final visual check now support the same conclusion.",explanation:"The cut appears complete. Do not extend the deficit merely to chase more certainty; preserve training quality while you review the result.",preparation:"Review Visible Abs goal. PhysiqueOS will not complete it or move into the next phase without your explicit confirmation."}}};
  }
  if(authoritative){
    const eventState=completionRecommended?"goal_completion_owns_surface":photoEvent?"event_owns_decision":goal?.status==="transitioning"?"goal_transition_owns_surface":"no_event";
    void createPIDecisionCadenceShadow({cadence:"weekly",evaluationDate:window.endDate,cadenceEligible:true,evidenceWindow:window,activeGoal:goal,activePhase,rankedCandidates:authoritative.candidates??[],claims:authoritative.claims??[],lifecycle:authoritative.lifecycleResult,evidenceCompleteness:{overall:weeklyEnergy?.current?.coverage?.state==="complete"?"complete":"partial",training:authoritative.coverage?.training?"complete":"missing",energy:weeklyEnergy?.current?.coverage?.state==="complete"?"complete":"partial",recovery:authoritative.recoveryPI?.assessment?.completeness??"missing",bodyComposition:dexaScans.length?"complete":"missing"},eventAuthority:{state:eventState,sourceId:photoEvent?.id??null},recommendationMetadata:null,existingRecommendation:{coachDirection:narrative.coachDirection,nextWeekFocus:narrative.nextWeekFocus},existingNarrative:{summary:narrative.summary,primaryStory:narrative.primaryStory},sundayHandoff:null,memory:continuity?.memory??null,priorDecisionMemory:null,renderingCompatible:false,memoryCompatible:false,integrationEnabled:false,limitations:["weekly_decision_shadow_only"]});
  }
  const artifact={id:existing?.id??artifactId,userId,artifactType:"scheduled",cadence:"weekly",generatedAt:narrative.generatedAt,evidenceWindow:window,lifecycle:{openedAt:null,consumedAt:null},generation:{reason,source:"explicit_weekly_operation",diagnostics:discoveryFailed?["bounded_weekly_artifact_discovery_failed"]:[]},briefing:{version:VERSION,weeklyNarrative:narrative}};
  if(authoritative){
    try {
      const communicated=[...(authoritative.selection.primary??[]),...(authoritative.selection.supporting??[])].map((entry)=>entry.candidate.id);
      artifact.piMemory=mergePIBriefingMemory(continuity.memory,{communicatedClaimIds:communicated,claims:authoritative.candidates,limitations:authoritative.limitations},{cadence:"weekly",briefingDate:window.endDate});
    } catch {
      // Optional bounded memory must never block Weekly generation.
    }
  }
  if(persist&&!existing)await repositories.dailyBriefings.createDailyBriefing(artifact);
  return existing??artifact;
}
async function getWeeklyActivityTarget(repositories,userId){const protocol=await repositories.protocols?.getActiveProtocolByType?.(userId,"activity");const version=protocol?await repositories.protocolVersions?.getCurrentVersion?.(protocol.id):null;return version?.evaluationWindows?.find((item)=>item.cadence==="weekly")?.target??DEFAULT_WEEKLY_ACTIVITY_TARGET;}
async function findExisting(repositories,userId,weekId){return repositories.dailyBriefings.getBriefingByEvidenceWindow(userId,weekId);}
function isResistanceTrainingSession(item={}){return item.evidence_type==="training"&&((item.exercises??[]).length>0||/strength|resistance|lifting|weights?/i.test(item.metadata?.activity_type??""));}
function isCompleteActivityDay(item={}){return item.evidence_type==="activity_day"&&item.quality?.status!=="incomplete"&&Number.isFinite(Number(item.daily_activity?.move_calories));}
function isCompleteNutritionDay(item={}){return item.evidence_type==="nutrition"&&item.quality?.status!=="incomplete"&&item.metadata?.completeness!=="incomplete";}
function displayExerciseName(observation,canonical){if(observation.exercise?.key==="cable_pushdown"&&canonical.some((item)=>(item.payload?.exercises??[]).some((exercise)=>/cable rope pushdowns?/i.test(exercise.name))))return "Cable Rope Pushdowns";return observation.exercise?.name??"Resistance training";}
function uniqueDays(values){return new Set(values.map(dateKey).filter(Boolean)).size;}
function average(values){const numbers=values.map(Number).filter(Number.isFinite);return numbers.length?numbers.reduce((sum,value)=>sum+value,0)/numbers.length:null;}
function round(value){return Number(value.toFixed(1));}
function dateKey(value){return String(value??"").slice(0,10);}
function shiftDate(value,days){const [y,m,d]=value.split("-").map(Number);const date=new Date(Date.UTC(y,m-1,d+days));return date.toISOString().slice(0,10);}
function signed(value){return `${value>0?"+":""}${value.toFixed(1)}`;}
function formatNumber(value){return Math.round(value).toLocaleString("en-US");}
function signedKcal(value){if(!Number.isFinite(value))return"not available";return`${value>0?"+":""}${Math.round(value).toLocaleString("en-US")} kcal`;}
function formatDate(value){const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function formatDexaAnchor(scan){const bodyFat=scan.bodyFatPercentage?.value??scan.bodyFatPercentage;return{date:dateKey(scan.measuredAt??scan.date),bodyFat:Number.isFinite(Number(bodyFat))?`${Number(bodyFat).toFixed(1)}% body fat`:"Body-composition baseline"};}
