import {
  AUTHORITY_ORDER,
  QUALITY_ORDER,
  deepFreeze,
  evaluateDeclarativePredicate,
  matchesCapability,
} from "./V3Runtime.js";

export function resolveGoalRelativeAuthority({ goalContract, observations }) {
  const bindings = [];
  for (const observation of observations) {
    for (const measurement of observation.capabilities) {
      for (const policy of goalContract.evidencePolicies) {
        if (!matchesCapability(policy.capabilityPattern, measurement.capabilityId)) continue;
        if (QUALITY_ORDER[observation.quality.status] < QUALITY_ORDER[policy.minimumQuality]) continue;
        bindings.push({
          bindingId: `${observation.observationId}|${measurement.capabilityId}|${policy.policyId}`,
          observationId: observation.observationId,
          observedAt: observation.observedAt,
          evidenceWindow: structuredClone(observation.evidenceWindow),
          sourceType: observation.sourceType,
          displayLabel: observation.displayLabel,
          subjectType: policy.subjectType,
          subjectId: policy.subjectId,
          capabilityId: measurement.capabilityId,
          role: policy.role,
          participation: policy.participation,
          directness: observation.directness,
          quality: observation.quality,
          exposureDays: observation.exposureDays,
          usableFor: observation.strategyScopeEligible === false
            ? policy.usableFor.filter((value) =>
                !["feasibility", "persistence", "attribution", "execution"].includes(value))
            : policy.usableFor,
          measurement: structuredClone(measurement),
          signalDirection: resolveSignalDirection(policy.signalRules, measurement, observation),
          signalSignificance: policy.signalRules?.significance ?? "none",
          limitations: [...observation.limitations],
          sourceReferences: [...observation.sourceReferences],
        });
      }
    }
  }
  bindings.sort((left, right) =>
    AUTHORITY_ORDER[right.role] - AUTHORITY_ORDER[left.role] ||
    QUALITY_ORDER[right.quality.status] - QUALITY_ORDER[left.quality.status] ||
    Date.parse(right.observedAt) - Date.parse(left.observedAt) ||
    right.exposureDays - left.exposureDays ||
    left.bindingId.localeCompare(right.bindingId));
  return deepFreeze(bindings);
}

function resolveSignalDirection(rules, measurement, observation) {
  if (!rules) return "indeterminate";
  const context = { measurement, observation: { exposureDays: observation.exposureDays, quality: observation.quality } };
  if (rules.contradictsWhen && evaluateDeclarativePredicate(context, rules.contradictsWhen)) return "contradicts";
  if (rules.supportsWhen && evaluateDeclarativePredicate(context, rules.supportsWhen)) return "supports";
  return "indeterminate";
}
