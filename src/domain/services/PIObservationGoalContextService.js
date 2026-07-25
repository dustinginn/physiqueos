import {
  normalizePIObservation,
  sortPIObservations,
  validatePIObservation,
} from "./PIObservationService";

export const PI_GOAL_CONTEXT_RESOLVER_VERSION = "pi_goal_context_v1";

export const PI_SEMANTIC_GOAL_TYPES = Object.freeze([
  "fat_loss",
  "lean_mass_gain",
  "body_fat_maintenance",
  "weight_change",
  "performance",
  "unknown",
]);

export const PI_PHASE_AGE_BANDS = Object.freeze([
  "week_1_to_4",
  "week_5_to_8",
  "week_9_plus",
  "unknown",
]);

const EARLY_PHASE_PHOTO_KINDS = new Set([
  "photo_body_composition",
  "photo_leanness",
  "photo_whole_body",
  "progress_photo_comparison",
  "photo_leanness_change",
  "photo_abdominal_definition_change",
  "photo_whole_body_softness_change",
  "photo_visual_stability",
]);

export function createPIGoalContext({
  activeGoal = null,
  activeGoals = null,
  activePhase = null,
  relatedGoals = [],
  protocols = [],
  currentDate = new Date(),
  timeZone = "America/Los_Angeles",
} = {}) {
  const limitations = [];
  const goals = resolveActiveGoals({ activeGoal, activeGoals });
  const primaryGoals = goals.filter(
    (goal) => goal?.primary === true && goal?.status === "active"
  );
  let goal = activeGoal && isObject(activeGoal) ? activeGoal : null;

  if (!goal && primaryGoals.length === 1) goal = primaryGoals[0];
  if (primaryGoals.length > 1) {
    limitations.push("multiple_active_primary_goals");
    goal = null;
  }
  if (!goal) limitations.push("active_goal_unavailable");
  if (goal && !isValidGoal(goal)) {
    limitations.push("active_goal_malformed");
    goal = null;
  }

  const semanticGoalType = classifySemanticGoalType(goal);
  if (goal && semanticGoalType === "unknown") {
    limitations.push("goal_semantic_type_unsupported");
  }

  const phase = resolveActivePhase(goal, activePhase, limitations);
  const currentDateKey = toLocalDateKey(currentDate, timeZone);
  const phaseAge = resolvePIPhaseAge({
    currentDate: currentDateKey,
    phaseStartDate: phase?.startDate ?? null,
  });
  limitations.push(...phaseAge.limitations);

  const measurement = normalizeMeasurementModel(goal);
  const targetRanges = normalizeTargetRanges({
    goal,
    relatedGoals,
    semanticGoalType,
  });
  if (
    semanticGoalType === "lean_mass_gain" &&
    !targetRanges.some((range) => range.metric === "body_fat_percentage")
  ) {
    limitations.push("body_fat_guardrail_range_unavailable");
  }

  return normalizeGoalContextObject({
    activeGoalId: goal?.id ?? null,
    goalType: machineKey(goal?.type),
    goalStatus: machineKey(goal?.status),
    semanticGoalType,
    goalStartDate: validDate(goal?.timeline?.startDate ?? goal?.startDate),
    goalPhase: machineKey(phase?.name),
    phaseId: machineKey(phase?.id),
    phaseStartDate: phaseAge.phaseStartDate,
    phaseAgeDays: phaseAge.phaseAgeDays,
    phaseAgeWeeks: phaseAge.phaseAgeWeeks,
    phaseAgeBand: phaseAge.phaseAgeBand,
    primaryOutcomeDomains: measurement.primaryOutcomeDomains,
    primaryOutcomeMeasures: measurement.primaryOutcomeMeasures,
    guardrailDomains: measurement.guardrailDomains,
    guardrailMeasures: measurement.guardrailMeasures,
    contextualDomains: measurement.contextualDomains,
    contextualMeasures: measurement.contextualMeasures,
    targetRanges,
    sourceGoalIds: uniqueStrings([
      goal?.id,
      ...relatedGoals
        .filter((item) => item?.status === "active")
        .map((item) => item.id),
    ]),
    sourceProtocolIds: uniqueStrings(
      protocols.filter((item) => item?.status === "active").map((item) => item.id)
    ),
    provenance: {
      resolver: "pi_observation_goal_context_service",
      resolverVersion: PI_GOAL_CONTEXT_RESOLVER_VERSION,
      mappingMethod: "canonical_goal_phase_measurement_mapping",
      sourceGoalId: goal?.id ?? null,
      sourcePhaseId: phase?.id ?? null,
    },
    limitations: uniqueStrings(limitations),
  });
}

