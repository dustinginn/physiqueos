import {
  deepFreeze,
  semanticHash,
  uniqueStrings,
} from "./interpretationRuntimeUtils";

export const EVIDENCE_DURABILITY_VERSION = "evidence_durability_v1";

const DIRECT_CAPABILITIES = new Set(["dexa_body_composition"]);
const QUALIFYING_STRENGTH = new Set(["authoritative", "high", "moderate"]);
const PERSISTENCE_RANK = { emerging: 1, repeated: 2, sustained: 3 };

export function createCanonicalDurabilityPeriod({
  evidenceWindow = {}, cadence = null, occurrenceId = null,
} = {}) {
  const windowCadence = cadence ?? evidenceWindow.cadence ??
    String(evidenceWindow.id ?? "").split(":")[0] ?? "unknown";
  const startDate = dateOnly(evidenceWindow.startDate ?? evidenceWindow.start);
  const suppliedEnd = dateOnly(evidenceWindow.endDate ?? evidenceWindow.end ??
    evidenceWindow.cutoff);
  const timeZone = evidenceWindow.timeZone ?? windowTimeZone(evidenceWindow.id) ??
    "UTC";
  if (["midweek", "weekly"].includes(windowCadence) && startDate) {
    const endDate = windowCadence === "midweek"
      ? addDays(startDate, 6) : suppliedEnd;
    if (!endDate) return null;
    const completed = windowCadence === "weekly" && evidenceWindow.closed !== false;
    return deepFreeze({
      schemaVersion: "confidence_durability_period_v1",
      id: `confidence_week|${startDate}|${endDate}|${timeZone}`,
      kind: "canonical_week",
      startDate,
      endDate,
      timeZone,
      state: completed ? "completed" : "preliminary",
      occurrenceId: occurrenceId ?? evidenceWindow.id ?? null,
    });
  }
  if (windowCadence === "photo" && suppliedEnd) {
    return deepFreeze({
      schemaVersion: "confidence_durability_period_v1",
      id: `confidence_photo_session|${occurrenceId ?? evidenceWindow.id ?? suppliedEnd}`,
      kind: "photo_session",
      startDate: startDate ?? suppliedEnd,
      endDate: suppliedEnd,
      timeZone,
      state: "completed",
      occurrenceId: occurrenceId ?? evidenceWindow.id ?? null,
    });
  }
  return deepFreeze({
    schemaVersion: "confidence_durability_period_v1",
    id: `confidence_nonweekly|${windowCadence}|${occurrenceId ??
      evidenceWindow.id ?? suppliedEnd ?? "unknown"}`,
    kind: "nonweekly_aggregate",
    startDate,
    endDate: suppliedEnd,
    timeZone,
    state: evidenceWindow.closed === true ? "completed" : "preliminary",
    occurrenceId: occurrenceId ?? evidenceWindow.id ?? null,
  });
}

export function createDurabilitySignalFromDescriptor(descriptor = {}) {
  const lineage = uniqueStrings([
    ...(descriptor.sourceEvidenceIds ?? []),
    ...(descriptor.sourceObservationIds ?? []),
    ...(descriptor.sourceClaimIds ?? []),
  ]);
  return deepFreeze({
    capability: String(descriptor.capability ?? "unknown"),
    direction: descriptor.agreement ?? "indeterminate",
    lineageDigest: `sha256_${semanticHash({
      capability: descriptor.capability ?? null,
      direction: descriptor.agreement ?? null,
      lineage,
    })}`,
    lineageAvailable: lineage.length > 0,
  });
}

