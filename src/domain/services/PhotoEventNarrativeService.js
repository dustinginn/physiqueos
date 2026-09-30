import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { semanticDeduplicate } from "./GalleryInterpretationService";
import { evaluatePhotoGoalConfirmation, selectVisibleAbsCompletionComparisons } from "./PhotoGoalConfirmationService";
import { getProgressPhotoDisplayLabel, getProgressPhotoProseLabel } from "../models/progressPhotoPoseVocabulary";
import { composePhotoEventContext } from "./PhotoEventContextService";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";
import {
  createPIPhotoEventLifecycleService,
} from "./PIPhotoEventLifecycleService";
import {
  CADENCE_RMR_STRATEGIES,
  createCadenceEnergyAssessment,
} from "./CadenceEnergyAssessmentService";
import { resolveCommittedPhaseContext } from
  "./FounderPhaseCorrectionService";
import { isResistanceTrainingSession } from "./TrainingEvidenceClassification.js";
import {
  createCanonicalPhotoIntelligenceSetFromSession,
} from "./CanonicalPhotoIntelligenceSetService.js";
import {
  canonicalEvidenceCandidate,
  createPhotoBriefingHolisticSynthesis,
  selectPhotoBriefingEvidence,
} from "./PhotoBriefingHolisticSynthesisService.js";

const EVENT_VERSION = "photo_event_v4_0_0";

export function classifyPhotoAnalysis(view = {}) {
  if (!view.analysisMode) return "unavailable";
  return /fallback|deterministic/i.test(view.analysisMode) ? "deterministic_fallback" : "vision_backed";
}

