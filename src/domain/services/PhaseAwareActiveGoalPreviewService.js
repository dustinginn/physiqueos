import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";
import { createGoalTrainingProgress, createGoalTrainingProgressToDate } from "./GoalTrainingProgressService";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";
import { confidenceExplanationDetailFromModel } from
  "../presentation/confidenceExplanationPresentation";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { loadApplicationCanonicalRuntime } from "../../application/runtime/ApplicationCanonicalRuntime";
import { projectFounderBuildLeanMassPhaseCorrection } from "./FounderPhaseCorrectionService";
import { describeWeightAndEnergyInterpretation } from "../presentation/evidenceInterpretationPresentation";
import { runRepositoryReadScope } from "../../application/read-models/RepositoryReadScope";
import { composeActiveGoalCurrentState, selectAuthoritativeGoalDexaRecords, selectLatestPublishedV3Briefing } from "./ActiveGoalCurrentStateService";

export async function getPhaseAwareActiveGoalPreview({ repositories = FounderRepositories, currentDate = new Date() } = {}) {
  return runRepositoryReadScope({ repositories, readModel: "goals.phase-aware-preview", callback: () => getPhaseAwareActiveGoalPreviewWithinScope({ repositories, currentDate }) });
}

async function getPhaseAwareActiveGoalPreviewWithinScope({ repositories, currentDate }) {
  const user = await repositories.users.getCurrentUser();
  if (!user) throw new Error("The current user is unavailable.");
  const [goal, dexaScans, protocols, canonicalEvidence, checkIns, nutritionContext, progressPhotos] = await Promise.all([
    repositories.goals.getActiveGoal(user.id),
    repositories.dexaScans.listDEXAScans(user.id),
    repositories.protocols.listActiveProtocols(user.id),
    repositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id),
    repositories.dailyCheckIns.listCheckIns(user.id),
    repositories.nutritionContext.getNutritionContext(user.id),
    repositories.progressPhotos.listPhotos(user.id),
  ]);
  const store = await loadApplicationCanonicalRuntime();
  return composePhaseAwareActiveGoalPreview({ user, goal, dexaScans, protocols, canonicalEvidence, checkIns, nutritionContext, progressPhotos, latestBriefing: selectLatestPublishedV3Briefing(store.dailyBriefings ?? []), currentDate, store });
}

