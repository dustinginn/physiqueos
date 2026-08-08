import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";

export const MONTHLY_BASELINE_ROLE_RESOLVER_VERSION = "monthly_baseline_role_resolver_v1";

const NEW_BASELINE_ROLE = "new_baseline";
const TRANSITION_TOLERANCE_DAYS = 5;

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function dateDistance(left, right) {
  if (!dateKey(left) || !dateKey(right)) return null;
  const leftDate = new Date(`${dateKey(left)}T12:00:00.000Z`);
  const rightDate = new Date(`${dateKey(right)}T12:00:00.000Z`);
  if (!Number.isFinite(leftDate.getTime()) || !Number.isFinite(rightDate.getTime())) return null;
  return Math.abs(Math.round((leftDate - rightDate) / 86400000));
}

function dateInTimeZone(value, timeZone) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function activePhaseOf(goal) {
  return goal ? resolveCommittedPhaseContext(goal).activePhase : null;
}

function scanDate(scan) {
  return dateKey(scan?.measuredAt ?? scan?.date);
}

function scanId(scan) {
  return scan?.id ?? scan?.canonicalId ?? null;
}

function explicitBaselineSignal(scan) {
  return scan?.monthlyBaselineRole?.role === NEW_BASELINE_ROLE ||
    scan?.canonicalBaselineRole?.role === NEW_BASELINE_ROLE ||
    scan?.isNewBaseline === true ||
    scan?.baselineRole === NEW_BASELINE_ROLE ||
    scan?.baselineRole === "goal_transition_reference" ||
    scan?.dexaRole === NEW_BASELINE_ROLE;
}

function explicitContradiction(scan) {
  return scan?.monthlyBaselineRole?.role === "not_applicable" ||
    scan?.canonicalBaselineRole?.role === "not_applicable" ||
    ["comparison_only", "prior_goal_only", "not_new_baseline"].includes(scan?.baselineRole) ||
    scan?.dexaRole === "not_new_baseline";
}

function lifecycleRefs({ completionEvent, goal, phase, scan }) {
  return [
    completionEvent?.id,
    completionEvent?.goalId,
    goal?.id,
    phase?.id,
    scanId(scan),
  ].filter(Boolean);
}

function boundedTransition({ completionDate, phaseStart, scan }) {
  const date = scanDate(scan);
  if (!date || !completionDate || !phaseStart) return false;
  return dateDistance(date, completionDate) <= TRANSITION_TOLERANCE_DAYS &&
    dateDistance(date, phaseStart) <= TRANSITION_TOLERANCE_DAYS;
}

function hasPriorGoalLink(scan, previousGoalId, completionEvent) {
  if (!previousGoalId) return false;
  if ((scan?.relatedGoalIds ?? []).includes(previousGoalId)) return true;
  const evidenceIds = [
    completionEvent?.sourceDexaId,
    completionEvent?.numericalDexaId,
    completionEvent?.evidence?.numericalDexaId,
    ...(completionEvent?.evidenceRefs ?? []),
  ].filter(Boolean);
  return evidenceIds.includes(scanId(scan));
}

function candidatePriority(candidate) {
  if (candidate.existingCanonicalRole) return 3;
  if (candidate.explicit) return 2;
  return 1;
}

function compareCandidates(left, right) {
  const priority = candidatePriority(right) - candidatePriority(left);
  if (priority) return priority;
  const leftDistance = dateDistance(scanDate(left.scan), left.completionDate) ?? 999;
  const rightDistance = dateDistance(scanDate(right.scan), right.completionDate) ?? 999;
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  return scanDate(right.scan).localeCompare(scanDate(left.scan)) ||
    String(scanId(left.scan)).localeCompare(String(scanId(right.scan)));
}

export function resolveCanonicalGoalCompletion({
  completedGoal,
  nextGoal,
  dexaScans = [],
  timeZone = "America/Los_Angeles",
} = {}) {
  const recordedCompletionDate = dateInTimeZone(completedGoal?.completedAt, timeZone);
  if (!completedGoal?.id || !recordedCompletionDate) {
    return Object.freeze({
      effectiveDate: null,
      recordedCompletionDate,
      sourceDexaId: null,
      reason: "required_lifecycle_linkage_absent",
      lifecycleRefs: [completedGoal?.id, nextGoal?.id].filter(Boolean),
    });
  }

  const phase = activePhaseOf(nextGoal);
  const transitionDate = dateKey(phase?.startDate ?? nextGoal?.timeline?.startDate ?? nextGoal?.startDate);
  const explicitDexaIds = new Set([
    completedGoal?.completion?.evidence?.numericalDexaId,
    ...(completedGoal?.milestoneRelationships ?? [])
      .filter((relationship) => relationship.role === "numerical_completion" && relationship.targetType === "dexa")
      .map((relationship) => relationship.targetId),
  ].filter(Boolean));

  const linkedScans = dexaScans
    .filter((scan) => explicitDexaIds.has(scanId(scan)) || (scan?.relatedGoalIds ?? []).includes(completedGoal.id))
    .filter((scan) => {
      const date = scanDate(scan);
      if (!date || date > recordedCompletionDate) return false;
      return explicitDexaIds.has(scanId(scan)) ||
        (transitionDate && dateDistance(date, transitionDate) <= TRANSITION_TOLERANCE_DAYS);
    })
    .sort((left, right) => {
      const explicit = Number(explicitDexaIds.has(scanId(right))) - Number(explicitDexaIds.has(scanId(left)));
      if (explicit) return explicit;
      const leftDistance = dateDistance(scanDate(left), transitionDate) ?? 999;
      const rightDistance = dateDistance(scanDate(right), transitionDate) ?? 999;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return scanDate(right).localeCompare(scanDate(left));
    });
  const closingScan = linkedScans[0] ?? null;

  return Object.freeze({
    effectiveDate: closingScan ? scanDate(closingScan) : recordedCompletionDate,
    recordedCompletionDate,
    sourceDexaId: scanId(closingScan),
    reason: closingScan
      ? explicitDexaIds.has(scanId(closingScan))
        ? "explicit_numerical_completion_dexa"
        : "bounded_completed_goal_closing_dexa"
      : "recorded_goal_completion_date",
    lifecycleRefs: [completedGoal.id, nextGoal?.id, phase?.id, scanId(closingScan)].filter(Boolean),
  });
}

