import {
  PROTOCOL_PROVENANCE_SCHEMA_VERSION,
  validateProtocolProvenance,
} from "../models/protocolProvenance";

export const PROTOCOL_PROVENANCE_RESOLVER_VERSION =
  "protocol_provenance_resolver_v1";

export function resolveProtocolAtDate({
  protocolVersions = [],
  legacyProtocols = [],
  goalId = null,
  date,
  timezone,
  category,
  weightEvidence = [],
} = {}) {
  requireDate(date);
  if (!timezone) return result("unknown", { date, timezone: null, category, limitations: ["timezone_unavailable"] });
  protocolVersions.forEach(validateProtocolProvenance);
  const candidates = protocolVersions.filter((item) =>
    item.protocolCategory === category &&
    (!goalId || item.goalId === goalId) &&
    item.timezone === timezone &&
    includes(item, date) &&
    applicableState(item.state)
  );
  if (candidates.length > 1) {
    return result("conflicted", {
      date, timezone, category, goalId,
      candidateVersions: candidates.map((item) => item.protocolVersionId),
      conflicts: ["multiple_applicable_protocol_versions"],
    });
  }
  if (candidates.length === 0) {
    const legacy = legacyProtocols.filter((item) =>
      (item.protocolType === category || item.category === category) &&
      item.status === "active" &&
      (!goalId || goalIds(item).includes(goalId))
    );
    return legacy.length === 1
      ? result("legacy_unversioned", {
          date, timezone, category, goalId,
          protocolId: legacy[0].id,
          limitations: ["applicable_protocol_has_no_canonical_version"],
        })
      : result(legacy.length > 1 ? "conflicted" : "missing", {
          date, timezone, category, goalId,
          conflicts: legacy.length > 1 ? ["multiple_legacy_protocols"] : [],
        });
  }
  const version = candidates[0];
  const targetResolution = resolveTarget(version.target, weightEvidence, version.effectiveFrom);
  return result(targetResolution.status, {
    date,
    timezone,
    category,
    goalId: version.goalId,
    protocolId: version.protocolId,
    protocolVersionId: version.protocolVersionId,
    state: version.state,
    effectiveInterval: {
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      convention: "start_inclusive_end_exclusive",
    },
    target: targetResolution.target,
    targetProvenance: version.target,
    weightProvenance: targetResolution.weightProvenance,
    selectionMethod: "effective_interval_and_goal_ownership",
    candidateVersions: [version.protocolVersionId],
    limitations: [...version.limitations, ...targetResolution.limitations],
    evidenceIds: targetResolution.evidenceIds,
  });
}

export function resolveProtocolAcrossWindow(input = {}) {
  requireDate(input.startDate);
  requireDate(input.endDate);
  if (input.startDate > input.endDate) throw new Error("Window start must not follow end.");
  const dailyTargets = [];
  for (let date = input.startDate; date <= input.endDate; date = nextDay(date)) {
    dailyTargets.push(resolveProtocolAtDate({ ...input, date }));
  }
  const segments = [];
  for (const day of dailyTargets) {
    const prior = segments.at(-1);
    const key = segmentKey(day);
    if (prior?.key === key) {
      prior.endDate = day.date;
    } else {
      segments.push({
        key,
        startDate: day.date,
        endDate: day.date,
        status: day.status,
        protocolId: day.protocolId,
        protocolVersionId: day.protocolVersionId,
        goalId: day.goalId,
        state: day.state,
        target: day.target,
        targetProvenance: day.targetProvenance,
        weightProvenance: day.weightProvenance,
        evidenceIds: day.evidenceIds,
        limitations: day.limitations,
      });
    }
  }
  const cleanSegments = segments.map(({ key: _key, ...segment }) => segment);
  const resolved = dailyTargets.every((item) => item.status === "resolved");
  const oneVersion = new Set(dailyTargets.map((item) => item.protocolVersionId)).size === 1;
  const singleTargetApplies = resolved && oneVersion;
  const statuses = new Set(dailyTargets.map((item) => item.status));
  const status = singleTargetApplies
    ? "resolved"
    : statuses.has("conflicted") ? "conflicted"
      : statuses.has("legacy_unversioned") ? "legacy_unversioned"
        : statuses.has("partially_resolved") ? "partially_resolved"
          : statuses.has("unknown") ? "unknown" : "missing";
  return Object.freeze({
    schemaVersion: "protocol_provenance_window_v1",
    status,
    window: { startDate: input.startDate, endDate: input.endDate },
    timezone: input.timezone ?? null,
    category: input.category ?? null,
    goalIds: unique(dailyTargets.map((item) => item.goalId)),
    protocolIds: unique(dailyTargets.map((item) => item.protocolId)),
    protocolVersionIds: unique(dailyTargets.map((item) => item.protocolVersionId)),
    segments: cleanSegments,
    dailyTargets,
    singleTargetApplies,
    target: singleTargetApplies ? dailyTargets[0].target : null,
    targetProvenance: singleTargetApplies ? dailyTargets[0].targetProvenance : null,
    conflicts: unique(dailyTargets.flatMap((item) => item.conflicts)),
    gaps: cleanSegments.filter((item) => ["missing", "not_applicable"].includes(item.status))
      .map((item) => ({ startDate: item.startDate, endDate: item.endDate })),
    limitations: unique(dailyTargets.flatMap((item) => item.limitations)),
    evidenceIds: unique(dailyTargets.flatMap((item) => item.evidenceIds)),
    provenance: provenance("date_expansion_and_deterministic_segmentation"),
  });
}

