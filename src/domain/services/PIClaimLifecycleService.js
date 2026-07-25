import { validatePICrossDomainClaim } from "./PICrossDomainClaimService";

export const PI_CLAIM_LIFECYCLE_VERSION = "pi_claim_lifecycle_v1";
export const PI_CLAIM_LIFECYCLE_STATES = Object.freeze([
  "unevaluated",
  "new",
  "strengthened",
  "weakened",
  "contradicted",
  "unchanged",
  "resolved",
  "background",
  "retired",
]);

const CONFIDENCE_ORDER = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
  "very_high",
]);
const COVERAGE_ORDER = Object.freeze(["missing", "partial", "complete"]);
const OVERLAP_ORDER = Object.freeze(["none", "unavailable", "partial", "complete"]);
const SCOPE_ORDER = Object.freeze(["exercise", "category", "overall"]);
const INSUFFICIENCY_KINDS = new Set([
  "insufficient_energy_to_explain_weight",
  "insufficient_weight_to_support_energy_claim",
  "insufficient_training_to_support_weight_claim",
  "insufficient_weight_to_support_training_claim",
]);

export function evaluatePIClaimLifecycle(
  currentClaim,
  priorClaim = null,
  options = {}
) {
  validatePICrossDomainClaim(currentClaim);
  if (priorClaim) validatePICrossDomainClaim(priorClaim);
  if (priorClaim && currentClaim.id !== priorClaim.id) {
    throw new Error("Same-claim lifecycle evaluation requires matching claim IDs.");
  }
  const normalizedOptions = lifecycleOptions(options, currentClaim);
  return evaluateSameClaim(currentClaim, priorClaim, normalizedOptions);
}

export function evaluatePIClaimSetLifecycle(
  currentClaims = [],
  priorClaims = [],
  options = {}
) {
  const current = normalizeClaimSet(currentClaims, "currentClaims");
  const prior = normalizeClaimSet(priorClaims, "priorClaims");
  const normalizedOptions = lifecycleOptions(
    options,
    current[0] ?? prior[0] ?? null
  );
  const priorById = new Map(prior.map((claim) => [claim.id, claim]));
  const currentById = new Map(current.map((claim) => [claim.id, claim]));
  const evaluated = [];
  const transitionedPrior = [];
  const diagnostics = [];

  current.forEach((claim) => {
    const same = priorById.get(claim.id) ?? null;
    if (same) {
      evaluated.push(evaluateSameClaim(claim, same, normalizedOptions));
      return;
    }

    const conflicts = prior
      .filter((candidate) => !currentById.has(candidate.id))
      .filter((candidate) => sameSemanticFamily(claim, candidate));
    const contradiction = conflicts.find((candidate) =>
      claimsContradict(claim, candidate)
    );
    const resolvedInsufficiency = conflicts.find(
      (candidate) =>
        isInsufficiency(candidate) &&
        !isInsufficiency(claim)
    );
    const resolvedChanging = conflicts.find(
      (candidate) =>
        isChangingRelationship(candidate) &&
        isStableRelationship(claim)
    );
    const related = contradiction ?? resolvedInsufficiency ?? resolvedChanging;

    if (contradiction) {
      evaluated.push(
        withLifecycle(claim, newLifecycle(claim, normalizedOptions, {
          state: "contradicted",
          priorClaimId: contradiction.id,
          changeReasons: ["semantic_family_contradiction"],
        }))
      );
      diagnostics.push({
        code: "semantic_family_contradiction",
        currentClaimId: claim.id,
        priorClaimId: contradiction.id,
        semanticFamily: semanticFamilyKey(claim),
      });
    } else {
      evaluated.push(
        withLifecycle(claim, newLifecycle(claim, normalizedOptions, {
          priorClaimId: related?.id ?? null,
          changeReasons: related
            ? ["prior_semantic_state_resolved"]
            : ["first_appearance"],
        }))
      );
    }
  });

  prior
    .filter((claim) => !currentById.has(claim.id))
    .forEach((claim) => {
      const replacements = current.filter((candidate) =>
        sameSemanticFamily(candidate, claim)
      );
      const replacement = replacements.find((candidate) =>
        claimsContradict(candidate, claim)
      );
      const resolution = replacements.find(
        (candidate) =>
          (isInsufficiency(claim) && !isInsufficiency(candidate)) ||
          (isChangingRelationship(claim) && isStableRelationship(candidate))
      );
      if (replacement || resolution) {
        transitionedPrior.push(
          transitionMissingPrior(claim, normalizedOptions, {
            state: replacement ? "contradicted" : "resolved",
            reason: replacement
              ? "superseded_by_contradictory_semantic_state"
              : isInsufficiency(claim)
                ? "sufficient_relationship_evidence_available"
                : "relationship_became_stable",
            relatedClaimId: (replacement ?? resolution).id,
          })
        );
        return;
      }
      if (normalizedOptions.evaluationCoverage === "complete") {
        transitionedPrior.push(
          transitionMissingPrior(claim, normalizedOptions, {
            state: "resolved",
            reason: "absent_after_complete_evaluation",
          })
        );
      } else {
        transitionedPrior.push(
          preserveMissingPrior(claim, normalizedOptions)
        );
      }
    });

  return {
    currentClaims: evaluated.sort(byId),
    transitionedPriorClaims: transitionedPrior.sort(byId),
    diagnostics: diagnostics.sort((left, right) =>
      `${left.code}|${left.currentClaimId}|${left.priorClaimId}`.localeCompare(
        `${right.code}|${right.currentClaimId}|${right.priorClaimId}`
      )
    ),
    evaluation: {
      coverage: normalizedOptions.evaluationCoverage,
      date: normalizedOptions.evaluationDate,
      backgroundThreshold: normalizedOptions.backgroundThreshold,
      retirementThreshold: normalizedOptions.retirementThreshold,
      persistenceStrengthensAt: normalizedOptions.persistenceStrengthensAt,
      lifecycleVersion: PI_CLAIM_LIFECYCLE_VERSION,
    },
  };
}

