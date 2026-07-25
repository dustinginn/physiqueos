import { createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeWeeklyNarrative } from "./WeeklyNarrativeService";

export const WEEKLY_V4_PREVIEW_VERSION = "weekly_briefing_v4_preview";

export function createWeeklyBriefingV4PreviewService({repositories,now=()=>new Date()}={}) {
  return { async preview({userId,previewDate}={}) {
    const user=await repositories.users.getCurrentUser();
    const at=previewDate?new Date(`${previewDate}T12:00:00Z`):now();
    const timeZone=user?.timeZone??"America/Los_Angeles";
    const window=createWeeklyEvidenceWindow({now:at,timeZone});
    const [canonicalObjects,weights,dexaScans,artifacts,currentGoal]=await Promise.all([
      repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId??user?.id),
      repositories.weights.listWeightEntries(userId??user?.id),
      repositories.dexaScans.listDEXAScans(userId??user?.id),
      repositories.dailyBriefings.listDailyBriefings(userId??user?.id),
      repositories.goals.getActiveGoal(userId??user?.id),
    ]);
    const canonicalArtifact=artifacts.find((item)=>item.cadence==="weekly"&&item.evidenceWindow?.id===window.id)??null;
    const photoEvent=newestInWindow(artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"),window);
    const midweekArtifact=artifacts.find((item)=>item.cadence==="midweek"&&item.evidenceWindow?.startDate===window.startDate&&item.evidenceWindow?.endDate<=window.endDate)??null;
    const historicalGoal=resolveHistoricalGoal({canonicalArtifact,currentGoal,window});
    const base=canonicalArtifact?.briefing?.weeklyNarrative??composeWeeklyNarrative({window,canonicalObjects,weights,dexaScans,photoEvent,goal:historicalGoal,generatedAt:at.toISOString()});
    return composeWeeklyBriefingV4Preview({base,window,canonicalObjects,dexaScans,midweekArtifact,historicalGoal,generatedAt:at.toISOString()});
  }};
}

export function composeWeeklyBriefingV4Preview({base,window,canonicalObjects=[],dexaScans=[],midweekArtifact=null,historicalGoal=null,generatedAt=new Date().toISOString()}={}) {
  const narrative=structuredClone(base);
  const energy=weeklyEnergy({canonicalObjects,window,dexaScans});
  const continuity=resolveContinuity(midweekArtifact,energy,narrative.cards.interpretation?.domains??[]);
  const goalName=historicalGoal?.title??goalNameFromNarrative(narrative)??"Current Goal";
  const energyDomain=narrative.cards.interpretation?.domains?.find((item)=>item.domain==="energy_balance");
  if(energyDomain){energyDomain.highlight=energy.conclusion;energyDomain.insight=energy.opportunity??`The completed week supports repeating the behaviors that kept ${goalName} moving forward.`;}
  narrative.generatedAt=generatedAt;
  narrative.preview={version:WEEKLY_V4_PREVIEW_VERSION,readOnly:true,canonicalPresentation:"weekly_narrative_v5_1",historicalGoalId:historicalGoal?.id??narrative.completionContext?.goalId??null,midweekIntegrated:Boolean(midweekArtifact),energy};
  narrative.cards.interpretation={...narrative.cards.interpretation,title:"What the completed week established",opening:continuity.opening??narrative.cards.interpretation.opening,synthesis:continuity.synthesis??narrative.cards.interpretation.synthesis,uncertainty:continuity.uncertainty??narrative.cards.interpretation.uncertainty};
  narrative.cards.coachInsight={...narrative.cards.coachInsight,title:"Chapter Ahead",celebration:narrative.cards.coachInsight.celebration,explanation:directionFor({energy,narrative}),preparation:prioritiesFor({energy,narrative}).slice(0,3).join(" ")};
  return narrative;
}

