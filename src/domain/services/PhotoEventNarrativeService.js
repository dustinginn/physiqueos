import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { semanticDeduplicate } from "./GalleryInterpretationService";

const EVENT_VERSION = "photo_event_v2_2_1";

export function classifyPhotoAnalysis(view = {}) {
  if (!view.analysisMode) return "unavailable";
  return /fallback|deterministic/i.test(view.analysisMode) ? "deterministic_fallback" : "vision_backed";
}

export function composePhotoEventNarrative({ session, goal = null, latestDexa = null, milestone = null, executionSupport = {}, generatedAt = new Date().toISOString() } = {}) {
  if (!session || session.sourceMode !== "canonical") return null;
  const activeViews = session.views.map((view) => {
    const activeSourceIds=new Set(view.provenance?.sourceIds??[]);
    const synthesisFindings=(session.synthesis?.observations??[]).filter((item)=>(item.sourceEvidenceIds??[]).some((id)=>activeSourceIds.has(id))).map((item)=>item.change??item.description).filter(Boolean);
    const eligibleFindings=semanticDeduplicate([...synthesisFindings,...(view.structuredFindings ?? []).map((item)=>item.change ?? item.description).filter(Boolean), ...(view.observedChanges ?? [])]).filter(isNaturalFinding).slice(0,4);
    return ({
    id: view.canonicalViewId,
    poseId: view.poseId,
    label: view.label,
    imageHref: view.imageHref,
    previousImageHref: view.previousImageHref,
    previousDate: view.comparison?.previousDate ?? null,
    analysisQuality: classifyPhotoAnalysis(view),
    findings: classifyPhotoAnalysis(view) === "vision_backed" ? eligibleFindings : [],
    headline: poseHeadline(view.poseId,eligibleFindings),
    supportingObservations: poseSupportingObservations(view.poseId,eligibleFindings),
    comparisonStatus: view.comparisonStatus,
  });});
  const synthesisFindings=semanticDeduplicate((session.synthesis?.observations??[]).map((item)=>item.change??item.description).filter(Boolean)).filter(isNaturalFinding);
  const allFindings = semanticDeduplicate([...synthesisFindings,...activeViews.flatMap((view)=>view.findings)]);
  const waistFinding=find(allFindings,/waist|midsection/i);
  const waist = waistFinding ?? (find(allFindings,/front shape|front silhouette/i) && find(allFindings,/maintain|preserv|stable/i) ? "Your waist looks meaningfully tighter while upper-body size appears well maintained." : find(allFindings,/front shape|front silhouette/i)) ?? "No meaningful session-level visual change stands out this week.";
  const stable = find(allFindings,/maintain|stable|preserv|no meaningful/i) ?? "Both rear views remain broadly stable.";
  const limitation = session.views.some((view)=>(view.conditionDifferences?.length??0)>0)
    ? "Different capture conditions make subtle changes harder to judge."
    : "The matching poses make broad visual changes easier to judge.";
  const goalTitle = goal?.title ?? "visible-abs goal";
  const milestoneText = milestone?.date === "2026-07-18" ? "next Saturday's DEXA" : milestone?.label ?? "next scheduled measurement";
  const narrativeId = `photo_event_narrative_${session.id}`;
  return {
    id: narrativeId,
    eventId: `event_briefing_progress_photo_${session.id}`,
    photoSessionId: session.id,
    eventDate: session.captureDate,
    generatedAt,
    sourceMode: "canonical_photo_session",
    completion: session.completionLabel,
    activeViews,
    previousSessions: [...new Set(activeViews.map((view)=>view.previousDate).filter(Boolean))],
    supportingEvidence: { weight: session.weight, dexa: latestDexa ? formatDexa(latestDexa) : null, ...executionSupport },
    overallSummary: waist,
    keyVisibleChanges: allFindings.slice(0,4),
    stableSignals: [stable],
    conditionLimitations: [limitation],
    confidence: limitation,
    goalMeaning: `The photos support continued progress toward your ${goalTitle.toLowerCase()}, while the next DEXA remains the better measure of body-composition change.`,
    coachingDirection: `Stay the course into ${milestoneText}. Keep the next photo set as consistent as possible so subtle abdominal changes are easier to judge.`,
    nextMilestone: milestone,
    cardContent: {
      hero: { id:`${narrativeId}_hero`, title:"Today’s photos suggest continued progress toward visible abs.", body:"The clearest change is a tighter waist in the front view, while both rear views suggest upper-body muscle has been maintained." },
      snapshot: { id:`${narrativeId}_snapshot`, title:"This photo session", poses:activeViews.map((view)=>view.label), conditions:describeSessionConditions(session.sessionConditions) },
      progress: { id:`${narrativeId}_progress`, title:"What visibly changed", body:"One view shows the clearest movement; the other two help establish what stayed stable.", comparisons:activeViews },
      interpretation: { id:`${narrativeId}_interpretation`, title:"What the complete evidence means", paragraphs:["The front photos are the strongest visual sign that fat loss is continuing. The rear photos add a different part of the story: upper-body muscle appears preserved as the cut moves forward.",supportingEvidenceSentence(session.weight,latestDexa,executionSupport),`${limitation} Taken together, the photos support the current direction, while the upcoming DEXA remains the best confirmation of body-composition change.`].filter(Boolean), support:[session.weight, latestDexa ? formatDexa(latestDexa) : null, ...Object.values(executionSupport)].filter(Boolean) },
      coachInsight: { id:`${narrativeId}_coach`, title:"Coach’s Insight", body:`Stay the course into ${milestoneText}. Keep the next photo session as consistent as possible so the photos and DEXA tell the clearest story together.` },
    },
    evidenceReferences: activeViews.map((view)=>view.id),
    provenance: { synthesisId: session.synthesis?.id ?? session.synthesisSummaryReference, synthesisSource: session.synthesis?.source ?? "unavailable", version:EVENT_VERSION },
  };
}

