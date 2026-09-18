// Confidence V3 — Stage B. Evidence-authority classification.
//
// "How directly does this evidence measure THIS Goal's own outcome metric?"
// is a Goal/evidence-pair question, not a fixed domain hierarchy. A strength
// test is authoritative-direct for a strength Goal and merely a supporting
// proxy for a body-composition Goal. This module therefore separates a
// DEFAULT capability table (documentation + test fixtures — DEXA-for-body-
// composition, weight, training, photos, nutrition/activity/recovery are all
// real PhysiqueOS domains today) from the actual resolution rule, which
// always prefers a Goal-declared override when one exists. No scoring logic
// anywhere else in Confidence V3 may branch on a domain name directly — it
// branches on the resolved `DirectOutcomeAuthority` value only.

export const EVIDENCE_AUTHORITY_VERSION = "evidence_authority_v1";

export const DirectOutcomeAuthority = Object.freeze({
  AUTHORITATIVE_DIRECT: "authoritative_direct",
  HIGH_FREQUENCY_DIRECT: "high_frequency_direct",
  SUPPORTING_PROXY: "supporting_proxy",
  BEHAVIORAL: "behavioral",
});

export const MeasurementUncertainty = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
});

// Documentation/test defaults only — see file header. Keyed by
// `${evidenceDomain}:${goalOutcomeMetric}`; `*` matches any metric for that
// domain. A Goal's own declared mapping always wins over this table.
export const DEFAULT_EVIDENCE_AUTHORITY_TABLE = Object.freeze({
  "dexa:lean_mass": DirectOutcomeAuthority.AUTHORITATIVE_DIRECT,
  "dexa:body_fat_percentage": DirectOutcomeAuthority.AUTHORITATIVE_DIRECT,
  "dexa:*": DirectOutcomeAuthority.AUTHORITATIVE_DIRECT,
  "weight:*": DirectOutcomeAuthority.HIGH_FREQUENCY_DIRECT,
  "training:*": DirectOutcomeAuthority.SUPPORTING_PROXY,
  "photos:*": DirectOutcomeAuthority.SUPPORTING_PROXY,
  "nutrition:*": DirectOutcomeAuthority.BEHAVIORAL,
  "activity:*": DirectOutcomeAuthority.BEHAVIORAL,
  "recovery:*": DirectOutcomeAuthority.BEHAVIORAL,
});

// Intrinsic to the authority CLASS (fixed per class, not per-reading — a
// specific scan's prep quality is a `durabilityState` concern, not a
// per-instance override here). See DurabilityWeightService for how this
// combines with repetition into a `durabilityWeight`.
export const MEASUREMENT_UNCERTAINTY_BY_AUTHORITY = Object.freeze({
  [DirectOutcomeAuthority.AUTHORITATIVE_DIRECT]: MeasurementUncertainty.MODERATE,
  [DirectOutcomeAuthority.HIGH_FREQUENCY_DIRECT]: MeasurementUncertainty.HIGH,
  [DirectOutcomeAuthority.SUPPORTING_PROXY]: MeasurementUncertainty.MODERATE,
  [DirectOutcomeAuthority.BEHAVIORAL]: MeasurementUncertainty.LOW,
});

/**
 * Resolve authority for one evidence reading against one Goal.
 *
 * @param evidenceDomain     e.g. "dexa", "weight", "training" — a stable
 *                           capability identifier, never a raw evidence
 *                           object.
 * @param goalOutcomeMetric  the Goal's own target metric, e.g. "lean_mass".
 * @param goalAuthorityOverrides  optional Goal-declared table in the same
 *                           `${domain}:${metric}` shape; always wins.
 */
export function classifyEvidenceAuthority({
  evidenceDomain,
  goalOutcomeMetric = null,
  goalAuthorityOverrides = null,
} = {}) {
  if (!evidenceDomain) {
    return Object.freeze({
      schemaVersion: EVIDENCE_AUTHORITY_VERSION,
      directOutcomeAuthority: null,
      measurementUncertainty: null,
      source: "unresolved",
    });
  }
  const specificKey = `${evidenceDomain}:${goalOutcomeMetric ?? ""}`;
  const wildcardKey = `${evidenceDomain}:*`;
  const resolved =
    lookup(goalAuthorityOverrides, specificKey, wildcardKey) ??
    lookup(DEFAULT_EVIDENCE_AUTHORITY_TABLE, specificKey, wildcardKey) ??
    null;
  const source = goalAuthorityOverrides && lookup(goalAuthorityOverrides, specificKey, wildcardKey)
    ? "goal_declared"
    : resolved
      ? "default_table"
      : "unresolved";
  return Object.freeze({
    schemaVersion: EVIDENCE_AUTHORITY_VERSION,
    directOutcomeAuthority: resolved,
    measurementUncertainty: resolved ? MEASUREMENT_UNCERTAINTY_BY_AUTHORITY[resolved] : null,
    source,
  });
}

function lookup(table, specificKey, wildcardKey) {
  if (!table) return null;
  return table[specificKey] ?? table[wildcardKey] ?? null;
}
