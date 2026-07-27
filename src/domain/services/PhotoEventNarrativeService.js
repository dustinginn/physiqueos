import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { semanticDeduplicate } from "./GalleryInterpretationService";
import { evaluatePhotoGoalConfirmation, selectVisibleAbsCompletionComparisons } from "./PhotoGoalConfirmationService";
import { getProgressPhotoDisplayLabel, getProgressPhotoProseLabel } from "../models/progressPhotoPoseVocabulary";
import { resolvePhotoEventContext } from "./PhotoEventContextService";
import {
  createPIPhotoEventPublicationService,
} from "./PIPhotoEventPublicationService";
import {
  createPIPhotoEventLifecycleService,
} from "./PIPhotoEventLifecycleService";
import {
  CADENCE_RMR_STRATEGIES,
  createCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";

const EVENT_VERSION = "photo_event_v3_4_0";

export function classifyPhotoAnalysis(view = {}) {
  if (!view.analysisMode) return "unavailable";
  return /fallback|deterministic/i.test(view.analysisMode) ? "deterministic_fallback" : "vision_backed";
}

export function composePhotoEventNarrative({ session, goal = null, goalContext = null, latestDexa = null, priorDexa = null, baselineDexa = null, milestone = null, executionSupport = {}, confirmationIntent = null, completionComparisons = null, visualCriterionComplete = "uncertain", generatedAt = new Date().toISOString() } = {}) {
  if (!session || session.sourceMode !== "canonical") return null;
  const goalCompletionHandoff = evaluatePhotoGoalConfirmation({
    ...confirmationIntent,
    session,
    visualCriterionComplete,
    completionComparisons,
    latestDexa,
    priorDexa,
    baselineDexa,
  });
  const activeViews = session.views.map((view) => {
    const activeSourceIds=new Set(view.provenance?.sourceIds??[]);
    const synthesisFindings=(session.synthesis?.observations??[]).filter((item)=>(item.sourceEvidenceIds??[]).some((id)=>activeSourceIds.has(id))).map((item)=>item.change??item.description).filter(Boolean);
    const eligibleFindings=semanticDeduplicate([...synthesisFindings,...(view.structuredFindings ?? []).map((item)=>item.change ?? item.description).filter(Boolean), ...(view.observedChanges ?? [])]).filter(isNaturalFinding).slice(0,4);
    const comparisonMode = view.comparison ? "historical_comparison" : "new_pose_baseline";
    const completionView = goalCompletionHandoff?.visualCriterionStatus === "confirmed" ? confirmedPoseCopy(view) : null;
    return ({
    id: view.canonicalViewId,
    poseId: view.poseId,
    label: getProgressPhotoDisplayLabel(view),
    imageHref: view.imageHref,
    previousImageHref: view.previousImageHref,
    previousDate: view.comparison?.previousDate ?? null,
    analysisQuality: classifyPhotoAnalysis(view),
    findings: classifyPhotoAnalysis(view) === "vision_backed" ? eligibleFindings : [],
    headline: completionView?.headline ?? poseHeadline(view.poseId,eligibleFindings),
    supportingObservations: completionView?.observations ?? poseSupportingObservations(view.poseId,eligibleFindings),
    comparisonStatus: view.comparisonStatus,
    comparisonMode,
    establishesBaseline: comparisonMode === "new_pose_baseline",
    goalRelevance: view.poseId === "front-relaxed" ? "primary" : "supporting",
    contributesToGoalValidation: view.poseId === "front-relaxed",
    baselineNarrative: comparisonMode === "new_pose_baseline" ? newBaselineNarrative(view.poseId,view.label) : null,
  });});
  const comparedViews=activeViews.filter((view)=>!view.establishesBaseline);
  const newBaselineViews=activeViews.filter((view)=>view.establishesBaseline);
  const synthesisFindings=semanticDeduplicate((session.synthesis?.observations??[]).map((item)=>item.change??item.description).filter(Boolean)).filter(isNaturalFinding);
  const allFindings = semanticDeduplicate([...synthesisFindings,...activeViews.flatMap((view)=>view.findings)]);
  const waistFinding=find(allFindings,/waist|midsection/i);
  const waist = waistFinding ?? (find(allFindings,/front shape|front silhouette/i) && find(allFindings,/maintain|preserv|stable/i) ? "Your waist looks meaningfully tighter while upper-body size appears well maintained." : find(allFindings,/front shape|front silhouette/i)) ?? "No meaningful session-level visual change stands out this week.";
  const stable = find(allFindings,/maintain|stable|preserv|no meaningful/i) ?? "Both rear views remain broadly stable.";
  const limitation = session.views.some((view)=>(view.conditionDifferences?.length??0)>0)
    ? "Different capture conditions make subtle changes harder to judge."
    : "The matching poses make broad visual changes easier to judge.";
  const narrativeId = `photo_event_narrative_${session.id}`;
  const completionStatus = goalCompletionHandoff?.visualCriterionStatus ?? null;
  const completionCopy = completionEventCopy(completionStatus, { latestDexa, priorDexa, baselineDexa }, goalCompletionHandoff);
  const ordinaryCopy = ordinaryEventCopy({ goalContext, limitation, milestone });
  return {
    id: narrativeId,
    eventId: `event_briefing_progress_photo_${session.id}`,
    photoSessionId: session.id,
    eventDate: session.captureDate,
    generatedAt,
    sourceMode: "canonical_photo_session",
    completion: session.completionLabel,
    activeViews,
    poseInterpretations: activeViews.map((view)=>({currentViewId:view.id,currentPhotoSessionId:session.id,poseIdentity:session.views.find((item)=>item.canonicalViewId===view.id)?.poseIdentity??{poseId:view.poseId,label:view.label},priorMatchFound:!view.establishesBaseline,priorViewId:session.views.find((item)=>item.canonicalViewId===view.id)?.comparison?.previousCanonicalViewId??null,priorPhotoSessionId:session.views.find((item)=>item.canonicalViewId===view.id)?.comparison?.previousSessionId??null,comparisonMode:view.comparisonMode,goalId:confirmationIntent?.goalId??goal?.id??null,goalRelevance:view.goalRelevance,contributesToGoalValidation:view.contributesToGoalValidation,observations:view.findings,limitingFactors:[],confidence:view.analysisQuality==="vision_backed"?"moderate":"limited",establishesBaseline:view.establishesBaseline})),
    comparisonGroups:{comparedWithPriorPhotos:comparedViews.map((view)=>view.id),newBaselineViews:newBaselineViews.map((view)=>view.id)},
    previousSessions: [...new Set(activeViews.map((view)=>view.previousDate).filter(Boolean))],
    supportingEvidence: { weight: session.weight, dexa: latestDexa ? formatDexa(latestDexa) : null, ...executionSupport },
    overallSummary: waist,
    keyVisibleChanges: allFindings.slice(0,4),
    stableSignals: [stable],
    conditionLimitations: [limitation],
    confidence: limitation,
    goalContext,
    goalMeaning: completionCopy?.goalMeaning ?? ordinaryCopy.goalMeaning,
    coachingDirection: completionCopy?.coachingDirection ?? ordinaryCopy.coach,
    nextMilestone: milestone,
    goalCompletionHandoff,
    completionExperience: goalCompletionHandoff ? {
      state: completionStatus,
      journeyComparison: completionComparisons?.journey ?? null,
      recentComparison: completionComparisons?.recent ?? null,
      recentComparisons: completionComparisons?.recentComparisons ?? [],
      journeyComparisons: completionComparisons?.journeyComparisons ?? [],
      newBaselineViews: completionComparisons?.newBaselines?.map((view)=>activeViews.find((item)=>item.id===view.id)).filter(Boolean) ?? [],
      userDecision: goalCompletionHandoff.requiredUserDecision ? {
        question: "PhysiqueOS sees the Visible Abs goal as complete. Do you agree?",
        completeLabel: "Complete Goal",
        keepOpenLabel: "Keep Goal Open",
      } : null,
      nextGoalPreview: {
        title: "Build Lean Mass while maintaining 8–9% body fat",
        actionLabel: "Create Next Goal",
        availability: "coming_next",
      },
    } : null,
    cardContent: {
      hero: { id:`${narrativeId}_hero`, title:completionCopy?.title ?? ordinaryCopy.title, body:completionCopy?.summary ?? ordinaryCopy.summary },
      snapshot: { id:`${narrativeId}_snapshot`, title:"This photo session", poses:activeViews.map((view)=>view.label), conditions:describeSessionConditions(session.sessionConditions) },
      progress: { id:`${narrativeId}_progress`, title:completionCopy ? "The visual journey" : "What visibly changed", body:completionCopy?.progress ?? mixedModeSummary(comparedViews,newBaselineViews), comparisons:comparedViews, newBaselines:newBaselineViews },
      interpretation: { id:`${narrativeId}_interpretation`, title:completionCopy ? "The result" : "What the complete evidence means", paragraphs:completionCopy?.interpretation ?? [ordinaryCopy.interpretation,supportingEvidenceSentence(session.weight,latestDexa,executionSupport),ordinaryCopy.limitation].filter(Boolean), support:[session.weight, latestDexa ? formatDexa(latestDexa) : null, ...Object.values(executionSupport)].filter(Boolean) },
      coachInsight: { id:`${narrativeId}_coach`, title:"Coach’s Insight", body:completionCopy?.coach ?? ordinaryCopy.coach },
    },
    evidenceReferences: activeViews.map((view)=>view.id),
    provenance: { synthesisId: session.synthesis?.id ?? session.synthesisSummaryReference, synthesisSource: session.synthesis?.source ?? "unavailable", version:EVENT_VERSION },
  };
}

export function createFounderPhotoEventNarrativeService({
  repositories,
  now = () => new Date(),
  eventLifecycle,
} = {}) {
  const publication = eventLifecycle ? null :
    createPIPhotoEventPublicationService({ now });
  return createPhotoEventNarrativeService({
    repositories,
    now,
    eventLifecycle: eventLifecycle ??
      createPIPhotoEventLifecycleService({ publicationService: publication, now }),
  });
}

export function createPhotoEventNarrativeService({
  repositories,
  now = () => new Date(),
  eventLifecycle = null,
} = {}) {
  const service = {
    async getLatest({ userId, sessionId }) {
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(userId);
      return artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"&&item.trigger?.evidenceId===sessionId).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;
    },
    async getOrCreate({ userId, sessionId, preview = false }) {
      const result = await this.getOrCreateResult({ userId, sessionId, preview });
      return result.artifact ?? null;
    },
    async getOrCreateResult({
      userId,
      sessionId,
      preview = false,
      operation = "create",
      confidenceMode = "publish-successor",
      replacementAuthorized = false,
      reason = null,
      ignoreExisting = false,
    }) {
      const [canonicalObjects, legacyPhotos, weights, analyses, goal, dexaScans, artifacts] = await Promise.all([
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId), repositories.progressPhotos.listPhotos(userId), repositories.weights.listWeightEntries(userId), repositories.analyses.listAnalyses(), repositories.goals.getActiveGoal(userId), repositories.dexaScans.listDEXAScans(userId), repositories.dailyBriefings.listDailyBriefings(userId),
      ]);
      const sessions = createPhotoSessionReadModels({ canonicalObjects, legacyPhotos, weights, analyses });
      const session = sessions.find((item)=>item.id===sessionId || item.hiddenProvenanceAliases?.includes(sessionId));
      if (!session) return {
        status: "blocked",
        code: "canonical_photo_session_unavailable",
        message: `Canonical PhotoSession ${sessionId} is unavailable to the briefing read model.`,
        requestedSessionId: sessionId,
        retryable: true,
        artifact: null,
        artifactId: null,
      };
      const eventId=`event_briefing_progress_photo_${session.id}`;
      const existing=artifacts.find((item)=>item.id===eventId);
      if (existing?.briefing?.version === EVENT_VERSION && !preview &&
          !ignoreExisting) return {
        status: "completed", artifact: existing, artifactId: existing.id, sessionId: session.id, created: false,
      };
      const sortedDexa=[...dexaScans].sort((a,b)=>String(a.measuredAt).localeCompare(String(b.measuredAt)));
      const latestDexa=sortedDexa.at(-1)??null;
      const priorDexa=sortedDexa.filter((item)=>String(item.measuredAt)<String(latestDexa?.measuredAt)).at(-1)??null;
      const baselineDexa=sortedDexa.find((item)=>String(item.measuredAt).slice(0,10)==="2026-05-24")??null;
      const executionSupport=deriveExecutionSupport(canonicalObjects,session.captureDate);
      const confidenceDomainStates=derivePhotoConfidenceDomainStates({
        canonicalObjects,
        weights,
        dexaScans,
        eventDate: session.captureDate,
      });
      const photoEventContext=await resolvePhotoEventContext({repositories,userId,evidenceDate:session.captureDate});
      const completionComparisons=session.confirmationIntent?.confirmationPurpose==="visible_abs_completion"?selectVisibleAbsCompletionComparisons({sessions,finalSession:session,goalStartDate:goal?.startDate}):null;
      const narrative=composePhotoEventNarrative({session,goal,goalContext:photoEventContext,latestDexa,priorDexa,baselineDexa,executionSupport,confirmationIntent:session.confirmationIntent,completionComparisons,milestone:photoEventContext.futureMilestone,generatedAt:now().toISOString()});
      if (!narrative) return {
        status: "blocked",
        code: "photo_event_narrative_unavailable",
        message: `Photo Event narrative could not be composed for canonical session ${session.id}.`,
        requestedSessionId: sessionId,
        sessionId: session.id,
        retryable: true,
        artifact: null,
        artifactId: null,
      };
      const artifact={id:eventId,userId,artifactType:"event",cadence:"event",generatedAt:narrative.generatedAt,trigger:{evidenceType:"photo_session",evidenceId:session.id},lifecycle:{openedAt:null,consumedAt:null},briefing:{version:EVENT_VERSION,photoEventNarrative:narrative}};
      if (!preview && eventLifecycle) {
        const result = await eventLifecycle.publish({
          operation,
          confidenceMode,
          artifact,
          session,
          context: { ...photoEventContext, confidenceDomainStates },
          reason: reason ?? `Confirmed Photo Event ${session.id}.`,
          replacementAuthorized,
        });
        if (!result.committed && result.status !== "matched") return {
          status: "blocked",
          code: result.status,
          message: result.error?.message ?? "Photo Event publication failed.",
          requestedSessionId: sessionId,
          sessionId: session.id,
          retryable: ["baseline_conflict", "persistence_failure"].includes(
            result.status),
          artifact: null,
          artifactId: null,
        };
        return {
          status: "completed",
          artifact: result.artifact,
          artifactId: result.artifact.id,
          sessionId: session.id,
          created: result.committed,
          publicationStatus: result.status,
        };
      }
      if (!preview) await repositories.dailyBriefings.createDailyBriefing(artifact);
      return { status: "completed", artifact, artifactId: artifact.id, sessionId: session.id, created: !preview };
    },
    async regenerate({
      userId, sessionId, reason, replacementAuthorized = false,
    }) {
      if (!reason) throw new Error("Photo Event regeneration requires an explicit reason.");
      if (replacementAuthorized !== true) {
        throw new Error("Photo Event regeneration requires explicit replacement authorization.");
      }
      return service.getOrCreateResult({
        userId,
        sessionId,
        operation: "regenerate",
        confidenceMode: "matched-only",
        replacementAuthorized: true,
        reason,
        ignoreExisting: true,
      });
    },
  };
  return service;
}