export function composePhotoEventNarrative({ session, goal = null, goalContext = null, latestDexa = null, priorDexa = null, baselineDexa = null, milestone = null, executionSupport = {}, confirmationIntent = null, completionComparisons = null, visualCriterionComplete = "uncertain", photoIntelligence = null, holisticSynthesis = null, generatedAt = new Date().toISOString() } = {}) {
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
  const analysisFindingsByViewId = new Map();
  const activeViews = session.views.map((view) => {
    const activeSourceIds=new Set(view.provenance?.sourceIds??[]);
    const synthesisFindings=(session.synthesis?.observations??[]).filter((item)=>(item.sourceEvidenceIds??[]).some((id)=>activeSourceIds.has(id)) && isPublishableStructuredFinding(item)).map((item)=>item.change??item.description).filter(Boolean);
    const structuredFindings=(view.structuredFindings??[]).filter(isPublishableStructuredFinding);
    const legacyObservedChanges=structuredFindings.length || (view.structuredFindings??[]).length ? [] : (view.observedChanges??[]);
    const eligibleFindings=semanticDeduplicate([...synthesisFindings,...structuredFindings.map((item)=>item.change ?? item.description).filter(Boolean), ...legacyObservedChanges]).filter(isNaturalFinding).slice(0,4);
    analysisFindingsByViewId.set(view.canonicalViewId, eligibleFindings);
    const comparisonMode = view.comparison ? "historical_comparison" : "new_pose_baseline";
    const completionView = goalCompletionHandoff?.visualCriterionStatus === "confirmed" ? confirmedPoseCopy(view) : null;
    const conciseCaption = realizePoseCaption({
      poseId: view.poseId,
      comparisonMode,
      structuredFindings,
      eligibleFindings,
    });
    return ({
    id: view.canonicalViewId,
    poseId: view.poseId,
    label: getProgressPhotoDisplayLabel(view),
    imageHref: view.imageHref,
    previousImageHref: view.previousImageHref,
    previousDate: view.comparison?.previousDate ?? null,
    analysisQuality: classifyPhotoAnalysis(view),
    findings: [],
    headline: completionView?.headline ?? conciseCaption,
    supportingObservations: completionView?.observations ?? [],
    comparisonStatus: view.comparisonStatus,
    comparisonMode,
    establishesBaseline: comparisonMode === "new_pose_baseline",
    goalRelevance: view.poseId === "front-relaxed" ? "primary" : "supporting",
    contributesToGoalValidation: view.poseId === "front-relaxed",
    baselineNarrative: comparisonMode === "new_pose_baseline" ? newBaselineNarrative(view.poseId,view.label) : null,
  });});
  const comparedViews=activeViews.filter((view)=>!view.establishesBaseline);
  const newBaselineViews=activeViews.filter((view)=>view.establishesBaseline);
  const synthesisFindings=semanticDeduplicate((session.synthesis?.observations??[]).filter(isPublishableStructuredFinding).map((item)=>item.change??item.description).filter(Boolean)).filter(isNaturalFinding);
  const allFindings = semanticDeduplicate([...synthesisFindings,...analysisFindingsByViewId.values()].flat());
  const waistFinding=find(allFindings,/waist|midsection/i);
  const waist = waistFinding ?? find(allFindings,/front shape|front silhouette/i) ?? "No meaningful session-level visual change stands out this week.";
  const stable = find(allFindings,/maintain|stable|preserv|no meaningful/i) ?? "Both rear views remain broadly stable.";
  const limitation = session.views.some((view)=>(view.conditionDifferences?.length??0)>0)
    ? "Different capture conditions make subtle changes harder to judge."
    : "The matching poses make broad visual changes easier to judge.";
  const narrativeId = `photo_event_narrative_${session.id}`;
  const completionStatus = goalCompletionHandoff?.visualCriterionStatus ?? null;
  const completionCopy = completionEventCopy(completionStatus, { latestDexa, priorDexa, baselineDexa }, goalCompletionHandoff);
  const ordinaryCopy = ordinaryEventCopy({ goalContext, limitation, milestone, holisticSynthesis });
  return {
    id: narrativeId,
    eventId: `event_briefing_progress_photo_${session.id}`,
    photoSessionId: session.id,
    eventDate: session.captureDate,
    generatedAt,
    evidenceBinding: {
      photoSessionId: session.id,
      sessionRevision: Number(session.revision ?? 1),
      photos: session.views.map((view) => ({
        photoId: view.canonicalPhotoId ?? view.canonicalViewId,
        poseId: view.poseId,
        mediaReference: view.imageReference ?? null,
        priorPhotoSessionId: view.comparison?.previousSessionId ?? null,
        priorPhotoId: view.comparison?.previousCanonicalViewId ?? null,
        priorMediaReference: view.comparison?.previousImageReference ?? null,
      })).sort((left, right) =>
        `${left.poseId}|${left.photoId}`.localeCompare(`${right.poseId}|${right.photoId}`)),
    },
    sourceMode: "canonical_photo_session",
    evidenceCutoff: holisticSynthesis?.evidenceCutoff ?? generatedAt,
    photoIntelligence,
    holisticSynthesis,
    completion: session.completionLabel,
    activeViews,
    poseInterpretations: activeViews.map((view)=>({currentViewId:view.id,currentPhotoSessionId:session.id,poseIdentity:session.views.find((item)=>item.canonicalViewId===view.id)?.poseIdentity??{poseId:view.poseId,label:view.label},priorMatchFound:!view.establishesBaseline,priorViewId:session.views.find((item)=>item.canonicalViewId===view.id)?.comparison?.previousCanonicalViewId??null,priorPhotoSessionId:session.views.find((item)=>item.canonicalViewId===view.id)?.comparison?.previousSessionId??null,comparisonMode:view.comparisonMode,goalId:confirmationIntent?.goalId??goal?.id??null,goalRelevance:view.goalRelevance,contributesToGoalValidation:view.contributesToGoalValidation,observations:analysisFindingsByViewId.get(view.id)??[],limitingFactors:[],confidence:view.analysisQuality==="vision_backed"?"moderate":"limited",establishesBaseline:view.establishesBaseline})),
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
        question: "The cut appears complete. Do you agree?",
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
      progress: { id:`${narrativeId}_progress`, title:completionCopy ? "The visual journey" : "What visibly changed", body:completionCopy?.progress ?? ordinaryCopy.progress ?? mixedModeSummary(comparedViews,newBaselineViews), comparisons:comparedViews, newBaselines:newBaselineViews },
      interpretation: { id:`${narrativeId}_interpretation`, title:completionCopy ? "The result" : "What the complete evidence means", paragraphs:completionCopy?.interpretation ?? [ordinaryCopy.interpretation].filter(Boolean), support:[session.weight, latestDexa ? formatDexa(latestDexa) : null, ...Object.values(executionSupport)].filter(Boolean) },
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
    createCanonicalBriefingConfidencePublicationService({ now });
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
  createEventLifecycle = null,
  loadInputs = null,
} = {}) {
  const service = {
    async getLatest({ userId, sessionId }) {
      const artifacts = loadInputs
        ? (await loadInputs({ userId, sessionId })).artifacts
        : await repositories.dailyBriefings.listDailyBriefings(userId);
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
      const inputs = loadInputs
        ? await loadInputs({ userId, sessionId })
        : await loadRepositoryInputs({ repositories, userId });
      const {
        canonicalObjects, legacyPhotos, weights, analyses, goal, goals = [],
        executionItems = [], dexaScans, artifacts, evidenceAvailability = [],
      } = inputs;
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
      const generatedAt=now().toISOString();
      const availability = new Map(evidenceAvailability.map((item) => [item.id, item]));
      const candidates = [
        ...dexaScans.map((item) => canonicalEvidenceCandidate(item, {
          type: "dexa_scan",
          availableAt: availability.get(item.id)?.availableAt ?? null,
          lastUpdatedAt: availability.get(item.id)?.lastUpdatedAt ?? null,
        })),
        ...weights.map((item) => canonicalEvidenceCandidate(item, {
          type: "weight",
          availableAt: availability.get(item.id)?.availableAt ?? null,
          lastUpdatedAt: availability.get(item.id)?.lastUpdatedAt ?? null,
        })),
        ...canonicalObjects.map((item) => canonicalEvidenceCandidate(item, {
          type: item.evidence_type,
          availableAt: availability.get(item.canonicalId ?? item.id)?.availableAt ?? null,
          lastUpdatedAt: availability.get(item.canonicalId ?? item.id)?.lastUpdatedAt ?? null,
        })),
      ];
      const causalEvidence = selectPhotoBriefingEvidence({
        evidence: candidates,
        eventDate: session.captureDate,
        cutoff: generatedAt,
      });
      const eligibleIds = new Set(causalEvidence.eligible.map((item) => item.id));
      const eligibleDexa=dexaScans.filter((item)=>eligibleIds.has(String(item.id ?? item.canonicalId)));
      const eligibleCanonicalObjects=canonicalObjects.filter((item)=>
        eligibleIds.has(String(item.canonicalId ?? item.id)));
      const eligibleWeights=weights.filter((item)=>eligibleIds.has(String(item.id ?? item.canonicalId)));
      const eligibleExecutionItems=executionItems.filter((item) =>
        recordAvailableByCutoff(item, availability, generatedAt));
      const sortedDexa=[...eligibleDexa].sort((a,b)=>String(a.measuredAt).localeCompare(String(b.measuredAt)));
      const latestDexa=sortedDexa.at(-1)??null;
      const priorDexa=sortedDexa.filter((item)=>String(item.measuredAt)<String(latestDexa?.measuredAt)).at(-1)??null;
      const baselineDexa=sortedDexa.find((item)=>String(item.measuredAt).slice(0,10)==="2026-05-24")??null;
      const executionSupport=deriveExecutionSupport(eligibleCanonicalObjects,session.captureDate);
      const confidenceDomainStates=derivePhotoConfidenceDomainStates({
        canonicalObjects: eligibleCanonicalObjects,
        weights: eligibleWeights,
        dexaScans: eligibleDexa,
        eventDate: session.captureDate,
      });
      const photoEventContext=composePhotoEventContext({
        activeGoal: goal,
        goals: goals.length ? goals : [goal].filter(Boolean),
        executionItems: eligibleExecutionItems,
        dexaScans: eligibleDexa,
        evidenceDate: session.captureDate,
        evidenceAttribution: session,
      });
      const publicationContext=createPhotoEventPublicationContext({
        goal,
        photoEventContext,
        evidenceDate: session.captureDate,
      });
      const completionComparisons=session.confirmationIntent?.confirmationPurpose==="visible_abs_completion"?selectVisibleAbsCompletionComparisons({sessions,finalSession:session,goalStartDate:goal?.startDate}):null;
      const photoIntelligence=createCanonicalPhotoIntelligenceSetFromSession({
        session,
        goalContext: photoOnlyGoalContext(photoEventContext),
      });
      const holisticSynthesis=photoIntelligence?createPhotoBriefingHolisticSynthesis({
        photoIntelligence,
        evidence: candidates,
        eventDate: session.captureDate,
        cutoff: generatedAt,
        goalContext: photoEventContext,
      }):null;
      const narrative=composePhotoEventNarrative({session,goal,goalContext:photoEventContext,latestDexa,priorDexa,baselineDexa,executionSupport,confirmationIntent:session.confirmationIntent,completionComparisons,milestone:photoEventContext.futureMilestone,photoIntelligence,holisticSynthesis,generatedAt});
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
      const lifecycle = eventLifecycle ?? createEventLifecycle?.(inputs);
      if (!preview && lifecycle) {
        const result = await lifecycle.publish({
          operation,
          confidenceMode,
          artifact,
          session,
          context: { ...publicationContext, confidenceDomainStates },
          reason: reason ?? `Confirmed Photo Event ${session.id}.`,
          replacementAuthorized,
          periodEvidence: {
            window: { startDate: session.captureDate, endDate: session.captureDate },
            timeZone: "America/Los_Angeles",
            canonicalObjects: eligibleCanonicalObjects,
            weightEntries: eligibleWeights,
            dexaScans: eligibleDexa,
          },
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
        confidenceMode: "publish-successor",
        replacementAuthorized: true,
        reason,
        ignoreExisting: true,
      });
    },
  };
  return service;
}

async function loadRepositoryInputs({ repositories, userId }) {
  const [canonicalObjects, legacyPhotos, weights, analyses, goal, goals,
    executionItems, dexaScans, artifacts] = await Promise.all([
    repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
    repositories.progressPhotos.listPhotos(userId),
    repositories.weights.listWeightEntries(userId),
    repositories.analyses.listAnalyses(),
    repositories.goals.getActiveGoal(userId),
    repositories.goals.listGoals?.(userId) ?? [],
    repositories.executionItems?.listExecutionItems?.(userId) ?? [],
    repositories.dexaScans.listDEXAScans(userId),
    repositories.dailyBriefings.listDailyBriefings(userId),
  ]);
  return {
    canonicalObjects,
    legacyPhotos,
    weights,
    analyses,
    goal,
    goals: goals.length ? goals : [goal].filter(Boolean),
    executionItems,
    dexaScans,
    artifacts,
    evidenceAvailability: [],
  };
}

function createPhotoEventPublicationContext({
  goal,
  photoEventContext,
  evidenceDate,
} = {}) {
  if (!goal) return photoEventContext;
  const phaseContext = resolveCommittedPhaseContext(goal, {
    asOf: evidenceDate,
  });
  return {
    ...photoEventContext,
    activeGoal: structuredClone(phaseContext.goal),
    activePhase: phaseContext.activePhase
      ? structuredClone(phaseContext.activePhase)
      : photoEventContext.activePhase,
  };
}

function photoOnlyGoalContext(context = {}) {
  const goal = context.activeGoal;
  const phase = context.activePhase;
  return {
    activeGoal: goal ? {
      id: goal.id ?? null,
      title: goal.title ?? null,
      type: goal.type ?? null,
      target: goal.target ? structuredClone(goal.target) : null,
      guardrails: Array.isArray(goal.guardrails)
        ? structuredClone(goal.guardrails) : [],
    } : null,
    activePhase: phase ? {
      id: phase.id ?? null,
      name: phase.name ?? null,
      status: phase.status ?? null,
      startDate: phase.startDate ?? null,
    } : null,
    operatingState: context.operatingState?.value ? {
      value: context.operatingState.value,
    } : null,
  };
}

function recordAvailableByCutoff(record, availability, cutoff) {
  const id = String(record?.id ?? record?.canonicalId ?? "");
  const metadata = availability.get(id);
  const availableAt = metadata?.availableAt ?? record?.createdAt ?? record?.created_at ?? null;
  const lastUpdatedAt = metadata?.lastUpdatedAt ?? record?.updatedAt ?? record?.updated_at ?? null;
  if (!availableAt || Date.parse(availableAt) > Date.parse(cutoff)) return false;
  return !lastUpdatedAt || Date.parse(lastUpdatedAt) <= Date.parse(cutoff);
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
function isPublishableStructuredFinding(item={}){const hasSemantics=item.direction!=null||item.magnitude!=null||item.confidence!=null;if(!hasSemantics)return true;if(["unknown","insufficient"].includes(item.direction))return false;if(["unknown","low"].includes(item.confidence))return false;if(item.magnitude==="unknown")return false;return true;}
function realizePoseCaption({poseId,comparisonMode,structuredFindings=[],eligibleFindings=[]}){
  if(comparisonMode==="new_pose_baseline")return `This ${getProgressPhotoProseLabel(poseId)} view establishes a new visual baseline.`;
  const supported=structuredFindings.filter(isPublishableStructuredFinding);
  const directional=supported.find((item)=>["increased","improved","decreased","reduced","worsened"].includes(item.direction));
  if(directional){
    const metric=String(directional.metric??"").replaceAll("_"," ");
    const magnitude=directional.magnitude&&!["none","unknown"].includes(directional.magnitude)?`${directional.magnitude} `:"";
    if(["increased","decreased","reduced"].includes(directional.direction)){
      const direction=directional.direction==="increased"?"increase":"decrease";
      return `This view suggests a ${magnitude}${direction} in ${metric||"the visible feature"}.`;
    }
    return `This view suggests ${metric||"the visible feature"} looks ${magnitude}${directional.direction==="worsened"?"less favorable":"improved"}.`;
  }
  const stable=supported.some((item)=>item.direction==="stable") || eligibleFindings.some((item)=>/stable|no (?:visible|meaningful|notable|clear|obvious)|unchanged|consistent/i.test(item));
  if(stable){
    if(poseId==="front-relaxed")return "Your front-relaxed shape and waist look broadly unchanged.";
    if(poseId==="back-relaxed")return "Your rear shape and muscularity look broadly unchanged.";
    if(poseId==="back-flexed")return "Back size and definition look broadly unchanged.";
    if(poseId.includes("side"))return "Your side profile and waist look broadly unchanged.";
    if(poseId==="front-flexed")return "Muscle fullness and definition look broadly unchanged.";
    return "This matched view looks broadly unchanged.";
  }
  return "This matched view does not support a confident visual change claim.";
}
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
export function deriveExecutionSupport(canonicalObjects=[],eventDate){const start=new Date(`${eventDate}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-6);const startKey=start.toISOString().slice(0,10);const recent=canonicalObjects.filter((item)=>item.quality?.status!=="superseded"&&String(item.lastObservedAt).slice(0,10)>=startKey&&String(item.lastObservedAt).slice(0,10)<=eventDate);const count=(types)=>recent.filter((item)=>types.includes(item.evidence_type)&&item.payload?.quality?.status!=="incomplete").length;
  // "Resistance training was consistent" is a specific claim: only evidence
  // that is actually resistance/strength training (Logger exercises present,
  // or an explicit strength/resistance/lifting/weights label) may support it --
  // the same test WeeklyNarrativeService already uses for this exact
  // distinction. A canonical HealthKit Cardio workout is also `evidence_type:
  // "training"` (see HealthKitCardioTrainingPresentation.js) but has no
  // exercises and a Cardio activity label, so it correctly never counts here,
  // including once Cardio ever becomes strategically eligible.
  const training=recent.filter((item)=>item.evidence_type==="training"&&item.payload?.quality?.status!=="incomplete"&&isResistanceTrainingSession(item.payload??item)).length;
  const activity=count(["activity_day"]);const nutrition=count(["nutrition"]);return {...(training>=2?{training:"Resistance training was consistent through the week."}:{}),...(activity>=3?{activity:"Activity remained sustained through the week."}:{}),...(nutrition>=3?{nutrition:"The available nutrition record was consistent through the week."}:{})};}
function ordinaryEventCopy({goalContext,limitation,milestone,holisticSynthesis}){
  const compatibility=holisticSynthesis?.goalRelativeCompatibility;
  const hierarchy=holisticSynthesis?.goalEvidenceHierarchy;
  const visualStable=compatibility?.supportingVisualEvidence?.status==="stable";
  const hasAcceptedGuardrail=(hierarchy?.guardrails?.length??0)>0;
  const objectiveMetric=String(hierarchy?.primaryObjective?.metric??"primary objective").replaceAll("_"," ");
  const objectiveDirection=hierarchy?.primaryObjective?.direction==="decrease"?"is moving down":hierarchy?.primaryObjective?.direction==="maintain"?"is holding steady":"is moving up";
  if(compatibility?.status==="jointly_supportive")return{
    title:visualStable?`Measured ${objectiveMetric} ${objectiveDirection} before the photos show a clear change.`:"The complete evidence supports continued progress.",
    summary:`Your primary measurement is moving in the intended direction${hasAcceptedGuardrail?", the accepted guardrail is holding":""}${visualStable?", and the matched views look broadly stable":""}.`,
    goalMeaning:"The primary objective is progressing, while supporting photo evidence remains stable and does not override the objective measurement.",
    progress:visualStable?"The matched views show broad visual stability across the full photo set.":"The matched views add supporting visual context to the objective measurement.",
    interpretation:holisticSynthesis.userFacingCopy,
    limitation,
    coach:holisticSynthesis.coachingImplication,
  };
  if(compatibility&&compatibility.status!=="insufficient_goal_context")return{
    title:"This check-in needs a measured, Goal-aware check.",
    summary:"The objective, accepted guardrails, and supporting photos do not all support continuing unchanged.",
    goalMeaning:compatibility.rationale,
    progress:visualStable?"The matched views look broadly stable.":"The matched views add supporting visual context.",
    interpretation:holisticSynthesis.userFacingCopy,
    limitation,
    coach:holisticSynthesis.coachingImplication,
  };
  const goalTitle=goalContext?.activeGoal?.title??"";
  const phaseName=goalContext?.activePhase?.name??"";
  const operatingState=goalContext?.operatingState?.value??"";
  const leanMassGoal=/lean mass|muscle/i.test(goalTitle);
  const calibration=/calibration|maintenance/i.test(`${phaseName} ${operatingState}`);
  const activeCut=/\bcut\b|fat loss|visible abs/i.test(goalTitle);
  const milestoneSentence=milestone?.label?` ${milestone.label} will give us the next body-composition comparison.`:"";
  if(leanMassGoal&&calibration)return{
    title:"Today’s photos show your recent condition is holding steady.",
    summary:"The matched views support maintenance of your recent lean condition and provide an early baseline for the current phase.",
    goalMeaning:"The photos fit what we would expect while you settle into maintenance. One week is far too soon to claim new muscle.",
    interpretation:"Across the matched views, your current physique remains lean and upper-body muscularity appears maintained. These photos are most useful as an early maintenance and lean-gain baseline, not proof of new tissue gain.",
    limitation:`${limitation} Interpret small changes cautiously over this short interval.${milestoneSentence}`,
    coach:`No strategy change is warranted from these photos. Continue the current approach.${milestone?.label?` Reassess alongside ${milestone.label}.`:""}`,
  };
  if(activeCut)return{
    title:"Today’s photos add a new check-in on your current goal.",
    summary:"The matched views add current visual evidence without overstating change from a single interval.",
    goalMeaning:"The photos add a useful visual check on your cut, while weight, training, and body composition tell us whether the change is meaningful.",
    interpretation:"The matched views describe visible stability or change. Weight, training, nutrition, and body-composition evidence may independently strengthen the broader interpretation without changing what the photos show.",
    limitation:`${limitation}${milestoneSentence}`,
    coach:`No strategy change is warranted from these photos alone.${milestone?.label?` Reassess alongside ${milestone.label}.`:""}`,
  };
  return{
    title:"Today’s photos add a new physique check-in.",
    summary:"The matched views provide current visual context without assuming a goal direction.",
    goalMeaning:"The photos establish current visual evidence. Goal meaning remains neutral until an authoritative active goal and phase are available.",
    interpretation:"The comparison can describe visible stability or change, but it does not establish fat loss, lean-mass gain, or goal completion on its own.",
    limitation,
    coach:"No strategy change is warranted from these photos alone.",
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
    coach:"The cut appears complete. If you agree, close it without extending the deficit to chase an outcome you have already reached.",
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
    title:"The final photo needs a clearer view.",
    summary:"The image conditions do not support a reliable decision about lower-ab visibility at rest.",
    progress:"The journey remains visible, but the final Front Relaxed frame is not qualified enough to serve as the completion gate.",
    interpretation:[dexaSentence,leanSentence,...(result?.limitingFactors?.length?result.limitingFactors:["A clearly framed, original Front Relaxed photo under usable lighting would resolve the decision."])],
    coach:"Upload a replacement Front Relaxed photo with the abdomen fully visible, a genuinely relaxed pose, usable lighting, and no edits. PhysiqueOS will not guess from the DEXA result alone.",
    goalMeaning:"The numerical threshold is complete, but the visual result remains uncertain.",
    coachingDirection:"Replace the limiting photo rather than extending the cut automatically.",
  };
}
function formatDexa(scan){const bf=scan.bodyFatPercentage?.value??scan.bodyFatPercentage;return bf?`Latest DEXA: ${bf}% body fat`:`Latest DEXA: ${String(scan.measuredAt).slice(0,10)}`;}
function describeSessionConditions(c={}){const values=[];if(c.postWorkout===true)values.push("after your workout");if(c.fasted===true)values.push("fasted");if(c.fasted===false)values.push("after eating");if(c.morning===true)values.push("in the morning");if(c.morning===false)values.push("later in the day");return values.length?`Taken ${values.join(", ")}.`:"Capture details are limited.";}
function newBaselineNarrative(poseId){const prose=getProgressPhotoProseLabel(poseId);if(poseId.includes("side"))return `This is your first confirmed ${prose} photo, so there is no same-pose comparison yet. It establishes a useful baseline for abdominal profile and waist projection.`;if(poseId==="front-flexed")return "This front flexed view adds context around abdominal separation, oblique definition, vascularity, and end-of-cut conditioning. It supports but does not prove visible abs at rest.";return `This is your first confirmed ${prose} photo. It establishes a useful new baseline while adding current goal context.`;}
function mixedModeSummary(compared,newBaselines){if(compared.length&&newBaselines.length)return `${compared.length} ${compared.length===1?"view has":"views have"} matching history for direct comparison. ${newBaselines.length} ${newBaselines.length===1?"view is":"views are"} a first recorded view that establishes a useful new baseline.`;if(newBaselines.length)return "These confirmed views establish useful new baselines and add current goal context without claiming change over time.";return "Matching historical views show what changed and what remained stable.";}
function mass(value){const number=Number(value?.value??value);return Number.isFinite(number)?number:null;}
function formatNumber(value){return Number(value).toFixed(1);}
function signedNumber(value){return `${value>0?"+":value<0?"−":""}${Math.abs(value).toFixed(1)}`;}
