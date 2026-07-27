import { createHash } from "node:crypto";

export const PI_GOAL_CONFIDENCE_CONTRIBUTOR_MAPPER_VERSION =
  "pi_goal_confidence_contributor_mapper_v1";

const SUPPORTED = Object.freeze({
  goal: "build_lean_mass",
  phase: "establish_maintenance",
  operatingState: "calibration",
});

const DOMAIN_RULES = Object.freeze({
  energy: Object.freeze({
    near_maintenance: ["supporting", "high", "Maintenance Energy is directionally established."],
    persistent_deficit: ["conflicting", "high", "Energy still suggests a persistent deficit."],
    large_surplus: ["conflicting", "high", "Energy suggests a surplus that may challenge the body-fat guardrail."],
    incomplete: ["limiting", "moderate", "Energy coverage is not yet complete enough for a firm calibration conclusion."],
    unknown: ["limiting", "low", "Maintenance Energy direction is not yet established."],
  }),
  training: Object.freeze({
    broad_constructive: ["supporting", "high", "Training is constructive across meaningful breadth."],
    constructive: ["supporting", "moderate", "Training is constructive."],
    stable: ["supporting", "moderate", "Training remains stable during calibration."],
    isolated_pr: ["supporting", "low", "One isolated performance record offers limited support."],
    stagnating: ["neutral", "low", "Training is not yet showing a clear direction."],
    regressing: ["conflicting", "high", "Training is regressing across meaningful breadth."],
    poor_session: ["neutral", "low", "One poor session does not establish a broader trend."],
    unknown: ["neutral", "low", "Training direction is not yet established."],
  }),
  weight: Object.freeze({
    stable: ["supporting", "moderate", "Weight is stable and consistent with maintenance calibration."],
    falling: ["conflicting", "moderate", "Falling Weight supports the concern that intake remains below maintenance."],
    rising: ["neutral", "low", "Rising Weight needs Energy and Photo context before it can support calibration."],
    rising_with_softening: ["conflicting", "high", "Rising Weight and softer Photos challenge the body-fat guardrail."],
    volatile: ["limiting", "low", "Weight volatility limits interpretation."],
    sparse: ["limiting", "low", "Weight coverage is too sparse for a firm conclusion."],
    one_day: ["neutral", "low", "A one-day Weight change is not a trend."],
    unknown: ["neutral", "low", "Weight direction is not yet established."],
  }),
  photos: Object.freeze({
    stable: ["supporting", "moderate", "Photos support a stable body-composition guardrail."],
    improving: ["supporting", "low", "Photos suggest improvement, subject to the Energy context."],
    softening: ["conflicting", "moderate", "Photos suggest softening that may challenge the guardrail."],
    inconclusive: ["limiting", "low", "Photo comparison is inconclusive."],
    low_quality: ["limiting", "low", "Photo quality limits comparison."],
    missing: ["neutral", "low", "No new Photo comparison is expected every week."],
  }),
  dexa: Object.freeze({
    confirming: ["supporting", "authoritative", "A new DEXA confirms the current direction."],
    contradicting: ["conflicting", "authoritative", "A new DEXA contradicts the current direction."],
    recent_baseline: ["neutral", "authoritative", "DEXA provides a recent interpretation boundary."],
    historical_baseline: ["neutral", "high", "Historical DEXA remains an anchor without creating a new gain."],
    stale: ["limiting", "moderate", "DEXA is materially stale for the current conclusion."],
    missing: ["neutral", "low", "No new DEXA is required each week."],
  }),
  recovery: Object.freeze({
    supportive: ["supporting", "low", "PI links Recovery to the current progress interpretation."],
    limiting: ["limiting", "moderate", "Recovery is limiting the current progress interpretation."],
    unsafe: ["conflicting", "high", "Recovery conditions conflict with safe progress."],
    unknown: ["neutral", "low", "Recovery has no interpreted role in this assessment."],
  }),
  protocol: Object.freeze({
    supportive: ["supporting", "low", "PI links protocol execution to the current progress interpretation."],
    limiting: ["limiting", "moderate", "Protocol execution is limiting the current interpretation."],
    unsafe: ["conflicting", "high", "The active strategy contains a safety conflict."],
    present: ["neutral", "low", "Protocol presence alone does not demonstrate progress."],
    unknown: ["neutral", "low", "Protocol context has no interpreted role in this assessment."],
  }),
});

export class PIGoalConfidenceContributorMappingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PIGoalConfidenceContributorMappingError";
    this.code = code;
  }
}

export function mapPIGoalConfidenceContributors(input = {}) {
  const goal = machine(input.goalContext?.semanticGoalType ?? input.goalContext?.goalType);
  const phase = machine(input.phaseContext?.semanticPhaseType ?? input.phaseContext?.phaseType);
  const operatingState = machine(input.operatingState);
  if (goal !== SUPPORTED.goal || phase !== SUPPORTED.phase ||
      operatingState !== SUPPORTED.operatingState) {
    return Object.freeze({
      status: "unsupported",
      reason: "unsupported_goal_phase_operating_state",
      contributors: Object.freeze([]),
      trace: Object.freeze({ merged: Object.freeze([]), suppressed: Object.freeze([]) }),
    });
  }

  const candidates = [];
  for (const domain of Object.keys(DOMAIN_RULES)) {
    const domainInput = input.domainStates?.[domain];
    if (!domainInput) continue;
    for (const state of Array.isArray(domainInput) ? domainInput : [domainInput]) {
      if (domain === "energy" &&
          (state.targetCalories === 7000 || state.targetKind === "obsolete_cut_active_calories")) {
        candidates.push(suppressed(domain, state, "obsolete_cut_target"));
        continue;
      }
      const status = machine(state.status) || "unknown";
      const rule = DOMAIN_RULES[domain][status];
      if (!rule) throw new PIGoalConfidenceContributorMappingError(
        "unsupported_domain_state", `Unsupported ${domain} state: ${status}.`
      );
      const authoritative = state.authoritative === true || rule[1] === "authoritative";
      const isolated = state.isolated === true ||
        (domain === "training" && status === "isolated_pr");
      candidates.push({
        id: contributorId(domain, state.semanticKey ?? status, state),
        semanticKey: `${domain}:${state.semanticKey ?? status}`,
        domain,
        label: `${title(domain)} evidence`,
        direction: rule[0],
        strength: rule[1],
        confidence: state.confidence ?? { level: strengthConfidence(rule[1]), method: "pi_v3_reasoning" },
        evidenceCompleteness: state.evidenceCompleteness ?? "unknown",
        reason: state.reason ?? rule[2],
        sourceObservationIds: strings(state.sourceObservationIds),
        sourceClaimIds: strings(state.sourceClaimIds),
        canonicalEvidenceReferences: references(state.canonicalEvidenceReferences),
        consumedTransitionIds: strings(state.consumedTransitionIds),
        contributorSemanticFingerprint:
          state.contributorSemanticFingerprint ?? null,
        firstConsumedAssessmentId: state.firstConsumedAssessmentId ?? null,
        sourceInterpretationId: state.sourceInterpretationId ?? null,
        consumptionRole: state.consumptionRole ?? null,
        userFacing: state.userFacing !== false,
        authoritative,
        isolated,
        corroborated: state.corroborated === true,
        influencesScore: state.influencesScore !== false && rule[0] !== "neutral",
        phaseRole: state.phaseRole ?? phaseRole(domain),
        status,
      });
    }
  }

  const completeness = mapCompleteness(input.evidenceCompleteness);
  if (completeness) candidates.push(completeness);
  const deduped = deduplicate(candidates);
  return deepFreeze({
    status: "mapped",
    mapperVersion: PI_GOAL_CONFIDENCE_CONTRIBUTOR_MAPPER_VERSION,
    contributors: deduped.contributors,
    trace: { merged: deduped.merged, suppressed: deduped.suppressed },
  });
}

