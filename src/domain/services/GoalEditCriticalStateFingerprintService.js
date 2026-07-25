import { createHash } from "node:crypto";
import { sourceRevision } from "./GoalEditDraftService";
import { GOAL_PLAN_REVIEW_TOKEN_VERSION } from "./GoalPlanUpdateService";
import { GOAL_PHASE_REVIEW_TOKEN_VERSION, phaseFingerprint } from "./GoalPhasePersistenceService";

export const GOAL_EDIT_CRITICAL_PROJECTION_VERSION="goal_edit_critical_projection_v1";
export const GOAL_PLANNING_BASELINE_VERSION="goal_planning_baseline_v1";
const NORMAL_KEYS=new Set(["revision","lastCommitId","canonicalEvidenceObjects","evidencePackages","evidenceReviews","analyses","analysisOutputs","dailyBriefings","briefings","progressPhotos","dexaScans","nutritionDays","nutritionUploads","trainingSessions","activityRecords","recoveryRecords","dailyLogs","logs","runtimeCaches","updatedAt"]);
const CRITICAL_KEYS=new Set(["goals"]);

export class GoalEditCriticalStateError extends Error{constructor(code,message,details={}){super(message);this.name="GoalEditCriticalStateError";this.code=code;this.details=freeze(structuredClone(details))}}

export function projectGoalEditCriticalState(store,{projectionVersion=GOAL_EDIT_CRITICAL_PROJECTION_VERSION}={}){
 if(projectionVersion!==GOAL_EDIT_CRITICAL_PROJECTION_VERSION)throw new GoalEditCriticalStateError("GOAL_EDIT_CRITICAL_VERSION_UNSUPPORTED","Unsupported Goal Edit critical projection version.",{projectionVersion});
 if(!store||typeof store!=="object"||Array.isArray(store))throw new GoalEditCriticalStateError("GOAL_EDIT_CRITICAL_STORE_INVALID","Founder runtime state must be an object.");
 const active=(store.goals??[]).filter(goal=>goal?.primary===true&&goal?.status==="active");
 if(active.length!==1)throw new GoalEditCriticalStateError("GOAL_EDIT_CRITICAL_ACTIVE_GOAL_INVALID","Exactly one active primary goal is required.",{count:active.length});
 const goal=active[0],phases=Array.isArray(goal.phases)?structuredClone(goal.phases):[];
 const criticalProjection={projectionVersion,activeGoal:pickGoal(goal),phases:sortRecords(phases),protectedRelationships:relationships(goal),persistenceCapabilities:{goalPlanReviewTokenVersion:GOAL_PLAN_REVIEW_TOKEN_VERSION,goalPhaseReviewTokenVersion:GOAL_PHASE_REVIEW_TOKEN_VERSION,goalPlanUpdateAvailable:true,phasePersistenceAvailable:Array.isArray(goal.phases)}};
 return freeze({fingerprintVersion:projectionVersion,goalId:goal.id,founderRevision:store.revision??null,lastCommitId:store.lastCommitId??null,goalSourceRevision:sourceRevision(goal),phaseFingerprint:phaseFingerprint(phases),criticalFingerprint:hash(criticalProjection),criticalProjection,projectionWarnings:Array.isArray(goal.phases)?[]:["Active goal has no explicit phases collection."]});
}

export function captureGoalPlanningBaseline(store,{capturedAt=new Date().toISOString(),fullRuntimeHash=hash(store),fileSize=null,lastModified=null}={}){
 const critical=projectGoalEditCriticalState(store);
 return freeze({baselineVersion:GOAL_PLANNING_BASELINE_VERSION,capturedAt,fullRuntimeHash,fileSize,lastModified,founderRevision:critical.founderRevision,lastCommitId:critical.lastCommitId,goalEditCriticalFingerprint:critical.criticalFingerprint,goalSourceRevision:critical.goalSourceRevision,phaseFingerprint:critical.phaseFingerprint,activeGoalId:critical.goalId,explicitPhaseCount:critical.criticalProjection.phases.length,projectionVersion:critical.fingerprintVersion,criticalProjection:critical.criticalProjection,runtimeIndex:indexRuntime(store)});
}

export function reconcileGoalPlanningBaseline(baseline,currentStore,{currentFullRuntimeHash=hash(currentStore),attribution=[]}={}){
 if(!baseline||baseline.baselineVersion!==GOAL_PLANNING_BASELINE_VERSION||baseline.projectionVersion!==GOAL_EDIT_CRITICAL_PROJECTION_VERSION)return freeze({classification:"invalid_baseline",mayContinue:false,errors:["Baseline version is missing or unsupported."]});
 let current;try{current=projectGoalEditCriticalState(currentStore)}catch(error){return freeze({classification:"goal_edit_critical_drift",mayContinue:false,errors:[error.message]})}
 const pathSummary=summarizeRuntimeDiff(baseline.runtimeIndex,indexRuntime(currentStore));
 const criticalPaths=diffPaths(baseline.criticalProjection,current.criticalProjection);
 const fullChanged=baseline.fullRuntimeHash!==currentFullRuntimeHash,criticalChanged=baseline.goalEditCriticalFingerprint!==current.criticalFingerprint;
 let classification="unchanged";
 if(criticalChanged)classification="goal_edit_critical_drift";
 else if(fullChanged)classification=pathSummary.changedTopLevelKeys.length>0&&pathSummary.changedTopLevelKeys.every(key=>pathSummary.areas[key].classification==="normal-runtime")?"normal_runtime_drift":"unknown_drift";
 const attributionVerified=verifyAttribution(attribution,pathSummary);
 return freeze({classification,mayContinue:classification==="unchanged"||classification==="normal_runtime_drift",fullRuntimeChanged:fullChanged,criticalFingerprintChanged:criticalChanged,founderRevisionChanged:baseline.founderRevision!==current.founderRevision,activeGoalIdChanged:baseline.activeGoalId!==current.goalId,goalSourceRevisionChanged:baseline.goalSourceRevision!==current.goalSourceRevision,phaseFingerprintChanged:baseline.phaseFingerprint!==current.phaseFingerprint,criticalChangedPaths:criticalPaths,pathSummary,attributionVerified,current});
}

