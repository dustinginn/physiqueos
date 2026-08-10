import {
  createCanonicalDurabilityPeriod,
  createDurabilitySignalFromDescriptor,
} from "../interpretation/EvidenceDurabilityService";
import { adaptBriefingArtifactToEvidenceDescriptors } from
  "./ProductionConfidenceContextAdapter";

const QUALIFYING_STRENGTH = new Set(["authoritative", "high", "moderate"]);
const DIRECT_CAPABILITIES = new Set(["dexa_body_composition"]);

export function createCadenceEvidenceDurabilityContext({
  store = {},
  artifact,
  cadence,
  goalContract,
  previousCanonicalAssessment = null,
} = {}) {
  const currentPeriod = createCanonicalDurabilityPeriod({
    evidenceWindow: artifact?.evidenceWindow ?? {},
    cadence,
    occurrenceId: artifact?.id ?? null,
  });
  const goalId = goalContract?.goal?.goalId ?? null;
  const contractId = goalContract?.contractId ?? null;
  const strategyRevision = goalContract?.strategyHypothesis?.strategyRef
    ?.strategyVersion ?? null;
  const eligibleCapabilities = new Set((goalContract?.relevantEvidence?.entries ?? [])
    .filter((item) => item.role !== "not_relevant")
    .map((item) => item.evidenceCapability)
    .filter((item) => item && !DIRECT_CAPABILITIES.has(item)));
  const histories = (store.goalConfidenceHistory ?? []).filter((item) =>
    item.goalId === goalId &&
    item.assessment?.goalContract?.id === contractId
  );
  const artifactIds = new Set(histories.map((item) =>
    item.originatingArtifactId ?? item.assessment?.briefingArtifactId)
    .filter(Boolean));
  const byPeriod = new Map();
  for (const candidate of store.dailyBriefings ?? []) {
    if (candidate?.cadence !== "weekly" ||
        candidate.evidenceWindow?.closed === false ||
        !artifactIds.has(candidate.id)) continue;
    const period = createCanonicalDurabilityPeriod({
      evidenceWindow: candidate.evidenceWindow,
      cadence: "weekly",
      occurrenceId: candidate.id,
    });
    if (!period || period.kind !== "canonical_week" ||
        period.state !== "completed" ||
        currentPeriod?.endDate && period.endDate > currentPeriod.endDate) continue;
    const descriptors = adaptBriefingArtifactToEvidenceDescriptors({ artifact: candidate });
    const signals = descriptors.filter((descriptor) =>
      descriptor.agreement === "supports" &&
      QUALIFYING_STRENGTH.has(descriptor.strength) &&
      eligibleCapabilities.has(descriptor.capability) &&
      descriptor.capability !== "execution_context"
    ).map(createDurabilitySignalFromDescriptor)
      .filter((signal) => signal.lineageAvailable);
    if (!signals.length) continue;
    const existing = byPeriod.get(period.id);
    byPeriod.set(period.id, existing ? {
      ...existing,
      signals: mergeSignals(existing.signals, signals),
    } : { ...period, signals: mergeSignals([], signals) });
  }
  const priorPeriods = [...byPeriod.values()].sort((left, right) =>
    left.endDate.localeCompare(right.endDate) || left.id.localeCompare(right.id))
    .slice(-3);
  const previousDurability = previousCanonicalAssessment?.evidenceDurability ?? null;
  const uncertaintyComparisonSafe = previousDurability?.schemaVersion ===
    "evidence_durability_v1";
  const previousUncertaintyKeys = uncertaintyComparisonSafe
    ? previousDurability.namedUncertaintyKeys ??
      (previousCanonicalAssessment?.remainingUncertainty?.items ?? [])
        .map((item) => item.key).filter(Boolean)
    : [];
  return freeze({
    schemaVersion: "cadence_evidence_durability_context_v1",
    goalId,
    strategyRevision,
    currentPeriod,
    priorPeriods,
    previousDurability,
    previousUncertaintyKeys: [...new Set(previousUncertaintyKeys.map(String))].sort(),
    uncertaintyComparisonSafe,
    boundedHistoryLimit: 3,
  });
}

function mergeSignals(left, right) {
  const values = new Map();
  for (const signal of [...left, ...right]) {
    const key = `${signal.capability}|${signal.direction}`;
    const prior = values.get(key);
    if (!prior || String(signal.lineageDigest) > String(prior.lineageDigest)) {
      values.set(key, signal);
    }
  }
  return [...values.values()].sort((a, b) =>
    `${a.capability}|${a.direction}`.localeCompare(`${b.capability}|${b.direction}`));
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
