import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { resolveHomeGoalTrajectory } from "./HomeGoalTrajectoryService";
import { createGoalTrainingProgress } from "./GoalTrainingProgressService";
import { resolveOverallGoalConfidenceReadModel } from "./OverallGoalConfidenceReadService";
import { resolveActiveGoalConfidencePresentation } from "./ActiveGoalConfidencePresentationReadService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { getFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";

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
  return composePhaseAwareActiveGoalPreview({ user, goal, dexaScans, protocols, canonicalEvidence, checkIns, nutritionContext, progressPhotos, currentDate });
}

export function composePhaseAwareActiveGoalPreview({ user, goal, dexaScans = [], protocols = [], canonicalEvidence = [], checkIns = [], nutritionContext = null, progressPhotos = [], currentDate = new Date() }) {
  if (!goal || goal.status !== "active" || goal.type !== "build_lean_mass") throw new Error("The active Build Lean Mass goal is unavailable.");
  const timeZone = user?.timeZone ?? "America/Los_Angeles";
  const trajectory = resolveHomeGoalTrajectory({ activeGoal: goal, phases: goal.phases, currentDate, timeZone, dexaScans });
  if (!trajectory.hasExplicitPhases || !trajectory.activePhase) throw new Error("The active goal phase trajectory is unavailable.");
  const active = trajectory.activePhase;
  const upcoming = trajectory.upcomingPhases[0];
  const baseline = [...dexaScans].filter((scan) => (scan.measuredAt ?? scan.date) <= trajectory.overallGoal.journeyStartDate).sort((a,b)=>String(a.measuredAt??a.date).localeCompare(String(b.measuredAt??b.date))).at(-1);
  const protocolTypes = new Set(protocols.map((item) => String(item.protocolType ?? item.type ?? item.category ?? "").toLowerCase()));
  const strategy = ["Energy", "Nutrition", "Activity", "Training", "Coaching Updates", "Peptide", "Supplement"].map((label) => ({ label, active: [...protocolTypes].some((type) => type.includes(label.toLowerCase().replace(" updates", ""))) }));
  const guardrail = trajectory.overallGoal.sharedGuardrails.find((item) => /8.?9%|body fat/i.test(item)) ?? "Maintain approximately 8–9% body fat.";
  const legacyGoalConfidence = resolveOverallGoalConfidenceReadModel({ activeGoal: goal, activeProtocols: protocols, canonicalEvidence, checkIns, currentDate, dexaScans, nutritionContext, progressPhotos, timeZone, trainingPerformance: createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence, now: currentDate }) });
  const overallGoalConfidence = resolveActiveGoalConfidencePresentation({
    activeGoal: goal,
    store: getFounderRuntimeStore(),
    legacyReadModel: legacyGoalConfidence,
  });
  const trainingProgress = createGoalTrainingProgress({ goal, phase: goal.phases.find((item)=>item.id===active.phaseId), canonicalObjects: canonicalEvidence, currentDate, timeZone });
  const turningPoints = [{ date: baseline?.measuredAt ?? baseline?.date, title: "DEXA baseline established", body: "The final cut measurement became the authoritative starting point for this goal." }, { date: trajectory.overallGoal.journeyStartDate, title: "Maintenance phase activated", body: "The journey began by establishing a reliable maintenance baseline." }, { date: active.calculatedPlannedReviewDate, title: "Planned phase review", body: "Evidence will determine readiness for the Lean Mass Build phase." }, { date: upcoming.targetDate, title: "Goal destination", body: "A future DEXA will measure progress toward the 10 lb lean-mass target." }];
  if(trainingProgress.checkpoint.turningPoint)turningPoints.push(trainingProgress.checkpoint.turningPoint);
  turningPoints.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.title.localeCompare(b.title));
  return {
    hero: { title: trajectory.overallGoal.goalName, status: "Active Goal", destination: `${trajectory.overallGoal.targetDescription} by ${formatLongDate(trajectory.overallGoal.overallTargetDate)}`, confidence: `${overallGoalConfidence.value}% confidence`, confidenceBand: overallGoalConfidence.label, confidenceDetail: overallGoalConfidence.explanation, confidenceSource: overallGoalConfidence.source, confidenceMovement: overallGoalConfidence.movement, confidenceDelta: overallGoalConfidence.delta, confidenceAssessmentId: overallGoalConfidence.assessmentId, editHref: `/goals/${goal.id}/edit` },
    journey: [phaseCard(active, "orange"), phaseCard(upcoming, "green")],
    currentPhase: { title: active.phaseName, purpose: active.purpose, week: active.progress.presentationLabel, review: formatLongDate(active.calculatedPlannedReviewDate), evidence: "Daily weight, energy balance, recovery, and training performance establish whether maintenance is repeatable.", readiness: "Early evidence is accumulating. The phase remains active until maintenance is stable enough to support a deliberate surplus." },
    next: { title: upcoming.phaseName, goal: trajectory.overallGoal.targetDescription, outcome: "DEXA is the primary outcome measure for lean-mass gain.", lead: "Training progression leads the day-to-day build signal.", guardrail },
    readiness: ["Maintenance intake is repeatable without a persistent deficit.", "Body weight and energy trends are stable enough to set a controlled surplus.", "Training performance and recovery support progressive work.", "The planned phase review confirms readiness to begin the lean-mass build."],
    guardrail: { title: guardrail.replace(/[.]$/u, ""), scope: "Applies across every phase", body: "DEXA remains authoritative for body composition. Scale weight provides context between scans, but does not replace it." },
    evidence: { dexa: { date: baseline?.measuredAt ?? baseline?.date, bodyFat: metric(baseline?.bodyFatPercentage, "%"), leanMass: mass(baseline?.leanMass), fatMass: mass(baseline?.fatMass), weight: mass(baseline?.totalMass) }, support: "Weight and energy evidence help interpret execution and recovery between DEXA measurements." },
    trainingProgress,
    turningPoints,
    strategy,
    actions: { strategyHref: "/profile/operating-plan", protocolsHref: "/profile/operating-plan" },
  };
}

function phaseCard(phase, color) { return { name: phase.phaseName, status: phase.status === "active" ? "Active" : "Upcoming", dates: phase.status === "active" ? `${formatShortDate(phase.startDate)}–${formatShortDate(phase.calculatedPlannedReviewDate)}` : `Target ${formatShortDate(phase.targetDate)}`, progress: phase.progress.presentationLabel, support: phase.progress.status === "awaiting_follow_up" ? "Awaiting next DEXA" : phase.friendlyTimeline, percentage: phase.progress.clampedProgressPercentage ?? phase.timelineProgressPercentage ?? 0, color }; }
function mass(value) { return Number.isFinite(value?.value) ? `${value.value.toFixed(1)} ${value.unit}` : "—"; }
function metric(value, unit) { return Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—"; }
function formatLongDate(value) { return formatDate(value, { month: "long", day: "numeric", year: "numeric" }); }
function formatShortDate(value) { return formatDate(value, { month: "short", day: "numeric" }); }
function formatDate(value, options) { if (!value) return "Not scheduled"; return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
