import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";

export const OVERALL_GOAL_CONFIDENCE_VERSION = "overall_goal_confidence_v1";

export function resolveOverallGoalConfidenceReadModel({ activeGoal, activeProtocols = [], canonicalEvidence = [], checkIns = [], currentDate = new Date(), dexaScans = [], nutritionContext = null, progressPhotos = [], timeZone = "UTC", trainingPerformance = null } = {}) {
  const evidenceSummary = createOverallGoalConfidenceEvidenceSummary({ activeProtocols, canonicalEvidence, checkIns, dexaScans, nutritionContext, progressPhotos, trainingPerformance });
  const trajectory = resolveHomeGoalTrajectory({ activeGoal, currentDate, timeZone, evidenceSummary, dexaScans });
  if (!trajectory.hasExplicitPhases) throw new Error("Overall goal confidence requires an explicit phase trajectory.");
  const confidence = trajectory.confidence;
  return Object.freeze({
    value: confidence.numericValue,
    band: confidence.qualitativeLevel,
    explanation: Object.freeze({
      supportingFactors: confidence.supportingFactors,
      limitingFactors: confidence.limitingFactors,
      improvementFactors: confidence.clarifyingFactors,
      uncertaintyStatement: confidence.uncertaintyStatement,
      evidenceBasis: confidence.evidenceInputsUsed,
    }),
    source: Object.freeze({
      version: OVERALL_GOAL_CONFIDENCE_VERSION,
      goalId: activeGoal.id,
      goalRevision: activeGoal.updatedAt ?? activeGoal.revision ?? null,
      phaseFingerprint: fingerprint((activeGoal.phases ?? []).map(phaseSource)),
      evidenceFingerprint: fingerprint(evidenceSource({ activeProtocols, canonicalEvidence, checkIns, dexaScans, nutritionContext, progressPhotos })),
      evaluatedAt: localDate(currentDate, timeZone),
    }),
    trajectory,
  });
}

export function createOverallGoalConfidenceEvidenceSummary({ activeProtocols = [], canonicalEvidence = [], checkIns = [], dexaScans = [], nutritionContext = null, progressPhotos = [], trainingPerformance = null } = {}) {
  return Object.freeze({
    nutritionConsistent: Boolean(nutritionContext),
    trainingConsistent: Boolean(trainingPerformance?.sessions?.length ?? canonicalEvidence.some((item) => /training/i.test(item.type ?? item.evidenceType ?? ""))),
    activityConsistent: checkIns.length > 0,
    evidenceConsistent: progressPhotos.length > 0 || dexaScans.length > 0,
    protocolAdherence: activeProtocols.length > 0,
  });
}

function phaseSource(phase){return {id:phase.id,name:phase.name,status:phase.status,order:phase.order,startDate:phase.startDate,targetDate:phase.targetDate,duration:phase.duration,timingMode:phase.timingMode,updatedAt:phase.updatedAt};}
function evidenceSource({activeProtocols,canonicalEvidence,checkIns,dexaScans,nutritionContext,progressPhotos}){const ids=(values,dateKey)=>values.map((item)=>[item.id??item.canonicalId??item.scanId??null,item.updatedAt??item[dateKey]??null]);return {protocols:ids(activeProtocols,"startDate"),canonical:ids(canonicalEvidence,"observed_at"),checkIns:ids(checkIns,"date"),dexa:ids(dexaScans,"measuredAt"),photos:ids(progressPhotos,"date"),nutrition:nutritionContext?.updatedAt??nutritionContext?.id??Boolean(nutritionContext)};}
function fingerprint(value){const text=JSON.stringify(value);let hash=2166136261;for(let index=0;index<text.length;index+=1){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619);}return `fnv1a_${(hash>>>0).toString(16).padStart(8,"0")}`;}
function localDate(value,timeZone){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value instanceof Date?value:new Date(value));const pick=(type)=>parts.find((item)=>item.type===type)?.value;return `${pick("year")}-${pick("month")}-${pick("day")}`;}
