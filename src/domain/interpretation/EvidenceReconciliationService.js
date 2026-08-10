import {
  EvidenceAgreement,
  EvidenceAgreementStatus,
  EvidenceQualityStatus,
  EvidenceRelevance,
  EvidenceStrength,
  enumSet,
} from "./InterpretationRuntimeContract";
import {
  assertEnum,
  deepFreeze,
  relationRef,
  semanticHash,
  uniqueStrings,
} from "./interpretationRuntimeUtils";
import { deriveEvidenceDurability } from "./EvidenceDurabilityService";

const STRENGTHS = enumSet(EvidenceStrength);
const AGREEMENTS = enumSet(EvidenceAgreement);
const ROLE_TO_RELEVANCE = Object.freeze({
  primary: EvidenceRelevance.DECISIVE,
  supporting: EvidenceRelevance.MATERIAL,
  monitoring: EvidenceRelevance.MATERIAL,
  informational: EvidenceRelevance.SUPPORTING_CONTEXT,
  not_relevant: EvidenceRelevance.NOT_APPLICABLE,
});

export function reconcileInterpretationEvidence({
  goalContract,
  evidenceDescriptors = [],
  evaluationContext,
  strategyHypothesis = {},
  durabilityContext = {},
} = {}) {
  const descriptors = normalizeDescriptors(evidenceDescriptors, evaluationContext);
  const evidenceMap = goalContract?.relevantEvidence?.entries ?? [];
  const items = [];
  for (const descriptor of descriptors) {
    const mappings = evidenceMap.filter((entry) =>
      entry.evidenceCapability === descriptor.capability);
    if (!mappings.length) {
      items.push(createItem({ descriptor, mapping: null, targetType: "unmapped",
        targetId: descriptor.capability }));
      continue;
    }
    for (const mapping of mappings) {
      const targets = mappedTargets(mapping);
      if (!targets.length) {
        items.push(createItem({ descriptor, mapping, targetType: "unmapped",
          targetId: mapping.evidenceMapId }));
        continue;
      }
      targets.forEach((target) => items.push(createItem({
        descriptor, mapping, ...target,
      })));
    }
  }
  const sorted = items.sort((left, right) => left.id.localeCompare(right.id));
  const agreementStatus = aggregateAgreement(sorted);
  const quality = aggregateQuality({ descriptors, evidenceMap, items: sorted });
  const contradictions = sorted.filter((item) =>
    item.agreement === EvidenceAgreement.CONTRADICTS &&
    [EvidenceRelevance.DECISIVE, EvidenceRelevance.MATERIAL]
      .includes(item.relevance)
  ).map((item) => ({
    evidenceRef: item.evidenceRef,
    evidenceMapRef: item.evidenceMapRef,
    conclusionRef: item.conclusionRef,
    strength: item.strength,
    relevance: item.relevance,
  }));
  const durability = deriveEvidenceDurability({
    goalId: goalContract?.goal?.goalId,
    strategyRevision: strategyHypothesis?.strategyRef?.strategyVersion,
    descriptors,
    reconciliationItems: sorted,
    contradictions,
    durabilityContext,
  });
  return deepFreeze({
    items: sorted,
    agreementStatus,
    quality,
    reconciledConclusions: reconcileConclusions(sorted),
    contradictions,
    durability,
  });
}

