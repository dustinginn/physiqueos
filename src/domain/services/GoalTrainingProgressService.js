import { createTrainingPerformanceIntelligenceReport, getActiveResistanceTrainingSessions } from "./TrainingPerformanceIntelligenceService";
import { expectedPhaseReviewDate } from "./GoalPhaseTimelineIntegrityService";
import { resolveTrainingExerciseOccurrenceIdentity } from "../models/trainingExerciseIdentity";
import { resolveUserFacingObjectLanguage } from "./UserFacingObjectLanguageService";

const DAY_MS = 86400000;
export const GOAL_TRAINING_PRIORITY_GROUPS = Object.freeze(["Lower Body", "Core", "Arms"]);

export function createGoalTrainingProgress({ goal, phase, canonicalObjects = [], currentDate = new Date(), timeZone = "UTC" } = {}) {
  const period = resolveGoalTrainingReviewPeriod({ phase });
  const today = localDate(currentDate, timeZone);
  const phaseEvidence = canonicalObjects.filter((object) => {
    const date = String(object?.payload?.observed_at ?? object?.observed_at ?? "").slice(0, 10);
    return date >= period.start && date <= period.end;
  });
  const report = createTrainingPerformanceIntelligenceReport({ canonicalObjects: phaseEvidence, now: `${today}T12:00:00Z` });
  return composeGoalTrainingProgress({ goal, phase, period, report, today, comparabilityBlocks: findComparabilityBlocks(phaseEvidence) });
}

// Training progress to date for the active phase: the same defensible
// movement comparisons as the phase review, but over phase start -> today and
// with no review boundary, so a terminal phase still reports how training is
// actually moving. The interpretation is Server-owned coaching copy.
const TRAINING_REGION_BY_CATEGORY = Object.freeze({
  quads: "lower body", glutes: "lower body", hamstrings: "lower body", calves: "lower body", adductors: "lower body", abductors: "lower body", "lower body": "lower body", legs: "lower body",
  chest: "upper body", back: "upper body", shoulders: "upper body", lats: "upper body", traps: "upper body", "upper body": "upper body",
  biceps: "arms", triceps: "arms", forearms: "arms", arms: "arms",
  core: "core", abs: "core", abdominals: "core",
});

export function trainingRegionForCategory(category) {
  return TRAINING_REGION_BY_CATEGORY[String(category ?? "").trim().toLowerCase()] ?? null;
}

export function createGoalTrainingProgressToDate({ phase, canonicalObjects = [], currentDate = new Date(), timeZone = "UTC" } = {}) {
  const start = phase?.startedAt ?? phase?.startDate;
  if (!validDate(start)) return null;
  const today = localDate(currentDate, timeZone);
  // Local training day (the user's zone), not the UTC date of observed_at.
  const dayOf = (value) => {
    const text = String(value ?? "");
    if (!text) return "";
    return /T/.test(text) && Number.isFinite(Date.parse(text)) ? localDate(new Date(text), timeZone) : text.slice(0, 10);
  };
  const phaseEvidence = canonicalObjects.filter((object) => {
    const date = dayOf(object?.payload?.observed_at ?? object?.observed_at);
    return date >= start && date <= today;
  });
  const report = createTrainingPerformanceIntelligenceReport({ canonicalObjects: phaseEvidence, now: `${today}T12:00:00Z` });
  // Count only live resistance sessions (the same de-duplicated, non-superseded
  // set the performance report reads), never raw evidence revisions.
  const sessions = getActiveResistanceTrainingSessions(phaseEvidence);
  return composeGoalTrainingProgressToDate({ start, today, report, sessionCount: sessions.length,
    trainingDayCount: new Set(sessions.map((session) => dayOf(session.observed_at)).filter(Boolean)).size,
    comparabilityBlocks: findComparabilityBlocks(phaseEvidence) });
}

