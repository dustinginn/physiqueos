import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";
import { createGoalTrainingProgress } from "./GoalTrainingProgressService";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { loadApplicationCanonicalRuntime } from "../../application/runtime/ApplicationCanonicalRuntime";
import { projectFounderBuildLeanMassPhaseCorrection } from "./FounderPhaseCorrectionService";

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
  const baseline = [...dexaScans].filter((scan) => (scan.measuredAt ?? scan.date) <= trajectory.overallGoal.journeyStartDate).sort((a,b)=>String(a.measuredAt??a.date).localeCompare(String(b.measuredAt??b.date))).at(-1);
  const acceptedStrategy = (store.phaseStrategies ?? []).find((item) =>
    item.id === goal.activePhaseStrategyId && item.phaseId === active.phaseId) ?? null;
  const strategicReviewCadence = acceptedStrategy?.domains?.energy?.strategicReviewCadence ??
    active.strategicReviewCadence ?? null;
  const strategicReviewAnchor = acceptedStrategy?.domains?.energy?.strategicReviewAnchor ??
    active.strategicReviewAnchor ?? null;
  const phaseNarrative = currentPhaseNarrative({ active, upcoming, strategicReviewCadence,
    strategicReviewAnchor });
  const protocolTypes = new Set(protocols.map((item) => String(item.protocolType ?? item.type ?? item.category ?? "").toLowerCase()));
  const strategy = ["Energy", "Nutrition", "Activity", "Training", "Coaching Updates", "Peptide", "Supplement"].map((label) => ({ label, active: [...protocolTypes].some((type) => type.includes(label.toLowerCase().replace(" updates", ""))) }));
  const guardrail = trajectory.overallGoal.sharedGuardrails.find((item) => /8.?9%|body fat/i.test(item)) ?? "Maintain approximately 8–9% body fat.";
  const overallGoalConfidence = resolveActiveGoalConfidencePresentation({
    activeGoal: goal,
    store,
  });
  const trainingProgress = active.calculatedPlannedReviewDate
    ? createGoalTrainingProgress({ goal, phase: goal.phases.find((item)=>item.id===active.phaseId),
      canonicalObjects: canonicalEvidence, currentDate, timeZone })
    : null;
  const turningPoints = [{ date: baseline?.measuredAt ?? baseline?.date, title: "DEXA baseline established", body: "The accepted measurement became the authoritative starting point for this goal." }, { date: trajectory.overallGoal.journeyStartDate, title: "Goal journey activated", body: "The journey began with its first planned phase." },
    ...(active.calculatedPlannedReviewDate ? [{ date: active.calculatedPlannedReviewDate,
      title: "Planned phase review", body: upcoming ? `Evidence will determine readiness for ${upcoming.phaseName}.` : "Evidence will determine progress and the appropriate goal decision." }] : []),
    { date: upcoming?.targetDate ?? trajectory.overallGoal.overallTargetDate, title: "Goal destination", body: `Future evidence will measure progress toward ${trajectory.overallGoal.targetDescription}.` }];
  if(trainingProgress?.checkpoint.turningPoint)turningPoints.push(trainingProgress.checkpoint.turningPoint);
  turningPoints.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.title.localeCompare(b.title));
  return {
    hero: { title: trajectory.overallGoal.goalName, status: "Active Goal", destination: `${trajectory.overallGoal.targetDescription} by ${formatLongDate(trajectory.overallGoal.overallTargetDate)}`, confidence: `${overallGoalConfidence.value}% confidence`, confidenceBand: overallGoalConfidence.label, confidenceDetail: overallGoalConfidence.explanation, confidenceSource: overallGoalConfidence.source, confidenceMovement: overallGoalConfidence.movement, confidenceDelta: overallGoalConfidence.delta, confidenceAssessmentId: overallGoalConfidence.assessmentId, editHref: `/goals/${goal.id}/edit` },
    journey: trajectory.phases.map((phase) => phaseCard(phase)),
    currentPhase: { title: active.phaseName, purpose: active.purpose,
      progress: active.progress.presentationLabel, review: phaseNarrative.review,
      evidence: phaseNarrative.evidence, readiness: phaseNarrative.readiness,
      color: active.presentationTone },
    next: upcoming ? { title: upcoming.phaseName, goal: trajectory.overallGoal.targetDescription, outcome: "Authoritative outcome evidence measures Goal progress.", lead: "Supporting evidence guides day-to-day execution.", guardrail } : null,
    readiness: upcoming ? ["The current phase objective is sufficiently resolved.", "Goal and guardrail evidence support the next planned phase.", "The next strategy remains reviewable and user-authorized."] : [],
    guardrail: { title: guardrail.replace(/[.]$/u, ""), scope: "Applies across every phase", body: "DEXA remains authoritative for body composition. Scale weight provides context between scans, but does not replace it." },
    evidence: { dexa: { date: baseline?.measuredAt ?? baseline?.date, bodyFat: metric(baseline?.bodyFatPercentage, "%"), leanMass: mass(baseline?.leanMass), fatMass: mass(baseline?.fatMass), weight: mass(baseline?.totalMass) },
      phaseBaseline: active.phaseBaseline, support: "Weight and energy evidence help interpret execution and recovery between DEXA measurements." },
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
  if (upcoming) return { review: "Evidence-led", evidence: "Current evidence shows whether this phase objective is sufficiently resolved.", readiness: "The next phase begins only after a recommendation and explicit user authorization." };
  const monthly = strategicReviewCadence === "monthly";
  const aligned = strategicReviewAnchor === "dexa_body_composition";
  return { review: monthly ? `Monthly${aligned ? " · DEXA aligned" : ""}` : "Evidence-led",
    evidence: "Weekly evidence monitors intake, activity, training, recovery, and body-composition response to the active targets.",
    readiness: "Evidence accumulates toward goal review. Any strategy change remains user-authorized." };
}
function mass(value) { return Number.isFinite(value?.value) ? `${value.value.toFixed(1)} ${value.unit}` : "—"; }
function metric(value, unit) { return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—"; }
function formatLongDate(value) { return formatDate(value, { month: "long", day: "numeric", year: "numeric" }); }
function formatShortDate(value) { return formatDate(value, { month: "short", day: "numeric" }); }
function formatDate(value, options) { if (!value) return "Not scheduled"; return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
