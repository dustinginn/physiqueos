import {
  isActivePhaseStatus,
  normalizeCanonicalGoalPhases,
  resolveCanonicalPhaseReviewState,
} from "../models/canonicalGoalPhase.js";

export function resolveCanonicalGoalPhaseChronology(goal, { asOf = new Date() } = {}) {
  if (!goal?.id) throw new TypeError("Canonical Phase chronology requires a Goal ID.");
  const date = dateKey(asOf);
  const phases = normalizeCanonicalGoalPhases(goal.phases ?? [], {
    goalId: goal.id,
    allowLegacyIncompleteLifecycle: true,
  });
  const effective = phases.filter((phase) => isEffectiveOn(phase, date));
  if (effective.length > 1) {
    throw new TypeError(`Multiple phases are effective for Goal ${goal.id} on ${date}.`);
  }
  const committedActive = phases.filter((phase) => isActivePhaseStatus(phase.status));
  if (committedActive.length > 1) {
    throw new TypeError(`Multiple current phases prevent chronology resolution for Goal ${goal.id}.`);
  }
  const fallback = effective[0] ?? (
    committedActive.length === 1 && startsOnOrBefore(committedActive[0], date)
      ? committedActive[0]
      : null
  );
  const effectivePhase = fallback ? Object.freeze({
    ...fallback,
    effectiveReviewState: resolveCanonicalPhaseReviewState(fallback, { asOf: date }),
  }) : null;
  return deepFreeze({
    goalId: goal.id,
    asOf: date,
    phases,
    effectivePhase,
    currentPhase: committedActive[0] ?? null,
    plannedPhases: phases.filter((phase) => phase.status === "planned"),
    completedPhases: phases.filter((phase) => phase.status === "completed"),
  });
}

export function resolveFrozenGoalPhaseAttribution({ artifact, fallbackGoal = null, asOf = null } = {}) {
  const persistedGoalId = clean(artifact?.goalId ?? artifact?.goal_id ?? artifact?.historicalGoalId);
  const persistedPhaseId = clean(artifact?.phaseId ?? artifact?.phase_id ?? artifact?.historicalPhaseId);
  if (persistedGoalId || persistedPhaseId) {
    return Object.freeze({
      goalId: persistedGoalId,
      phaseId: persistedPhaseId,
      source: "persisted_artifact",
    });
  }
  if (!fallbackGoal?.id) return Object.freeze({ goalId: null, phaseId: null, source: "unavailable" });
  const chronology = resolveCanonicalGoalPhaseChronology(fallbackGoal, { asOf: asOf ?? new Date() });
  return Object.freeze({
    goalId: fallbackGoal.id,
    phaseId: chronology.effectivePhase?.id ?? null,
    source: "legacy_effective_date_fallback",
  });
}

function isEffectiveOn(phase, date) {
  const start = cleanDate(phase.startedAt ?? phase.startDate);
  if (!start || start > date) return false;
  const end = cleanDate(phase.completedAt ?? phase.supersededAt ?? phase.endDate);
  if (["completed", "superseded"].includes(phase.status) && !end) return false;
  if (["planned", "paused"].includes(phase.status)) return false;
  return !end || date < end;
}
function startsOnOrBefore(phase, date) {
  const start = cleanDate(phase.startedAt ?? phase.startDate);
  return !start || start <= date;
}
function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError("Phase chronology asOf must be a valid date.");
  return parsed.toISOString().slice(0, 10);
}
function cleanDate(value) { return typeof value === "string" ? value.slice(0, 10) : null; }
function clean(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
