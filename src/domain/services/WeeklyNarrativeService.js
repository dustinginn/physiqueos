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
import { resolveWeeklyBriefingContext } from "./WeeklyBriefingContextService";
import {
  artifactIdForWeeklyWindow,
  createWeeklyClosedWindowContract,
} from "./WeeklyClosedWindowContract";
import {
  createFounderWeeklyBriefingPersistenceService,
  createWeeklyPreparedCommit,
  WeeklyPersistenceOutcome,
} from "./WeeklyBriefingPersistenceService";
import { loadApplicationCanonicalRuntime } from "../../application/runtime/ApplicationCanonicalRuntime";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";
import { createBriefingGoalConfidenceBlock } from "./BriefingGoalConfidencePresentationService";
import { createCanonicalBriefingConfidencePublicationService } from "./CanonicalBriefingConfidencePublicationService";
import { createPICadenceBriefingLifecycleService } from "./PICadenceBriefingLifecycleService";
import { createWeeklyEnergyProgressModel } from "./WeeklyBriefingPresentationService";
import { composePIEditorialParagraph } from "./PIEditorialTranslationService";
import { createWeeklyTrainingPresentationModel } from "./WeeklyTrainingPresentationService";
import { resolveUserFacingObjectLanguage } from "./UserFacingObjectLanguageService";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";
import { attachBriefingDependencyManifest } from
  "./BriefingDependencyManifestService";

const VERSION = "weekly_narrative_v5_2";
const DEFAULT_WEEKLY_ACTIVITY_TARGET = 7000;

