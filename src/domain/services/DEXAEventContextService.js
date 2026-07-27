import { createDEXAPIObservations } from "./DEXAPIObservationService";
import {
  applyPIGoalContextToObservations,
  createPIGoalContext,
} from "./PIObservationGoalContextService";
import { resolvePhotoEventFutureMilestone } from "./PhotoEventContextService";

export const DEXA_EVENT_CONTEXT_VERSION = "dexa_event_context_v1";

export async function resolveDEXAEventContext({
  repositories,
  userId,
  scan,
  scans = [],
  generatedAt = new Date().toISOString(),
  timeZone = "America/Los_Angeles",
} = {}) {
  const evidenceDate = dateKey(scan?.measuredAt ?? scan?.date);
  const [candidateGoal, goals, protocols, executionItems, weights] = await Promise.all([
    repositories.goals?.getActiveGoal?.(userId) ?? null,
    repositories.goals?.listGoals?.(userId) ?? [],
    repositories.protocols?.listActiveProtocols?.(userId)
      ?? repositories.protocols?.listProtocols?.(userId)
      ?? [],
    repositories.executionItems?.listExecutionItems?.(userId) ?? [],
    repositories.weights?.listWeightEntries?.(userId)
      ?? repositories.weightEntries?.listWeightEntries?.(userId)
      ?? [],
  ]);
  const activeGoal = candidateGoal?.status === "active" ? candidateGoal : null;
  const activePhase = activeGoal?.phases?.filter((phase) => phase.status === "active")[0] ?? null;
  const completedPriorGoal = selectCompletedPriorGoal(goals, activeGoal);
  const eligibleScans = scans
    .filter((item) => item.userId === userId && dateKey(item.measuredAt ?? item.date) <= evidenceDate)
    .sort(byDate);
  const priorScan = eligibleScans.filter((item) => item.id !== scan?.id).at(-1) ?? null;
  const phaseBaselineScan = selectBaseline(eligibleScans, activePhase?.startDate, scan?.id);
  const goalBaselineScan = selectBaseline(
    eligibleScans,
    activeGoal?.timeline?.startDate ?? activeGoal?.startDate,
    scan?.id,
  );
  const guardrail = resolveBodyFatGuardrail(activeGoal);
  const operatingState = activeGoal?.openingApproach
    ? {
        value: activeGoal.openingApproach.value ?? null,
        label: activeGoal.openingApproach.label ?? null,
        accepted: activeGoal.openingApproach.accepted !== false,
      }
    : null;
  const relevantProtocols = protocols.filter((protocol) =>
    protocol?.status === "active"
    && (!protocol.goalIds?.length
      || protocol.goalIds.includes(activeGoal?.id)
      || protocol.relatedGoalIds?.includes(activeGoal?.id)
      || protocol.linkedGoalIds?.includes(activeGoal?.id)),
  );
  const pi = createPIContext({
    activeGoal,
    activePhase,
    relatedGoals: goals.filter((goal) => goal.status === "active" && goal.id !== activeGoal?.id),
    protocols: relevantProtocols,
    scans: eligibleScans,
    evidenceDate,
    timeZone,
  });
  const latestWeight = weights
    .filter((entry) => dateKey(entry.recordedAt ?? entry.date) <= evidenceDate)
    .sort((left, right) => dateKey(left.recordedAt ?? left.date).localeCompare(dateKey(right.recordedAt ?? right.date)))
    .at(-1) ?? null;

  return {
    schemaVersion: DEXA_EVENT_CONTEXT_VERSION,
    status: activeGoal ? "ready" : "neutral",
    evidenceDate,
    generatedAt,
    timeZone,
    activeGoal,
    activeGoalSummary: activeGoal
      ? { id: activeGoal.id, title: activeGoal.title, status: activeGoal.status, semanticType: pi.goalContext.semanticGoalType }
      : null,
    semanticGoalType: pi.goalContext.semanticGoalType,
    activePhase: activePhase
      ? {
          id: activePhase.id,
          name: activePhase.name ?? activePhase.title,
          status: activePhase.status,
          startDate: dateKey(activePhase.startDate) || null,
          ageDays: pi.goalContext.phaseAgeDays,
          ageWeeks: pi.goalContext.phaseAgeWeeks,
        }
      : null,
    operatingState,
    completedPriorGoal: completedPriorGoal
      ? { id: completedPriorGoal.id, title: completedPriorGoal.title, completedAt: completedPriorGoal.completedAt ?? null }
      : null,
    currentGoalMeasures: {
      primary: pi.goalContext.primaryOutcomeMeasures,
      guardrail: pi.goalContext.guardrailMeasures,
      contextual: pi.goalContext.contextualMeasures,
    },
    bodyFatGuardrail: guardrail,
    openingApproach: operatingState,
    activeProtocols: relevantProtocols.map((protocol) => ({
      id: protocol.id,
      name: protocol.name ?? protocol.title,
      category: protocol.category ?? protocol.protocolType ?? null,
    })),
    latestPriorDexa: priorScan,
    goalBaselineDexa: goalBaselineScan,
    phaseBaselineDexa: phaseBaselineScan,
    latestBodyWeight: latestWeight,
    futureMilestone: resolvePhotoEventFutureMilestone({
      evidenceDate,
      scheduledMeasurements: executionItems,
      completedDexaHistory: eligibleScans,
      activeGoal,
    }),
    pi,
    uncertainty: {
      state: priorScan ? "comparison_available" : "insufficient_comparison",
      limitations: [
        ...pi.goalContext.limitations,
        ...(priorScan ? [] : ["prior_dexa_unavailable"]),
        ...(guardrail ? [] : ["body_fat_guardrail_unavailable"]),
      ],
    },
    provenance: {
      producer: "dexa_event_context_service",
      producerVersion: DEXA_EVENT_CONTEXT_VERSION,
      activeGoalId: activeGoal?.id ?? null,
      activePhaseId: activePhase?.id ?? null,
      scanId: scan?.id ?? null,
    },
  };
}