export function detectPIClaimMaterialChange(currentClaim, priorClaim) {
  validatePICrossDomainClaim(currentClaim);
  validatePICrossDomainClaim(priorClaim);
  if (currentClaim.id !== priorClaim.id) {
    return {
      material: true,
      state: "different_identity",
      reasons: ["claim_identity_changed"],
    };
  }
  if (claimsContradict(currentClaim, priorClaim)) {
    return {
      material: true,
      state: "contradicted",
      reasons: ["measured_direction_contradicted"],
    };
  }

  let strengthening = [];
  let weakening = [];
  const context = [];
  compareOrdinal(
    currentClaim.confidence.level,
    priorClaim.confidence.level,
    CONFIDENCE_ORDER,
    "confidence_increased",
    "confidence_decreased",
    strengthening,
    weakening
  );
  compareOrdinal(
    coverageState(currentClaim),
    coverageState(priorClaim),
    COVERAGE_ORDER,
    "coverage_improved",
    "coverage_declined",
    strengthening,
    weakening
  );
  compareOrdinal(
    overlapState(currentClaim),
    overlapState(priorClaim),
    OVERLAP_ORDER,
    "evidence_overlap_improved",
    "evidence_overlap_declined",
    strengthening,
    weakening
  );
  compareOrdinal(
    trainingScope(currentClaim),
    trainingScope(priorClaim),
    SCOPE_ORDER,
    "training_scope_broadened",
    "training_scope_narrowed",
    strengthening,
    weakening
  );

  const currentLimitations = new Set(currentClaim.limitations);
  const priorLimitations = new Set(priorClaim.limitations);
  if ([...priorLimitations].some((item) => !currentLimitations.has(item))) {
    strengthening.push("limitations_removed");
  }
  if ([...currentLimitations].some((item) => !priorLimitations.has(item))) {
    weakening.push("limitations_added");
  }
  if (goalContextKey(currentClaim) !== goalContextKey(priorClaim)) {
    context.push("goal_context_changed");
  }
  if (
    meaningKey(currentClaim) !== meaningKey(priorClaim) &&
    !claimsContradict(currentClaim, priorClaim)
  ) {
    context.push("measured_relationship_changed");
  }

  if (isInsufficiency(currentClaim)) {
    [strengthening, weakening] = [weakening, strengthening];
  }
  const reasons = [...new Set([
    ...strengthening,
    ...weakening,
    ...context,
  ])].sort();
  let state = "unchanged";
  if (strengthening.length > 0 && weakening.length === 0) {
    state = "strengthened";
  } else if (weakening.length > 0 && strengthening.length === 0) {
    state = "weakened";
  }
  return {
    material: reasons.length > 0,
    state,
    reasons:
      strengthening.length > 0 && weakening.length > 0
        ? [...reasons, "mixed_support_changes"].sort()
        : reasons,
  };
}