export function composeWeeklyNarrative({ window, canonicalObjects = [], weights = [], dexaScans = [], photoEvent = null, goal = null, context = null, generatedAt = new Date().toISOString(), activityTarget = DEFAULT_WEEKLY_ACTIVITY_TARGET, trainingPerformance = null, trainingPerformanceEvents = [], weeklyEnergy = null, piNarrativeSelection = null } = {}) {
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
  const photoSummary = photoNarrative ? summarizePhotoEvent(photoNarrative) : null;
  const report = trainingPerformance??createTrainingPerformanceIntelligenceReport({canonicalObjects:active.filter((item)=>dateKey(item.lastObservedAt)<=window.endDate),now:new Date(`${window.endDate}T12:00:00Z`)});
  const energyPresentation=createWeeklyEnergyProgressModel(weeklyEnergy?.current);
  const trainingPresentation=createWeeklyTrainingPresentationModel({window,trainingDays,trainingReport:report,piObservations:context?.pi?.observations??[],context,energy:energyPresentation,performanceEvents:trainingPerformanceEvents});
  const trainingCopy=weeklyTrainingCoachCopy(trainingPresentation,{semanticGoalType:context?.semanticGoalType??"unknown"});
  const weeklyPrs = (report.exerciseObservations??[]).filter((item)=>item.explanation_data?.pr_detection?.detected&&within(item.evidence_date_range?.end));
  const improving = (report.exerciseObservations??[]).filter((item)=>item.status==="improving"&&within(item.evidence_date_range?.end));
  const regression = (report.exerciseObservations??[]).filter((item)=>item.status==="regressing"&&within(item.evidence_date_range?.end));
  const prLabel = weeklyPrs[0] ? displayExerciseName(weeklyPrs[0], active) : null;
  const overloadLabel = !prLabel&&improving[0] ? displayExerciseName(improving[0],active) : null;
  const prName = exerciseNarrativeReference(prLabel);
  const overloadName = exerciseNarrativeReference(overloadLabel);
  const goalName = context?.activeGoalSummary?.title??goal?.title??"the current goal";
  const semanticGoalType = context?.semanticGoalType??"unknown";
  const latestDexa=[...dexaScans].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)))[0]??null;
  const weeklyAverageText = averageWeight==null?null:`${averageWeight.toFixed(1)} lb weekly average`;
  const heroHighlights = [
    photoSummary
      ? semanticGoalType==="lean_mass_gain"
        ? "📸 Your progress photos documented that recent condition is holding."
        : "📸 Your progress photos added the clearest visual context of the week."
      : null,
    weeklyAverageText?`⚖️ Weight averaged ${averageWeight.toFixed(1)} lb${weeklyLow!=null?` and reached a ${weeklyLow.toFixed(1)} lb weekly low`:""}.`:null,
    prName?`💪 ${sentenceStart(prName)} reached a new performance PR.`:overloadName?`💪 ${sentenceStart(overloadName)} showed supported progressive overload.`:null,
    activityDayCount?`🔥 ${activityDayCount} complete activity days totaled ${formatNumber(activityCalories)} active calories.`:null,
  ].filter(Boolean).slice(0,4);
  const heroHighlightTiles = [
    photoSummary?{domain:"photos",icon:"📸",label:"Photo Context",value:"Current condition documented",detail:"Directional guardrail evidence"}:null,
    weeklyAverageText?{domain:"weight",icon:"⚖️",label:"Weight Trend",value:`${averageWeight.toFixed(1)} lb average`,detail:weeklyLow!=null?`${weeklyLow.toFixed(1)} lb weekly low`:null}:null,
    prLabel?{domain:"training",icon:"💪",label:"Performance",value:`${prLabel} PR`,detail:`${trainingDays} training days`}:overloadLabel?{domain:"training",icon:"💪",label:"Performance",value:overloadLabel,detail:"Supported progressive overload"}:trainingDays?{domain:"training",icon:"💪",label:"Performance",value:`${trainingDays} training days`,detail:"Resistance work completed"}:null,
    activityDayCount?{domain:"energy_balance",icon:"🔥",label:"Activity",value:`${activityDayCount} complete days`,detail:`${formatNumber(activityCalories)} active calories`}:null,
  ].filter(Boolean).slice(0,4);
  const heroMilestone = heroHighlightTiles.length>=3&&activityDayCount===7&&(photoSummary||(semanticGoalType==="fat_loss"&&weightChange<0))
    ? {label:"Weekly Milestone",value:"Execution and outcome remained aligned across the full week."}
    : semanticGoalType==="fat_loss"&&prName&&weightChange<0
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
    photoSummary?{domain:"photos",label:"📸 Progress Photos",highlight:"Your current-period photos added a useful visual guardrail check.",insight:photoSummary}:null,
    averageWeight!=null?{domain:"weight",label:"⚖️ Weight",highlight:`You finished ${Math.abs(weightChange??0).toFixed(1)} lb ${weightChange!=null&&weightChange<0?"lower":"from where you began"}, with a ${averageWeight.toFixed(1)} lb weekly average${weeklyLow!=null?` and ${weeklyLow.toFixed(1)} lb low`:""}.`,insight:`Your weekly pattern matters more than any single weigh-in${previousAverage!=null&&averageWeight<previousAverage?`, and your average stayed below the prior week’s ${previousAverage.toFixed(1)} lb`:""}.`}:null,
    trainingDays?{domain:"training",label:"💪 Training",highlight:trainingCopy.conclusion,insight:trainingCopy.phaseContext}:null,
    activityDayCount?{domain:"energy_balance",label:"🔥 Energy Balance",highlight:`You burned approximately ${formatNumber(activityCalories)} active calories across ${activityDayCount} complete days—${formatNumber(Math.abs(activityDifference))} ${activityDifference>=0?"above":"below"} the ${formatNumber(weeklyActivityTarget)} weekly target.`,insight:`You stayed ${activityAlignment} the planned activity level, which helps explain the week’s weight change. You recorded only ${nutritionCount} complete nutrition day${nutritionCount===1?"":"s"}, so there is not enough information to judge the full week${/visible abs|cut/i.test(goalName)?", although the recorded days supported the cut":""}.`}:null,
  ].filter(Boolean);
  if (weeklyEnergy?.current?.coverage?.pairedDayCount) domains.push({
    domain:"estimated_energy",
    label:"Estimated Energy",
    highlight:`Recorded intake totaled ${formatNumber(weeklyEnergy.current.intake.total)} kcal and estimated expenditure totaled ${formatNumber(weeklyEnergy.current.estimatedExpenditure.total)} kcal across ${weeklyEnergy.current.coverage.pairedDayCount} paired days.`,
    insight:weeklyEnergyInsight(weeklyEnergy),
  });
  const completionEvent = photoNarrative?.goalCompletionHandoff?.goalCompletionRecommended === true;
  const piEditorial = !completionEvent ? renderWeeklyPISelection(piNarrativeSelection) : null;
  const editorial = createGoalAwareEditorial({ context, semanticGoalType, goalName, weightChange, trainingDays, prName, photoSummary, weeklyEnergy, piEditorial });
  const celebration = editorial.celebration;
  const id=`weekly_narrative_${window.startDate}_${window.endDate}`;
  return {
    id,weekId:window.id,weekStart:window.startDate,weekEnd:window.endDate,generatedAt,
    summary:editorial.summary,primaryStory:editorial.summary,primaryEvidence:photoSummary?"photo_event":weightChange!=null?"weight":"execution",
    supportingEvidence:domains.map((item)=>item.highlight),keyChanges:domains.map((item)=>item.highlight),stableSignals:[],risks:nutritionCount<7?[`Only ${nutritionCount} complete nutrition days were available.`]:[],wins:[celebration],goalMeaning:editorial.goalMeaning,coachDirection:editorial.coachDirection,nextWeekFocus:editorial.nextWeekFocus,
    cards:{
      hero:{id:`${id}_hero`,title:piEditorial?.title??editorial.heroTitle,body:piEditorial?.body??editorial.heroBody,highlights:heroHighlights,highlightTiles:heroHighlightTiles,milestone:heroMilestone},
      snapshot:{id:`${id}_snapshot`,title:"The completed week",facts},
      progress:{id:`${id}_progress`,title:"What changed",items:[photoSummary?{domain:"Photos",summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,weightChange!=null?{domain:"Weight",summary:`The week finished ${Math.abs(weightChange).toFixed(1)} lb ${weightChange<0?"lower":"higher"} than it began.`}:null].filter(Boolean),energy:energyPresentation,weight:{points:weekWeights.map((item)=>({date:item.measuredAt,value:item.weight.value})),weeklyAverage:averageWeight,weeklyLow,change:weightChange},dexa:{occurredThisWeek:Boolean(dexaCount),latest:latestDexa?formatDexaAnchor(latestDexa):null},photo:photoNarrative?{thumbnailHref:photoNarrative.activeViews?.find((view)=>view.poseId==="front-relaxed")?.imageHref??photoNarrative.activeViews?.[0]?.imageHref??null,summary:photoSummary,href:`/briefings/photo/${photoEvent.trigger.evidenceId}`}:null,training:{completedDays:trainingDays,totalDays:7,presentation:trainingPresentation},activity:{completedDays:activityDayCount,totalDays:7,totalActiveCalories:activityCalories,dailyAverage:activityAverage,weeklyTarget:weeklyActivityTarget,difference:activityDifference}},
      interpretation:{id:`${id}_interpretation`,title:"Why this week mattered",opening:piEditorial?.opening??editorial.opening,domains,synthesis:piEditorial?.synthesis??editorial.synthesis,uncertainty:editorial.uncertainty},
      coachInsight:{id:`${id}_coach`,title:"Coach’s Insight",celebration:trainingDays?`This was a strong week. ${trainingCopy.conclusion} ${trainingCopy.phaseContext}`:`This was a strong week. ${celebration}`,explanation:editorial.explanation,preparation:editorial.preparation},
    },
    context,references:weekly.map((item)=>item.canonicalId),provenance:{version:VERSION,photoEventId:photoEvent?.id??null,evidenceWindowId:window.id,trainingPerformanceGeneratedAt:report.generated_at??null},
  };
}