function find(values,pattern){return values.find((value)=>pattern.test(value));}
function shiftDate(value, days) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString().slice(0, 10);
}

export function derivePhotoConfidenceDomainStates({
  canonicalObjects = [],
  weights = [],
  dexaScans = [],
  eventDate,
} = {}) {
  const startDate = shiftDate(eventDate, -6);
  let energy = { status: "incomplete", evidenceCompleteness: "partial" };
  try {
    const assessment = createCadenceEnergyAssessment({
      cadence: "photo_event",
      window: {
        id: `photo_event:${startDate}:${eventDate}`,
        startDate,
        endDate: eventDate,
        timeZone: "America/Los_Angeles",
      },
      nutritionDays: canonicalObjects.filter(
        (item) => item.evidence_type === "nutrition"),
      activityDays: canonicalObjects.filter(
        (item) => item.evidence_type === "activity_day"),
      dexaScans,
      rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
    });
    const average = assessment.netBalance?.average;
    energy = {
      status: assessment.coverage?.state !== "complete" ? "incomplete" :
        average < -150 ? "persistent_deficit" :
          average > 250 ? "large_surplus" : "near_maintenance",
      evidenceCompleteness: assessment.coverage?.state === "complete"
        ? "complete" : "partial",
    };
  } catch {
    // Incomplete Energy limits Photo interpretation without blocking the Event.
  }
  const recentWeights = weights.filter((item) => {
    const date = String(item.measuredAt ?? item.recordedAt ?? item.date).slice(0, 10);
    return date >= startDate && date <= eventDate;
  }).sort((a, b) => String(a.measuredAt ?? a.recordedAt ?? a.date)
    .localeCompare(String(b.measuredAt ?? b.recordedAt ?? b.date)));
  const first = Number(recentWeights[0]?.weight?.value ??
    recentWeights[0]?.value);
  const last = Number(recentWeights.at(-1)?.weight?.value ??
    recentWeights.at(-1)?.value);
  const weight = recentWeights.length < 3 || !Number.isFinite(first) ||
    !Number.isFinite(last)
    ? { status: "sparse" }
    : { status: last - first < -0.75 ? "falling" :
      last - first > 0.75 ? "rising" : "stable" };
  return { energy, weight };
}
function isNaturalFinding(value){return !/fallback|metadata|persist|repository|evidence|claim|comparable set|confirmed/i.test(value);}
function poseHeadline(poseId,findings){if(poseId==="front-relaxed")return find(findings,/waist|midsection|front shape|silhouette/i)??"The front shape is the primary at-rest view.";if(poseId==="back-relaxed")return find(findings,/no meaningful|stable|maintain/i)??"Overall rear shape appears stable.";if(poseId==="back-flexed")return find(findings,/no meaningful|stable|maintain|taper/i)??"Back fullness and taper appear stable.";if(poseId.includes("side"))return find(findings,/waist|profile|abdomen|conditioning/i)??"This view adds context on waist profile and side-view conditioning.";if(poseId==="front-flexed")return find(findings,/abdominal|oblique|conditioning|separation/i)??"This view adds context on abdominal separation and overall conditioning.";return find(findings,/.+/)??"This confirmed view establishes useful visual context.";}
function poseSupportingObservations(poseId,findings){const blocked=poseId==="front-relaxed"?/silhouette|front shape|shoulder.to.waist/i:/overall shape|no meaningful/i;return semanticDeduplicate(findings.filter((value)=>!blocked.test(value))).slice(0,2);}
function confirmedPoseCopy(view){
  const copies={
    "front-relaxed":{headline:"The final relaxed view supports visible abdominal definition at rest.",observations:["The full journey shows substantially reduced waist softness, clearer abdominal structure, and stronger shoulder-to-waist contrast.","Since Jul 11, the waist and lower midsection show continued refinement rather than a new baseline."]},
    "back-relaxed":{headline:"The same-pose comparison shows a cleaner lower back and stronger waist taper.",observations:["Upper-back contours remain clear while softness around the flanks appears reduced."]},
    "back-flexed":{headline:"The same-pose comparison shows stronger upper-back separation and waist contrast.",observations:["Rear-delt definition and lat presentation support the broader end-of-cut conditioning result."]},
    "right-side-relaxed":{headline:"This first recorded side view establishes a useful abdominal-profile baseline.",observations:["It adds context on waist projection without making a same-pose change claim."]},
    "front-flexed":{headline:"This first recorded flexed view shows abdominal separation and end-of-cut conditioning.",observations:["Oblique detail and vascularity support the result, but this view does not replace front relaxed as the primary validator."]},
  };
  return copies[view.poseId]??null;
}
function supportingEvidenceSentence(weight,dexa,support={}){const parts=[];if(weight&&!/^No /.test(weight))parts.push("the continued weight trend");if(support.training)parts.push("consistent resistance training");if(support.activity)parts.push("sustained activity through the week");if(support.nutrition)parts.push("the available nutrition record");const reinforcement=parts.length?`${joinNarrative(parts)} ${parts.length===1?"reinforces":"reinforce"} the visual pattern`:`The photos remain the clearest current signal`;const sentence=`${reinforcement}${dexa?", with the latest DEXA serving as the body-composition baseline":""}.`;return sentence.charAt(0).toUpperCase()+sentence.slice(1);}
export function deriveExecutionSupport(canonicalObjects=[],eventDate){const start=new Date(`${eventDate}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-6);const startKey=start.toISOString().slice(0,10);const recent=canonicalObjects.filter((item)=>item.quality?.status!=="superseded"&&String(item.lastObservedAt).slice(0,10)>=startKey&&String(item.lastObservedAt).slice(0,10)<=eventDate);const count=(types)=>recent.filter((item)=>types.includes(item.evidence_type)&&item.payload?.quality?.status!=="incomplete").length;const training=count(["training"]);const activity=count(["activity_day"]);const nutrition=count(["nutrition"]);return {...(training>=2?{training:"Resistance training was consistent through the week."}:{}),...(activity>=3?{activity:"Activity remained sustained through the week."}:{}),...(nutrition>=3?{nutrition:"The available nutrition record was consistent through the week."}:{})};}
function ordinaryEventCopy({goalContext,limitation,milestone}){
  const goalTitle=goalContext?.activeGoal?.title??"";
  const phaseName=goalContext?.activePhase?.name??"";
  const operatingState=goalContext?.operatingState?.value??"";
  const leanMassGoal=/lean mass|muscle/i.test(goalTitle);
  const calibration=/calibration|maintenance/i.test(`${phaseName} ${operatingState}`);
  const activeCut=/\bcut\b|fat loss|visible abs/i.test(goalTitle);
  const milestoneSentence=milestone?.label?` ${milestone.label} can add a future body-composition checkpoint.`:"";
  if(leanMassGoal&&calibration)return{
    title:"Today’s photos show your recent condition is holding steady.",
    summary:"The matched views support maintenance of your recent lean condition and provide an early baseline for the current phase.",
    goalMeaning:"The photos are consistent with the current maintenance-calibration phase. A one-week visual interval is not enough to claim new lean-mass gain.",
    interpretation:"Across the matched views, your current physique remains lean and upper-body muscularity appears maintained. These photos are most useful as an early maintenance and lean-gain baseline, not proof of new tissue gain.",
    limitation:`${limitation} Interpret small changes cautiously over this short interval.${milestoneSentence}`,
    coach:`Keep capture conditions consistent and let the trend develop across several check-ins.${milestone?.label?` Use ${milestone.label} as the next measurement checkpoint.`:""}`,
  };
  if(activeCut)return{
    title:"Today’s photos add a new check-in on your current goal.",
    summary:"The matched views add current visual evidence without overstating change from a single interval.",
    goalMeaning:`The photos add evidence for ${goalTitle}, while the observed comparison and supporting measurements determine whether meaningful progress is present.`,
    interpretation:"The matched views should be read alongside weight, training, nutrition, and body-composition evidence. Only changes supported by those records should be treated as progress.",
    limitation:`${limitation}${milestoneSentence}`,
    coach:`Keep the next photo session as consistent as possible.${milestone?.label?` Reassess alongside ${milestone.label}.`:""}`,
  };
  return{
    title:"Today’s photos add a new physique check-in.",
    summary:"The matched views provide current visual context without assuming a goal direction.",
    goalMeaning:"The photos establish current visual evidence. Goal meaning remains neutral until an authoritative active goal and phase are available.",
    interpretation:"The comparison can describe visible stability or change, but it does not establish fat loss, lean-mass gain, or goal completion on its own.",
    limitation,
    coach:"Keep the next photo session as consistent as possible so changes are easier to judge.",
  };
}
function completionEventCopy(status,{latestDexa,priorDexa,baselineDexa},result){
  if(!status)return null;
  const bodyFat=mass(latestDexa?.bodyFatPercentage);
  const latestFat=mass(latestDexa?.fatMass);
  const priorFat=mass(priorDexa?.fatMass);
  const latestLean=mass(latestDexa?.leanMass);
  const baselineLean=mass(baselineDexa?.leanMass);
  const fatChange=latestFat!==null&&priorFat!==null?latestFat-priorFat:null;
  const leanChange=latestLean!==null&&baselineLean!==null?latestLean-baselineLean:null;
  const dexaSentence=`The Jul 18 DEXA measured ${formatNumber(bodyFat)}% body fat${fatChange!==null?`, with ${formatNumber(Math.abs(fatChange))} lb of measured fat lost since the prior scan`:""}.`;
  const leanSentence=leanChange!==null?`Lean tissue finished at ${formatNumber(latestLean)} lb, ${signedNumber(leanChange)} lb from the May 24 baseline and within the established preservation tolerance.`:"Lean mass remained preserved across the cut.";
  if(status==="confirmed")return{
    title:"The evidence supports the finish.",
    summary:"The Jul 18 DEXA reached 7.7% body fat, the full photo journey shows a substantially leaner waist and midsection, and the final front relaxed view supports visible abs at rest. The evidence as a whole indicates that the goal is complete.",
    progress:"The May-to-Jul 18 journey shows how far the waist and midsection changed. The separate Jul 11-to-Jul 18 comparison captures the smaller final-week refinement.",
    interpretation:[`${dexaSentence} ${leanSentence} The photos reinforce that result: from the beginning of the cut through today, your waist is substantially leaner, abdominal definition is clearer, and your upper body has been preserved.`, "The final front relaxed photo was taken later in the day after training, so it is not a perfect laboratory comparison. It is still clear enough to assess when viewed alongside the full journey, the recent same-pose comparisons, and the supporting views.", "The evidence supports completion, while your explicit confirmation remains the final step."],
    coach:"PhysiqueOS sees the Visible Abs goal as complete. If you agree, close the goal without extending the deficit to chase an outcome the evidence already supports.",
    goalMeaning:"The totality of objective and visual evidence supports completion with moderate confidence. The goal remains open until you explicitly agree.",
    coachingDirection:"Review the full journey, then decide whether you agree that this chapter is complete.",
  };
  if(status==="not_confirmed")return{
    title:"The numerical goal is reached. The visual check remains open.",
    summary:"The DEXA threshold is complete, but the qualified relaxed photo does not yet clearly show lower abs at rest.",
    progress:"The comparison shows the full journey without forcing a positive conclusion from the final frame.",
    interpretation:[dexaSentence,leanSentence,"This is not a failure and does not automatically justify a more aggressive deficit. You can keep the goal open and reassess cautiously."],
    coach:"Keep the goal open if the visual result does not match your finish criterion. Hold the current fundamentals steady rather than automatically cutting harder.",
    goalMeaning:"The numerical threshold is complete, while the visual criterion is not confirmed.",
    coachingDirection:"Keep the goal open and choose the next check deliberately.",
  };
  return{
    title:"The final photo needs a clearer read.",
    summary:"The image conditions do not support a reliable decision about lower-ab visibility at rest.",
    progress:"The journey remains visible, but the final Front Relaxed frame is not qualified enough to serve as the completion gate.",
    interpretation:[dexaSentence,leanSentence,...(result?.limitingFactors?.length?result.limitingFactors:["A clearly framed, original Front Relaxed photo under usable lighting would resolve the decision."])],
    coach:"Upload a replacement Front Relaxed photo with the abdomen fully visible, a genuinely relaxed pose, usable lighting, and no edits. PhysiqueOS will not guess from the DEXA result alone.",
    goalMeaning:"The numerical threshold is complete, but the visual result remains uncertain.",
    coachingDirection:"Replace the limiting photo rather than extending the cut automatically.",
  };
}
function joinNarrative(values){if(values.length===1)return values[0];if(values.length===2)return `${values[0]} and ${values[1]}`;return `${values.slice(0,-1).join(", ")}, and ${values.at(-1)}`;}
function formatDexa(scan){const bf=scan.bodyFatPercentage?.value??scan.bodyFatPercentage;return bf?`Latest DEXA: ${bf}% body fat`:`Latest DEXA: ${String(scan.measuredAt).slice(0,10)}`;}
function describeSessionConditions(c={}){const values=[];if(c.postWorkout===true)values.push("after your workout");if(c.fasted===true)values.push("fasted");if(c.fasted===false)values.push("after eating");if(c.morning===true)values.push("in the morning");if(c.morning===false)values.push("later in the day");return values.length?`Taken ${values.join(", ")}.`:"Capture details are limited.";}
function newBaselineNarrative(poseId){const prose=getProgressPhotoProseLabel(poseId);if(poseId.includes("side"))return `This is your first confirmed ${prose} photo, so there is no same-pose comparison yet. It establishes a useful baseline for abdominal profile and waist projection.`;if(poseId==="front-flexed")return "This front flexed view adds context around abdominal separation, oblique definition, vascularity, and end-of-cut conditioning. It supports but does not prove visible abs at rest.";return `This is your first confirmed ${prose} photo. It establishes a useful new baseline while adding current goal context.`;}
function mixedModeSummary(compared,newBaselines){if(compared.length&&newBaselines.length)return `${compared.length} ${compared.length===1?"view has":"views have"} matching history for direct comparison. ${newBaselines.length} ${newBaselines.length===1?"view is":"views are"} a first recorded view that establishes a useful new baseline.`;if(newBaselines.length)return "These confirmed views establish useful new baselines and add current goal context without claiming change over time.";return "Matching historical views show what changed and what remained stable.";}
function mass(value){const number=Number(value?.value??value);return Number.isFinite(number)?number:null;}
function formatNumber(value){return Number(value).toFixed(1);}
function signedNumber(value){return `${value>0?"+":value<0?"−":""}${Math.abs(value).toFixed(1)}`;}