function evaluateSameClaim(current, prior, options) {
  if (!prior) {
    return withLifecycle(current, newLifecycle(current, options));
  }
  const priorLifecycle = normalizePriorLifecycle(prior, options);
  const change = detectPIClaimMaterialChange(current, prior);
  const complete = options.evaluationCoverage === "complete";
  const totalObservationCount = priorLifecycle.totalObservationCount + 1;
  const consecutiveObservationCount =
    priorLifecycle.consecutiveObservationCount + 1;
  const persistenceStrengthened =
    change.state === "unchanged" &&
    complete &&
    options.persistenceStrengthensAt != null &&
    totalObservationCount >= options.persistenceStrengthensAt &&
    priorLifecycle.totalObservationCount < options.persistenceStrengthensAt;
  if (persistenceStrengthened) {
    change.state = "strengthened";
    change.material = true;
    change.reasons = [...change.reasons, "relationship_persisted"].sort();
  }
  const unchangedCount =
    change.state === "unchanged" && complete
      ? priorLifecycle.consecutiveUnchangedCount + 1
      : change.material
        ? 0
        : priorLifecycle.consecutiveUnchangedCount;
  let state = change.state;
  if (
    state === "unchanged" &&
    complete &&
    unchangedCount >= options.backgroundThreshold
  ) {
    state = "background";
  } else if (
    state === "unchanged" &&
    priorLifecycle.state === "background"
  ) {
    state = "background";
  }

  const lifecycle = {
    state,
    firstObservedDate: priorLifecycle.firstObservedDate,
    lastObservedDate: options.evaluationDate,
    lastMaterialChangeDate: change.material
      ? options.evaluationDate
      : priorLifecycle.lastMaterialChangeDate,
    consecutiveObservationCount,
    consecutiveUnchangedCount: unchangedCount,
    totalObservationCount,
    missedEvaluationCount: 0,
    priorClaimId: prior.id,
    priorConfidence: prior.confidence.level,
    currentConfidence: current.confidence.level,
    changeReasons: change.reasons,
    resolutionReason: null,
    retirementReason: null,
    eligibility: "eligible",
    provenance: lifecycleProvenance(options, [current.id, prior.id]),
    limitations: [],
  };
  return withLifecycle(current, lifecycle);
}

function newLifecycle(claim, options, overrides = {}) {
  return {
    state: overrides.state ?? "new",
    firstObservedDate: options.evaluationDate,
    lastObservedDate: options.evaluationDate,
    lastMaterialChangeDate: options.evaluationDate,
    consecutiveObservationCount: 1,
    consecutiveUnchangedCount: 0,
    totalObservationCount: 1,
    missedEvaluationCount: 0,
    priorClaimId: overrides.priorClaimId ?? null,
    priorConfidence: null,
    currentConfidence: claim.confidence.level,
    changeReasons: overrides.changeReasons ?? ["first_appearance"],
    resolutionReason: null,
    retirementReason: null,
    eligibility: "eligible",
    provenance: lifecycleProvenance(options, [claim.id]),
    limitations: [],
  };
}

function transitionMissingPrior(
  prior,
  options,
  { state, reason, relatedClaimId = null }
) {
  const previous = normalizePriorLifecycle(prior, options);
  const missedEvaluationCount = previous.missedEvaluationCount + 1;
  const shouldRetire =
    previous.state === "resolved" &&
    missedEvaluationCount >= options.retirementThreshold;
  const lifecycle = {
    ...previous,
    state: shouldRetire ? "retired" : state,
    lastMaterialChangeDate: options.evaluationDate,
    consecutiveObservationCount: 0,
    consecutiveUnchangedCount: 0,
    missedEvaluationCount,
    priorClaimId: relatedClaimId ?? prior.id,
    priorConfidence: prior.confidence.level,
    currentConfidence: null,
    changeReasons: [shouldRetire ? "retirement_threshold_reached" : reason],
    resolutionReason: shouldRetire ? previous.resolutionReason : reason,
    retirementReason: shouldRetire
      ? "resolved_claim_retained_beyond_threshold"
      : null,
    eligibility: shouldRetire ? "ineligible" : "eligible",
    provenance: lifecycleProvenance(options, [prior.id, relatedClaimId].filter(Boolean)),
  };
  return withLifecycle(prior, lifecycle);
}