function weeklyTrainingCoachCopy(model, { semanticGoalType } = {}) {
  const counts = model?.counts ?? {};
  if (!model?.comparableCategoryCount) {
    return {
      conclusion: "Training was consistent, but the comparison history is not broad enough to call this a weekly progression trend.",
      phaseContext: semanticGoalType === "lean_mass_gain"
        ? "That is encouraging for building muscle, but it cannot confirm new lean mass."
        : "Protecting training quality matters, but one week cannot confirm new lean mass.",
    };
  }
  if (counts.regressing > 0) {
    return {
      conclusion: "Training slipped across more than one comparable area this week.",
      phaseContext: "That deserves attention before assuming the current plan is fully supporting performance.",
    };
  }
  if (counts.improving > 0) {
    return {
      conclusion: "Training progressed across multiple comparable areas this week.",
      phaseContext: semanticGoalType === "lean_mass_gain"
        ? "That is the response we want while building muscle, although a later DEXA still has to confirm tissue change."
        : "That is a strong sign that training quality is holding.",
    };
  }
  return {
    conclusion: "Training held steady across the areas we could compare.",
    phaseContext: "At this stage, holding performance is a useful result and supports keeping the plan steady.",
  };
}

function summarizePhotoEvent(photoNarrative) {
  const summary = photoNarrative.overallSummary
    ?? photoNarrative.cardContent?.hero?.body
    ?? photoNarrative.cardContent?.progress?.summary;
  return summary
    ? `The current-period photo session added directional visual context: ${summary}`
    : "The current-period photo session provided directional guardrail context without establishing a measured body-composition change.";
}

function createGoalAwareEditorial({
  context, semanticGoalType, goalName, weightChange, trainingDays, prName,
  photoSummary, weeklyEnergy, piEditorial,
}) {
  const paired = weeklyEnergy?.current?.coverage?.pairedDayCount ?? 0;
  const missing = Math.max(0, 7 - paired);
  const balance = weeklyEnergy?.current?.netBalance?.average;
  const direction = !Number.isFinite(balance) ? "unresolved"
    : balance < -100 ? "below likely maintenance"
      : balance > 100 ? "above likely maintenance" : "near likely maintenance";
  const coverage = paired
    ? `you logged both intake and expenditure on ${paired} day${paired === 1 ? "" : "s"}${missing ? `, while ${missing} day${missing === 1 ? "" : "s"} still had one side missing` : " across the full week"}`
    : "we do not yet have a day with both intake and expenditure logged";
  const milestone = context?.futureMilestone?.label ?? null;
  const training = prName ? `${prName} improved` : trainingDays ? `${trainingDays} resistance-training days were recorded` : "Training evidence was limited";

  if (semanticGoalType === "fat_loss") {
    return {
      summary: "This week gave us a clearer read on how the cut is progressing.",
      heroTitle: "The cut stayed on track this week.",
      heroBody: "Your weight, training, calorie intake, and body composition still point in the same direction.",
      opening: "This week, the useful question is whether you are getting leaner without giving up training quality.",
      synthesis: "Judge the cut by the combined pattern in weight, training, nutrition, and body composition rather than any single number.",
      uncertainty: milestone ? `${milestone} will show whether the recent direction holds.` : "A future DEXA will be needed to confirm the body-composition result.",
      celebration: prName ? `${prName} improved while the cut continued.` : "You stayed consistent without overreacting to one metric.",
      explanation: "Protect training quality and judge fat loss from the full pattern.",
      preparation: milestone ? `Keep the current plan steady until ${milestone}.` : "Keep the current plan steady until the evidence supports a reviewed change.",
      goalMeaning: "The plan is still aimed at finishing the cut without sacrificing muscle.",
      coachDirection: "Continue the plan while weight, training, and recovery remain aligned with the cut.",
      nextWeekFocus: milestone ? `Keep conditions steady so ${milestone} gives us a clean comparison.` : "Complete another consistent week before making a change.",
    };
  }

  if (semanticGoalType === "lean_mass_gain") {
    const calibration = context?.activePhase?.name === "Establish Maintenance"
      && context?.operatingState?.value === "calibration";
    return {
      summary: calibration ? "We are getting closer to understanding how much food will support stable weight and stronger training." : "This week gave us a clearer read on your muscle-building phase.",
      heroTitle: piEditorial?.title ?? (calibration ? "Keep finding the intake that supports training without moving weight too quickly." : "Training and nutrition frame this week."),
      heroBody: calibration
        ? `Your calorie balance was ${direction}, and ${coverage}. ${training}. That helps us tune the plan, but it is too early to claim new muscle.`
        : `${training}. Weight and calorie intake help explain the week, while a later DEXA will tell us whether lean mass changed.`,
      opening: calibration
        ? "This week was about learning whether intake is supporting maintenance while training and the body-fat guardrail remain stable."
        : "This week was about whether training is responding well enough to support building muscle.",
      synthesis: `${training}. Your calorie balance was ${direction}; ${coverage}. ${photoSummary ? "Progress photos can show whether your condition is holding, but they cannot measure new muscle." : "A later DEXA is still needed to confirm body-composition change."}`,
      uncertainty: milestone
        ? `Your last DEXA is the starting point. ${milestone} will show whether lean mass has changed.`
        : "Your last DEXA is the starting point; a later comparable scan will be needed to confirm change.",
      celebration: prName ? `${prName} improved, which is encouraging even though one lift cannot prove new muscle.` : "You gave us more information without forcing a decision too early.",
      explanation: "Better training supports building muscle, but one lift or a small weight change cannot confirm new tissue.",
      preparation: paired < 7
        ? `Hold the current plan and log intake and expenditure more completely${milestone ? ` before ${milestone}` : ""}.`
        : `Use the full week to decide whether a small calorie adjustment is warranted${milestone ? ` before ${milestone}` : ""}.`,
      goalMeaning: "The goal is to add muscle while keeping body fat controlled.",
      coachDirection: paired < 7 ? "Keep the plan steady and complete more nutrition logs before changing calories." : "Review the calorie trend without rushing into the next phase.",
      nextWeekFocus: milestone ? `Protect training quality and prepare for ${milestone}.` : "Protect training quality and collect enough complete days to make the next decision confidently.",
    };
  }

  return {
    summary: "This week added useful evidence without establishing a goal-specific conclusion.",
    heroTitle: "The week is best treated as neutral evidence.",
    heroBody: "Training, Weight, Energy, and body-composition evidence remain available, but active goal context is incomplete.",
    opening: "This week’s evidence can be described without assuming a cut, maintenance phase, or lean-gain objective.",
    synthesis: "Keep each measured direction in context and avoid converting incomplete evidence into a goal judgment.",
    uncertainty: milestone ? `${milestone} is the next active measurement.` : "No future authoritative measurement is currently active.",
    celebration: "You collected useful evidence without forcing an unsupported conclusion.",
    explanation: "A goal-safe interpretation avoids treating weight or visual change as inherently positive.",
    preparation: "Continue the established plan until canonical goal context supports a reviewed recommendation.",
    goalMeaning: "Active goal semantics were unavailable, so the Weekly interpretation remains neutral.",
    coachDirection: "Hold the established plan and restore authoritative goal context before changing direction.",
    nextWeekFocus: "Gather complete evidence and resolve the active goal context.",
  };
}