function resolveHistoricalGoal({canonicalArtifact,currentGoal,window}){const id=canonicalArtifact?.briefing?.weeklyNarrative?.completionContext?.goalId;if(id==="goal_visible_abs_at_rest")return{id,title:"Visible Abs at Rest",historicalWindow:window.id};return currentGoal;}
function goalNameFromNarrative(narrative){if(/Visible Abs/i.test(`${narrative.goalMeaning??""} ${narrative.cards?.hero?.body??""}`))return"Visible Abs at Rest";return null;}
function weeklyEnergy({canonicalObjects,window,dexaScans}){const latestDexa=[...dexaScans].filter((item)=>dateKey(item.measuredAt??item.date)<=window.endDate).sort((a,b)=>String(b.measuredAt??b.date).localeCompare(String(a.measuredAt??a.date)))[0]??null;const rmr=number(latestDexa?.restingMetabolicRate?.value);const days=dateKeys(window).map((date)=>{const nutrition=findPayload(canonicalObjects,"nutrition",date),activity=findPayload(canonicalObjects,"activity_day",date);const intake=number(nutrition?.daily_totals?.calories),active=number(activity?.daily_activity?.move_calories),expenditure=rmr!=null&&active!=null?rmr+active:null,balance=intake!=null&&expenditure!=null?intake-expenditure:null;return{date,intake,activeCalories:active,expenditure,balance,complete:balance!=null};});const complete=days.filter((item)=>item.complete),averageBalance=complete.length?complete.reduce((sum,item)=>sum+item.balance,0)/complete.length:null;const conclusion=averageBalance==null?"The completed week did not establish maintenance because food or activity evidence remained incomplete.":averageBalance<-150?"The completed week confirmed that intake remained below estimated maintenance.":averageBalance>150?"The completed week showed intake above estimated maintenance.":"The completed week supported the current maintenance estimate.";const opportunity=complete.length<7?`Complete all seven nutrition and activity days next week; ${complete.length} comparable days were available this week.`:averageBalance<-150?"Increase intake modestly next week while keeping activity stable.":null;return{restingEnergy:rmr,days,completeDays:complete.length,averageBalance,conclusion,opportunity};}
function resolveContinuity(artifact,energy,domains){if(!artifact)return{};const threads=artifact.briefing?.openCoachingThreads??[];const hasMaintenance=threads.some((item)=>item.key==="maintenance_range_holding"),hasTraining=threads.some((item)=>item.key==="training_response_continues"),training=domains.find((item)=>item.domain==="training");const conclusions=[];if(hasMaintenance)conclusions.push(energy.conclusion);if(hasTraining&&training)conclusions.push(`The second half of the week reinforced the training read: ${lowerFirst(training.insight)}`);return conclusions.length?{opening:conclusions.join(" "),synthesis:"The full week turned Wednesday’s open questions into one coaching direction without changing the evidence standard.",uncertainty:energy.completeDays<7?"The remaining uncertainty comes from incomplete daily energy evidence, not from conflicting outcomes.":"The completed week provided enough evidence to close the midweek coaching loop."}:{};}
function directionFor({energy,narrative}){if(narrative.completionContext?.completionRecommended)return"The week proved the cut reached its intended outcome. Preserve training quality and do not extend the deficit merely to chase more certainty.";if(energy.averageBalance!=null&&energy.averageBalance<-150)return"Training can remain the priority, but energy intake should rise modestly so next week supports productive adaptation.";return"Repeat the execution that worked this week and make only the smallest evidence-supported adjustment.";}
function prioritiesFor({energy,narrative}){if(narrative.completionContext?.completionRecommended)return["Review the Visible Abs goal and make the explicit completion decision.","Protect training quality while moving out of the deficit.","Carry the successful activity consistency into the next chapter."];return[energy.averageBalance!=null&&energy.averageBalance<-150?"Add a modest amount of food while holding activity steady.":"Keep intake and activity consistent.","Progress one priority movement with clean execution.",energy.completeDays<7?"Complete all seven nutrition and activity logs.":"Repeat the logging consistency that made this week clear."];}
function newestInWindow(items,window){return items.filter((item)=>{const date=dateKey(item.briefing?.photoEventNarrative?.eventDate??item.generatedAt);return date>=window.startDate&&date<=window.endDate;}).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;}
function findPayload(items,type,date){return items.find((item)=>dateKey(item.lastObservedAt??item.payload?.observed_at)===date&&(item.evidence_type??item.payload?.evidence_type)===type)?.payload??null;}
function dateKeys(window){const output=[];for(let date=window.startDate;date<=window.endDate;date=shift(date,1))output.push(date);return output;}
function shift(value,days){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function dateKey(value){return String(value??"").slice(0,10);}
function number(value){if(value==null||value==="")return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function lowerFirst(value){const text=String(value??"");return text?text[0].toLowerCase()+text.slice(1):text;}
