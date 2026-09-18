import {
  V3_SCHEMA,
  assertOneOf,
  capabilityId,
  deepFreeze,
  requiredText,
  requiredTimestamp,
  semanticFingerprint,
  uniqueStrings,
} from "./V3Runtime.js";

export function createEvidenceObservationV3(input = {}) {
  const capabilities = (input.capabilities ?? []).map((item, index) => ({
    capabilityId: capabilityId(item.capabilityId ?? item.capability),
    value: item.value,
    unit: item.unit ?? null,
    comparisonValue: item.comparisonValue ?? null,
    comparisonAt: item.comparisonAt ?? null,
    change: item.change ?? deriveChange(item.value, item.comparisonValue),
    factualSummary: item.factualSummary ?? null,
    metadata: structuredClone(item.metadata ?? {}),
    index,
  }));
  if (capabilities.length === 0) throw new Error("Evidence Observation V3 requires a capability.");
  const semantic = {
    schemaVersion: V3_SCHEMA.evidenceObservation,
    observationId: requiredText(input.observationId, "observationId"),
    canonicalRecordId: input.canonicalRecordId ?? input.observationId,
    sourceType: requiredText(input.sourceType, "sourceType"),
    displayLabel: input.displayLabel ?? input.sourceType,
    observedAt: requiredTimestamp(input.observedAt, "observedAt"),
    status: assertOneOf(input.status ?? "active", ["active", "superseded", "retracted"], "status"),
    relatedGoalIds: uniqueStrings(input.relatedGoalIds ?? []),
    phaseId: input.phaseId ?? null,
    strategyRevisionId: input.strategyRevisionId ?? null,
    highSalienceEvent: Boolean(input.highSalienceEvent),
    evidenceWindow: structuredClone(input.evidenceWindow ?? null),
    directness: assertOneOf(input.directness ?? "proxy", ["direct", "proxy", "behavioral"], "directness"),
    quality: {
      status: assertOneOf(input.quality?.status ?? "limited", ["robust", "adequate", "limited", "insufficient"], "quality.status"),
      provenance: input.quality?.provenance ?? "unknown",
      precision: input.quality?.precision ?? "unknown",
      completeness: input.quality?.completeness ?? "unknown",
      comparability: input.quality?.comparability ?? "unknown",
      coverageRatio: input.quality?.coverageRatio ?? null,
    },
    exposureDays: Math.max(0, Number(input.exposureDays ?? 0)),
    capabilities,
    limitations: uniqueStrings(input.limitations ?? []),
    sourceReferences: uniqueStrings(input.sourceReferences ?? []),
  };
  return deepFreeze({
    ...semantic,
    semanticFingerprint: semanticFingerprint(semantic),
  });
}

function deriveChange(value, comparisonValue) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(comparisonValue))) return null;
  return Number(value) - Number(comparisonValue);
}