function weeklyEnergyInsight({current,comparison}){const prior=comparison?.netBalance?.average;const comparisonText=Number.isFinite(prior)?` The prior comparable week averaged ${signedKcal(prior)} per paired day.`:" The prior comparable week is incomplete.";return `Estimated balance was ${signedKcal(current.netBalance.total)} for the recorded week, averaging ${signedKcal(current.netBalance.average)} per paired day.${comparisonText} Coverage included ${current.coverage.completePairedDayCount} complete and ${current.coverage.partialPairedDayCount} partial paired days. Expenditure uses the eligible DEXA RMR plus active calories and remains an estimate.`;}
function renderWeeklyPISelection(selection) {
  const candidate = selection?.primary;
  if (!candidate) return null;
  if (candidate.editorialTemplateKey === "weekly_body_fat_guardrail") {
    return {
      title: "Your progress photos are the most useful check this week.",
      body: "The photos can show whether your physique is moving in the right direction, but they cannot measure body fat.",
      opening: "Your latest progress photos give us a useful early look at whether your condition is changing.",
      synthesis: "Keep the photo conditions consistent and wait for a DEXA before putting a number on the change.",
    };
  }
  if (candidate.editorialTemplateKey === "weekly_direct_training") {
    return {
      title: "Training told us the most this week.",
      body: "Your major lifts showed the clearest change, while weight and calorie intake helped explain the setting around it.",
      opening: "The most important development this week was how your training performed.",
      synthesis: "Use the overall training pattern to guide the week ahead, not one weigh-in or calorie estimate.",
    };
  }
  if (candidate.editorialTemplateKey === "weekly_direct_recovery") {
    return {
      title: "Recovery deserves attention this week.",
      body: "Your recovery markers changed enough to affect how we should read training and nutrition.",
      opening: "The way you recovered this week adds important context to your training response.",
      synthesis: "Keep training and nutrition steady enough to see whether the recovery change persists.",
    };
  }
  if (candidate.editorialTemplateKey === "weekly_energy_calibration") {
    return {
      title: "Your calorie balance is the most useful part of this week.",
      body: composePIEditorialParagraph({
        observation: "Your logged intake and estimated expenditure give us the clearest picture of whether you are eating enough",
        interpretation: "The estimate helps us understand the direction, but it cannot establish your exact maintenance calories",
        whyItMatters: "That distinction keeps us from changing the plan based on false precision",
      }),
      opening: "Your intake versus expenditure gives us the most useful context for this week.",
      synthesis: "Use the estimate to guide the next week, while letting weight and training show whether the plan is actually working.",
    };
  }
  if (candidate.relationshipKind === "training_energy_relationship") {
    const text = trainingEnergyWeeklyText(
      candidate.renderingContext?.relationshipState
    );
    return text ? {
      title: "Training and nutrition help explain each other this week.",
      body: text,
      opening: text,
      synthesis: "Use the pattern as context, without assuming calorie estimates caused the training result.",
    } : null;
  }
  if (
    candidate.relationshipKind === "recovery_training_relationship" ||
    candidate.relationshipKind === "recovery_energy_relationship"
  ) {
    const text = recoveryWeeklyText(
      candidate.renderingContext?.relationshipState
    );
    return text ? {
      title: "Recovery helps explain this week.",
      body: text,
      opening: text,
      synthesis: "Use the pattern to guide what you watch next without assuming one change caused the other.",
    } : null;
  }
  return {
    title: "Training, weight, and nutrition need to be read together.",
    body: "The clearest conclusion comes from how those parts moved together, not from any one number.",
    opening: "Your week makes more sense when training, weight, and nutrition are viewed together.",
    synthesis: "Keep each measure in its proper role and use the overall pattern to guide the week ahead.",
  };
}
function recoveryWeeklyText(state){return({training_progress_with_stable_recovery:"Training improved while Recovery indicators remained stable.",training_progress_with_improving_recovery:"Training and Recovery indicators improved together.",training_progress_despite_strained_recovery:"Training improved despite weaker Recovery indicators.",training_stability_with_strained_recovery:"Training remained stable while Recovery indicators weakened.",training_decline_with_strained_recovery:"Training declined while Recovery indicators also weakened.",training_decline_despite_stable_recovery:"Training declined even though Recovery indicators remained stable.",training_volume_growth_with_stable_recovery:"Training volume increased while Recovery indicators remained stable.",training_volume_growth_with_declining_recovery:"Training volume increased while Recovery indicators weakened.",recovery_stability_with_positive_energy_support:"Recovery indicators remained stable while estimated Energy support was positive.",recovery_stability_with_neutral_energy_support:"Recovery indicators remained stable while estimated Energy support was near neutral.",recovery_strain_with_negative_energy_balance:"Recovery indicators weakened while estimated Energy balance was negative.",recovery_strain_despite_positive_energy_support:"Recovery indicators weakened despite positive estimated Energy support.",recovery_improvement_despite_negative_energy_balance:"Recovery indicators improved despite a negative estimated Energy balance."})[state]??null;}