export function resolveMonthlyDexaBaselineRoles({ dexaScans = [], goal = null } = {}) {
  const completionEvent = goal?.completionEvent ?? null;
  const phase = activePhaseOf(goal);
  const completionDate = dateKey(completionEvent?.completedAt ?? completionEvent?.date);
  const phaseStart = dateKey(phase?.startDate ?? goal?.timeline?.startDate ?? goal?.startDate);
  const previousGoalId = completionEvent?.goalId ?? goal?.sourceGoalId ?? null;
  const nextGoalId = goal?.id ?? null;
  const candidates = [];
  const diagnostics = [];

  for (const scan of dexaScans) {
    const id = scanId(scan);
    const date = scanDate(scan);
    const explicit = explicitBaselineSignal(scan);
    const contradictory = explicitContradiction(scan);
    const bounded = boundedTransition({ completionDate, phaseStart, scan });
    const linkedToPriorGoal = hasPriorGoalLink(scan, previousGoalId, completionEvent);
    const existingCanonicalRole = scan?.monthlyBaselineRole?.role === NEW_BASELINE_ROLE ||
      scan?.canonicalBaselineRole?.role === NEW_BASELINE_ROLE;
    const lifecycleComplete = Boolean(completionDate && phaseStart && nextGoalId);
    const inferred = lifecycleComplete && bounded && linkedToPriorGoal;

    if (!contradictory && lifecycleComplete && bounded && (existingCanonicalRole || explicit || inferred)) {
      candidates.push({
        scan,
        completionDate,
        explicit,
        existingCanonicalRole,
        inferenceReason: existingCanonicalRole
          ? scan?.monthlyBaselineRole?.inferenceReason ??
            scan?.canonicalBaselineRole?.inferenceReason ??
            "existing_canonical_baseline_role"
          : linkedToPriorGoal
            ? "completed_goal_closing_dexa_establishes_next_goal_reference"
            : "explicit_transition_baseline_with_bounded_lifecycle",
      });
      continue;
    }

    diagnostics.push({
      scanId: id,
      scanDate: date,
      status: contradictory
        ? "semantic_role_not_applicable"
        : !lifecycleComplete || (explicit && !bounded)
          ? "required_lifecycle_linkage_absent"
          : "semantic_role_not_applicable",
      reason: contradictory
        ? "contradictory_canonical_semantics"
        : !lifecycleComplete
          ? "goal_completion_or_active_phase_missing"
          : explicit && !bounded
            ? "explicit_annotation_outside_bounded_transition"
            : "scan_does_not_close_prior_goal_transition",
    });
  }

  const selected = [...candidates].sort(compareCandidates)[0] ?? null;
  const role = selected ? Object.freeze({
    role: NEW_BASELINE_ROLE,
    sourceDexaId: scanId(selected.scan),
    associatedGoalId: nextGoalId,
    associatedPhaseId: phase?.id ?? null,
    previousGoalId,
    effectiveDate: scanDate(selected.scan),
    inferenceReason: selected.inferenceReason,
    lifecycleRefs: lifecycleRefs({ completionEvent, goal, phase, scan: selected.scan }),
    provenance: Object.freeze({
      source: "canonical_monthly_baseline_role_resolver",
      version: MONTHLY_BASELINE_ROLE_RESOLVER_VERSION,
    }),
  }) : null;

  for (const candidate of candidates) {
    const id = scanId(candidate.scan);
    diagnostics.push({
      scanId: id,
      scanDate: scanDate(candidate.scan),
      status: id === role?.sourceDexaId
        ? "canonical_role_resolved"
        : "another_baseline_already_owns_role",
      reason: id === role?.sourceDexaId
        ? candidate.inferenceReason
        : `owned_by_${role?.sourceDexaId}`,
    });
  }

  const annotatedDexaScans = dexaScans.map((scan) => scanId(scan) === role?.sourceDexaId
    ? { ...scan, monthlyBaselineRole: role }
    : { ...scan });

  return Object.freeze({
    role,
    annotatedDexaScans,
    diagnostics: diagnostics.sort((left, right) =>
      String(left.scanDate).localeCompare(String(right.scanDate)) ||
      String(left.scanId).localeCompare(String(right.scanId))),
    summary: Object.freeze({
      status: role ? "canonical_role_resolved" : diagnostics.some((item) => item.status === "required_lifecycle_linkage_absent")
        ? "required_lifecycle_linkage_absent"
        : "semantic_role_not_applicable",
      role: role?.role ?? null,
      sourceDexaId: role?.sourceDexaId ?? null,
      associatedGoalId: role?.associatedGoalId ?? nextGoalId,
      associatedPhaseId: role?.associatedPhaseId ?? phase?.id ?? null,
      effectiveDate: role?.effectiveDate ?? null,
      reason: role?.inferenceReason ?? diagnostics.at(-1)?.reason ?? "no_dexa_evidence",
      lifecycleRefs: role?.lifecycleRefs ?? [completionEvent?.id, previousGoalId, nextGoalId, phase?.id].filter(Boolean),
      resolverVersion: MONTHLY_BASELINE_ROLE_RESOLVER_VERSION,
    }),
  });
}
