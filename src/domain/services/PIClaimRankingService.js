import { validatePICrossDomainClaim } from "./PICrossDomainClaimService";

export const PI_CLAIM_RANKING_VERSION = "pi_claim_ranking_v1";
export const PI_CLAIM_SCORE_MODEL_VERSION = "pi_claim_priority_score_v1";
export const PI_PRIORITY_BANDS = Object.freeze([
  "critical",
  "high",
  "moderate",
  "low",
  "background",
  "suppressed",
]);
export const PI_SELECTION_STATES = Object.freeze([
  "primary",
  "supporting",
  "background",
  "suppressed",
  "ineligible",
]);
export const PI_MATERIALITY_LEVELS = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
  "very_high",
]);

const CONFIDENCE_SCORE = Object.freeze({
  unevaluated: 0,
  low: 5,
  moderate: 11,
  high: 15,
  very_high: 18,
});
const CONFIDENCE_ORDER = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
  "very_high",
]);
const LIFECYCLE_SCORE = Object.freeze({
  unevaluated: 0,
  new: 12,
  strengthened: 20,
  weakened: 18,
  contradicted: 24,
  unchanged: 4,
  resolved: 10,
  background: 0,
  retired: 0,
});
const COMPONENT_WEIGHTS = Object.freeze({
  lifecycle: 24,
  confidence: 18,
  materiality: 20,
  goalRelevance: 14,
  guardrail: 8,
  evidenceQuality: 10,
  recency: 8,
  breadth: 6,
  transitionSignificance: 12,
  cadenceFit: 4,
  observationalSignificance: 4,
});
const INSUFFICIENCY_KINDS = new Set([
  "insufficient_energy_to_explain_weight",
  "insufficient_weight_to_support_energy_claim",
  "insufficient_training_to_support_weight_claim",
  "insufficient_weight_to_support_training_claim",
]);

export function evaluatePIClaimMateriality(claim, context = {}) {
  validatePICrossDomainClaim(claim);
  const lifecycle = lifecycleState(claim);
  const goal = goalRelevance(claim, context);
  const evidence = evidenceState(claim);
  const breadth = breadthState(claim);
  const basis = [];
  const limitations = [];
  let score = 0;

  if (isInsufficiency(claim)) {
    score += 12;
    basis.push("insufficiency_relationship");
  } else if (isChangingRelationship(claim)) {
    score += 34;
    basis.push("measured_change_relationship");
  } else {
    score += 22;
    basis.push("measured_stability_relationship");
  }
  const lifecycleContribution = {
    contradicted: 30,
    strengthened: 22,
    weakened: 20,
    new: 12,
    resolved: 10,
    unchanged: 4,
    background: 0,
    retired: 0,
    unevaluated: 0,
  }[lifecycle];
  score += lifecycleContribution;
  if (lifecycleContribution > 0) basis.push(`lifecycle_${lifecycle}`);
  score += { complete: 12, partial: 6, missing: 0 }[evidence.coverage];
  if (evidence.coverage !== "missing") {
    basis.push(`coverage_${evidence.coverage}`);
  }
  score += { overall: 10, category: 7, exercise: 2, unknown: 4 }[breadth];
  basis.push(`scope_${breadth}`);
  score += goal.primary ? 12 : goal.contextual ? 4 : 0;
  if (goal.primary) basis.push("primary_outcome_relevance");
  if (goal.guardrail) {
    score += 14;
    basis.push("guardrail_relevance");
  }
  if (goal.risk) {
    score += 14;
    basis.push("structured_risk_role");
  }
  if (claim.confidence.level === "unevaluated") {
    limitations.push("confidence_unevaluated");
  }
  if (breadth === "exercise") limitations.push("isolated_exercise_scope");
  limitations.push(...claim.limitations);
  score -= Math.min(20, [...new Set(limitations)].length * 4);
  const unsupported =
    claim.confidence.level === "unevaluated" &&
    lifecycle === "unevaluated" &&
    !goal.primary &&
    !goal.guardrail &&
    !goal.risk;
  if (unsupported) {
    score = Math.min(score, 25);
    basis.push("support_unevaluated");
  }
  score = clamp(score);

  return {
    level: unsupported ? (score === 0 ? "unevaluated" : "low") : materialityLevel(score, claim),
    score,
    basis: [...new Set(basis)].sort(),
    limitations: [...new Set(limitations)].sort(),
    provenance: {
      producer: "pi_claim_ranking_service",
      producerVersion: PI_CLAIM_RANKING_VERSION,
      calculationMethod: "structured_claim_materiality",
      scoreModelVersion: PI_CLAIM_SCORE_MODEL_VERSION,
    },
  };
}

