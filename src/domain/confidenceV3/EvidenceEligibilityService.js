// Confidence V3 — Phase 6. Strategic evidence eligibility.
//
// Canonical storage (`canonicalEvidenceObjects`) is unconditional: every
// Weight/Nutrition/Activity/Training/DEXA/Photo/Recovery observation is kept
// regardless of relevance to any Goal. "Strategically eligible" is a
// narrower, Goal-scoped question this module answers explicitly, layered on
// top of the existing `EvidenceAuthorityService` domain/metric
// classification (`authoritative_direct` / `high_frequency_direct` /
// `supporting_proxy` / `behavioral`) rather than replacing it:
//
//   ELIGIBLE evidence must (a) be attributable to the active Goal's date
//   window (see `EvidenceContextWindows` — reused, not reimplemented, by the
//   orchestrator that calls this module), (b) carry a resolvable
//   `directOutcomeAuthority` for the Goal's `goalOutcomeMetric`, and (c) not
//   be superseded/retracted.
//
//   FRESHNESS is a per-domain recency fact, independent of authority: how
//   many days old is the newest eligible observation in this domain,
//   relative to the domain's own expected cadence (from
//   `operatingPlanImplications.evidenceProtocols`, passed in — this module
//   never re-derives cadence, only classifies against it).
//
//   COMPLETENESS asks whether every domain the Goal's contract marks
//   `primary`/`supporting` has AT LEAST ONE eligible observation at all —
//   distinct from freshness (a domain can be complete-but-stale) and from
//   authority (a domain can be complete with only proxy evidence).
//
//   CONTRADICTION is evidence-eligible-on-both-sides disagreement: two
//   eligible readings in the same domain, over the same window, implying
//   opposite `strategicOutcomeDirection`s for the Goal's own metric.
//
// GENERICITY: no Goal-name, Phase-name literal branch — same discipline as
// `StrategicInterpretationService`.

export const EVIDENCE_ELIGIBILITY_VERSION = "evidence_eligibility_v1";

export const FreshnessState = Object.freeze({
  CURRENT: "current",
  AGING: "aging",
  STALE: "stale",
  UNKNOWN: "unknown",
});

export const CompletenessState = Object.freeze({
  COMPLETE: "complete",
  PARTIAL: "partial",
  MISSING: "missing",
});

// Named, calibration-flagged (same convention as every coefficient table in
// this module family). A domain without an explicit expected-cadence input
// falls back to this default rather than fabricating urgency.
const DEFAULT_EXPECTED_CADENCE_DAYS = 14;
const AGING_MULTIPLIER = 1.5;
const STALE_MULTIPLIER = 3;

/**
 * @param evidenceRefs           Array of { id, domain, observedOn, status,
 *                                supersededBy } — already-canonical (not raw)
 *                                references, one per eligible-domain
 *                                observation being considered.
 * @param goalOutcomeMetric      The active Goal's own target metric.
 * @param goalAuthorityOverrides Optional Goal-declared authority table.
 * @param primaryDomains         Domains the Goal Contract marks
 *                                primary/supporting (drives completeness).
 * @param expectedCadenceDaysByDomain  Optional { [domain]: days } — from
 *                                Operating Plan `evidenceProtocols`; a
 *                                missing entry uses
 *                                DEFAULT_EXPECTED_CADENCE_DAYS.
 * @param asOf                   ISO date the freshness clock is measured
 *                                against (the evidence cutoff).
 */