export function deriveEvidenceDurability({
  goalId,
  strategyRevision,
  descriptors = [],
  reconciliationItems = [],
  contradictions = [],
  durabilityContext = {},
} = {}) {
  const currentPeriod = normalizePeriod(durabilityContext.currentPeriod ??
    descriptors.find((item) => item.temporalIdentity)?.temporalIdentity);
  const priorPeriods = normalizePeriods(durabilityContext.priorPeriods)
    .slice(-3);
  const materialDescriptorIds = new Set(reconciliationItems.filter((item) =>
    ["decisive", "material"].includes(item.relevance) &&
    item.temporalApplicability === "applicable"
  ).map((item) => item.evidenceRef));
  const qualifying = descriptors.filter((item) =>
    item.agreement === "supports" &&
    item.temporalApplicability === "applicable" &&
    QUALIFYING_STRENGTH.has(item.strength) &&
    !DIRECT_CAPABILITIES.has(item.capability) &&
    materialDescriptorIds.has(item.id)
  );
  let currentSignals = uniqueSignals(qualifying.map(
    createDurabilitySignalFromDescriptor));
  if (!currentSignals.length &&
      currentPeriod?.kind === "nonweekly_aggregate") {
    currentSignals = uniqueSignals(priorPeriods.flatMap((period) =>
      period.signals ?? []));
  }
  const currentCapabilities = uniqueStrings(currentSignals.map((item) =>
    item.capability));
  const signals = currentSignals.map((currentSignal) => {
    const historical = priorPeriods.filter((period) =>
      period.state === "completed" && period.kind === "canonical_week" &&
      period.signals.some((item) => sameSignal(item, currentSignal)));
    const priorIds = uniqueStrings(historical.map((item) => item.id));
    const priorSamePeriod = historical.find((item) =>
      item.id === currentPeriod?.id);
    const priorSameSignal = priorSamePeriod?.signals.find((item) =>
      sameSignal(item, currentSignal));
    const currentEligible = currentPeriod?.kind === "canonical_week" &&
      currentPeriod.state === "completed" && currentSignal.lineageAvailable;
    const currentIds = uniqueStrings([
      ...priorIds,
      ...(currentEligible ? [currentPeriod.id] : []),
    ]).slice(-3);
    const previousCount = Math.min(3, priorIds.length);
    const independentPeriodCount = Math.min(3, currentIds.length);
    const priorPersistence = persistence(previousCount);
    const currentPersistence = persistence(independentPeriodCount,
      Boolean(currentPeriod));
    const samePeriodPreviouslyObserved = Boolean(priorSameSignal);
    const samePeriodRevision = samePeriodPreviouslyObserved &&
      priorSameSignal.lineageDigest !== currentSignal.lineageDigest;
    const duplicateEvidence = samePeriodPreviouslyObserved &&
      priorSameSignal.lineageDigest === currentSignal.lineageDigest;
    const transition = independentPeriodCount > previousCount &&
      currentPersistence !== priorPersistence &&
      ["repeated", "sustained"].includes(currentPersistence)
      ? currentPersistence : null;
    const signalKey = [goalId, strategyRevision, currentSignal.capability,
      currentSignal.direction].map((value) => value ?? "unknown").join("|");
    return {
      signalKey,
      capability: currentSignal.capability,
      direction: currentSignal.direction,
      persistence: currentPersistence,
      priorPersistence,
      independentPeriodCount,
      priorIndependentPeriodCount: previousCount,
      firstPeriodId: currentIds[0] ?? currentPeriod?.id ?? null,
      lastPeriodId: currentIds.at(-1) ?? currentPeriod?.id ?? null,
      periodIds: currentIds,
      transition,
      uniqueEligiblePeriod: Boolean(transition),
      samePeriodPreviouslyObserved,
      samePeriodRevision,
      duplicateEvidence,
      lineageDigest: currentSignal.lineageDigest,
    };
  }).sort((left, right) => left.signalKey.localeCompare(right.signalKey));
  const directContradiction = contradictions.some((item) => {
    const descriptor = descriptors.find((entry) => entry.id === item.evidenceRef);
    return descriptor && DIRECT_CAPABILITIES.has(descriptor.capability) &&
      ["authoritative", "high"].includes(item.strength);
  });
  const materialContradiction = contradictions.length > 0;
  const transitionSignals = signals.filter((item) => item.transition);
  const strongest = signals.reduce((result, item) =>
    PERSISTENCE_RANK[item.persistence] > PERSISTENCE_RANK[result]
      ? item.persistence : result, "emerging");
  const previousCorroboration = Number(
    durabilityContext.previousDurability?.corroboratingCapabilityCount ?? NaN);
  const corroboratingCapabilityCount = currentCapabilities.length;
  const corroborationTransition = Number.isFinite(previousCorroboration) &&
    corroboratingCapabilityCount > previousCorroboration;
  const priorCurrentPeriod = priorPeriods.find((period) =>
    period.id === currentPeriod?.id);
  const samePeriodRevision = Boolean(priorCurrentPeriod) && (
    signals.some((item) => item.samePeriodRevision) ||
    currentSignals.some((item) => !priorCurrentPeriod.signals.some((prior) =>
      prior.capability === item.capability))
  );
  const duplicateEvidence = signals.length > 0 &&
    signals.every((item) => item.duplicateEvidence);
  const semantic = {
    goalId: goalId ?? null,
    strategyRevision: strategyRevision ?? null,
    persistence: strongest,
    independentPeriodCount: signals.reduce((count, item) =>
      Math.max(count, item.independentPeriodCount), 0),
    corroboratingCapabilityCount,
    contradictionState: directContradiction ? "material_direct" :
      materialContradiction ? "material_proxy" : "none",
    signals: signals.map((item) => ({
      signalKey: item.signalKey,
      persistence: item.persistence,
      independentPeriodCount: item.independentPeriodCount,
      transition: item.transition,
    })),
  };
  return deepFreeze({
    schemaVersion: EVIDENCE_DURABILITY_VERSION,
    goalId: goalId ?? null,
    strategyRevision: strategyRevision ?? null,
    currentPeriod,
    persistence: strongest,
    independentPeriodCount: semantic.independentPeriodCount,
    corroboratingCapabilityCount,
    corroboratingCapabilities: currentCapabilities,
    corroborationTransition,
    priorDurabilityEstablished: ["repeated", "sustained"].includes(
      durabilityContext.previousDurability?.persistence),
    contradictionState: semantic.contradictionState,
    signals,
    triggeringCapabilities: uniqueStrings((corroborationTransition
      ? signals : transitionSignals).map((item) => item.capability)),
    transition: strongestTransition(transitionSignals),
    samePeriodRevision,
    duplicateEvidence,
    namedUncertaintyKeys: [],
    reducedUncertaintyKeys: [],
    uncertaintyComparisonSafe:
      durabilityContext.uncertaintyComparisonSafe === true,
    lineageDigest: `sha256_${semanticHash(semantic)}`,
  });
}

