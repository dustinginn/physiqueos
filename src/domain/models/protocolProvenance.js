export const PROTOCOL_PROVENANCE_SCHEMA_VERSION = "protocol_provenance_v1";
export const PROTOCOL_PROVENANCE_STATUSES = Object.freeze([
  "resolved", "partially_resolved", "conflicted", "unknown", "missing",
  "not_applicable", "legacy_unversioned",
]);

export function createProtocolProvenance(value = {}) {
  const target = value.target ? normalizeTarget(value.target) : null;
  const result = {
    schemaVersion: PROTOCOL_PROVENANCE_SCHEMA_VERSION,
    protocolId: required(value.protocolId, "protocolId"),
    protocolVersionId: required(value.protocolVersionId, "protocolVersionId"),
    protocolCategory: required(value.protocolCategory, "protocolCategory"),
    goalId: value.goalId ?? null,
    goalVersionId: value.goalVersionId ?? null,
    previousProtocolVersionId: value.previousProtocolVersionId ?? null,
    replacesProtocolVersionId: value.replacesProtocolVersionId ?? null,
    replacedByProtocolVersionId: value.replacedByProtocolVersionId ?? null,
    sourceProtocolId: value.sourceProtocolId ?? null,
    sourceTransitionDraftId: value.sourceTransitionDraftId ?? null,
    state: value.state ?? "active",
    effectiveFrom: date(value.effectiveFrom, "effectiveFrom"),
    effectiveTo: value.effectiveTo ? date(value.effectiveTo, "effectiveTo") : null,
    activatedAt: value.activatedAt ?? null,
    pausedAt: value.pausedAt ?? null,
    resumedAt: value.resumedAt ?? null,
    supersededAt: value.supersededAt ?? null,
    completedAt: value.completedAt ?? null,
    timezone: value.timezone ?? "America/Los_Angeles",
    target,
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
    createdBy: value.createdBy ?? null,
    provenance: structuredClone(value.provenance ?? {}),
    limitations: unique(value.limitations),
  };
  validateProtocolProvenance(result);
  return deepFreeze(result);
}

export function validateProtocolProvenance(value) {
  if (value?.schemaVersion !== PROTOCOL_PROVENANCE_SCHEMA_VERSION) {
    throw new Error("Invalid protocol provenance schema.");
  }
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    throw new Error("effectiveTo must be later than effectiveFrom.");
  }
  const self = value.protocolVersionId;
  if ([value.previousProtocolVersionId, value.replacesProtocolVersionId,
    value.replacedByProtocolVersionId].includes(self)) {
    throw new Error("Protocol version lineage cannot reference itself.");
  }
  return true;
}

export function validateProtocolProvenanceSet(values = []) {
  values.forEach(validateProtocolProvenance);
  const byId = new Map(values.map((item) => [item.protocolVersionId, item]));
  for (const item of values) {
    const seen = new Set([item.protocolVersionId]);
    let prior = item.previousProtocolVersionId;
    while (prior) {
      if (seen.has(prior)) throw new Error("Circular protocol version lineage.");
      seen.add(prior);
      prior = byId.get(prior)?.previousProtocolVersionId ?? null;
    }
  }
  const groups = Map.groupBy(values, (item) => item.protocolId);
  for (const versions of groups.values()) {
    const ordered = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let index = 1; index < ordered.length; index += 1) {
      const prior = ordered[index - 1];
      const current = ordered[index];
      if (!prior.effectiveTo || prior.effectiveTo > current.effectiveFrom) {
        throw new Error("Protocol version effective intervals overlap.");
      }
    }
  }
  return true;
}

function normalizeTarget(value) {
  const mode = required(value.mode, "target.mode");
  if (!["fixed_grams", "grams_per_pound"].includes(mode)) {
    throw new Error("Unsupported protocol target mode.");
  }
  const configuredValue = number(value.configuredValue);
  const configuredRatio = number(value.configuredRatio);
  const input = value.inputProvenance ? structuredClone(value.inputProvenance) : null;
  const limitations = unique(value.limitations);
  if (mode === "fixed_grams" && configuredValue == null) {
    throw new Error("Fixed target requires configuredValue.");
  }
  if (mode === "grams_per_pound" && configuredRatio == null) {
    throw new Error("Ratio target requires configuredRatio.");
  }
  if (mode === "grams_per_pound" && value.translatedValue != null && !input) {
    limitations.push("translated_target_input_provenance_missing");
  }
  if (input?.weightDate && input?.effectiveFrom &&
      input.weightDate > input.effectiveFrom) {
    throw new Error("Future Weight cannot produce an earlier target.");
  }
  return {
    targetKind: value.targetKind ?? "minimum",
    targetMetric: value.targetMetric ?? "protein",
    mode,
    unit: "g_per_day",
    configuredValue,
    configuredRatio,
    translatedValue: number(value.translatedValue),
    roundingRule: value.roundingRule ?? null,
    calculationVersion: value.calculationVersion ?? null,
    effectiveFrom: value.effectiveFrom ?? null,
    effectiveTo: value.effectiveTo ?? null,
    source: value.source ?? null,
    sourceProtocolVersionId: value.sourceProtocolVersionId ?? null,
    sourceGoalId: value.sourceGoalId ?? null,
    inputProvenance: input,
    status: value.status ?? (limitations.length ? "partially_resolved" : "resolved"),
    sourceFacts: structuredClone(value.sourceFacts ?? {}),
    limitations: unique(limitations),
  };
}
function required(value, field) {
  if (typeof value !== "string" || !value) throw new Error(`${field} is required.`);
  return value;
}
function date(value, field) {
  const normalized = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${field} must use YYYY-MM-DD.`);
  return normalized;
}
function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort();
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