export function resolvePIPhaseAge({
  currentDate,
  phaseStartDate,
} = {}) {
  if (phaseStartDate == null || phaseStartDate === "") {
    return {
      phaseStartDate: null,
      phaseAgeDays: null,
      phaseAgeWeeks: null,
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_unavailable"],
    };
  }
  if (!validDate(phaseStartDate)) {
    return {
      phaseStartDate: null,
      phaseAgeDays: null,
      phaseAgeWeeks: null,
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_invalid"],
    };
  }
  if (!validDate(currentDate)) {
    return {
      phaseStartDate,
      phaseAgeDays: null,
      phaseAgeWeeks: null,
      phaseAgeBand: "unknown",
      limitations: ["current_date_invalid"],
    };
  }

  const phaseAgeDays = daysBetween(phaseStartDate, currentDate);
  if (phaseAgeDays < 0) {
    return {
      phaseStartDate,
      phaseAgeDays: null,
      phaseAgeWeeks: null,
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_in_future"],
    };
  }
  const phaseAgeWeeks = Math.floor(phaseAgeDays / 7);
  return {
    phaseStartDate,
    phaseAgeDays,
    phaseAgeWeeks,
    phaseAgeBand:
      phaseAgeDays < 28
        ? "week_1_to_4"
        : phaseAgeDays < 56
          ? "week_5_to_8"
          : "week_9_plus",
    limitations: [],
  };
}

export function resolvePIObservationGoalContext(observation, goalContext) {
  validatePIObservation(observation);
  const normalizedContext = normalizeGoalContextObject(goalContext);
  const existing = observation.goalContext;
  const conflicts = detectConflicts(existing, normalizedContext);
  const assignment = assignObservationRole(observation, normalizedContext);
  const resolvedAssignment = normalizedContext.activeGoalId
    ? assignment
    : {
        observationRole: existing?.observationRole ?? assignment.observationRole,
        primaryOutcomeRelevance:
          existing?.primaryOutcomeRelevance ??
          assignment.primaryOutcomeRelevance,
        guardrailRelevance:
          existing?.guardrailRelevance ?? assignment.guardrailRelevance,
        evidencePurpose:
          existing?.evidencePurpose ?? assignment.evidencePurpose,
        limitations: assignment.limitations,
      };
  const baseContext = normalizedContext.activeGoalId
    ? { ...(existing ?? {}), ...normalizedContext }
    : { ...normalizedContext, ...(existing ?? {}) };
  const enrichedContext = normalizeGoalContextObject({
    ...baseContext,
    observationRole: resolvedAssignment.observationRole,
    primaryOutcomeRelevance: resolvedAssignment.primaryOutcomeRelevance,
    guardrailRelevance: resolvedAssignment.guardrailRelevance,
    evidencePurpose:
      resolvedAssignment.evidencePurpose ?? existing?.evidencePurpose ?? null,
    limitations: uniqueStrings([
      ...(existing?.limitations ?? []),
      ...(normalizedContext.limitations ?? []),
      ...resolvedAssignment.limitations,
    ]),
    conflicts: [...(existing?.conflicts ?? []), ...conflicts],
  });

  return normalizePIObservation({
    ...observation,
    goalContext: enrichedContext,
  });
}

