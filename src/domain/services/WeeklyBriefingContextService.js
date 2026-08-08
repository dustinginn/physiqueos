import { resolveBodyFatGuardrail } from "./DEXAEventContextService";
import { createPIGoalContext } from "./PIObservationGoalContextService";
import { resolvePhotoEventFutureMilestone } from "./PhotoEventContextService";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";

export const WEEKLY_BRIEFING_CONTEXT_VERSION = "weekly_briefing_context_v1";

export async function resolveWeeklyBriefingContext({
  repositories, userId, window, timeZone = "America/Los_Angeles",
  activeGoal: suppliedGoal = null, dexaScans = [], photoEvent = null, piResult = null,
} = {}) {
  const [candidateGoal, goals, protocols, executionItems] = await Promise.all([
    suppliedGoal ?? repositories.goals?.getActiveGoal?.(userId) ?? null,
    repositories.goals?.listGoals?.(userId) ?? [],
    repositories.protocols?.listActiveProtocols?.(userId)
      ?? repositories.protocols?.listProtocols?.(userId) ?? [],
    repositories.executionItems?.listExecutionItems?.(userId) ?? [],
  ]);
  let activeGoal = candidateGoal?.status === "active" ? candidateGoal : null;
  const phaseContext = activeGoal ? resolveCommittedPhaseContext(activeGoal, { asOf: window.endDate }) : null;
  activeGoal = phaseContext?.goal ?? activeGoal;
  const activePhase = phaseContext?.activePhase ?? null;
  const relevantProtocols = protocols.filter((protocol) =>
    protocol?.status === "active" && (!protocol.goalIds?.length
      || protocol.goalIds.includes(activeGoal?.id)
      || protocol.relatedGoalIds?.includes(activeGoal?.id)
      || protocol.linkedGoalIds?.includes(activeGoal?.id)));
  const goalContext = createPIGoalContext({
    activeGoal, activePhase,
    relatedGoals: goals.filter((goal) => goal.status === "active" && goal.id !== activeGoal?.id),
    protocols: relevantProtocols, currentDate: window.endDate, timeZone,
  });
  const latestCompletedDexa = [...dexaScans]
    .filter((scan) => dateKey(scan.measuredAt ?? scan.date) <= window.endDate)
    .sort((a, b) => dateKey(b.measuredAt ?? b.date).localeCompare(dateKey(a.measuredAt ?? a.date)))[0] ?? null;
  return {
    schemaVersion: WEEKLY_BRIEFING_CONTEXT_VERSION,
    cadence: "weekly",
    evidenceWindow: structuredClone(window),
    briefingDate: window.briefingDate ?? shiftDate(window.endDate, 1),
    timeZone,
    status: activeGoal ? "ready" : "neutral",
    activeGoal,
    activeGoalSummary: activeGoal
      ? { id: activeGoal.id, title: activeGoal.title, semanticType: goalContext.semanticGoalType } : null,
    semanticGoalType: normalizeSemanticType(goalContext.semanticGoalType),
    activePhase: activePhase ? {
      id: activePhase.id, name: activePhase.name ?? activePhase.title, status: activePhase.status,
      startDate: dateKey(activePhase.startedAt ?? activePhase.startDate) || null, plannedReviewAt: activePhase.plannedReviewAt ?? null,
      reviewState: activePhase.effectiveReviewState ?? activePhase.reviewState ?? null, ageDays: goalContext.phaseAgeDays,
      ageWeeks: goalContext.phaseAgeWeeks, ageBand: goalContext.phaseAgeBand,
    } : null,
    operatingState: activeGoal?.openingApproach ? {
      value: activeGoal.openingApproach.value ?? null,
      label: activeGoal.openingApproach.label ?? null,
      accepted: activeGoal.openingApproach.accepted !== false,
    } : null,
    openingApproach: activeGoal?.openingApproach ?? null,
    currentGoalMeasures: {
      primary: goalContext.primaryOutcomeMeasures,
      guardrail: goalContext.guardrailMeasures,
      contextual: goalContext.contextualMeasures,
    },
    bodyFatGuardrail: resolveBodyFatGuardrail(activeGoal),
    completedPriorGoal: selectCompletedPriorGoal(goals, activeGoal),
    activeProtocols: relevantProtocols.map((protocol) => ({
      id: protocol.id, name: protocol.name ?? protocol.title,
      category: protocol.category ?? protocol.protocolType ?? null,
    })),
    latestCompletedDexa,
    currentPeriodPhotoEvent: photoEvent,
    futureMilestone: resolvePhotoEventFutureMilestone({
      evidenceDate: window.endDate, scheduledMeasurements: executionItems,
      completedDexaHistory: dexaScans, activeGoal,
    }),
    pi: {
      status: piResult ? "ready" : "unavailable",
      observations: piResult?.observations ?? [],
      rankedClaims: piResult?.selection ?? null,
      decisionStatus: piResult ? "advisory" : "unavailable",
      limitations: piResult?.limitations ?? ["weekly_pi_unavailable"],
    },
    evidenceCompleteness: {
      energy: piResult?.coverage?.energy?.state ?? "unknown",
      training: piResult?.coverage?.training ? "available" : "unknown",
      weight: piResult?.coverage?.weight ? "available" : "unknown",
    },
    continuity: piResult?.lifecycleResult ?? null,
    provenance: {
      producer: "weekly_briefing_context_service", version: WEEKLY_BRIEFING_CONTEXT_VERSION,
      activeGoalId: activeGoal?.id ?? null, activePhaseId: activePhase?.id ?? null,
    },
  };
}

function selectCompletedPriorGoal(goals, activeGoal) {
  return goals.find((goal) => goal.id === activeGoal?.sourceGoalId && goal.status === "completed")
    ?? goals.filter((goal) => goal.status === "completed")
      .sort((a, b) => String(b.completedAt ?? b.updatedAt).localeCompare(String(a.completedAt ?? a.updatedAt)))[0]
    ?? null;
}
function normalizeSemanticType(value) {
  if (value === "body_fat_maintenance") return "maintenance";
  return ["lean_mass_gain", "fat_loss", "maintenance"].includes(value) ? value : "unknown";
}
function dateKey(value) { return String(value ?? "").slice(0, 10); }
function shiftDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