export function scorePIClaimForPriority(claim, context = {}, options = {}) {
  validatePICrossDomainClaim(claim);
  const normalized = rankingOptions(options);
  const materiality = evaluatePIClaimMateriality(claim, context);
  const lifecycle = lifecycleState(claim);
  const goal = goalRelevance(claim, context);
  const evidence = evidenceState(claim);
  const breadth = breadthState(claim);
  const pair = domainPair(claim);
  const suppressionReasons = [];
  const boostReasons = [];
  const penaltyReasons = [];

  const scoreComponents = {
    lifecycle: LIFECYCLE_SCORE[lifecycle] ?? 0,
    confidence: CONFIDENCE_SCORE[claim.confidence.level] ?? 0,
    materiality: Math.round((materiality.score / 100) * COMPONENT_WEIGHTS.materiality),
    goalRelevance: goal.primary
      ? 14
      : goal.contextual
        ? 6
        : goal.unknown
          ? 2
          : 0,
    guardrail: goal.guardrail ? 8 : 0,
    evidenceQuality: evidenceQualityScore(evidence),
    recency: recencyScore(claim, context),
    breadth: { overall: 6, category: 4, exercise: 1, unknown: 2 }[breadth],
    transitionSignificance:
      lifecycle === "contradicted"
        ? 12
        : lifecycle === "resolved"
          ? 6
          : 0,
    cadenceFit: cadenceFitScore(claim, context),
    observationalSignificance:
      lifecycle === "contradicted" || goal.risk
        ? 4
        : goal.guardrail && lifecycle !== "unchanged"
          ? 3
          : 0,
    repetitionPenalty: lifecycle === "background" ? -16 : 0,
    insufficiencyPenalty: isInsufficiency(claim) ? -10 : 0,
    limitationPenalty: -Math.min(12, claim.limitations.length * 3),
    backgroundPenalty: lifecycle === "background" ? -20 : 0,
    stalePenalty: stalePenalty(claim, context),
  };

  if (["new", "strengthened", "weakened", "contradicted"].includes(lifecycle)) {
    boostReasons.push(`lifecycle_${lifecycle}`);
  }
  if (goal.primary) boostReasons.push("primary_outcome_relevance");
  if (goal.guardrail) boostReasons.push("guardrail_relevance");
  if (goal.risk) boostReasons.push("structured_risk_role");
  if (evidence.coverage === "complete") boostReasons.push("complete_evidence_coverage");
  if (lifecycle === "background") penaltyReasons.push("lifecycle_background");
  if (isInsufficiency(claim)) penaltyReasons.push("insufficiency_relationship");
  if (claim.limitations.length > 0) penaltyReasons.push("inherited_limitations");
  if (scoreComponents.stalePenalty < 0) penaltyReasons.push("stale_material_change");

  let eligible = true;
  if (lifecycle === "retired") {
    eligible = false;
    suppressionReasons.push("lifecycle_retired");
  }
  if (
    normalized.allowedDomainPairs &&
    !normalized.allowedDomainPairs.includes(pair)
  ) {
    eligible = false;
    suppressionReasons.push("domain_pair_excluded");
  }
  if (isInsufficiency(claim) && !normalized.includeInsufficiency) {
    suppressionReasons.push("insufficiency_excluded");
  }
  if (lifecycle === "resolved" && !normalized.includeResolved) {
    suppressionReasons.push("resolved_excluded");
  }
  if (staleBeyondLimit(claim, context)) {
    eligible = false;
    suppressionReasons.push("stale_beyond_explicit_limit");
  }
  if (
    claim.confidence.level === "unevaluated" &&
    lifecycle !== "contradicted" &&
    !goal.risk &&
    !goal.guardrail
  ) {
    suppressionReasons.push("confidence_unevaluated_without_attention_signal");
  }
  if (
    evidence.coverage === "missing" &&
    !isInsufficiency(claim) &&
    lifecycle !== "contradicted"
  ) {
    suppressionReasons.push("material_support_missing");
  }

  const priorityScore = clamp(
    Object.values(scoreComponents).reduce((sum, value) => sum + value, 0)
  );
  const suppressed = suppressionReasons.length > 0;
  const selectionState = !eligible
    ? "ineligible"
    : lifecycle === "background"
      ? "background"
      : suppressed
        ? "suppressed"
        : "supporting";

  return {
    claimId: claim.id,
    claim: structuredClone(claim),
    eligible,
    priorityScore,
    priorityBand: priorityBand(priorityScore, selectionState),
    rank: null,
    selectionState,
    materiality,
    scoreComponents,
    boostReasons: [...new Set(boostReasons)].sort(),
    penaltyReasons: [...new Set(penaltyReasons)].sort(),
    suppressionReasons: [...new Set(suppressionReasons)].sort(),
    tieBreakData: {
      materialityScore: materiality.score,
      confidenceOrdinal: CONFIDENCE_ORDER.indexOf(claim.confidence.level),
      semanticFamily: semanticFamily(claim),
      claimId: claim.id,
    },
    limitations: [...claim.limitations],
    provenance: rankingProvenance(context),
  };
}

