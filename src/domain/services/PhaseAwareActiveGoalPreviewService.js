import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";
import { createGoalTrainingProgress } from "./GoalTrainingProgressService";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { loadApplicationCanonicalRuntime } from "../../application/runtime/ApplicationCanonicalRuntime";
import { projectFounderBuildLeanMassPhaseCorrection } from "./FounderPhaseCorrectionService";
import { describeWeightAndEnergyInterpretation } from "../presentation/evidenceInterpretationPresentation";
import { buildMilestoneStory } from "../presentation/milestoneStoryPresentation";

export async function getPhaseAwareActiveGoalPreview({ repositories = FounderRepositories, currentDate = new Date() } = {}) {
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
  return composePhaseAwareActiveGoalPreview({ user, goal, dexaScans, protocols, canonicalEvidence, checkIns, nutritionContext, progressPhotos, currentDate, store });
}

export function composePhaseAwareActiveGoalPreview({ user, goal, dexaScans = [], protocols = [], canonicalEvidence = [], checkIns = [], nutritionContext = null, progressPhotos = [], currentDate = new Date(), store = {} }) {
  if (!goal || goal.status !== "active" || goal.type !== "build_lean_mass") throw new Error("The active Build Lean Mass goal is unavailable.");
  goal = projectFounderBuildLeanMassPhaseCorrection(goal);
  const timeZone = user?.timeZone ?? "America/Los_Angeles";
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
  const phaseNarrative = currentPhaseNarrative({ active, upcoming, strategicReviewCadence,
    strategicReviewAnchor });
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
  const guardrailRange = parseGuardrailRange(guardrail);
  const observedBodyFat = (phaseStart ?? baseline)?.bodyFatPercentage;
  const guardrailObservation = guardrailRange && Number.isFinite(observedBodyFat)
    ? describeGuardrailObservation(observedBodyFat, guardrailRange) : null;
  const overallGoalConfidence = resolveActiveGoalConfidencePresentation({
    activeGoal: goal,
    store,
  });
  const trainingProgress = active.calculatedPlannedReviewDate
    ? createGoalTrainingProgress({ goal, phase: goal.phases.find((item)=>item.id===active.phaseId),
      canonicalObjects: canonicalEvidence, currentDate, timeZone })
    : null;
  const priorPhase = trajectory.phases.find((item) => item.order === active.order - 1) ?? null;
  const transitionTurningPoint = active.order > 0 && active.startDate && priorPhase
    ? buildMilestoneStory("phase_transition", {
      date: active.startDate, priorPhaseName: priorPhase.phaseName, activePhaseName: active.phaseName,
      measurementDate: phaseStart?.measuredAt ?? phaseStart?.date ?? null,
      metricLabel: phaseStart ? "lean mass" : null,
      metricValue: phaseStart ? mass(phaseStart.leanMass) : null,
      changeFromBaseline: Number.isFinite(trajectory.goalProgress?.changeValue)
        ? signedAmount(trajectory.goalProgress.changeValue) : null,
    })
    : null;
  const turningPoints = [
    buildMilestoneStory("dexa_baseline", { date: baseline?.measuredAt ?? baseline?.date }),
    buildMilestoneStory("goal_activated", { date: trajectory.overallGoal.journeyStartDate }),
    ...(transitionTurningPoint ? [transitionTurningPoint] : []),
    ...(active.calculatedPlannedReviewDate ? [buildMilestoneStory("planned_review",
      { date: active.calculatedPlannedReviewDate, upcomingPhaseName: upcoming?.phaseName ?? null })] : []),
    buildMilestoneStory("goal_destination", { date: upcoming?.targetDate ?? trajectory.overallGoal.overallTargetDate,
      targetDescription: trajectory.overallGoal.targetDescription }),
  ];
  if(trainingProgress?.checkpoint.turningPoint)turningPoints.push(trainingProgress.checkpoint.turningPoint);
  turningPoints.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.title.localeCompare(b.title));
  return {
    hero: { title: trajectory.overallGoal.goalName, status: "Active Goal", destination: `${trajectory.overallGoal.targetDescription} by ${formatLongDate(trajectory.overallGoal.overallTargetDate)}`, confidence: `${overallGoalConfidence.value}% confidence`, confidenceBand: overallGoalConfidence.label, confidenceDetail: overallGoalConfidence.explanation, confidenceSource: overallGoalConfidence.source, confidenceMovement: overallGoalConfidence.movement, confidenceDelta: overallGoalConfidence.delta, confidenceAssessmentId: overallGoalConfidence.assessmentId, editHref: `/goals/${goal.id}/edit` },
    journey: trajectory.phases.map((phase) => phaseCard(phase)),
    currentPhase: { title: active.phaseName, purpose: active.purpose,
      progress: active.progress.presentationLabel, review: phaseNarrative.review,
      evidence: phaseNarrative.evidence, readiness: phaseNarrative.readiness,
      color: active.presentationTone },
    next: upcoming ? { title: upcoming.phaseName, goal: trajectory.overallGoal.targetDescription, outcome: "The next DEXA will show whether this phase is working.", lead: "Day-to-day evidence — weight, training, and energy — shows how things are trending in between.", guardrail } : null,
    readiness: upcoming ? ["The current phase objective is sufficiently resolved.", "Goal and guardrail evidence support the next planned phase.", "The plan for the next phase will build on what's learned here."] : [],
    guardrail: { title: guardrail.replace(/[.]$/u, ""), scope: "Applies across every phase", body: "DEXA remains authoritative for body composition. Scale weight provides context between scans, but does not replace it.", observation: guardrailObservation },
    evidence: {
      goalBaseline: dexaAnchor(baseline),
      phaseStart: dexaAnchor(phaseStart),
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
    strategy,
    actions: { strategyHref: "/profile/operating-plan", protocolsHref: "/profile/operating-plan" },
  };
}