export function composeGoalTrainingProgressToDate({ start, today, report, sessionCount = 0, trainingDayCount = 0, comparabilityBlocks = new Set() } = {}) {
  const comparisons = (report?.exerciseObservations ?? []).map((item) => toMovementComparison(item, comparabilityBlocks)).filter(Boolean)
    .map((item) => ({ ...item, region: trainingRegionForCategory(item.muscleGroup) }));
  const improving = comparisons.filter((item) => item.status === "improving");
  const regressing = comparisons.filter((item) => item.status === "regressing");
  const steady = comparisons.filter((item) => ["plateauing", "stable", "steady"].includes(item.status));
  const state = comparisons.length >= 3 ? "established" : comparisons.length > 0 ? "forming" : "waiting_for_evidence";
  const regions = ["lower body", "upper body", "arms", "core"].map((region) => {
    const members = comparisons.filter((item) => item.region === region);
    if (!members.length) return null;
    const count = (status) => members.filter((item) => item.status === status).length;
    const status = count("improving") > count("regressing") && count("improving") * 2 >= members.length ? "improving"
      : count("regressing") > count("improving") ? "regressing" : "steady";
    return Object.freeze({ region, status, movementCount: members.length, improvingCount: count("improving"), regressingCount: count("regressing") });
  }).filter(Boolean);
  const highlights = [...improving].sort((a, b) => (b.percentChange ?? -Infinity) - (a.percentChange ?? -Infinity)).slice(0, 3)
    .map((item) => Object.freeze({ name: item.name, region: item.region, status: item.status, percentChange: item.percentChange,
      currentVolumeLoad: item.currentVolumeLoad, previousVolumeLoad: item.previousVolumeLoad, personalRecord: item.prs.length > 0 }));
  return Object.freeze({
    state,
    periodStart: start,
    periodEnd: today,
    sessionCount,
    trainingDayCount,
    comparableMovementCount: comparisons.length,
    improvingCount: improving.length,
    steadyCount: steady.length,
    regressingCount: regressing.length,
    regions,
    highlights,
    regressions: regressing.slice(0, 2).map((item) => Object.freeze({ name: item.name, region: item.region, percentChange: item.percentChange })),
    summary: trainingProgressSummary({ state, comparisons, improving, regressing, regions }),
  });
}

// What training adds beyond DEXA: the comparable-movement trend and its
// notable weakness. It never concludes the overall goal thesis.
function trainingProgressSummary({ state, comparisons, improving, regressing, regions }) {
  if (state === "waiting_for_evidence") return "Not enough repeated movements have been logged in this phase to judge training progress yet.";
  if (state === "forming") return `${comparisons.length} ${comparisons.length === 1 ? "movement has" : "movements have"} comparable sessions so far; more repeats are needed before training progress can be judged.`;
  const improvingRegions = regions.filter((item) => item.status === "improving").map((item) => item.region);
  const where = improvingRegions.length ? `, led by ${joinWords(improvingRegions)}` : "";
  const steadyCount = comparisons.length - improving.length - regressing.length;
  const verb = (count) => (count === 1 ? "is" : "are");
  const lead = improving.length * 2 >= comparisons.length
    ? `${improving.length} of ${comparisons.length} comparable movements ${verb(improving.length)} improving${where}.`
    : regressing.length > improving.length
      ? `More movements are slipping than improving: ${regressing.length} of ${comparisons.length} ${verb(regressing.length)} down.`
      : steadyCount * 2 > comparisons.length
        ? `Most comparable movements are holding steady${improving.length ? `; ${improving.length} of ${comparisons.length} ${verb(improving.length)} improving${where}` : ""}.`
        : `Results are mixed across ${comparisons.length} comparable movements: ${improving.length} improving, ${regressing.length} down.`;
  const slipping = regressing.length && improving.length * 2 >= comparisons.length
    ? ` ${joinWords(regressing.slice(0, 2).map((item) => item.name))} ${regressing.length === 1 ? "is" : "are"} down.` : "";
  return `${lead}${slipping}`;
}

