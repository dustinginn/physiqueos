// Confidence V3 — the real-evidence adapter StrategicActivationService (and,
// later, post-activation briefing wiring) calls as `buildInterpretationInput`.
// This is the ONLY file in the V3 module that reads real canonical store
// shapes (goals, weight entries, DEXA scans, guardrails, confidence
// history) — every file under `confidenceV3/` upstream of this one is pure
// and evidence-shape-agnostic by design (see StrategicInterpretationService's
// GENERICITY discipline). Keeping the adapter isolated here means a new
// evidence domain (DEXA, Photos) is a new branch in this one file, never a
// change to the interpretation/projection/narrative math.
//
// SCOPE (current): the Weight domain, for a quantitative numeric Goal (the
// shape `deriveCanonicalGoalProgress` already resolves for "Build Lean
// Mass"). DEXA/Photos/Training extension is a defined, not-yet-wired next
// step — see the DEXA_TODO note below; nothing here fabricates authority
// for a domain it does not actually adapt.
//
// This module reuses `deriveCanonicalGoalProgress` (existing production
// service) for baseline/current/progress-fraction resolution rather than
// re-deriving it — the shadow's `goalProgress` parameter shape was already
// an exact match for that service's return shape, verified field-by-field.

import { deriveCanonicalGoalProgress } from "../confidence/GoalProgressContextService";
import { classifyEvidenceAuthority } from "./EvidenceAuthorityService";

const DEFAULT_GOAL_OUTCOME_METRIC_BY_DOMAIN = Object.freeze({
  weight: "weight",
});

/**
 * @param goal    Canonical active Goal, including `.target.metric` and
 *                optionally `.guardrails: [{id, currentValue, priorValue, guardrail}]`.
 * @param phase   Canonical active Phase.
 * @param store    Founder runtime store (weightEntries, goalConfidenceHistory, etc.).
 * @param evidenceCutoff  ISO timestamp.
 */
export function buildProductionStrategicInterpretationInput({ goal, phase, store, evidenceCutoff } = {}) {
  const goalProgress = deriveCanonicalGoalProgress({
    goal, canonicalStore: store, activePhase: phase, asOf: evidenceCutoff,
  });

  const evidenceDomain = resolveEvidenceDomain(goal);
  const goalOutcomeMetric = goal?.target?.goalOutcomeMetric ??
    DEFAULT_GOAL_OUTCOME_METRIC_BY_DOMAIN[evidenceDomain] ?? evidenceDomain;

  const observedInterval = goalProgress.status === "available"
    ? {
        priorValue: goalProgress.baseline.value,
        priorObservedOn: goalProgress.baseline.observedOn,
        currentValue: goalProgress.current.value,
        currentObservedOn: goalProgress.current.observedOn,
      }
    : (goalProgress.baseline && goalProgress.current
        ? {
            priorValue: goalProgress.baseline.value,
            priorObservedOn: goalProgress.baseline.observedOn,
            currentValue: goalProgress.current.value,
            currentObservedOn: goalProgress.current.observedOn,
          }
        : null);

  const guardrails = normalizeGuardrails(goal?.guardrails, evidenceCutoff);
  const persistenceContext = resolvePersistenceContext({
    store, goalId: goal?.id, direction: goalProgress.direction, observedInterval,
  });

  const authority = classifyEvidenceAuthority({
    evidenceDomain,
    goalOutcomeMetric,
    goalAuthorityOverrides: goal?.evidenceAuthorityOverrides ?? null,
  });

  return {
    interpretation: {
      goalProgress: goalProgress.status === "available" ? goalProgress : null,
      thresholdProgress: null,
      observedInterval,
      deadline: goal?.timeline?.targetDate
        ? { remainingDays: remainingDays(goal.timeline.targetDate, evidenceCutoff) }
        : null,
      guardrails,
      evidence: { domain: evidenceDomain, goalOutcomeMetric, goalAuthorityOverrides: goal?.evidenceAuthorityOverrides ?? null },
      evidenceQuality: { hasValidComparableReference: Boolean(observedInterval) },
      persistenceContext,
      provenance: { goalContractFingerprint: goal?.goalContractId ?? null },
      elapsedGoalTimeFraction: elapsedGoalTimeFraction(goal, evidenceCutoff),
    },
    eligibilityInput: {
      evidenceRefs: buildEligibilityRefs({ store, evidenceDomain, direction: goalProgress.direction }),
      goalOutcomeMetric,
      goalAuthorityOverrides: goal?.evidenceAuthorityOverrides ?? null,
      primaryDomains: [evidenceDomain],
      expectedCadenceDaysByDomain: {},
    },
    baseCeiling: 8,
    resolvedAuthority: authority,
  };

  // DEXA_TODO: when DEXA/Photos activation wiring lands, this function
  // becomes a dispatcher over `evidenceDomain` — each domain resolves its
  // own `observedInterval`/`guardrails`/`persistenceContext` from its own
  // canonical collection (`dexaScans`, `progressPhotos`), still producing
  // the exact same StrategicInterpretation input shape.
}