function trainingEnergyWeeklyText(state){return({progress_with_positive_support:"Training improved while estimated Energy support remained positive.",progress_with_neutral_support:"Training improved while estimated Energy balance remained near neutral.",progress_despite_negative_support:"Training improved despite a negative estimated Energy balance.",stable_with_positive_support:"Training remained stable while estimated Energy balance was positive.",stable_with_declining_support:"Training remained stable while estimated Energy support weakened.",decline_with_negative_support:"Training declined while estimated Energy balance was negative.",decline_despite_positive_support:"Training declined despite positive estimated Energy support.",insufficient:"The Training and Energy relationship remains uncertain because evidence coverage was incomplete."})[state]??null;}

export function createFounderWeeklyNarrativeService({repositories,now=()=>new Date(),weeklyPersistence,confidenceStoreResolver,cadenceLifecycle}={}){
  const publication = cadenceLifecycle ? null :
    createCanonicalBriefingConfidencePublicationService({ now });
  return createWeeklyNarrativeService({
    repositories,
    now,
    weeklyPersistence: weeklyPersistence??createFounderWeeklyBriefingPersistenceService({now}),
    confidenceStoreResolver: confidenceStoreResolver??loadApplicationCanonicalRuntime,
    cadenceLifecycle: cadenceLifecycle ??
      createPICadenceBriefingLifecycleService({ publicationService: publication, now }),
  });
}