function phaseCard(phase) {
  const status = phase.status === "active" ? "Active" : phase.status === "completed" ? "Completed" : "Planned";
  const dates = phase.status === "active"
    ? `Started ${formatShortDate(phase.startDate)} · ${phase.strategicReviewCadence === "monthly" ? "Monthly review" : "Evidence-led review"}`
    : phase.status === "completed" ? `Started ${formatShortDate(phase.startDate)} · Completed`
      : `Projected · Target ${formatShortDate(phase.targetDate)}`;
  return { name: phase.phaseName, number: Number(phase.order ?? 0) + 1, status, dates,
    progress: phase.progress.presentationLabel,
    support: phase.progress.status === "awaiting_follow_up" ? "Awaiting next DEXA" : phase.friendlyTimeline,
    percentage: phase.progress.clampedProgressPercentage ?? phase.timelineProgressPercentage ?? 0,
    color: phase.presentationTone };
}
function currentPhaseNarrative({ upcoming, strategicReviewCadence, strategicReviewAnchor }) {
  if (upcoming) return { review: "Evidence-led", evidence: "Current evidence shows whether this phase objective is sufficiently resolved.", readiness: "The next phase begins once the evidence supports moving forward." };
  const monthly = strategicReviewCadence === "monthly";
  const aligned = strategicReviewAnchor === "dexa_body_composition";
  return { review: monthly ? `Monthly${aligned ? " · DEXA aligned" : ""}` : "Evidence-led",
    evidence: "Weekly evidence monitors intake, activity, training, recovery, and body-composition response to the active targets.",
    readiness: "Evidence keeps accumulating toward the next review, where the plan can be adjusted if needed." };
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
function parseGuardrailRange(text) {
  const match = /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*%/u.exec(String(text ?? ""));
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2]);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}
// Describes where an observed body-fat percentage sits relative to the guardrail range,
// as informational context — never as an alarm or an implied Strategy response.
function describeGuardrailObservation(observed, range) {
  const value = `${observed.toFixed(1)}%`;
  if (observed < range.min) return { relation: "below", label: `${value} observed — below the ${range.min}–${range.max}% guardrail range.` };
  if (observed > range.max) return { relation: "above", label: `${value} observed — above the ${range.min}–${range.max}% guardrail range.` };
  return { relation: "within", label: `${value} observed — within the ${range.min}–${range.max}% guardrail range.` };
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