function resolveEvidenceDomain(goal) {
  const metric = String(goal?.target?.metric ?? "").toLowerCase();
  if (metric.includes("dexa")) return "dexa";
  return "weight";
}

function normalizeGuardrails(rawGuardrails, evidenceCutoff) {
  if (!Array.isArray(rawGuardrails)) return [];
  return rawGuardrails
    .filter((item) => item && item.guardrail && Number.isFinite(item.currentValue))
    .map((item) => ({
      id: item.id ?? null,
      currentValue: item.currentValue,
      priorValue: Number.isFinite(item.priorValue) ? item.priorValue : item.currentValue,
      guardrail: item.guardrail,
    }));
}

// Counts prior canonical Confidence history entries (already-published V2 or
// V3 assessments for this Goal) whose recorded movement was an "increase" in
// the same direction as the current observed interval — a real read over
// already-persisted history, not a fabricated repetition count. A goal with
// no prior favorable publication correctly yields `priorConfirmingIntervalCount: 0`
// (single_observation), matching PersistenceAssessmentService's contract.
function resolvePersistenceContext({ store, goalId, direction, observedInterval }) {
  if (!observedInterval) return { priorConfirmingIntervalCount: 0, contradicted: false };
  const currentFavorable = observedInterval.currentValue > observedInterval.priorValue;
  const history = (store?.goalConfidenceHistory ?? [])
    .filter((item) => item.goalId === goalId)
    .map((item) => item.assessment)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.publicationTimestamp ?? 0) - Date.parse(left.publicationTimestamp ?? 0));
  let priorConfirmingIntervalCount = 0;
  let contradicted = false;
  for (const assessment of history) {
    if (assessment.movement === "increase" && currentFavorable) priorConfirmingIntervalCount += 1;
    else if (assessment.movement === "decrease" && currentFavorable) { contradicted = true; break; }
    else break;
  }
  return { priorConfirmingIntervalCount, contradicted };
}

function buildEligibilityRefs({ store, evidenceDomain, direction }) {
  if (evidenceDomain !== "weight") return [];
  return (store?.weightEntries ?? [])
    .filter((entry) => entry && !entry.superseded && !entry.retracted)
    .map((entry) => ({
      id: entry.id ?? `weight|${entry.date}`,
      domain: "weight",
      observedOn: entry.date,
      status: entry.status ?? "active",
      direction: null,
    }));
}

function remainingDays(targetDateIso, evidenceCutoff) {
  const target = Date.parse(targetDateIso);
  const cutoff = Date.parse(evidenceCutoff);
  if (!Number.isFinite(target) || !Number.isFinite(cutoff)) return null;
  return Math.round((target - cutoff) / 86_400_000);
}
function elapsedGoalTimeFraction(goal, evidenceCutoff) {
  const start = Date.parse(goal?.timeline?.startDate);
  const target = Date.parse(goal?.timeline?.targetDate);
  const cutoff = Date.parse(evidenceCutoff);
  if (![start, target, cutoff].every(Number.isFinite) || target <= start) return null;
  return Math.min(1, Math.max(0, (cutoff - start) / (target - start)));
}