export function createWeeklyNarrativeService({repositories,now=()=>new Date(),weeklyPersistence=null,confidenceStoreResolver=()=>null,cadenceLifecycle=null}){const service={
 async getLatest({userId,weekId=null}={}){if(weekId)return findExisting(repositories,userId,weekId);return repositories.dailyBriefings.getLatestWeeklyBriefing?repositories.dailyBriefings.getLatestWeeklyBriefing(userId):null;},
 async generateForCurrentWindow({userId,asOf=now()}={}){const user=userId?await repositories.users.getUserById(userId):await repositories.users.getCurrentUser();const resolvedUserId=user?.id??userId;if(!resolvedUserId)return{state:"not_eligible",reason:"user_not_found"};const timeZone=user?.timeZone??"America/Los_Angeles";const coachingUpdates=await createCoachingUpdatesReadService({repositories}).getCurrent({userId:resolvedUserId});if(selectScheduledBriefingCadence({now:asOf,timeZone,coachingUpdates})!=="weekly")return{state:"not_eligible",reason:"not_weekly_day"};try{const artifact=await service.generate({userId:resolvedUserId,reason:"scheduled_weekly_cadence",asOf});return{state:"completed",artifact};}catch(error){return{state:"failed",reason:error?.code??"weekly_persistence_failure",error:typedError(error)};}},
 async preview({userId}){return buildWeeklyArtifact({repositories,userId,now,persist:false,confidenceStoreResolver});},
 async generate({userId,reason="explicit_generation",asOf=null}){const artifact=await buildWeeklyArtifact({repositories,userId,now:asOf?()=>asOf:now,persist:false,reason,confidenceStoreResolver});if(cadenceLifecycle){const result=await publishWeeklyCadence({cadenceLifecycle,artifact,reason,operation:"create"});if(result.committed||result.status==="matched")return result.artifact;const error=new Error(result.error?.message??`Weekly cadence publication failed: ${result.status}`);error.code=result.status;throw error;}const persistence=requireWeeklyPersistence(weeklyPersistence);const baseline=persistence.captureBaseline();const result=await persistence.commit(createWeeklyPreparedCommit({operation:"normal_generation",artifact,baseline,reason}));return committedArtifactOrThrow(result);},
 async prepareClosedWindow({userId,windowContract}){
   const validation=createWeeklyClosedWindowContract(windowContract,{now:now()});
   if(validation.status!=="valid")return validation;
   const {contract}=validation;
   const existing=await findExisting(repositories,userId,contract.window.id);
   if(existing&&!sameWeeklyIdentity(existing,contract))return conflictResult(existing,contract);
   if(existing)return{status:"matched",contract,artifact:existing,preparation:prepareSummary(existing,true)};
   try{
     const baseline=requireWeeklyPersistence(weeklyPersistence).captureBaseline();
     const artifact=await buildWeeklyArtifact({repositories,userId,now,persist:false,reason:contract.reason,windowOverride:contract.window,existingArtifactId:contract.expectedArtifactId,confidenceStoreResolver});
     return{status:"prepared",contract,artifact,baseline,preparation:prepareSummary(artifact,false)};
   }catch(error){return{status:"generation_failure",contract,error:typedError(error)};}
 },
 async catchUpClosedWindow({userId,windowContract}){
   const prepared=await service.prepareClosedWindow({userId,windowContract});
   if(prepared.status==="matched"||prepared.status==="artifact_identity_mismatch")return prepared;
   if(prepared.status!=="prepared")return prepared;
   const {contract,artifact}=prepared;
   const replay=await findExisting(repositories,userId,contract.window.id);
   if(replay&&!sameWeeklyIdentity(replay,contract))return conflictResult(replay,contract);
   if(replay)return{status:"matched",contract,artifact:replay};
   const result=cadenceLifecycle?await publishWeeklyCadence({cadenceLifecycle,artifact,reason:contract.reason,operation:"catch_up"}):await requireWeeklyPersistence(weeklyPersistence).commit(createWeeklyPreparedCommit({operation:"catch_up",artifact,baseline:prepared.baseline,reason:contract.reason}));
   if(cadenceLifecycle){if(result.committed)return{status:result.status,contract,artifact:result.artifact,commit:{revision:result.revision,commitId:result.commitId,updatedAt:result.updatedAt}};return{status:result.status,contract,artifact:result.artifact,error:result.error};}
   if(result.status===WeeklyPersistenceOutcome.CREATED)return{status:"created",contract,artifact:result.artifact,commit:{revision:result.revision,commitId:result.commitId,updatedAt:result.updatedAt}};
   if(result.status===WeeklyPersistenceOutcome.MATCHED)return{status:"matched",contract,artifact:result.artifact};
   return{status:result.status,contract,error:result.error};
 },
 async catchUpLatestClosedWindow({userId,reason="missed_run_catch_up"}){
   const user=await repositories.users.getCurrentUser();
   const timeZone=user?.timeZone??"America/Los_Angeles";
   const window=createWeeklyEvidenceWindow({now:now(),timeZone});
   return service.catchUpClosedWindow({userId,windowContract:{cadence:"weekly",startDate:window.startDate,endDate:window.endDate,briefingDate:window.briefingDate,timeZone,expectedArtifactId:artifactIdForWeeklyWindow(window.startDate,window.endDate),source:"latest_closed_window",reason}});
 },
 async prepareRegeneration({userId,reason,targetArtifactId=null,reconciliationContext=null}){if(!reason)throw new Error("Weekly regeneration requires an explicit reason.");const persistence=requireWeeklyPersistence(weeklyPersistence);const baseline=persistence.captureBaseline();const existing=targetArtifactId?await repositories.dailyBriefings.getBriefingById?.(targetArtifactId)??(await repositories.dailyBriefings.listDailyBriefings?.(userId))?.find((item)=>item.id===targetArtifactId)??null:await service.getLatest({userId});if(!existing)throw new Error("Weekly regeneration requires a persisted Weekly artifact.");if(targetArtifactId&&existing.id!==targetArtifactId)throw new Error("Weekly regeneration target identity changed.");const artifact=await buildWeeklyArtifact({repositories,userId,now,persist:false,reason,windowOverride:existing.evidenceWindow,existingArtifactId:existing.id,ignoreExisting:true,confidenceStoreResolver});artifact.publicationReconciliation={...(artifact.publicationReconciliation??{}),state:"current_after_revision",replacementReason:reason};artifact.revisionProvenance={schemaVersion:"briefing_revision_provenance_v1",priorPublicationId:existing.id,priorPublicationVersion:existing.briefing?.version??existing.version??null,replacementTimestamp:artifact.generatedAt,reason,triggeringDependencies:structuredClone(reconciliationContext?.affectedDependencies??[]),workItemId:reconciliationContext?.workItemId??null,inputFingerprint:reconciliationContext?.inputFingerprint??null};if(cadenceLifecycle)return{status:"prepared",artifact,existing,baseline,preparedCommit:null,sharedFinalizer:true,reason};const existingAssessmentId=existing.briefing?.weeklyNarrative?.goalConfidence?.assessmentId;if(existingAssessmentId&&existingAssessmentId===artifact.briefing?.weeklyNarrative?.goalConfidence?.assessmentId&&existing.briefing?.weeklyNarrative?.goalConfidence?.source===artifact.briefing?.weeklyNarrative?.goalConfidence?.source)return{status:"matched",artifact:existing,existing,baseline,preparedCommit:null};const preparedCommit=createWeeklyPreparedCommit({operation:"regeneration",artifact,baseline,expectedExistingArtifact:existing,reason});return{status:"prepared",artifact,existing,baseline,preparedCommit};},
 async executePreparedRegeneration({prepared}){if(prepared?.status==="matched")return{status:"matched",artifact:prepared.artifact,committed:false};if(prepared?.sharedFinalizer){const result=await publishWeeklyCadence({cadenceLifecycle,artifact:prepared.artifact,reason:prepared.reason,operation:"regenerate"});if(result.committed)return{...result,status:"regenerated"};return result;}const result=await requireWeeklyPersistence(weeklyPersistence).commit(prepared?.preparedCommit);return result;},
 async regenerate({userId,reason,targetArtifactId=null,reconciliationContext=null}){const prepared=await service.prepareRegeneration({userId,reason,targetArtifactId,reconciliationContext});const result=await service.executePreparedRegeneration({prepared});return committedArtifactOrThrow(result);},
 async getOrCreate({userId,preview=false}){if(preview)return service.preview({userId});const existing=await service.getLatest({userId});return existing??service.generate({userId,reason:"legacy_explicit_generation"});}
};return service;}