function normalizeDescriptors(values, context) {
  if (!Array.isArray(values)) throw new Error("Evidence descriptors must be an array.");
  const ids = new Set();
  return values.map((value) => {
    if (!value?.id || !value?.capability) {
      throw new Error("Evidence descriptors require identity and capability.");
    }
    if (ids.has(value.id)) throw new Error("Evidence descriptor IDs must be unique.");
    ids.add(value.id);
    const strength = assertEnum(value.strength ?? "insufficient", STRENGTHS,
      "evidence strength");
    const observedAt = value.observedAt ?? null;
    const cutoff = Date.parse(context?.evidenceCutoff);
    const start = Date.parse(context?.windowStart);
    const observed = Date.parse(observedAt);
    const temporalApplicability = value.temporalApplicability ??
      (Number.isFinite(observed) && Number.isFinite(cutoff)
        ? observed <= cutoff && (!Number.isFinite(start) || observed >= start)
          ? "applicable" : "outside_window"
        : "unknown");
    return {
      id: String(value.id),
      capability: String(value.capability),
      observedAt,
      strength,
      temporalApplicability,
      independenceGroup: String(value.independenceGroup ?? value.id),
      limitations: uniqueStrings([
        ...(value.limitations ?? []), ...(value.quality?.limitations ?? []),
      ]),
      quality: normalizeQuality(value.quality),
      agreement: value.agreement == null ? null :
        assertEnum(value.agreement, AGREEMENTS, "evidence agreement"),
      observations: Array.isArray(value.observations)
        ? structuredClone(value.observations) : [],
      measurements: Array.isArray(value.measurements)
        ? structuredClone(value.measurements) : [],
      sourceObservationIds: uniqueStrings(value.sourceObservationIds),
      sourceClaimIds: uniqueStrings(value.sourceClaimIds),
      sourceEvidenceIds: uniqueStrings(value.sourceEvidenceIds),
      temporalIdentity: value.temporalIdentity
        ? structuredClone(value.temporalIdentity) : null,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeQuality(value = {}) {
  return {
    status: value.status ?? "unknown",
    provenanceIntegrity: value.provenanceIntegrity ?? "unknown",
    temporalAdequacy: value.temporalAdequacy ?? "unknown",
    comparisonAdequacy: value.comparisonAdequacy ?? "unknown",
    limitations: uniqueStrings(value.limitations),
  };
}

function mappedTargets(mapping) {
  const applies = mapping.appliesTo ?? {};
  return [
    ...(applies.objectiveRefs ?? []).map((targetId) => ({ targetType: "objective", targetId })),
    ...(applies.guardrailRefs ?? []).map((targetId) => ({ targetType: "guardrail", targetId })),
    ...(applies.hypothesisRefs ?? []).map((targetId) => ({ targetType: "hypothesis", targetId })),
    ...(applies.milestoneRefs ?? []).map((targetId) => ({ targetType: "milestone", targetId })),
  ];
}

function createItem({ descriptor, mapping, targetType, targetId }) {
  const conclusionRef = relationRef(targetType, targetId);
  const observation = descriptor.observations.find((item) =>
    item.conclusionRef === conclusionRef ||
    item.targetType === targetType && item.targetId === targetId
  );
  const agreement = assertEnum(
    observation?.agreement ?? descriptor.agreement ?? EvidenceAgreement.INDETERMINATE,
    AGREEMENTS,
    "evidence agreement"
  );
  const relevance = mapping
    ? ROLE_TO_RELEVANCE[mapping.role] ?? EvidenceRelevance.UNKNOWN
    : EvidenceRelevance.UNKNOWN;
  const semantic = {
    evidenceRef: descriptor.id,
    evidenceMapRef: mapping?.evidenceMapId ?? null,
    conclusionRef,
    strength: descriptor.strength,
    relevance,
    agreement,
    temporalApplicability: descriptor.temporalApplicability,
    independenceGroup: descriptor.independenceGroup,
  };
  return {
    id: `interpretation_evidence|${semanticHash(semantic)}`,
    ...semantic,
    targetType,
    targetId,
    limitations: descriptor.limitations,
  };
}

function aggregateAgreement(items) {
  const material = independentItems(items.filter((item) =>
    item.temporalApplicability === "applicable" &&
    [EvidenceRelevance.DECISIVE, EvidenceRelevance.MATERIAL]
      .includes(item.relevance)));
  if (!material.length) return EvidenceAgreementStatus.INSUFFICIENT;
  const supporting = material.filter((item) => item.agreement === "supports");
  const contradicting = material.filter((item) => item.agreement === "contradicts");
  const bounded = material.filter((item) =>
    ["neutral", "indeterminate"].includes(item.agreement) ||
    ["low", "insufficient"].includes(item.strength));
  if (supporting.length && contradicting.length || contradicting.length) {
    return EvidenceAgreementStatus.CONFLICTING;
  }
  const supportingByConclusion = supporting.reduce((groups, item) => {
    groups.set(item.conclusionRef,
      (groups.get(item.conclusionRef) ?? 0) + 1);
    return groups;
  }, new Map());
  const hasIndependentConvergence = [...supportingByConclusion.values()]
    .some((count) => count >= 2);
  if (hasIndependentConvergence && !bounded.length &&
      supporting.every((item) => ["authoritative", "high"].includes(item.strength))) {
    return EvidenceAgreementStatus.STRONG_CONVERGENCE;
  }
  if (supporting.length && bounded.length) return EvidenceAgreementStatus.MIXED;
  if (supporting.length) return EvidenceAgreementStatus.MODERATE_CONVERGENCE;
  if (bounded.length) return EvidenceAgreementStatus.INSUFFICIENT;
  return EvidenceAgreementStatus.INSUFFICIENT;
}

function independentItems(items) {
  const selected = new Map();
  for (const item of items) {
    const key = `${item.conclusionRef}|${item.independenceGroup}`;
    const current = selected.get(key);
    if (!current || strengthRank(item.strength) > strengthRank(current.strength)) {
      selected.set(key, item);
    }
  }
  return [...selected.values()];
}

function aggregateQuality({ descriptors, evidenceMap, items }) {
  const relevantMap = evidenceMap.filter((entry) => entry.role !== "not_relevant");
  const represented = new Set(items.filter((item) =>
    item.evidenceMapRef && item.temporalApplicability === "applicable")
    .map((item) => item.evidenceMapRef));
  const missingEvidenceMapRefs = relevantMap.map((item) => item.evidenceMapId)
    .filter((id) => !represented.has(id)).sort();
  const coverage = relevantMap.length === 0 ? "unknown" :
    missingEvidenceMapRefs.length === 0 ? "complete" :
      represented.size > 0 ? "partial" : "missing";
  const applicable = descriptors.filter((item) =>
    item.temporalApplicability === "applicable");
  const provenanceIntegrity = worst(applicable.map((item) =>
    item.quality.provenanceIntegrity), ["high", "adequate", "limited", "missing", "unknown"]);
  const temporalAdequacy = worst(applicable.map((item) =>
    item.quality.temporalAdequacy), ["adequate", "limited", "missing", "unknown"]);
  const comparisonAdequacy = worst(applicable.map((item) =>
    item.quality.comparisonAdequacy), ["adequate", "not_required", "limited", "missing", "unknown"]);
  const limitations = uniqueStrings(applicable.flatMap((item) => item.limitations));
  const hasUnknownOrMissingQuality = [
    provenanceIntegrity, temporalAdequacy, comparisonAdequacy,
  ].some((value) => ["unknown", "missing"].includes(value));
  const status = applicable.length === 0 || coverage === "missing"
    ? EvidenceQualityStatus.INSUFFICIENT
    : coverage === "complete" && !limitations.length &&
      provenanceIntegrity === "high" && temporalAdequacy === "adequate" &&
      ["adequate", "not_required"].includes(comparisonAdequacy)
      ? EvidenceQualityStatus.ROBUST
      : coverage !== "missing" && !hasUnknownOrMissingQuality
        ? EvidenceQualityStatus.ADEQUATE
        : EvidenceQualityStatus.LIMITED;
  return {
    status,
    coverage,
    provenanceIntegrity,
    temporalAdequacy,
    comparisonAdequacy,
    missingEvidenceMapRefs,
    limitations,
    rationale: `evidence_quality_${status}`,
  };
}

function worst(values, ordering) {
  const filtered = values.filter(Boolean);
  if (!filtered.length) return "unknown";
  return filtered.reduce((result, value) =>
    ordering.indexOf(value) > ordering.indexOf(result) ? value : result,
  filtered[0]);
}

function reconcileConclusions(items) {
  const grouped = new Map();
  for (const item of items) {
    const group = grouped.get(item.conclusionRef) ?? {
      conclusionRef: item.conclusionRef,
      supportingEvidenceRefs: [],
      contradictingEvidenceRefs: [],
      neutralEvidenceRefs: [],
      indeterminateEvidenceRefs: [],
    };
    group[`${item.agreement === "supports" ? "supporting" :
      item.agreement === "contradicts" ? "contradicting" :
        item.agreement}EvidenceRefs`].push(item.evidenceRef);
    grouped.set(item.conclusionRef, group);
  }
  return [...grouped.values()].map((item) => ({
    ...item,
    supportingEvidenceRefs: uniqueStrings(item.supportingEvidenceRefs),
    contradictingEvidenceRefs: uniqueStrings(item.contradictingEvidenceRefs),
    neutralEvidenceRefs: uniqueStrings(item.neutralEvidenceRefs),
    indeterminateEvidenceRefs: uniqueStrings(item.indeterminateEvidenceRefs),
  })).sort((left, right) => left.conclusionRef.localeCompare(right.conclusionRef));
}

function strengthRank(value) {
  return ({ insufficient: 0, low: 1, moderate: 2, high: 3, authoritative: 4 })[value] ?? 0;
}