function resolveTarget(target, weights, effectiveFrom) {
  if (!target) return { status: "resolved", target: null, weightProvenance: null, limitations: [], evidenceIds: [] };
  if (target.status === "conflicted") {
    return { status: "conflicted", target: null, weightProvenance: null, limitations: target.limitations, evidenceIds: [] };
  }
  if (target.mode === "fixed_grams") {
    return {
      status: target.status === "resolved" ? "resolved" : "partially_resolved",
      target: { value: target.configuredValue, unit: "g" },
      weightProvenance: null,
      limitations: target.limitations,
      evidenceIds: [],
    };
  }
  const expected = target.inputProvenance;
  if (!expected?.weightEvidenceId) {
    return { status: "partially_resolved", target: null, weightProvenance: null, limitations: unique([...target.limitations, "weight_provenance_unavailable"]), evidenceIds: [] };
  }
  const weight = weights.find((item) => item.id === expected.weightEvidenceId);
  const date = String(weight?.measuredAt ?? weight?.date ?? "").slice(0, 10);
  const value = Number(weight?.weight?.value ?? weight?.value);
  const invalid = !weight || date > effectiveFrom ||
    ["superseded", "corrected"].includes(weight?.status ?? weight?.quality?.status);
  if (invalid || !Number.isFinite(value)) {
    return { status: "partially_resolved", target: null, weightProvenance: expected, limitations: ["weight_provenance_invalid"], evidenceIds: [] };
  }
  const translated = round(value * target.configuredRatio, target.roundingRule);
  if (translated !== target.translatedValue) {
    return { status: "conflicted", target: null, weightProvenance: expected, limitations: ["translated_target_not_reproducible"], evidenceIds: [weight.id] };
  }
  return {
    status: "resolved",
    target: { value: translated, unit: "g" },
    weightProvenance: expected,
    limitations: target.limitations,
    evidenceIds: [weight.id],
  };
}
function result(status, values = {}) {
  return Object.freeze({
    schemaVersion: "protocol_provenance_date_resolution_v1",
    status,
    date: values.date ?? null,
    timezone: values.timezone ?? null,
    protocolId: values.protocolId ?? null,
    protocolVersionId: values.protocolVersionId ?? null,
    goalId: values.goalId ?? null,
    category: values.category ?? null,
    state: values.state ?? null,
    effectiveInterval: values.effectiveInterval ?? null,
    target: values.target ?? null,
    targetProvenance: values.targetProvenance ?? null,
    weightProvenance: values.weightProvenance ?? null,
    selectionMethod: values.selectionMethod ?? null,
    candidateVersions: unique(values.candidateVersions),
    conflicts: unique(values.conflicts),
    limitations: unique(values.limitations),
    evidenceIds: unique(values.evidenceIds),
    provenance: provenance("effective_interval_date_resolution"),
  });
}
function includes(item, date) {
  return item.effectiveFrom <= date && (!item.effectiveTo || date < item.effectiveTo);
}
function applicableState(state) {
  return !["paused", "superseded", "completed", "archived"].includes(state);
}
function segmentKey(value) {
  return JSON.stringify([value.status, value.protocolId, value.protocolVersionId, value.target]);
}
function round(value, rule) {
  if (rule === "floor") return Math.floor(value);
  if (rule === "ceil") return Math.ceil(value);
  return Math.round(value);
}
function provenance(method) {
  return {
    producer: "protocol_provenance_resolver_service",
    producerVersion: PROTOCOL_PROVENANCE_RESOLVER_VERSION,
    calculationMethod: method,
    repositoryReads: 0,
    runtimeClockReads: 0,
  };
}
function goalIds(value) {
  return unique([...(value.relatedGoalIds ?? []), ...(value.currentGoalIds ?? [])]);
}
function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort();
}
function requireDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new Error("Date must use YYYY-MM-DD.");
}
function nextDay(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export { PROTOCOL_PROVENANCE_SCHEMA_VERSION };