export function attachNamedUncertaintyLifecycle({
  remainingUncertainty = {}, durability = {}, durabilityContext = {},
} = {}) {
  const items = (remainingUncertainty.items ?? []).map((item) => ({
    ...item,
    key: item.key ?? namedUncertaintyKey(item),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const currentKeys = uniqueStrings(items.map((item) => item.key));
  const comparisonSafe = durabilityContext.uncertaintyComparisonSafe === true;
  const previousKeys = comparisonSafe
    ? uniqueStrings(durabilityContext.previousUncertaintyKeys) : [];
  const reducedUncertaintyKeys = comparisonSafe
    ? previousKeys.filter((key) => !currentKeys.includes(key)) : [];
  return deepFreeze({
    remainingUncertainty: {
      ...remainingUncertainty,
      items,
      summary: {
        ...(remainingUncertainty.summary ?? {}),
        namedUncertaintyKeys: currentKeys,
      },
    },
    durability: {
      ...durability,
      namedUncertaintyKeys: currentKeys,
      reducedUncertaintyKeys,
      uncertaintyComparisonSafe: comparisonSafe,
    },
  });
}

export function namedUncertaintyKey(item = {}) {
  const kind = machine(item.kind ?? "uncertainty");
  const question = machine(item.question ?? "unknown");
  const prefix = ({
    measurement_pending: "objective_direct_measurement_pending",
    comparison_missing: "comparison_evidence_missing",
    coverage_limited: "evidence_coverage_limited",
    energy_calibration_uncertain: "energy_calibration_uncertain",
    recovery_evidence_missing: "recovery_evidence_missing",
    unresolved_guardrail_risk: "guardrail_measurement_pending",
    execution_ambiguous: "strategy_execution_uncertain",
  })[kind] ?? kind;
  return `${prefix}|${question}`;
}

function normalizePeriods(values) {
  const periods = new Map();
  for (const value of values ?? []) {
    const period = normalizePeriod(value);
    if (!period?.id) continue;
    const current = periods.get(period.id) ?? { ...period, signals: [] };
    current.signals = uniqueSignals([
      ...(current.signals ?? []), ...(period.signals ?? []),
    ]);
    periods.set(period.id, current);
  }
  return [...periods.values()].sort((left, right) =>
    String(left.endDate ?? "").localeCompare(String(right.endDate ?? "")) ||
    left.id.localeCompare(right.id));
}

function normalizePeriod(value) {
  if (!value?.id) return null;
  return {
    schemaVersion: value.schemaVersion ?? "confidence_durability_period_v1",
    id: String(value.id),
    kind: value.kind ?? "canonical_week",
    startDate: value.startDate ?? null,
    endDate: value.endDate ?? null,
    timeZone: value.timeZone ?? "UTC",
    state: value.state === "completed" ? "completed" : "preliminary",
    occurrenceId: value.occurrenceId ?? null,
    signals: uniqueSignals(value.signals ?? []),
  };
}

function uniqueSignals(values) {
  const signals = new Map();
  for (const value of values ?? []) {
    if (!value?.capability || !value?.direction) continue;
    const key = `${value.capability}|${value.direction}`;
    const current = signals.get(key);
    if (!current || String(value.lineageDigest ?? "") >
        String(current.lineageDigest ?? "")) {
      signals.set(key, {
        capability: String(value.capability),
        direction: String(value.direction),
        lineageDigest: value.lineageDigest ?? null,
        lineageAvailable: value.lineageAvailable !== false,
      });
    }
  }
  return [...signals.values()].sort((left, right) =>
    `${left.capability}|${left.direction}`.localeCompare(
      `${right.capability}|${right.direction}`));
}

function sameSignal(left, right) {
  return left.capability === right.capability &&
    left.direction === right.direction && left.lineageAvailable !== false;
}

function persistence(count, hasCurrent = false) {
  if (count >= 3) return "sustained";
  if (count >= 2) return "repeated";
  return hasCurrent || count >= 1 ? "emerging" : "emerging";
}

function strongestTransition(values) {
  return values.reduce((result, item) =>
    (PERSISTENCE_RANK[item.transition] ?? 0) > (PERSISTENCE_RANK[result] ?? 0)
      ? item.transition : result, null);
}

function dateOnly(value) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/u);
  return match?.[0] ?? null;
}

function addDays(value, count) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function windowTimeZone(value) {
  const parts = String(value ?? "").split(":");
  return parts.length >= 4 ? parts.slice(3).join(":") : null;
}

function machine(value) {
  return String(value ?? "unknown").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