export function applyPIGoalContextToObservations(
  observations,
  goalContext
) {
  if (!Array.isArray(observations)) {
    throw new Error("observations must be an array.");
  }
  return sortPIObservations(
    observations.map((observation) =>
      resolvePIObservationGoalContext(observation, goalContext)
    )
  );
}

function assignObservationRole(observation, context) {
  if (!context.activeGoalId || context.semanticGoalType === "unknown") {
    return unknownAssignment("goal_mapping_unavailable");
  }

  const measure = observationMeasure(observation);
  if (context.semanticGoalType === "lean_mass_gain") {
    if (
      observation.domain === "dexa" &&
      ["lean_mass", "dexa_lean_mass"].includes(measure)
    ) {
      return assignment("progress", true, false);
    }
    if (
      observation.domain === "training" &&
      /progressive_overload/.test(`${observation.kind}|${measure}`)
    ) {
      return assignment("progress", true, false);
    }
    if (
      observation.domain === "dexa" &&
      ["body_fat_percentage", "fat_mass", "dexa_body_fat", "dexa_fat_mass"].includes(measure)
    ) {
      return assignment("guardrail", false, true);
    }
    if (
      observation.domain === "photos" &&
      EARLY_PHASE_PHOTO_KINDS.has(observation.kind) &&
      context.phaseAgeBand === "week_1_to_4" &&
      hasBodyFatGuardrail(context)
    ) {
      return assignment(
        "guardrail",
        false,
        true,
        "early_phase_body_fat_monitoring"
      );
    }
    if (observation.domain === "recovery") {
      return assignment(
        "context",
        false,
        false,
        observation.status === "regressing"
          ? "recovery_constraint_context"
          : "recovery_progress_supporting_context"
      );
    }
    if (
      ["weight", "energy", "nutrition", "activity", "protocols"].includes(
        observation.domain
      )
    ) {
      return assignment("context", false, false);
    }
    if (observation.domain === "training") {
      return assignment("context", true, false, null, [
        "training_kind_not_directly_mapped_to_progress",
      ]);
    }
    if (observation.domain === "photos") {
      return assignment("context", false, hasBodyFatGuardrail(context));
    }
    return unknownAssignment("observation_kind_not_mapped");
  }

  if (context.semanticGoalType === "fat_loss") {
    if (
      observation.domain === "weight" &&
      isPrimaryMeasure(context, ["body_weight", "scale_weight", "weight"])
    ) {
      return assignment("progress", true, false);
    }
    if (
      observation.domain === "dexa" &&
      ["body_fat_percentage", "fat_mass", "dexa_body_fat", "dexa_fat_mass"].includes(measure)
    ) {
      return assignment("progress", true, false);
    }
    if (
      observation.domain === "dexa" &&
      ["lean_mass", "dexa_lean_mass"].includes(measure) &&
      isGuardrailMeasure(context, ["lean_mass", "dexa_lean_mass"])
    ) {
      return assignment("guardrail", false, true);
    }
    if (observation.domain === "energy") {
      return assignment("context", false, false);
    }
    if (observation.domain === "recovery") {
      return assignment(
        observation.status === "regressing" ? "guardrail" : "context",
        false,
        observation.status === "regressing",
        observation.status === "regressing"
          ? "recovery_preservation_guardrail_context"
          : "recovery_preservation_support_context"
      );
    }
    if (
      observation.domain === "photos" &&
      [
        "photo_leanness_change",
        "photo_abdominal_definition_change",
        "photo_whole_body_softness_change",
        "photo_visual_stability",
      ].includes(observation.kind)
    ) {
      return assignment("progress", true, false);
    }
    if (
      observation.domain === "photos" &&
      observation.kind === "photo_muscularity_change"
    ) {
      return assignment("guardrail", false, true);
    }
    return unknownAssignment("observation_kind_not_mapped");
  }

  if (context.semanticGoalType === "body_fat_maintenance") {
    if (
      observation.domain === "dexa" &&
      ["body_fat_percentage", "dexa_body_fat"].includes(measure)
    ) {
      return assignment("guardrail", false, true);
    }
    if (observation.domain === "recovery") {
      return assignment("context", false, false, "recovery_calibration_context");
    }
    return unknownAssignment("observation_kind_not_mapped");
  }

  if (
    context.semanticGoalType === "weight_change" &&
    observation.domain === "weight"
  ) {
    return assignment("progress", true, false);
  }
  if (
    context.semanticGoalType === "performance" &&
    observation.domain === "training"
  ) {
    return assignment("progress", true, false);
  }
  return unknownAssignment("observation_kind_not_mapped");
}