export function getWeeklyVersionStatus(artifact){const version=artifact?.briefing?.weeklyNarrative?.provenance?.version??artifact?.briefing?.version??null;return{current:version===VERSION,persistedVersion:version,expectedVersion:VERSION};}

function sameWeeklyIdentity(artifact, contract) {
  return artifact?.id === contract.expectedArtifactId
    && artifact?.cadence === "weekly"
    && artifact?.artifactType === "scheduled"
    && artifact?.evidenceWindow?.id === contract.window.id
    && artifact?.evidenceWindow?.startDate === contract.startDate
    && artifact?.evidenceWindow?.endDate === contract.endDate
    && artifact?.evidenceWindow?.briefingDate === contract.briefingDate;
}
function conflictResult(artifact, contract) {
  return {
    status: "artifact_identity_mismatch",
    contract,
    existingArtifactId: artifact?.id ?? null,
    error: { code: "semantic_identity_conflict", message: "An existing artifact conflicts with the requested Weekly identity." },
  };
}
function typedError(error) {
  return { code: error?.code ?? "unknown_error", message: String(error?.message ?? error) };
}
function prepareSummary(artifact, exists) {
  const narrative=artifact?.briefing?.weeklyNarrative;
  const energy=narrative?.cards?.interpretation?.domains?.find((item)=>item.domain==="estimated_energy");
  return {
    windowIdentity: artifact?.evidenceWindow?.id ?? null,
    artifactId: artifact?.id ?? null,
    productionStatus: exists ? "existing" : "missing",
    goal: narrative?.context?.activeGoalSummary ?? null,
    phase: narrative?.context?.activePhase ?? null,
    operatingState: narrative?.context?.operatingState ?? null,
    energyCoverage: energy?.highlight ?? null,
    piStatus: narrative?.context?.pi?.status ?? "unavailable",
    milestone: narrative?.context?.futureMilestone ?? null,
    narrativeVersion: narrative?.provenance?.version ?? null,
    semanticValidation: validatePreparedNarrative(narrative),
    expectedCommitScope: exists ? [] : ["dailyBriefings"],
  };
}
function validatePreparedNarrative(narrative) {
  const text=JSON.stringify(narrative??{});
  return {
    currentGoalAware: narrative?.context?.activeGoalSummary?.semanticType==="lean_mass_gain",
    staleCutLanguageAbsent: !/kept the cut moving|while the cut continues|preparing for the July 18 DEXA/i.test(text),
    unsupportedLeanMassClaimAbsent: !/proved? (?:new )?(?:muscle|lean[- ]mass)|confirmed (?:new )?(?:muscle|lean[- ]mass)/i.test(text),
  };
}