function joinWords(values) {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

export function resolveGoalTrainingReviewPeriod({ phase } = {}) {
  const start = phase?.startedAt ?? phase?.startDate;
  if (!phase?.id || !validDate(start)) throw new Error("A phase with a valid start date is required.");
  const reviewDate = expectedPhaseReviewDate(phase);
  if (!validDate(reviewDate)) throw new Error("A phase review date is required.");
  return Object.freeze({ start, end: reviewDate, reviewDate, comparisonMode: "evidence_based_phase_review" });
}

export function composeGoalTrainingProgress({ goal, phase, period = resolveGoalTrainingReviewPeriod({ phase }), report, today, comparabilityBlocks = new Set() } = {}) {
  const observations = report?.exerciseObservations ?? [];
  const defensible = observations.map((item)=>toMovementComparison(item,comparabilityBlocks)).filter(Boolean);
  const priority = defensible.filter((item) => GOAL_TRAINING_PRIORITY_GROUPS.includes(item.muscleGroup));
  const complete = String(today) >= period.reviewDate;
  const readinessState = readiness({ comparable: priority.length, complete, observations });
  const highlights = priority.filter((item) => item.status === "improving").sort((a,b)=>(b.percentChange??-Infinity)-(a.percentChange??-Infinity)).slice(0,3);
  const plateaus = priority.filter((item) => item.status === "plateauing").slice(0,2);
  const regressions = priority.filter((item) => item.status === "regressing").sort((a,b)=>(a.percentChange??0)-(b.percentChange??0)).slice(0,2);
  const checkpoint = createTrainingProgressCheckpoint({ goalId: goal?.id, phaseId: phase.id, phaseName: phase.name, reviewDate: period.reviewDate, readinessState });
  return Object.freeze({
    periodStart: period.start, periodEnd: period.end, reviewDate: period.reviewDate,
    phaseId: phase.id, phaseName: phase.name, comparisonMode: period.comparisonMode,
    readinessState, comparableMovementCount: priority.length,
    sessionCoverage: new Set(priority.flatMap((item)=>item.supportingSessionIds)).size,
    priorityMuscleGroups: GOAL_TRAINING_PRIORITY_GROUPS.map((group)=>groupSummary(group, priority)),
    movementHighlights: highlights, improvingMovements: highlights,
    plateauingMovements: plateaus, regressingMovements: regressions,
    prs: priority.flatMap((item)=>item.prs.map((pr)=>({...pr,movement:item.name}))).slice(0,3),
    volumeLoadChanges: priority.filter((item)=>Number.isFinite(item.currentVolumeLoad)&&Number.isFinite(item.previousVolumeLoad)),
    overallInterpretation: interpretation(readinessState, priority),
    nextReviewDate: period.reviewDate, checkpointEligibility: checkpoint.completed,
    checkpoint, warnings: warningsFor({ observations, priority }),
  });
}

export function createTrainingProgressCheckpoint({ goalId, phaseId, phaseName, reviewDate, readinessState }) {
  const completed = readinessState === "ready";
  const phaseReference = resolveUserFacingObjectLanguage({
    objectType: "phase",
    canonicalId: phaseId,
    displayName: phaseName,
    specificity: "coaching",
    narrativeContext: "long_term_training_review",
  }).selectedReference;
  return Object.freeze({ id: `goal-training-progress|${goalId}|${phaseId}|${reviewDate}`, type: "training_progress_review", date: reviewDate, title: "First four-week training review", phaseName, completed, turningPoint: completed ? { date: reviewDate, title: "Four-week training review", body: `Your long-term training review is ready for ${phaseReference}.` } : null });
}

function toMovementComparison(observation, comparabilityBlocks) {
  const detail=observation?.explanation_data, latest=detail?.last_session, previous=detail?.previous_comparable_session;
  if (!observation?.exercise?.key || comparabilityBlocks.has(observation.exercise.key) || observation.confidence === "low" || !latest || !previous) return null;
  const start=observation.evidence_date_range?.start, end=observation.evidence_date_range?.end;
  if (!validDate(start)||!validDate(end)||daysBetween(start,end)<7) return null;
  const setRatio=Math.max(latest.set_count??0,previous.set_count??0)/Math.max(1,Math.min(latest.set_count??0,previous.set_count??0));
  if(setRatio>2)return null;
  const trend=detail.volume_trend??{}, current=trend.latest, prior=trend.previous;
  const volumeComparable=Number.isFinite(current)&&Number.isFinite(prior)&&prior>0;
  const prs=detail.pr_detection?.detected ? detail.pr_detection.prs??[] : [];
  if (!volumeComparable && prs.length===0) return null;
  return { id:observation.exercise.key, name:observation.exercise.name, muscleGroup:observation.exercise.primaryNavigationCategory, status:observation.status, currentVolumeLoad:volumeComparable?current:null, previousVolumeLoad:volumeComparable?prior:null, absoluteChange:volumeComparable?round(current-prior):null, percentChange:volumeComparable?trend.percent_change:null, prs, supportingSessionIds:observation.supporting_session_ids??[], evidenceStart:start, evidenceEnd:end };
}
function readiness({comparable,complete,observations}) { const ambiguous=observations.some((item)=>item.confidence==="low"&&item.supporting_session_ids?.length>1); if(complete)return comparable>=2&&!ambiguous?"ready":"limited"; if(comparable>0)return "forming"; return "waiting_for_evidence"; }
function groupSummary(group, movements){const supported=movements.filter((item)=>item.muscleGroup===group);if(!supported.length)return {group,status:"too_early_to_assess",movementCount:0};const counts=(status)=>supported.filter((item)=>item.status===status).length;const status=counts("regressing")?"regressing":counts("improving")?"improving":counts("plateauing")?"plateauing":"steady";return {group,status,movementCount:supported.length};}
function interpretation(state,movements){if(state==="waiting_for_evidence")return "Your first long-term training review will appear once enough repeated movement data is available.";if(state==="forming")return `Training Progress is beginning to form. ${movements.length} priority movement${movements.length===1?" now has":"s now have"} comparable sessions.`;if(state==="limited")return "The review boundary has arrived, but the available comparisons remain too limited for a durable training conclusion.";const improving=movements.filter((item)=>item.status==="improving").map((item)=>item.muscleGroup);const regressing=movements.filter((item)=>item.status==="regressing").map((item)=>item.muscleGroup);if(regressing.length)return `Long-term performance has slowed across ${unique(regressing).join(" and ")}, which adds caution to phase readiness.`;if(improving.length)return `Performance across ${unique(improving).join(" and ")} is moving upward, which supports the current goal strategy.`;return "Comparable priority movements are steady across this phase.";}
function warningsFor({observations,priority}){const warnings=[];if(!priority.length)warnings.push("More repeated, comparable priority-movement sessions are needed.");if(observations.some((item)=>item.confidence==="low"))warnings.push("Low-confidence or ambiguous observations were excluded.");return warnings;}
function findComparabilityBlocks(objects){const variants=new Map();for(const object of objects){const session=object?.payload??object;for(const exercise of session?.exercises??[]){const identity=resolveTrainingExerciseOccurrenceIdentity(exercise);if(!identity.canonicalExerciseId)continue;const explicitEquipment=String(exercise.equipment??"").toLowerCase().trim();const modifier=JSON.stringify(identity.modifierExtraction??{});const key=identity.canonicalExerciseId;variants.set(key,new Set([...(variants.get(key)??[]),`${explicitEquipment}|${modifier}`]));}}return new Set([...variants].filter(([,values])=>values.size>1).map(([key])=>key));}
function localDate(value,timeZone){const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value instanceof Date?value:new Date(value));const p=(type)=>parts.find((item)=>item.type===type)?.value;return `${p("year")}-${p("month")}-${p("day")}`;}
function addDays(value,amount){return new Date(Date.parse(`${value}T00:00:00Z`)+amount*DAY_MS).toISOString().slice(0,10)}
function daysBetween(a,b){return Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/DAY_MS)}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value??"")}
function unique(values){return [...new Set(values)]}
function round(value){return Math.round(value*10)/10}