export function rankPIClaims(claims = [], context = {}, options = {}) {
  if (!Array.isArray(claims)) throw new Error("claims must be an array.");
  const diagnostics = [];
  const groupedByClaimId = new Map();

  claims.forEach((claim) => {
    try {
      validatePICrossDomainClaim(claim);
    } catch (error) {
      diagnostics.push({
        code: "invalid_claim",
        claimId: typeof claim?.id === "string" ? claim.id : null,
        detail: error.message,
      });
      return;
    }
    groupedByClaimId.set(claim.id, [
      ...(groupedByClaimId.get(claim.id) ?? []),
      claim,
    ]);
  });

  const canonicalClaims = [];
  groupedByClaimId.forEach((duplicates, claimId) => {
    if (duplicates.length > 1) {
      diagnostics.push({
        code: "duplicate_claim_id",
        claimId,
        duplicateCount: duplicates.length,
      });
    }
    canonicalClaims.push(
      [...duplicates].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      )[0]
    );
  });

  const ranked = canonicalClaims
    .map((claim) => scorePIClaimForPriority(claim, context, options))
    .sort(compareRankings);
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });

  const activeByFamily = new Map();
  ranked.forEach((item) => {
    if (!item.eligible || ["background", "suppressed", "ineligible"].includes(item.selectionState)) {
      return;
    }
    const family = item.tieBreakData.semanticFamily;
    const stronger = activeByFamily.get(family);
    if (!stronger) {
      activeByFamily.set(family, item);
      return;
    }
    item.selectionState = "suppressed";
    item.priorityBand = "suppressed";
    item.suppressionReasons = [
      ...item.suppressionReasons,
      "stronger_semantic_family_candidate",
    ].sort();
    diagnostics.push({
      code: "semantic_family_duplicate",
      claimId: item.claimId,
      strongerClaimId: stronger.claimId,
      semanticFamily: family,
    });
  });

  const families = new Map();
  ranked.forEach((item) => {
    const family = item.tieBreakData.semanticFamily;
    families.set(family, [...(families.get(family) ?? []), item]);
  });
  families.forEach((items, family) => {
    if (
      items.length > 1 &&
      items.some((item) => lifecycleState(item.claim) === "contradicted")
    ) {
      diagnostics.push({
        code: "conflicting_semantic_family",
        claimIds: items.map((item) => item.claimId).sort(),
        semanticFamily: family,
      });
    }
  });

  return {
    rankedClaims: ranked,
    diagnostics: diagnostics.sort(diagnosticComparator),
    provenance: rankingProvenance(context),
  };
}

export function selectPIClaimsForNarrative(
  claims = [],
  context = {},
  options = {}
) {
  const normalized = rankingOptions(options);
  const ranked = rankPIClaims(claims, context, normalized);
  const active = ranked.rankedClaims.filter(
    (item) =>
      item.eligible &&
      item.selectionState === "supporting" &&
      confidenceEligible(item.claim, normalized.minimumConfidence) &&
      bandEligible(item.priorityBand, normalized.minimumPriorityBand)
  );
  const primary = [];
  const supporting = [];
  const selectedFamilies = new Set();

  for (const item of active) {
    const family = item.tieBreakData.semanticFamily;
    if (
      primary.length < normalized.maxPrimaryClaims &&
      primaryEligible(item, normalized) &&
      !selectedFamilies.has(family)
    ) {
      item.selectionState = "primary";
      primary.push(item);
      selectedFamilies.add(family);
      continue;
    }
    if (
      supporting.length < normalized.maxSupportingClaims &&
      !selectedFamilies.has(family)
    ) {
      item.selectionState = "supporting";
      supporting.push(item);
      selectedFamilies.add(family);
    } else if (!selectedFamilies.has(family)) {
      item.selectionState = "suppressed";
      item.priorityBand = "suppressed";
      item.suppressionReasons = [
        ...item.suppressionReasons,
        "selection_limit_reached",
      ].sort();
    }
  }

  const selectedIds = new Set(
    [...primary, ...supporting].map((item) => item.claimId)
  );
  ranked.rankedClaims.forEach((item) => {
    if (
      item.selectionState === "supporting" &&
      !selectedIds.has(item.claimId)
    ) {
      item.selectionState = "suppressed";
      item.priorityBand = "suppressed";
      item.suppressionReasons = [
        ...item.suppressionReasons,
        confidenceEligible(item.claim, normalized.minimumConfidence)
          ? "not_selected"
          : "below_minimum_confidence",
      ].sort();
    }
  });

  return {
    primary,
    supporting,
    background: normalized.includeBackground
      ? ranked.rankedClaims.filter((item) => item.selectionState === "background")
      : [],
    suppressed: ranked.rankedClaims.filter((item) =>
      ["suppressed", "ineligible"].includes(item.selectionState)
    ),
    rankedClaims: ranked.rankedClaims,
    diagnostics: ranked.diagnostics,
    provenance: ranked.provenance,
    limits: {
      maxPrimaryClaims: normalized.maxPrimaryClaims,
      maxSupportingClaims: normalized.maxSupportingClaims,
    },
  };
}