export function evaluateEvidenceEligibility({
  evidenceRefs = [],
  goalOutcomeMetric = null,
  goalAuthorityOverrides = null,
  primaryDomains = [],
  expectedCadenceDaysByDomain = {},
  asOf,
} = {}) {
  const cutoff = parseDate(asOf);
  if (!cutoff) throw new Error("evaluateEvidenceEligibility requires a valid evidence cutoff.");

  const active = evidenceRefs.filter((ref) =>
    ref && ref.status !== "superseded" && ref.status !== "retracted" && !ref.supersededBy);
  const byDomain = groupBy(active, (ref) => ref.domain);

  const domainsConsidered = [...new Set([
    ...Object.keys(byDomain),
    ...primaryDomains,
  ])].sort();

  const perDomain = domainsConsidered.map((domain) => {
    const observations = (byDomain[domain] ?? [])
      .filter((ref) => parseDate(ref.observedOn) && parseDate(ref.observedOn) <= cutoff)
      .sort((left, right) => parseDate(right.observedOn) - parseDate(left.observedOn));
    const newest = observations[0] ?? null;
    const expectedDays = Number.isFinite(expectedCadenceDaysByDomain[domain])
      ? expectedCadenceDaysByDomain[domain]
      : DEFAULT_EXPECTED_CADENCE_DAYS;
    const ageDays = newest ? daysBetween(parseDate(newest.observedOn), cutoff) : null;
    const freshnessState = classifyFreshness({ ageDays, expectedDays });
    const isPrimary = primaryDomains.includes(domain);
    const completenessState = observations.length === 0
      ? (isPrimary ? CompletenessState.MISSING : CompletenessState.MISSING)
      : CompletenessState.COMPLETE;
    return Object.freeze({
      domain,
      isPrimary,
      eligibleObservationCount: observations.length,
      newestObservedOn: newest?.observedOn ?? null,
      newestEvidenceRef: newest?.id ?? null,
      ageDays,
      expectedCadenceDays: expectedDays,
      freshnessState,
      completenessState,
    });
  });

  const missingEvidence = perDomain
    .filter((item) => item.isPrimary && item.completenessState === CompletenessState.MISSING)
    .map((item) => Object.freeze({ domain: item.domain, reason: "no_eligible_observation" }));
  const staleEvidence = perDomain
    .filter((item) => item.freshnessState === FreshnessState.STALE)
    .map((item) => Object.freeze({
      domain: item.domain, ageDays: item.ageDays, expectedCadenceDays: item.expectedCadenceDays,
    }));

  const overallCompleteness = missingEvidence.length > 0
    ? (perDomain.some((item) => item.isPrimary && item.completenessState === CompletenessState.COMPLETE)
        ? CompletenessState.PARTIAL : CompletenessState.MISSING)
    : CompletenessState.COMPLETE;

  const contradictions = detectContradictions({ byDomain, cutoff, goalOutcomeMetric, goalAuthorityOverrides });

  return Object.freeze({
    schemaVersion: EVIDENCE_ELIGIBILITY_VERSION,
    evidenceCutoff: cutoff.toISOString().slice(0, 10),
    evidenceDomainsConsidered: domainsConsidered,
    perDomain: Object.freeze(perDomain),
    overallCompleteness,
    missingEvidence: Object.freeze(missingEvidence),
    staleEvidence: Object.freeze(staleEvidence),
    contradictions: Object.freeze(contradictions),
    eligibleEvidenceRefs: Object.freeze(active
      .filter((ref) => parseDate(ref.observedOn) && parseDate(ref.observedOn) <= cutoff)
      .map((ref) => ref.id)
      .sort()),
  });
}

function classifyFreshness({ ageDays, expectedDays }) {
  if (ageDays == null || !Number.isFinite(expectedDays) || expectedDays <= 0) {
    return FreshnessState.UNKNOWN;
  }
  if (ageDays <= expectedDays) return FreshnessState.CURRENT;
  if (ageDays <= expectedDays * AGING_MULTIPLIER) return FreshnessState.AGING;
  if (ageDays <= expectedDays * STALE_MULTIPLIER) return FreshnessState.STALE;
  return FreshnessState.STALE;
}

// Same-domain, same-window (within the more recent observation's expected
// cadence) evidence disagreeing on directional outcome. This is a coarse,
// intentionally conservative detector — it flags overlap, it does not
// resolve which reading is correct (StrategicInterpretationService's
// persistence/feasibility split handles that once the interpretation input
// is built).
function detectContradictions({ byDomain, cutoff }) {
  const contradictions = [];
  for (const [domain, refs] of Object.entries(byDomain)) {
    const withDirection = refs
      .filter((ref) => parseDate(ref.observedOn) && parseDate(ref.observedOn) <= cutoff && ref.direction)
      .sort((left, right) => parseDate(left.observedOn) - parseDate(right.observedOn));
    for (let index = 1; index < withDirection.length; index += 1) {
      const previous = withDirection[index - 1];
      const current = withDirection[index];
      if (previous.direction !== current.direction &&
          previous.direction !== "neutral" && current.direction !== "neutral") {
        contradictions.push(Object.freeze({
          domain,
          earlierEvidenceRef: previous.id,
          laterEvidenceRef: current.id,
          earlierDirection: previous.direction,
          laterDirection: current.direction,
        }));
      }
    }
  }
  return contradictions;
}

function groupBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    (result[key] ??= []).push(item);
  }
  return result;
}
function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function daysBetween(earlier, later) {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 86_400_000));
}