function normalizeMeasurementModel(goal) {
  const outcome = accepted(goal?.progressMeasurement?.outcomeMeasures);
  const predictive = accepted(goal?.progressMeasurement?.predictiveSignals);
  const explanatory = accepted(goal?.progressMeasurement?.explanatorySignals);
  const primaryOutcomeMeasures = uniqueKeys([
    goal?.target?.metric,
    goal?.metricKey,
    ...outcome.map((item) => item.evidenceType),
    ...predictive
      .filter((item) => item.importance === "strong")
      .map((item) => item.evidenceType),
  ]);
  const guardrailMeasures = uniqueKeys([
    ...outcome
      .filter((item) => /fat/i.test(`${item.evidenceType} ${item.label}`))
      .map((item) => item.evidenceType),
    ...(goal?.guardrails ?? [])
      .filter((item) => item.accepted !== false)
      .map((item) => inferGuardrailMetric(item)),
  ]);
  const contextualMeasures = uniqueKeys([
    ...predictive
      .filter((item) => item.importance !== "strong")
      .map((item) => item.evidenceType),
    ...explanatory.map((item) => item.evidenceType),
  ]);
  return {
    primaryOutcomeMeasures,
    primaryOutcomeDomains: domainsForMeasures(primaryOutcomeMeasures),
    guardrailMeasures,
    guardrailDomains: domainsForMeasures(guardrailMeasures),
    contextualMeasures,
    contextualDomains: domainsForMeasures(contextualMeasures),
  };
}

function normalizeTargetRanges({ goal, relatedGoals, semanticGoalType }) {
  const candidates = [goal, ...relatedGoals].filter(Boolean);
  return candidates
    .filter(
      (candidate) =>
        candidate.status === "active" &&
        candidate.targetRange &&
        finite(candidate.targetRange.min) != null &&
        finite(candidate.targetRange.max) != null
    )
    .map((candidate) => ({
      metric: normalizeMeasure(candidate.metricKey),
      lowerBound: finite(candidate.targetRange.min),
      upperBound: finite(candidate.targetRange.max),
      unit: candidate.unit ?? null,
      source: "canonical_goal_target_range",
      sourceGoalId: candidate.id,
      role:
        candidate.id === goal?.id && semanticGoalType !== "lean_mass_gain"
          ? "primary"
          : "guardrail",
    }))
    .sort((left, right) =>
      `${left.metric}|${left.sourceGoalId}`.localeCompare(
        `${right.metric}|${right.sourceGoalId}`
      )
    );
}

function classifySemanticGoalType(goal) {
  if (!goal) return "unknown";
  if (goal.type === "build_lean_mass") return "lean_mass_gain";
  if (goal.type === "performance") return "performance";
  const metric = normalizeMeasure(goal.target?.metric ?? goal.metricKey);
  const direction = goal.target?.direction;
  const title = String(goal.title ?? "").toLowerCase();
  if (
    metric === "body_fat_percentage" &&
    goal.targetRange &&
    /maintain|maintenance/.test(title)
  ) {
    return "body_fat_maintenance";
  }
  if (
    direction === "decrease" ||
    /fat loss|lose fat|cut|visible abs/.test(title)
  ) {
    return "fat_loss";
  }
  if (["body_weight", "scale_weight", "weight"].includes(metric)) {
    return "weight_change";
  }
  return "unknown";
}