export function summarizeRuntimeDiff(beforeIndex,afterIndex){
 const keys=[...new Set([...Object.keys(beforeIndex??{}),...Object.keys(afterIndex??{})])].sort(),areas={};
 for(const key of keys){const before=beforeIndex?.[key],after=afterIndex?.[key];if(equal(before,after))continue;const classification=CRITICAL_KEYS.has(key)?"goal-edit-critical":NORMAL_KEYS.has(key)?"normal-runtime":"unknown";areas[key]={classification,...counts(before,after),changedRecordIds:changedIds(before,after)};}
 return freeze({changedTopLevelKeys:Object.keys(areas),areas});
}

export function goalEditPatchMayContinue(result,{phaseWork=false}={}){if(!result?.mayContinue||result.activeGoalIdChanged||result.goalSourceRevisionChanged)return false;if(phaseWork&&result.phaseFingerprintChanged)return false;return true}

function pickGoal(goal){const fields=["id","userId","title","name","type","primary","status","lifecycle","createdAt","updatedAt","activatedAt","completedAt","pausedAt","archivedAt","purpose","primaryOutcome","target","timeline","successCriteria","guardrails","coachingPreferences","activationMetadata","activationState","completion","completionMetadata","progressMeasurement","sourceGoalId","createdFromTransitionId","navigationIdentity"];return Object.fromEntries(fields.map(key=>[key,structuredClone(goal[key]??null)]))}
function relationships(goal){const keys=["protocolIds","activeProtocolIds","evidenceLinks","evidencePackageIds","supportingGoalIds","supportingObjectives","goalRelationships","briefingIds","schedulerIds","coachingCadenceReference"];return Object.fromEntries(keys.map(key=>[key,sortValue(goal[key]??null)]))}
function indexRuntime(store){return freeze(Object.fromEntries(Object.keys(store).sort().map(key=>[key,indexValue(store[key])])))}
function indexValue(value){if(Array.isArray(value)){const records={};for(const [index,item] of value.entries())records[String(item?.id??item?.key??index)]=hash(item);return{kind:"collection",count:value.length,records}}return{kind:"scalar",fingerprint:hash(value)}}
function counts(before,after){if(before?.kind!=="collection"&&after?.kind!=="collection")return{added:0,removed:0,modified:1};const left=before?.records??{},right=after?.records??{},ids=new Set([...Object.keys(left),...Object.keys(right)]);let added=0,removed=0,modified=0;for(const id of ids){if(!(id in left))added++;else if(!(id in right))removed++;else if(left[id]!==right[id])modified++;}return{added,removed,modified}}
function changedIds(before,after){if(before?.kind!=="collection"&&after?.kind!=="collection")return[];const left=before?.records??{},right=after?.records??{};return [...new Set([...Object.keys(left),...Object.keys(right)])].filter(id=>left[id]!==right[id]).sort()}
function verifyAttribution(values,summary){const requested=[...new Set((Array.isArray(values)?values:[values]).filter(Boolean))];const evidenceKeys=new Set(["canonicalEvidenceObjects","evidencePackages","evidenceReviews","analyses","analysisOutputs","progressPhotos","dexaScans"]),briefingKeys=new Set(["dailyBriefings","briefings"]),loggingKeys=new Set(["dailyLogs","logs","nutritionDays","trainingSessions","activityRecords","recoveryRecords"]);const changed=summary.changedTopLevelKeys;return requested.map(value=>({value,verified:value==="evidence uploaded"||value==="evidence confirmed"?changed.some(key=>evidenceKeys.has(key)):value==="briefing generated"?changed.some(key=>briefingKeys.has(key)):value==="daily logging occurred"?changed.some(key=>loggingKeys.has(key)):false}))}
function diffPaths(left,right,path="criticalProjection"){if(equal(left,right))return[];if(Array.isArray(left)&&Array.isArray(right)){const length=Math.max(left.length,right.length);return Array.from({length},(_,index)=>diffPaths(left[index],right[index],`${path}[${index}]`)).flat()}if(!left||!right||typeof left!=="object"||typeof right!=="object"||Array.isArray(left)||Array.isArray(right))return[path];return [...new Set([...Object.keys(left),...Object.keys(right)])].sort().flatMap(key=>diffPaths(left[key],right[key],`${path}.${key}`))}
function sortRecords(records){return [...records].map(item=>structuredClone(item)).sort((a,b)=>(Number(a?.order??0)-Number(b?.order??0))||String(a?.id??"").localeCompare(String(b?.id??"")))}
function sortValue(value){if(Array.isArray(value))return [...value].map(item=>structuredClone(item)).sort((a,b)=>stable(a).localeCompare(stable(b)));return structuredClone(value)}
function hash(value){return createHash("sha256").update(stable(value)).digest("hex")}
function stable(value){if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function equal(left,right){return stable(left)===stable(right)}
function freeze(value){if(!value||typeof value!=="object"||Object.isFrozen(value))return value;Object.values(value).forEach(freeze);return Object.freeze(value)}