export function composePhaseAwareActiveGoalPreview({ user, goal, dexaScans = [], protocols = [], canonicalEvidence = [], checkIns = [], nutritionContext = null, progressPhotos = [], latestBriefing = null, currentDate = new Date(), store = {} }) {
  if (!goal || goal.status !== "active" || goal.type !== "build_lean_mass") throw new Error("The active Build Lean Mass goal is unavailable.");
  goal = projectFounderBuildLeanMassPhaseCorrection(goal);
  const timeZone = user?.timeZone ?? user?.timezone ?? "America/Los_Angeles";
  // Only authoritative DEXA revisions (no failed/superseded/retracted records,
  // one revision per scan date) may drive baseline, current state or progress.
  dexaScans = selectAuthoritativeGoalDexaRecords(dexaScans);
  const trajectory = resolveHomeGoalTrajectory({ activeGoal: goal, phases: goal.phases, currentDate, timeZone, dexaScans });
  if (!trajectory.hasExplicitPhases || !trajectory.activePhase) throw new Error("The active goal phase trajectory is unavailable.");
  const active = trajectory.activePhase;
  const upcoming = trajectory.upcomingPhases[0] ?? null;
  const baseline = latestScanOnOrBefore(dexaScans, trajectory.overallGoal.journeyStartDate);
  const phaseStartScan = latestScanOnOrBefore(dexaScans, active.startDate);
  const phaseStart = phaseStartScan && phaseStartScan !== baseline && scanDate(phaseStartScan) !== scanDate(baseline)
    ? phaseStartScan : null;
  const acceptedStrategy = (store.phaseStrategies ?? []).find((item) =>
    item.id === goal.activePhaseStrategyId && item.phaseId === active.phaseId) ?? null;
  const strategicReviewCadence = acceptedStrategy?.domains?.energy?.strategicReviewCadence ??
    active.strategicReviewCadence ?? null;
  const strategicReviewAnchor = acceptedStrategy?.domains?.energy?.strategicReviewAnchor ??
    active.strategicReviewAnchor ?? null;
  const monthlyDexa = strategicReviewCadence === "monthly" && strategicReviewAnchor === "dexa_body_composition";
  const energyProtocol = protocols.find((item) => item.effectiveStrategy?.phaseId === active.phaseId) ?? null;
  const caloricIntakeTarget = energyProtocol?.effectiveStrategy?.caloricIntakeTarget ?? null;
  const activityExpenditureTarget = energyProtocol?.effectiveStrategy?.activityExpenditureTarget ?? null;
  const monitoringCadence = energyProtocol?.effectiveStrategy?.monitoringCadence ?? null;
  const protocolTypes = new Set(protocols.map((item) => String(item.protocolType ?? item.type ?? item.category ?? "").toLowerCase()));
  const strategy = ["Energy", "Nutrition", "Activity", "Training", "Coaching Updates", "Peptide", "Supplement"].map((label) => {
    const isActive = [...protocolTypes].some((type) => type.includes(label.toLowerCase().replace(" updates", "")));
    return { label, active: isActive, summary: summarizeStrategyDomain(label, { caloricIntakeTarget,
      activityExpenditureTarget, monitoringCadence, strategicReviewCadence, strategicReviewAnchor }) };
  });
  const guardrail = trajectory.overallGoal.sharedGuardrails.find((item) => /8.?9%|body fat/i.test(item)) ?? "Maintain approximately 8–9% body fat.";
  const overallGoalConfidence = resolveActiveGoalConfidencePresentation({
    activeGoal: goal,
    store,
  });
  const activePhaseRecord = goal.phases.find((item)=>item.id===active.phaseId);
  const trainingProgress = active.calculatedPlannedReviewDate
    ? createGoalTrainingProgress({ goal, phase: activePhaseRecord,
      canonicalObjects: canonicalEvidence, currentDate, timeZone })
    : null;
  const currentState = composeActiveGoalCurrentState({
    goal, activePhase: { ...active, purpose: active.purpose ?? activePhaseRecord?.purpose ?? null,
      strategicReviewCadence, strategicReviewAnchor },
    journeyStartDate: trajectory.overallGoal.journeyStartDate, phases: trajectory.phases,
    guardrailTexts: trajectory.overallGoal.sharedGuardrails, dexaScans,
    confidencePresentation: overallGoalConfidence,
    trainingProgress: createGoalTrainingProgressToDate({ phase: activePhaseRecord ?? { startDate: active.startDate },
      canonicalObjects: canonicalEvidence, currentDate, timeZone }),
    latestBriefing, confidenceHistory: store.goalConfidenceHistory ?? [], timeZone, currentDate,
  });
  const phaseNarrative = currentPhaseNarrative({ upcoming, monthlyDexa, trainingSummary: currentState.training?.summary ?? null });
  const currentScan = selectLatestScan(dexaScans);
  const guardrailObservation = describeGuardrailObservation(currentState.guardrail);
  // Selective turning points from canonical facts (the legacy fixed list
  // carried a fictional planned review and a future destination entry).
  const turningPoints = currentState.turningPoints.map(({ id, date, title, body }) => ({ id, date, title, body }));
  return {
    goalId: goal.id,
    phaseId: active.phaseId,
    confidence: nativeConfidencePresentation(overallGoalConfidence, currentState.confidence),
    hero: { title: trajectory.overallGoal.goalName, status: "Active Goal", destination: `${trajectory.overallGoal.targetDescription} by ${formatLongDate(trajectory.overallGoal.overallTargetDate)}`, confidence: `${overallGoalConfidence.value}% Confidence`, confidenceBand: overallGoalConfidence.label, confidenceDetail: currentState.confidence.summary, confidenceExplanation: confidenceExplanationDetailFromModel(overallGoalConfidence.goalExplanationModel), confidenceSource: overallGoalConfidence.source, confidenceMovement: overallGoalConfidence.movement, confidenceDelta: overallGoalConfidence.delta, confidenceAssessmentId: overallGoalConfidence.assessmentId, editHref: `/goals/${goal.id}/edit` },
    journey: trajectory.phases.map((phase) => phaseCard(phase, { monthlyDexa })),
    currentPhase: { id: active.phaseId, goalId: goal.id, title: active.phaseName, purpose: active.purpose,
      progress: active.progress.presentationLabel, review: phaseNarrative.review,
      evidence: phaseNarrative.evidence, readiness: phaseNarrative.readiness,
      color: active.presentationTone },
    next: upcoming ? { title: upcoming.phaseName, goal: trajectory.overallGoal.targetDescription, outcome: "The next DEXA will show whether this phase is working.", lead: "Day-to-day evidence — weight, training, and energy — shows how things are trending in between.", guardrail } : null,
    readiness: upcoming ? ["The current phase objective is sufficiently resolved.", "Goal and guardrail evidence support the next planned phase.", "The plan for the next phase will build on what's learned here."] : [],
    guardrail: { title: guardrail.replace(/[.]$/u, ""), scope: "Applies across every phase", body: currentState.guardrail?.interpretation ?? "DEXA remains authoritative for body composition. Scale weight provides context between scans, but does not replace it.", observation: guardrailObservation },
    evidence: {
      goalBaseline: dexaAnchor(baseline),
      phaseStart: dexaAnchor(phaseStart),
      current: dexaAnchor(currentScan),
      progress: trajectory.goalProgress && Number.isFinite(trajectory.goalProgress.changeValue) && Number.isFinite(trajectory.goalProgress.targetAmount)
        ? { changeLabel: signedAmount(trajectory.goalProgress.changeValue), targetLabel: `${formatNumber(trajectory.goalProgress.targetAmount)} lb`,
          remainingLabel: `${formatNumber(Math.max(trajectory.goalProgress.targetAmount - trajectory.goalProgress.changeValue, 0))} lb remaining` }
        : null,
      phaseBaseline: active.phaseBaseline, support: describeWeightAndEnergyInterpretation({
        weightEntries: store.weightEntries ?? [], phaseStartDate: active.startDate, currentDate,
        caloricIntakeTarget, activityExpenditureTarget, goalDirection: goal.target?.direction ?? null,
      }) },
    trainingProgress,
    turningPoints,
    // Build 60 compatibility only: Build 61+ renders the latest briefing's
    // Coach's Take (currentState.coachTake) in place of this grid.
    strategy,
    actions: { strategyHref: "/profile/operating-plan", protocolsHref: "/profile/operating-plan" },
    currentState,
  };
}