function mapCompleteness(value) {
  const overall = typeof value === "string" ? value : value?.overall;
  if (!overall) return null;
  const table = {
    complete: ["supporting", "moderate", "Evidence is sufficiently complete across interpreted domains."],
    partial: ["limiting", "moderate", "Partial evidence limits certainty."],
    missing: ["limiting", "high", "Critical evidence is missing."],
    unknown: ["neutral", "low", "Evidence completeness has not been established."],
  };
  const rule = table[overall];
  if (!rule) throw new PIGoalConfidenceContributorMappingError(
    "invalid_evidence_completeness", "Unsupported evidence completeness."
  );
  return {
    id: contributorId("evidence_completeness", overall, {}),
    semanticKey: `evidence_completeness:${overall}`,
    domain: "evidence_completeness",
    label: "Evidence completeness",
    direction: rule[0],
    strength: rule[1],
    confidence: { level: strengthConfidence(rule[1]), method: "pi_v3_reasoning" },
    evidenceCompleteness: overall,
    reason: rule[2],
    sourceObservationIds: [],
    sourceClaimIds: [],
    canonicalEvidenceReferences: [],
    userFacing: true,
    authoritative: false,
    isolated: false,
    corroborated: false,
    influencesScore: overall !== "unknown",
    phaseRole: "certainty",
    status: overall,
  };
}

function deduplicate(candidates) {
  const selected = new Map();
  const merged = [];
  const suppressed = candidates.filter((item) => item.suppressed);
  for (const candidate of candidates.filter((item) => !item.suppressed)) {
    const evidenceKeys = candidate.canonicalEvidenceReferences.map((r) => `${r.type ?? ""}:${r.id}`);
    const lineage = [...candidate.sourceObservationIds, ...candidate.sourceClaimIds];
    const key = evidenceKeys[0] ?? lineage[0] ?? candidate.semanticKey;
    const existing = selected.get(`${candidate.domain}:${key}`);
    if (!existing) {
      selected.set(`${candidate.domain}:${key}`, candidate);
      continue;
    }
    const preferred = strengthRank(candidate.strength) > strengthRank(existing.strength)
      ? candidate : existing;
    const other = preferred === candidate ? existing : candidate;
    selected.set(`${candidate.domain}:${key}`, {
      ...preferred,
      sourceObservationIds: strings([...preferred.sourceObservationIds, ...other.sourceObservationIds]),
      sourceClaimIds: strings([...preferred.sourceClaimIds, ...other.sourceClaimIds]),
      canonicalEvidenceReferences: references([
        ...preferred.canonicalEvidenceReferences, ...other.canonicalEvidenceReferences,
      ]),
      consumedTransitionIds: strings([
        ...(preferred.consumedTransitionIds ?? []),
        ...(other.consumedTransitionIds ?? []),
      ]),
    });
    merged.push({ keptId: preferred.id, mergedId: other.id, reason: "shared_evidence_lineage" });
  }
  return {
    contributors: [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)),
    merged,
    suppressed: suppressed.map(({ domain, reason, sourceObservationIds = [] }) => ({
      domain, reason, sourceObservationIds: strings(sourceObservationIds),
    })),
  };
}

function suppressed(domain, state, reason) {
  return { suppressed: true, domain, reason, sourceObservationIds: state.sourceObservationIds };
}
function contributorId(domain, semanticKey, state) {
  const lineage = references(state.canonicalEvidenceReferences)[0]?.id ??
    strings(state.sourceObservationIds)[0] ?? strings(state.sourceClaimIds)[0] ?? semanticKey;
  return `pi_confidence_contributor|${domain}|${digest(`${semanticKey}|${lineage}`).slice(0, 16)}`;
}
function phaseRole(domain) {
  return ({
    energy: "calibration_signal", training: "outcome_signal", weight: "supporting_context",
    photos: "body_composition_guardrail", dexa: "authoritative_anchor",
    recovery: "enabling_context", protocol: "enabling_context",
  })[domain];
}
function strengthConfidence(strength) {
  return strength === "authoritative" ? "very_high" :
    strength === "high" ? "high" : strength === "moderate" ? "moderate" : "low";
}
function strengthRank(value) {
  return ({ low: 1, moderate: 2, high: 3, authoritative: 4 })[value] ?? 0;
}
function references(values = []) {
  return [...new Map((Array.isArray(values) ? values : []).map((v) => [
    `${v.type ?? ""}:${v.id}`, { id: String(v.id), type: v.type ?? null },
  ])).values()].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
function strings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))].sort();
}
function machine(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
}
function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