function resolveActivePhase(goal, suppliedPhase, limitations) {
  if (suppliedPhase && isObject(suppliedPhase)) return suppliedPhase;
  const phases = Array.isArray(goal?.phases) ? goal.phases : [];
  const active = phases.filter((phase) => phase?.status === "active");
  if (active.length > 1) limitations.push("multiple_active_phases");
  if (active.length === 0) limitations.push("active_phase_unavailable");
  return active.length === 1 ? active[0] : null;
}

function resolveActiveGoals({ activeGoal, activeGoals }) {
  if (activeGoals != null && !Array.isArray(activeGoals)) {
    return [];
  }
  const candidates = [
    ...(Array.isArray(activeGoals) ? activeGoals : []),
    ...(activeGoal ? [activeGoal] : []),
  ].filter(isObject);
  const byId = new Map();
  candidates.forEach((goal, index) => {
    byId.set(goal.id ?? `malformed_${index}`, goal);
  });
  return [...byId.values()];
}

function normalizeGoalContextObject(value = {}) {
  const shell = {
    activeGoalId: value.activeGoalId ?? null,
    goalType: value.goalType ?? null,
    goalStatus: value.goalStatus ?? null,
    semanticGoalType: value.semanticGoalType ?? "unknown",
    goalStartDate: value.goalStartDate ?? null,
    goalPhase: value.goalPhase ?? null,
    phaseId: value.phaseId ?? null,
    phaseStartDate: value.phaseStartDate ?? null,
    phaseAgeDays: value.phaseAgeDays ?? null,
    phaseAgeWeeks: value.phaseAgeWeeks ?? null,
    phaseAgeBand: value.phaseAgeBand ?? "unknown",
    observationRole: value.observationRole ?? "unknown",
    primaryOutcomeRelevance: value.primaryOutcomeRelevance ?? null,
    guardrailRelevance: value.guardrailRelevance ?? null,
    evidencePurpose: value.evidencePurpose ?? null,
    primaryOutcomeDomains: value.primaryOutcomeDomains ?? [],
    primaryOutcomeMeasures: value.primaryOutcomeMeasures ?? [],
    guardrailDomains: value.guardrailDomains ?? [],
    guardrailMeasures: value.guardrailMeasures ?? [],
    contextualDomains: value.contextualDomains ?? [],
    contextualMeasures: value.contextualMeasures ?? [],
    targetRanges: value.targetRanges ?? [],
    sourceGoalIds: value.sourceGoalIds ?? [],
    sourceProtocolIds: value.sourceProtocolIds ?? [],
    provenance: value.provenance ?? null,
    limitations: value.limitations ?? [],
    conflicts: value.conflicts ?? [],
  };
  const probe = normalizePIObservation({
    id: "pi_goal_context_validation_probe",
    domain: "goals",
    kind: "goal_context_validation",
    subject: { type: "goal_context", id: "validation_probe" },
    status: "unknown",
    direction: "not_applicable",
    evidenceWindow: { startDate: null, endDate: null },
    goalContext: shell,
    provenance: {
      producer: "pi_observation_goal_context_service",
      producerVersion: PI_GOAL_CONTEXT_RESOLVER_VERSION,
      calculationMethod: "goal_context_validation",
    },
  });
  return probe.goalContext;
}