async function buildWeeklyArtifact({repositories,userId,now,persist,reason=null,windowOverride=null,existingArtifactId=null,ignoreExisting=false,confidenceStoreResolver}) {
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
  const [canonicalObjects,weights,dexaScans,artifacts,goal,activityTarget,continuity,progressPhotos,analyses,trainingPerformanceEvents]=await Promise.all([
    repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
    repositories.weights.listWeightEntries(userId),
    repositories.dexaScans?.listDEXAScans(userId)??[],
    boundedArtifactsPromise,
    repositories.goals.getActiveGoal(userId),
    getWeeklyActivityTarget(repositories,userId),
    continuityPromise,
    repositories.progressPhotos?.listPhotos(userId)??[],
    repositories.analyses?.listAnalyses?.()??[],
    repositories.trainingPerformanceEvents?.listTrainingPerformanceEvents?.()??[],
  ]);
  const existing=ignoreExisting?null:(artifacts.find((item)=>item.id===existingArtifactId)??artifacts.find((item)=>item.cadence==="weekly"&&item.evidenceWindow?.id===window.id)??null);
  const photoEvent=artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"&&String(item.briefing?.photoEventNarrative?.eventDate??"")>=window.startDate&&String(item.briefing?.photoEventNarrative?.eventDate??"")<=window.endDate).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;
  const generatedAt=now().toISOString();
  const trainingPerformance=createTrainingPerformanceIntelligenceReport({canonicalObjects:canonicalObjects.filter((item)=>dateKey(item.lastObservedAt)<=window.endDate),now:new Date(`${window.endDate}T12:00:00Z`),generatedAt});
  let authoritative=null;
  let weeklyEnergy=null;
  const activePhase=goal?resolveCommittedPhaseContext(goal,{asOf:window.endDate}).activePhase:null;
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
  const context=await resolveWeeklyBriefingContext({
    repositories,userId,window,timeZone,activeGoal:goal,dexaScans,photoEvent,piResult:authoritative,
  });
  let narrative=composeWeeklyNarrative({window,canonicalObjects,weights,dexaScans,photoEvent,goal,context,activityTarget,generatedAt,trainingPerformance,trainingPerformanceEvents,weeklyEnergy,piNarrativeSelection:adaptedSelection});
  const confidence=resolveActiveGoalConfidencePresentation({
    activeGoal:goal,
    activePhase,
    store:await confidenceStoreResolver(),
  });
  const goalConfidence=createBriefingGoalConfidenceBlock(confidence,{capturedAt:generatedAt});
  if(goalConfidence)narrative={...narrative,goalConfidence};
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
  const confidenceDiagnostic=goalConfidence?[]:[`goal_confidence_unavailable:${confidence.fallbackReason??confidence.status}`];
  let artifact=attachBriefingDependencyManifest({id:existing?.id??artifactId,userId,artifactType:"scheduled",cadence:"weekly",generatedAt:narrative.generatedAt,evidenceWindow:window,lifecycle:{openedAt:null,consumedAt:null},generation:{reason,source:"explicit_weekly_operation",diagnostics:[...(discoveryFailed?["bounded_weekly_artifact_discovery_failed"]:[]),...confidenceDiagnostic]},briefing:{version:VERSION,weeklyNarrative:narrative}},[
    ...canonicalObjects,
    ...weights,
    ...dexaScans,
    ...progressPhotos,
  ]);
  if(authoritative){
    try {
      const communicated=[...(authoritative.selection.primary??[]),...(authoritative.selection.supporting??[])].map((entry)=>entry.candidate.id);
      artifact.piMemory=mergePIBriefingMemory(continuity.memory,{communicatedClaimIds:communicated,claims:authoritative.candidates,limitations:authoritative.limitations},{cadence:"weekly",briefingDate:window.endDate});
    } catch {
      // Optional bounded memory must never block Weekly generation.
    }
  }
  return existing??artifact;
}
async function getWeeklyActivityTarget(repositories,userId){const protocol=await repositories.protocols?.getActiveProtocolByType?.(userId,"activity");const version=protocol?await repositories.protocolVersions?.getCurrentVersion?.(protocol.id):null;return version?.evaluationWindows?.find((item)=>item.cadence==="weekly")?.target??DEFAULT_WEEKLY_ACTIVITY_TARGET;}
async function findExisting(repositories,userId,weekId){return repositories.dailyBriefings.getBriefingByEvidenceWindow(userId,weekId);}
function isResistanceTrainingSession(item={}){return item.evidence_type==="training"&&((item.exercises??[]).length>0||/strength|resistance|lifting|weights?/i.test(item.metadata?.activity_type??""));}
function isCompleteActivityDay(item={}){return item.evidence_type==="activity_day"&&item.quality?.status!=="incomplete"&&Number.isFinite(Number(item.daily_activity?.move_calories));}
function isCompleteNutritionDay(item={}){return item.evidence_type==="nutrition"&&item.quality?.status!=="incomplete"&&item.metadata?.completeness!=="incomplete";}
function displayExerciseName(observation,canonical){if(observation.exercise?.key==="cable_pushdown"&&canonical.some((item)=>(item.payload?.exercises??[]).some((exercise)=>/cable rope pushdowns?/i.test(exercise.name))))return "Cable Rope Pushdowns";return observation.exercise?.name??"Resistance training";}
function exerciseNarrativeReference(value){return value?resolveUserFacingObjectLanguage({objectType:"exercise",displayName:value,specificity:"specific",narrativeContext:"weekly_training_narrative"}).selectedReference:null;}
function sentenceStart(value){return `${String(value??"").charAt(0).toUpperCase()}${String(value??"").slice(1)}`;}
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
function requireWeeklyPersistence(service){if(!service?.captureBaseline||!service?.commit){const error=new Error("Canonical Weekly persistence is unavailable.");error.code="weekly_persistence_unavailable";throw error;}return service;}
function committedArtifactOrThrow(result){if([WeeklyPersistenceOutcome.CREATED,WeeklyPersistenceOutcome.REGENERATED,WeeklyPersistenceOutcome.MATCHED].includes(result?.status))return result.artifact;const error=new Error(result?.error?.message??"Weekly persistence failed.");error.code=result?.status??"weekly_persistence_failure";throw error;}
function publishWeeklyCadence({cadenceLifecycle,artifact,reason,operation}){const context=artifact.briefing.weeklyNarrative.context,goal=context.activeGoal,phase=goal?resolveCommittedPhaseContext(goal,{asOf:artifact.evidenceWindow?.endDate??artifact.generatedAt}).activePhase:context.activePhase;return cadenceLifecycle.publish({cadence:"weekly",operation,artifact,activeGoal:goal,activePhase:phase,operatingState:context.operatingState?.value??context.operatingState,piEnvelope:context.pi,reason,replacementAuthorized:operation==="regenerate"});}