function preserveMissingPrior(prior, options) {
  const previous = normalizePriorLifecycle(prior, options);
  return withLifecycle(prior, {
    ...previous,
    missedEvaluationCount: previous.missedEvaluationCount,
    changeReasons: ["evaluation_coverage_incomplete"],
    provenance: lifecycleProvenance(options, [prior.id]),
  });
}

function normalizePriorLifecycle(claim, options) {
  const value = claim.lifecycle;
  if (!value || !PI_CLAIM_LIFECYCLE_STATES.includes(value.state)) {
    return newLifecycle(claim, {
      ...options,
      evaluationDate: claim.evidenceWindow.endDate ?? options.evaluationDate,
    });
  }
  return structuredClone(value);
}

function lifecycleOptions(options, claim) {
  const evaluationCoverage = options.evaluationCoverage ?? "unknown";
  if (!["complete", "partial", "unknown"].includes(evaluationCoverage)) {
    throw new Error("evaluationCoverage must be complete, partial, or unknown.");
  }
  const evaluationDate =
    options.evaluationDate ??
    claim?.evidenceWindow?.endDate ??
    null;
  if (!evaluationDate || !/^\d{4}-\d{2}-\d{2}$/.test(evaluationDate)) {
    throw new Error("A deterministic evaluationDate is required.");
  }
  return {
    evaluationCoverage,
    evaluationDate,
    backgroundThreshold: positiveInteger(
      options.backgroundThreshold ?? 3,
      "backgroundThreshold"
    ),
    retirementThreshold: positiveInteger(
      options.retirementThreshold ?? 2,
      "retirementThreshold"
    ),
    persistenceStrengthensAt:
      options.persistenceStrengthensAt == null
        ? null
        : positiveInteger(
            options.persistenceStrengthensAt,
            "persistenceStrengthensAt"
          ),
  };
}

function lifecycleProvenance(options, sourceClaimIds) {
  return {
    producer: "pi_claim_lifecycle_service",
    producerVersion: PI_CLAIM_LIFECYCLE_VERSION,
    evaluationDate: options.evaluationDate,
    evaluationCoverage: options.evaluationCoverage,
    sourceClaimIds: [...new Set(sourceClaimIds)].sort(),
  };
}

function semanticFamilyKey(claim) {
  const pair = canonicalDomainPair(claim);
  const horizon = semanticHorizon(claim);
  const family = relationshipFamily(claim.kind);
  const subject = contradictionSubject(claim);
  return [pair, horizon, family, subject].join("|");
}

function sameSemanticFamily(left, right) {
  const leftPair = canonicalDomainPair(left);
  const rightPair = canonicalDomainPair(right);
  if (leftPair !== rightPair) return false;
  if (semanticHorizon(left) !== semanticHorizon(right)) return false;
  const leftFamily = relationshipFamily(left.kind);
  const rightFamily = relationshipFamily(right.kind);
  const familyCompatible =
    leftFamily === rightFamily ||
    leftFamily === `${leftPair}_insufficiency` ||
    rightFamily === `${rightPair}_insufficiency`;
  if (!familyCompatible) return false;
  const leftSubject = contradictionSubject(left);
  const rightSubject = contradictionSubject(right);
  return !leftSubject || !rightSubject || leftSubject === rightSubject;
}

function claimsContradict(current, prior) {
  if (current.id !== prior.id && !sameSemanticFamily(current, prior)) return false;
  const currentMeaning = directionalMeaning(current);
  const priorMeaning = directionalMeaning(prior);
  if (opposites(currentMeaning.training, priorMeaning.training)) return true;
  if (opposites(currentMeaning.energy, priorMeaning.energy)) return true;
  if (
    current.id !== prior.id &&
    isStableRelationship(prior) &&
    isChangingRelationship(current)
  ) {
    return true;
  }
  return false;
}