function detectConflicts(existing, resolved) {
  if (!existing) return [];
  const conflicts = [];
  if (
    existing.activeGoalId &&
    resolved.activeGoalId &&
    existing.activeGoalId !== resolved.activeGoalId
  ) {
    conflicts.push({
      field: "activeGoalId",
      existingValue: existing.activeGoalId,
      resolvedValue: resolved.activeGoalId,
      resolution: "canonical_active_goal",
    });
  }
  if (
    existing.phaseId &&
    resolved.phaseId &&
    existing.phaseId !== resolved.phaseId
  ) {
    conflicts.push({
      field: "phaseId",
      existingValue: existing.phaseId,
      resolvedValue: resolved.phaseId,
      resolution: "canonical_active_phase",
    });
  }
  return conflicts.sort((left, right) => left.field.localeCompare(right.field));
}

function observationMeasure(observation) {
  return normalizeMeasure(
    observation.subject?.semanticKey ??
      observation.subject?.id ??
      observation.kind
  );
}

function isPrimaryMeasure(context, candidates) {
  return context.primaryOutcomeMeasures.some((measure) =>
    candidates.includes(normalizeMeasure(measure))
  );
}

function isGuardrailMeasure(context, candidates) {
  return context.guardrailMeasures.some((measure) =>
    candidates.includes(normalizeMeasure(measure))
  );
}

function hasBodyFatGuardrail(context) {
  return (
    context.targetRanges.some(
      (range) =>
        range.role === "guardrail" &&
        range.metric === "body_fat_percentage"
    ) ||
    context.guardrailMeasures.some((measure) =>
      /body_fat|fat_mass/.test(measure)
    )
  );
}

function assignment(
  observationRole,
  primaryOutcomeRelevance,
  guardrailRelevance,
  evidencePurpose = null,
  limitations = []
) {
  return {
    observationRole,
    primaryOutcomeRelevance,
    guardrailRelevance,
    evidencePurpose,
    limitations,
  };
}

function unknownAssignment(limitation) {
  return assignment("unknown", null, null, null, [limitation]);
}

function inferGuardrailMetric(item) {
  const explicit = item.metric ?? item.metricKey;
  if (explicit) return explicit;
  const text = `${item.text ?? ""} ${item.label ?? ""}`.toLowerCase();
  if (/body.?fat/.test(text)) return "body_fat_percentage";
  if (/lean.?mass|muscle/.test(text)) return "lean_mass";
  if (/weight/.test(text)) return "scale_weight";
  if (/strength|performance/.test(text)) return "training_performance";
  if (/recovery/.test(text)) return "recovery";
  return null;
}

function domainsForMeasures(measures) {
  return uniqueKeys(
    measures.map((measure) => {
      if (/dexa|lean_mass|fat_mass|body_fat/.test(measure)) return "dexa";
      if (/training|progressive_overload|strength/.test(measure)) return "training";
      if (/weight/.test(measure)) return "weight";
      if (/calorie|protein|macro|nutrition/.test(measure)) return "nutrition";
      if (/activity/.test(measure)) return "activity";
      if (/energy/.test(measure)) return "energy";
      if (/photo/.test(measure)) return "photos";
      if (/adherence|protocol/.test(measure)) return "protocols";
      return null;
    })
  );
}

function normalizeMeasure(value) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function machineKey(value) {
  const normalized = normalizeMeasure(value);
  return normalized || null;
}

function accepted(values) {
  return (Array.isArray(values) ? values : []).filter(
    (item) => item?.accepted !== false
  );
}

function uniqueKeys(values) {
  return [...new Set(values.map(normalizeMeasure).filter(Boolean))].sort();
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))]
    .sort();
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function toLocalDateKey(value, timeZone) {
  if (validDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysBetween(start, end) {
  return Math.floor(
    (Date.parse(`${end}T12:00:00.000Z`) -
      Date.parse(`${start}T12:00:00.000Z`)) /
      86400000
  );
}

function finite(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number)
    ? null
    : number;
}

function isValidGoal(goal) {
  return (
    isObject(goal) &&
    typeof goal.id === "string" &&
    goal.id.trim() &&
    typeof goal.status === "string"
  );
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