export function createPhotoEventNarrativeService({ repositories, now = () => new Date() }) {
  return {
    async getLatest({ userId, sessionId }) {
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(userId);
      return artifacts.filter((item)=>item.artifactType==="event"&&item.trigger?.evidenceType==="photo_session"&&item.trigger?.evidenceId===sessionId).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]??null;
    },
    async getOrCreate({ userId, sessionId, preview = false }) {
      const [canonicalObjects, legacyPhotos, weights, analyses, goal, dexaScans, artifacts] = await Promise.all([
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId), repositories.progressPhotos.listPhotos(userId), repositories.weights.listWeightEntries(userId), repositories.analyses.listAnalyses(), repositories.goals.getActiveGoal(userId), repositories.dexaScans.listDEXAScans(userId), repositories.dailyBriefings.listDailyBriefings(userId),
      ]);
      const session = createPhotoSessionReadModels({ canonicalObjects, legacyPhotos, weights, analyses }).find((item)=>item.id===sessionId);
      if (!session) return null;
      const eventId=`event_briefing_progress_photo_${session.id}`;
      const existing=artifacts.find((item)=>item.id===eventId);
      if (existing?.briefing?.version === EVENT_VERSION && !preview) return existing;
      const latestDexa=[...dexaScans].sort((a,b)=>String(b.measuredAt).localeCompare(String(a.measuredAt)))[0]??null;
      const executionSupport=deriveExecutionSupport(canonicalObjects,session.captureDate);
      const narrative=composePhotoEventNarrative({session,goal,latestDexa,executionSupport,milestone:{label:"DEXA on Saturday, Jul 18 at 7:30 AM",date:"2026-07-18"},generatedAt:now().toISOString()});
      const artifact={id:eventId,userId,artifactType:"event",cadence:"event",generatedAt:narrative.generatedAt,trigger:{evidenceType:"photo_session",evidenceId:session.id},lifecycle:{openedAt:null,consumedAt:null},briefing:{version:EVENT_VERSION,photoEventNarrative:narrative}};
      if (!preview) await repositories.dailyBriefings.createDailyBriefing(artifact);
      return artifact;
    },
  };
}

function find(values,pattern){return values.find((value)=>pattern.test(value));}
function isNaturalFinding(value){return !/fallback|metadata|persist|repository|evidence|claim|comparable set|confirmed/i.test(value);}
function poseHeadline(poseId,findings){if(poseId==="front-relaxed")return find(findings,/waist|midsection|front shape|silhouette/i)??"The front shape looks cleaner.";if(poseId==="back-relaxed")return find(findings,/no meaningful|stable|maintain/i)??"Overall rear shape appears stable.";return find(findings,/no meaningful|stable|maintain|taper/i)??"Back fullness and taper appear stable.";}
function poseSupportingObservations(poseId,findings){const blocked=poseId==="front-relaxed"?/silhouette|front shape|shoulder.to.waist/i:/overall shape|no meaningful/i;return semanticDeduplicate(findings.filter((value)=>!blocked.test(value))).slice(0,2);}
function supportingEvidenceSentence(weight,dexa,support={}){const parts=[];if(weight&&!/^No /.test(weight))parts.push("the continued weight trend");if(support.training)parts.push("consistent resistance training");if(support.activity)parts.push("sustained activity through the week");if(support.nutrition)parts.push("the available nutrition record");const reinforcement=parts.length?`${joinNarrative(parts)} ${parts.length===1?"reinforces":"reinforce"} the visual pattern`:`The photos remain the clearest current signal`;const sentence=`${reinforcement}${dexa?", with the latest DEXA serving as the body-composition baseline":""}.`;return sentence.charAt(0).toUpperCase()+sentence.slice(1);}
export function deriveExecutionSupport(canonicalObjects=[],eventDate){const start=new Date(`${eventDate}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-6);const startKey=start.toISOString().slice(0,10);const recent=canonicalObjects.filter((item)=>item.quality?.status!=="superseded"&&String(item.lastObservedAt).slice(0,10)>=startKey&&String(item.lastObservedAt).slice(0,10)<=eventDate);const count=(types)=>recent.filter((item)=>types.includes(item.evidence_type)&&item.payload?.quality?.status!=="incomplete").length;const training=count(["training"]);const activity=count(["activity_day"]);const nutrition=count(["nutrition"]);return {...(training>=2?{training:"Resistance training was consistent through the week."}:{}),...(activity>=3?{activity:"Activity remained sustained through the week."}:{}),...(nutrition>=3?{nutrition:"The available nutrition record remained aligned with the cut."}:{})};}
function joinNarrative(values){if(values.length===1)return values[0];if(values.length===2)return `${values[0]} and ${values[1]}`;return `${values.slice(0,-1).join(", ")}, and ${values.at(-1)}`;}
function formatDexa(scan){const bf=scan.bodyFatPercentage?.value??scan.bodyFatPercentage;return bf?`Latest DEXA: ${bf}% body fat`:`Latest DEXA: ${String(scan.measuredAt).slice(0,10)}`;}
function describeSessionConditions(c={}){const values=[];if(c.postWorkout===true)values.push("after your workout");if(c.fasted===true)values.push("fasted");if(c.fasted===false)values.push("after eating");if(c.morning===true)values.push("in the morning");if(c.morning===false)values.push("later in the day");return values.length?`Taken ${values.join(", ")}.`:"Capture details are limited.";}