export function resolveBodyFatGuardrail(goal) {
  if (!goal || goal.status !== "active") return null;
  const structured = [
    goal.targetRange,
    ...(goal.guardrails ?? []).map((item) => item.targetRange ?? item),
  ].find((item) =>
    /body.?fat/i.test(`${item?.metric ?? item?.metricKey ?? ""} ${item?.text ?? item?.label ?? ""}`)
    && finite(item?.min ?? item?.lowerBound) != null
    && finite(item?.max ?? item?.upperBound) != null,
  );
  if (structured) {
    return range(
      finite(structured.min ?? structured.lowerBound),
      finite(structured.max ?? structured.upperBound),
      structured.unit ?? "%",
      "canonical_goal_guardrail",
    );
  }
  const textual = (goal.guardrails ?? [])
    .filter((item) => item?.accepted !== false)
    .map((item) => `${item.text ?? ""} ${item.label ?? ""}`)
    .find((text) => /body.?fat/i.test(text) && /\d/.test(text));
  const match = textual?.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(?:%|percent)?/i);
  return match ? range(Number(match[1]), Number(match[2]), "%", "canonical_goal_guardrail_text") : null;
}

export function classifyBodyFatGuardrail(value, guardrail, boundaryTolerance = 0.15) {
  const current = finite(value);
  if (current == null || !guardrail) return { status: "unknown", value: current, guardrail };
  if (current < guardrail.lowerBound) return { status: "below", value: current, guardrail };
  if (current > guardrail.upperBound) return { status: "above", value: current, guardrail };
  const near = Math.abs(current - guardrail.lowerBound) <= boundaryTolerance
    || Math.abs(current - guardrail.upperBound) <= boundaryTolerance;
  return { status: near ? "near_boundary" : "within", value: current, guardrail };
}

function createPIContext({ activeGoal, activePhase, relatedGoals, protocols, scans, evidenceDate, timeZone }) {
  try {
    const goalContext = createPIGoalContext({
      activeGoal,
      activePhase,
      relatedGoals,
      protocols,
      currentDate: evidenceDate,
      timeZone,
    });
    const observations = applyPIGoalContextToObservations(
      createDEXAPIObservations({ scans }),
      goalContext,
    );
    return {
      status: "ready",
      goalContext,
      observations,
      decisionContext: {
        status: "advisory",
        integrationEnabled: false,
        mutationEnabled: false,
        limitation: "dexa_event_decision_context_shadow_only",
      },
      failure: null,
    };
  } catch (error) {
    const goalContext = createPIGoalContext({
      activeGoal,
      activePhase,
      relatedGoals,
      protocols,
      currentDate: evidenceDate,
      timeZone,
    });
    return {
      status: "fallback",
      goalContext,
      observations: [],
      decisionContext: {
        status: "unavailable",
        integrationEnabled: false,
        mutationEnabled: false,
        limitation: "dexa_event_pi_unavailable",
      },
      failure: { code: "pi_context_failure", message: String(error?.message ?? error) },
    };
  }
}

function selectCompletedPriorGoal(goals, activeGoal) {
  return goals.find((goal) => goal.id === activeGoal?.sourceGoalId && goal.status === "completed")
    ?? goals.filter((goal) => goal.status === "completed")
      .sort((left, right) => String(right.completedAt ?? right.updatedAt).localeCompare(String(left.completedAt ?? left.updatedAt)))[0]
    ?? null;
}

function selectBaseline(scans, startDate, currentScanId) {
  const date = dateKey(startDate);
  if (!date) return null;
  return scans
    .filter((scan) => scan.id !== currentScanId && dateKey(scan.measuredAt ?? scan.date) <= date)
    .sort(byDate)
    .at(-1) ?? null;
}

function range(lowerBound, upperBound, unit, source) {
  if (lowerBound > upperBound) return null;
  return { metric: "body_fat_percentage", lowerBound, upperBound, unit, source };
}

function finite(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function byDate(left, right) {
  return dateKey(left.measuredAt ?? left.date).localeCompare(dateKey(right.measuredAt ?? right.date));
}