function nativeConfidencePresentation(value, goalConfidence) {
  return Object.freeze({
    status: value.status,
    score: value.score,
    band: value.label,
    movement: value.movement,
    priorScore: value.priorScore,
    delta: value.delta,
    assessmentId: value.assessmentId,
    goalId: value.goalId,
    phaseId: value.phaseId,
    evidenceCutoff: value.evidenceCutoff,
    publicationTimestamp: value.publicationTimestamp,
    // Goal-context explanation (V3 whyConfidence), never the publishing
    // briefing's movement sentence.
    summary: goalConfidence?.summary ?? null,
    explanation: goalConfidence?.detail
      ? Object.freeze({
        qualitativeLevel: value.label,
        summary: goalConfidence.summary ?? "",
        supportingFactors: [...goalConfidence.detail.whatSupportsIt],
        limitingFactors: [...goalConfidence.detail.whatIsHoldingItBack],
        movementFactors: [],
        clarifyingFactors: [],
        uncertaintyStatement: "",
      })
      : confidenceExplanationDetailFromModel(value.goalExplanationModel),
  });
}

function phaseCard(phase, { monthlyDexa = false } = {}) {
  const status = phase.status === "active" ? "Active" : phase.status === "completed" ? "Completed" : "Planned";
  const dates = phase.status === "active"
    ? `Started ${formatShortDate(phase.startDate)}${monthlyDexa ? " · Monthly DEXA" : ""}`
    : phase.status === "completed" ? `Started ${formatShortDate(phase.startDate)} · Completed`
      : `Projected · Target ${formatShortDate(phase.targetDate)}`;
  return { name: phase.phaseName, number: Number(phase.order ?? 0) + 1, status, dates,
    progress: phase.progress.presentationLabel,
    support: phase.progress.status === "awaiting_follow_up" ? "Awaiting next DEXA" : phase.friendlyTimeline,
    percentage: phase.progress.clampedProgressPercentage ?? phase.timelineProgressPercentage ?? 0,
    color: phase.presentationTone };
}
function currentPhaseNarrative({ upcoming, monthlyDexa, trainingSummary }) {
  if (upcoming) return { review: "Evidence-led", evidence: "Current evidence shows whether this phase objective is sufficiently resolved.", readiness: "The next phase begins once the evidence supports moving forward." };
  return { review: monthlyDexa ? "Monthly DEXA" : "DEXA",
    evidence: trainingSummary ?? "",
    readiness: monthlyDexa ? "Body composition progress is measured by monthly DEXA." : "Body composition progress is measured by DEXA." };
}
function mass(value) { return Number.isFinite(value?.value) ? `${value.value.toFixed(1)} ${value.unit}` : "—"; }
function metric(value, unit) { return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—"; }
function formatLongDate(value) { return formatDate(value, { month: "long", day: "numeric", year: "numeric" }); }
function formatShortDate(value) { return formatDate(value, { month: "short", day: "numeric" }); }
function formatNumber(value) { return Number.isInteger(value) ? value.toLocaleString("en-US") : Number(value).toFixed(1); }
function signedAmount(value) { return `${value >= 0 ? "+" : ""}${formatNumber(value)} lb`; }
function scanDate(scan) { return scan?.measuredAt ?? scan?.date ?? null; }
function latestScanOnOrBefore(scans, date) {
  if (!date) return null;
  return [...scans].filter((scan) => scanDate(scan) && scanDate(scan) <= date)
    .sort((a, b) => String(scanDate(a)).localeCompare(String(scanDate(b)))).at(-1) ?? null;
}
function dexaAnchor(scan) {
  if (!scan) return null;
  return { date: scanDate(scan), bodyFat: metric(scan.bodyFatPercentage, "%"), leanMass: mass(scan.leanMass),
    fatMass: mass(scan.fatMass), weight: mass(scan.totalMass) };
}
function selectLatestScan(scans) {
  return [...scans].filter((scan) => scanDate(scan))
    .sort((a, b) => String(scanDate(a)).localeCompare(String(scanDate(b)))).at(-1) ?? null;
}
// Where the latest authoritative body-fat measurement sits relative to the
// guardrail range (Build 60 state pill); the meaning is guardrail.body.
function describeGuardrailObservation(guardrail) {
  if (!guardrail?.measurement || !guardrail.position) return null;
  return { relation: guardrail.position,
    label: `${guardrail.measurement.value.toFixed(1)}% on ${formatShortDate(guardrail.measurement.date)} DEXA — ${guardrail.position === "within" ? "within" : guardrail.position} the ${guardrail.range.min}–${guardrail.range.max}% range` };
}
function summarizeStrategyDomain(label, { caloricIntakeTarget, activityExpenditureTarget, monitoringCadence, strategicReviewCadence, strategicReviewAnchor }) {
  if (label !== "Energy") return null;
  const parts = [];
  if (Number.isFinite(caloricIntakeTarget?.value)) parts.push(`${formatNumber(caloricIntakeTarget.value)} kcal/day intake`);
  if (Number.isFinite(activityExpenditureTarget?.value)) parts.push(`${formatNumber(activityExpenditureTarget.value)} kcal/day activity`);
  if (monitoringCadence === "weekly") parts.push("weekly evidence monitoring");
  if (strategicReviewCadence === "monthly") parts.push(`monthly${strategicReviewAnchor === "dexa_body_composition" ? " · DEXA aligned" : ""} review`);
  if (!parts.length) return null;
  return `${parts.join(" · ")} · adjusted as the evidence supports it`;
}
function formatDate(value, options) { if (!value) return "Not scheduled"; return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