function rankingOptions(options) {
  return {
    maxPrimaryClaims: nonNegativeInteger(
      options.maxPrimaryClaims ?? 1,
      "maxPrimaryClaims"
    ),
    maxSupportingClaims: nonNegativeInteger(
      options.maxSupportingClaims ?? 2,
      "maxSupportingClaims"
    ),
    includeBackground: options.includeBackground !== false,
    includeInsufficiency: options.includeInsufficiency !== false,
    includeResolved: options.includeResolved !== false,
    minimumConfidence: options.minimumConfidence ?? "low",
    minimumPriorityBand: options.minimumPriorityBand ?? "low",
    primaryMinimumScore: options.primaryMinimumScore ?? 50,
    allowedDomainPairs: options.allowedDomainPairs
      ? [...new Set(options.allowedDomainPairs)].sort()
      : null,
  };
}

function evidenceState(claim) {
  return {
    coverage: claim.explanationData?.coverage?.state ?? "complete",
    overlap: claim.explanationData?.evidenceOverlap ?? "complete",
  };
}

function evidenceQualityScore(evidence) {
  const coverage = { complete: 7, partial: 4, missing: 0 }[evidence.coverage] ?? 2;
  const overlap = { complete: 3, partial: 1, none: 0, unavailable: 0 }[evidence.overlap] ?? 1;
  return coverage + overlap;
}

function goalRelevance(claim, context) {
  const summaries = Object.values(
    claim.explanationData?.goalContext ?? {}
  ).filter(Boolean);
  const roles = summaries.map((item) => item.observationRole);
  const configured = context.domainRelevance?.[domainPair(claim)] ?? null;
  return {
    primary:
      configured === "primary" ||
      summaries.some((item) => item.primaryOutcomeRelevance === true),
    guardrail:
      configured === "guardrail" ||
      summaries.some((item) => item.guardrailRelevance === true),
    risk: roles.includes("risk"),
    contextual:
      configured === "context" ||
      roles.includes("context") ||
      summaries.length > 0,
    unknown: !configured && summaries.length === 0,
  };
}

function breadthState(claim) {
  const type = claim.explanationData?.trainingSubject?.type;
  return {
    training_scope: "overall",
    training_category: "category",
    exercise: "exercise",
  }[type] ?? (claim.participatingDomains.includes("training") ? "unknown" : "overall");
}

function lifecycleState(claim) {
  return claim.lifecycle?.state ?? "unevaluated";
}

function recencyScore(claim, context) {
  const age = materialChangeAge(claim, context);
  if (age == null || !["new", "strengthened", "weakened", "contradicted", "resolved"].includes(lifecycleState(claim))) {
    return 0;
  }
  if (age <= 7) return 8;
  if (age <= 30) return 5;
  if (age <= 90) return 2;
  return 0;
}

function stalePenalty(claim, context) {
  const age = materialChangeAge(claim, context);
  if (age == null || context.maximumRelevantAgeDays == null) return 0;
  return age > context.maximumRelevantAgeDays ? -20 : 0;
}

function staleBeyondLimit(claim, context) {
  const age = materialChangeAge(claim, context);
  return (
    age != null &&
    context.maximumRelevantAgeDays != null &&
    age > context.maximumRelevantAgeDays
  );
}

function materialChangeAge(claim, context) {
  const evaluationDate = context.evaluationDate;
  const materialDate = claim.lifecycle?.lastMaterialChangeDate;
  if (!evaluationDate || !materialDate) return null;
  return daysBetween(materialDate, evaluationDate);
}

