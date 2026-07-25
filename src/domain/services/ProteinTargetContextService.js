export const PROTEIN_TARGET_CONTEXT_VERSION = "protein_target_context_v1";

export function resolveProteinTargetContext({
  userId = null,
  goal = null,
  protocols = [],
  protocolVersions = [],
  weights = [],
  window,
} = {}) {
  const before = structuredClone({
    userId, goal, protocols, protocolVersions, weights, window,
  });
  const candidates = protocols.filter((protocol) =>
    protocol?.status === "active" &&
    (protocol.protocolType === "nutrition" || protocol.category === "nutrition") &&
    (!userId || !protocol.userId || protocol.userId === userId) &&
    (!goal?.id || goalIds(protocol).includes(goal.id))
  );
  let result;
  if (candidates.length === 0) {
    result = context({ status: "missing", window, limitations: ["active_nutrition_protocol_unavailable"] });
  } else if (candidates.length > 1) {
    result = context({ status: "conflicted", window, limitations: ["multiple_active_nutrition_protocols"] });
  } else {
    result = resolveProtocol(candidates[0], protocolVersions, weights, goal, window);
  }
  if (JSON.stringify({
    userId, goal, protocols, protocolVersions, weights, window,
  }) !== JSON.stringify(before)) {
    throw new Error("Protein target context input mutation detected.");
  }
  return result;
}

function resolveProtocol(protocol, versions, weights, goal, window) {
  const version = versions.find((item) =>
    item.id === protocol.currentVersionId ||
    (item.protocolId === protocol.id && item.status === "active")
  ) ?? null;
  const strategy = version?.effectiveStrategy ??
    version?.change?.reviewedChanges ??
    protocol.effectiveStrategy ?? {};
  const basis = strategy.proteinBasis ?? strategy.proteinRule?.basis ?? null;
  const ratio = finite(strategy.proteinRatio ?? strategy.proteinRule?.ratio);
  const translated = finite(strategy.proteinTarget ??
    strategy.proteinRule?.currentTranslatedTarget);
  const fixed = finite(strategy.fixedProtein ?? strategy.fixedProteinGrams);
  const effectiveFrom = date(protocol.activatedAt ?? protocol.startDate ??
    version?.effectiveAt);
  const effectiveTo = date(protocol.endDate);
  if (!applies(effectiveFrom, effectiveTo, window)) {
    return context({
      status: "missing", protocol, version, goal, window,
      limitations: ["protein_target_not_applicable_to_window"],
    });
  }
  if (basis === "body_weight") {
    const configured = translated;
    if (!ratio || !configured) {
      return context({
        status: "unknown", protocol, version, goal, window,
        mode: "grams_per_pound",
        limitations: ["body_weight_target_configuration_incomplete"],
      });
    }
    const matchingWeight = weights.find((item) =>
      item.id === strategy.bodyWeightEvidenceId ||
      item.id === strategy.weightEvidenceId
    ) ?? null;
    const weightValue = finite(matchingWeight?.weight?.value ?? matchingWeight?.value);
    const weightDate = date(matchingWeight?.measuredAt ?? matchingWeight?.date);
    const calculated = weightValue == null ? null : Math.round(weightValue * ratio);
    const limitations = [
      !matchingWeight ? "protein_target_body_weight_provenance_unavailable" : null,
      matchingWeight && weightDate > window.endDate ? "future_weight_not_eligible" : null,
      calculated != null && calculated !== configured
        ? "translated_target_does_not_match_weight_provenance" : null,
      fixed != null && fixed !== configured
        ? "alternative_fixed_protein_value_present" : null,
      !version ? "active_protocol_version_unavailable" : null,
    ].filter(Boolean);
    return context({
      status: limitations.length ? "partially_resolved" : "resolved",
      gramsPerDay: configured,
      mode: "grams_per_pound",
      ratio,
      protocol,
      version,
      goal,
      effectiveFrom,
      effectiveTo,
      bodyWeight: matchingWeight,
      window,
      historicalApplicability: limitations.length ? "limited" : "exact",
      limitations,
    });
  }
  const grams = fixed ?? translated;
  if (!grams) {
    return context({
      status: "unknown", protocol, version, goal, window,
      limitations: ["protein_target_value_unavailable"],
    });
  }
  return context({
    status: version ? "resolved" : "partially_resolved",
    gramsPerDay: grams,
    mode: "fixed_grams",
    protocol,
    version,
    goal,
    effectiveFrom,
    effectiveTo,
    window,
    historicalApplicability: version ? "exact" : "limited",
    limitations: version ? [] : ["active_protocol_version_unavailable"],
  });
}

function context({
  status,
  gramsPerDay = null,
  mode = null,
  ratio = null,
  protocol = null,
  version = null,
  goal = null,
  effectiveFrom = null,
  effectiveTo = null,
  bodyWeight = null,
  window = null,
  historicalApplicability = "unknown",
  limitations = [],
}) {
  const value = {
    schemaVersion: PROTEIN_TARGET_CONTEXT_VERSION,
    status,
    gramsPerDay,
    mode,
    ratio,
    unit: gramsPerDay == null ? null : "g",
    goalId: goal?.id ?? null,
    protocolId: protocol?.id ?? null,
    protocolVersion: version?.id ?? version?.versionNumber ?? null,
    effectiveFrom,
    effectiveTo,
    source: protocol ? "active_nutrition_protocol" : null,
    bodyWeightValue: finite(bodyWeight?.weight?.value ?? bodyWeight?.value),
    bodyWeightDate: date(bodyWeight?.measuredAt ?? bodyWeight?.date),
    bodyWeightEvidenceId: bodyWeight?.id ?? null,
    window: window ? structuredClone(window) : null,
    historicalApplicability,
    confidence: status === "resolved" ? "high"
      : status === "partially_resolved" ? "low" : "unevaluated",
    limitations: [...new Set(limitations)].sort(),
    provenance: {
      producer: "protein_target_context_service",
      producerVersion: PROTEIN_TARGET_CONTEXT_VERSION,
      protocolId: protocol?.id ?? null,
      protocolVersionId: version?.id ?? null,
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  };
  return Object.freeze(value);
}
function goalIds(protocol) {
  return [...new Set([
    ...(protocol.relatedGoalIds ?? []),
    ...(protocol.currentGoalIds ?? []),
  ])];
}
function applies(from, to, window) {
  if (!window?.startDate || !window?.endDate) return false;
  if (from && from > window.startDate) return false;
  if (to && to < window.endDate) return false;
  return true;
}
function date(value) {
  const normalized = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