function canonicalDomainPair(claim) {
  const explicit = claim.participatingDomains;
  if (explicit.includes("energy")) return "energy+weight";
  if (explicit.includes("training")) return "training+weight";
  if (/energy|intake|expenditure/.test(claim.kind)) return "energy+weight";
  if (/training/.test(claim.kind)) return "training+weight";
  return explicit.join("+");
}

function relationshipFamily(kind) {
  if ([
    "insufficient_energy_to_explain_weight",
    "insufficient_weight_to_support_energy_claim",
  ].includes(kind)) {
    return "energy+weight_insufficiency";
  }
  if ([
    "insufficient_training_to_support_weight_claim",
    "insufficient_weight_to_support_training_claim",
  ].includes(kind)) {
    return "training+weight_insufficiency";
  }
  if (/^intake_/.test(kind)) return "intake_weight";
  if (/^expenditure_/.test(kind)) return "expenditure_weight";
  if (/^energy_balance_/.test(kind)) return "energy_balance_weight";
  if (/training_volume/.test(kind)) return "training_volume_weight";
  if (/training_(progress|regression)|training_stability/.test(kind)) {
    return "training_performance_weight";
  }
  return kind;
}

function semanticHorizon(claim) {
  return claim.id.split("|").at(-1).split(".")[0];
}

function contradictionSubject(claim) {
  const subject = claim.explanationData?.trainingSubject;
  if (!subject) return "";
  return `${subject.type ?? ""}:${subject.id ?? subject.semanticKey ?? ""}`;
}

function directionalMeaning(claim) {
  return {
    training:
      claim.explanationData?.trainingDirection ??
      claim.explanationData?.trainingStatus ??
      null,
    energy: claim.explanationData?.energyDirection ?? null,
    weight: claim.explanationData?.weightDirection ?? null,
  };
}

function opposites(left, right) {
  const pairs = new Set([
    "rising|falling",
    "falling|rising",
    "improving|regressing",
    "regressing|improving",
    "positive|negative",
    "negative|positive",
  ]);
  return pairs.has(`${left}|${right}`);
}

function meaningKey(claim) {
  const meaning = directionalMeaning(claim);
  return JSON.stringify({
    kind: claim.kind,
    domains: claim.participatingDomains,
    relationship: claim.explanationData?.relationship ?? null,
    training: meaning.training,
    energy: meaning.energy,
    weight:
      claim.kind.includes("_weight_change")
        ? "changing"
        : meaning.weight,
  });
}

function coverageState(claim) {
  return claim.explanationData?.coverage?.state ?? "complete";
}

function overlapState(claim) {
  return claim.explanationData?.evidenceOverlap ?? "complete";
}

function trainingScope(claim) {
  const scope = claim.explanationData?.trainingSubject?.type;
  return {
    exercise: "exercise",
    training_category: "category",
    training_scope: "overall",
  }[scope] ?? "overall";
}

function goalContextKey(claim) {
  return JSON.stringify(claim.explanationData?.goalContext ?? null);
}

function isInsufficiency(claim) {
  return INSUFFICIENCY_KINDS.has(claim.kind);
}

function isStableRelationship(claim) {
  return (
    claim.kind.includes("_weight_stability") ||
    claim.kind === "weight_change_training_stability"
  );
}

function isChangingRelationship(claim) {
  return claim.kind.includes("_weight_change");
}

function compareOrdinal(
  current,
  prior,
  order,
  increasedReason,
  decreasedReason,
  strengthening,
  weakening
) {
  const currentIndex = order.indexOf(current);
  const priorIndex = order.indexOf(prior);
  if (currentIndex > priorIndex) strengthening.push(increasedReason);
  if (currentIndex < priorIndex) weakening.push(decreasedReason);
}

function normalizeClaimSet(claims, field) {
  if (!Array.isArray(claims)) throw new Error(`${field} must be an array.`);
  const byId = new Map();
  claims.forEach((claim) => {
    validatePICrossDomainClaim(claim);
    if (byId.has(claim.id)) {
      throw new Error(`Duplicate ${field} claim ID: ${claim.id}.`);
    }
    byId.set(claim.id, claim);
  });
  return [...byId.values()].sort(byIdComparator);
}

function withLifecycle(claim, lifecycle) {
  return {
    ...structuredClone(claim),
    lifecycle: structuredClone(lifecycle),
  };
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

function byIdComparator(left, right) {
  return byId(left, right);
}