function cadenceFitScore(claim, context) {
  const cadence = context.cadence ?? context.surface ?? "unknown";
  const lifecycle = lifecycleState(claim);
  if (cadence === "daily" && recencyScore(claim, context) >= 5) return 3;
  if (cadence === "weekly" && ["strengthened", "weakened"].includes(lifecycle)) return 4;
  if (cadence === "monthly" && breadthState(claim) === "overall") return 3;
  if (
    cadence === "event" &&
    context.eventDomains?.some((domain) =>
      claim.participatingDomains.includes(domain)
    )
  ) return 4;
  return 0;
}

function primaryEligible(item, options) {
  const lifecycle = lifecycleState(item.claim);
  const confidence = item.claim.confidence.level;
  const attentionException =
    lifecycle === "contradicted" ||
    item.boostReasons.includes("structured_risk_role") ||
    (isInsufficiency(item.claim) &&
      item.boostReasons.includes("primary_outcome_relevance"));
  return (
    item.priorityScore >= options.primaryMinimumScore &&
    (CONFIDENCE_ORDER.indexOf(confidence) >=
      CONFIDENCE_ORDER.indexOf("moderate") ||
      attentionException)
  );
}

function semanticFamily(claim) {
  return [
    domainPair(claim),
    semanticHorizon(claim),
    relationshipFamily(claim.kind),
  ].join("|");
}

function relationshipFamily(kind) {
  if (kind.startsWith("intake_")) return "intake_weight";
  if (kind.startsWith("expenditure_")) return "expenditure_weight";
  if (kind.startsWith("energy_balance_")) return "energy_balance_weight";
  if (kind.includes("training_volume")) return "training_volume_weight";
  if (kind.includes("training_progress") || kind.includes("training_regression") || kind.includes("training_stability")) {
    return "training_performance_weight";
  }
  if (kind.includes("energy") && kind.startsWith("insufficient")) return "energy_weight_insufficiency";
  if (kind.includes("training") && kind.startsWith("insufficient")) return "training_weight_insufficiency";
  return kind;
}

function domainPair(claim) {
  if (claim.participatingDomains.includes("energy") || /energy|intake|expenditure/.test(claim.kind)) {
    return "energy+weight";
  }
  if (claim.participatingDomains.includes("training") || claim.kind.includes("training")) {
    return "training+weight";
  }
  return claim.participatingDomains.join("+");
}

function semanticHorizon(claim) {
  return claim.id.split("|").at(-1).split(".")[0];
}

function priorityBand(score, selectionState) {
  if (["suppressed", "ineligible"].includes(selectionState)) return "suppressed";
  if (selectionState === "background") return "background";
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "moderate";
  if (score >= 30) return "low";
  return "background";
}

function materialityLevel(score, claim) {
  if (score === 0 || (claim.confidence.level === "unevaluated" && score < 20)) {
    return "unevaluated";
  }
  if (score >= 80) return "very_high";
  if (score >= 65) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

function compareRankings(left, right) {
  return (
    right.priorityScore - left.priorityScore ||
    right.materiality.score - left.materiality.score ||
    right.tieBreakData.confidenceOrdinal - left.tieBreakData.confidenceOrdinal ||
    left.claimId.localeCompare(right.claimId)
  );
}

function rankingProvenance(context) {
  return {
    producer: "pi_claim_ranking_service",
    producerVersion: PI_CLAIM_RANKING_VERSION,
    scoreModelVersion: PI_CLAIM_SCORE_MODEL_VERSION,
    callerContext: {
      cadence: context.cadence ?? context.surface ?? "unknown",
      evaluationDate: context.evaluationDate ?? null,
    },
    componentWeights: COMPONENT_WEIGHTS,
    tieBreakMethod: "score_materiality_confidence_claim_id",
  };
}

function confidenceEligible(claim, minimum) {
  return (
    CONFIDENCE_ORDER.indexOf(claim.confidence.level) >=
    CONFIDENCE_ORDER.indexOf(minimum)
  );
}

function bandEligible(band, minimum) {
  const order = ["suppressed", "background", "low", "moderate", "high", "critical"];
  return order.indexOf(band) >= order.indexOf(minimum);
}

function diagnosticComparator(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function isInsufficiency(claim) {
  return INSUFFICIENCY_KINDS.has(claim.kind);
}

function isChangingRelationship(claim) {
  return claim.kind.includes("_weight_change");
}

function daysBetween(startDate, endDate) {
  return Math.floor(
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000)
  );
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}
