// Current-strategy authority.
//
// One resolver decides what the CURRENT strategy is for the active Goal and
// Phase. It resolves from, in order:
//   active Goal -> active Phase -> accepted phase strategy -> the Energy
//   protocol's current, active, phase-bound revision.
//
// `goal.openingApproach` and protocol display names are historical context.
// They never override the active phase strategy, and stale records are read
// but never mutated. This is a read-time precedence rule.

export const CURRENT_STRATEGY_AUTHORITY_VERSION = "current_strategy_authority_v1";

export const CurrentStrategyOperatingState = Object.freeze({
  PHASE_EXECUTION: "phase_execution",
  LEGACY_OPENING_APPROACH: "legacy_opening_approach",
  UNRESOLVED: "unresolved",
});

export function resolveCurrentStrategyAuthority({
  goal = null,
  phase = null,
  phaseStrategies = [],
  protocols = [],
  protocolVersions = [],
} = {}) {
  const diagnostics = [];
  const phaseId = phase?.id ?? goal?.currentPhaseId ?? goal?.timeline?.currentPhaseId ?? null;
  const strategy = selectPhaseStrategy({ goal, phaseId, phaseStrategies });
  if (!strategy) diagnostics.push("phase_strategy_unavailable");

  const energy = resolveEnergyStrategy({ strategy, phaseId, protocols, protocolVersions, diagnostics });
  const operating = resolveOperatingState({ goal, phase, strategy, energy });
  const bodyFat = resolveBodyFatGuardrailAuthority({ goal, strategy });

  return Object.freeze({
    schemaVersion: CURRENT_STRATEGY_AUTHORITY_VERSION,
    goalId: goal?.id ?? null,
    goalTitle: goal?.title ?? goal?.name ?? null,
    goalType: goal?.type ?? null,
    phaseId,
    phaseName: phase?.name ?? phase?.title ?? null,
    phaseStatus: phase?.status ?? null,
    phaseStrategy: strategy ? Object.freeze({
      id: strategy.id ?? strategy.strategyId,
      revision: strategy.revision ?? null,
      status: strategy.status ?? null,
      acceptedAt: strategy.acceptedAt ?? null,
      hypothesisId: strategy.strategyHypothesis?.hypothesisId ?? null,
    }) : null,
    strategyRevisionId: strategy?.id ?? strategy?.strategyId ??
      goal?.activePhaseStrategyId ?? goal?.timeline?.activePhaseStrategyId ?? null,
    operatingState: operating,
    energyStrategy: energy,
    bodyFatGuardrail: bodyFat,
    // Historical context only: what the Goal opened with. Never current.
    historicalContext: Object.freeze({
      openingApproach: goal?.openingApproach ? Object.freeze({
        value: goal.openingApproach.value ?? null,
        role: "historical_opening_approach",
      }) : null,
      maintenanceCalibrationIsCurrent: false,
    }),
    status: strategy && energy ? "resolved" : strategy ? "partial" : "unavailable",
    diagnostics: Object.freeze(diagnostics),
  });
}

// Light-weight operating-state precedence for surfaces that hold a Goal and a
// Phase but not the strategy/protocol collections. An active phase bound to an
// active phase strategy is phase execution, not the Goal's opening approach.
export function resolveOperatingStateFromGoalPhase({ goal = null, phase = null } = {}) {
  const strategyId = goal?.activePhaseStrategyId ?? goal?.timeline?.activePhaseStrategyId ??
    phase?.activePhaseStrategyId ?? null;
  const active = phase?.status === "active" &&
    (!goal?.currentPhaseId || goal.currentPhaseId === phase.id);
  if (active && strategyId) {
    return Object.freeze({
      value: CurrentStrategyOperatingState.PHASE_EXECUTION,
      label: null,
      accepted: true,
      source: "active_phase_strategy",
      strategyRevisionId: strategyId,
      historicalOpeningApproach: goal?.openingApproach?.value ?? null,
    });
  }
  return goal?.openingApproach ? Object.freeze({
    value: goal.openingApproach.value ?? null,
    label: goal.openingApproach.label ?? null,
    accepted: goal.openingApproach.accepted !== false,
    source: CurrentStrategyOperatingState.LEGACY_OPENING_APPROACH,
    strategyRevisionId: null,
    historicalOpeningApproach: goal.openingApproach.value ?? null,
  }) : null;
}

export function resolveWeeklyActivityTargetKcal(authority, days = 7) {
  const daily = authority?.energyStrategy?.activityTarget;
  return Number.isFinite(daily?.value) && daily.unit === "kcal/day"
    ? Math.round(daily.value * days) : null;
}

function selectPhaseStrategy({ goal, phaseId, phaseStrategies }) {
  const candidates = (phaseStrategies ?? []).filter((item) =>
    item && (!phaseId || item.phaseId === phaseId) && item.status === "accepted" &&
    !item.supersededAt && !item.supersededBy);
  const referenced = goal?.activePhaseStrategyId ?? goal?.timeline?.activePhaseStrategyId ?? null;
  return candidates.find((item) => (item.id ?? item.strategyId) === referenced) ??
    candidates.sort((left, right) =>
      (Number(right.revision) || 0) - (Number(left.revision) || 0))[0] ?? null;
}

function resolveEnergyStrategy({ strategy, phaseId, protocols, protocolVersions, diagnostics }) {
  const domain = strategy?.domains?.energy ?? null;
  const strategyId = strategy?.id ?? strategy?.strategyId ?? null;
  const energyProtocols = (protocols ?? []).filter((item) =>
    item?.status === "active" &&
    [item.category, item.protocolType].some((value) => value === "energy") &&
    (!phaseId || item.phaseId === phaseId || (strategyId && item.phaseStrategyId === strategyId)));
  let selected = null;
  for (const protocol of energyProtocols) {
    const version = selectVersion({ protocol, phaseId, strategyId, protocolVersions });
    if (version && (!selected || (Number(version.versionNumber) || 0) >
      (Number(selected.version.versionNumber) || 0))) selected = { protocol, version };
  }
  if (!selected) {
    if (energyProtocols.length) diagnostics.push("energy_protocol_revision_unavailable");
    else diagnostics.push("energy_protocol_unavailable");
    if (!domain) return null;
  }
  const reviewed = selected?.version?.change?.reviewedChanges ?? {};
  const effective = selected?.protocol?.effectiveStrategy ?? {};
  const intake = target(reviewed.caloricIntakeTarget ?? effective.caloricIntakeTarget);
  const activity = target(reviewed.activityExpenditureTarget ?? effective.activityExpenditureTarget);
  if (!intake) diagnostics.push("energy_intake_target_unavailable");
  if (!activity) diagnostics.push("energy_activity_target_unavailable");
  return Object.freeze({
    // Mode comes from the current revision, never from the protocol display name.
    mode: reviewed.mode ?? effective.mode ?? null,
    intent: domain?.intent ?? null,
    adjustmentAuthorization: domain?.adjustmentAuthorization ??
      reviewed.adjustmentAuthorization ?? effective.adjustmentAuthorization ?? null,
    automaticAdjustmentAllowed: domain?.automaticAdjustmentAllowed ??
      reviewed.automaticAdjustmentAllowed ?? false,
    fixedCaloriePrescription: domain?.fixedCaloriePrescription ?? false,
    monitoringCadence: domain?.monitoringCadence ?? reviewed.monitoringCadence ?? null,
    intakeTarget: intake,
    activityTarget: activity,
    phaseStrategyId: strategyId,
    protocolId: selected?.protocol?.id ?? null,
    protocolVersionId: selected?.version?.id ?? null,
    protocolVersionNumber: selected?.version?.versionNumber ?? null,
    effectiveAt: selected?.version?.effectiveAt ?? null,
    confirmationAuthority: selected?.version?.confirmation?.authority ?? null,
    source: selected ? "energy_protocol_current_revision" : "phase_strategy_domain",
  });
}

function selectVersion({ protocol, phaseId, strategyId, protocolVersions }) {
  const versions = (protocolVersions ?? []).filter((item) => item?.protocolId === protocol.id);
  const current = versions.find((item) => item.id === protocol.currentVersionId);
  const active = current?.status === "active" ? current
    : versions.filter((item) => item.status === "active")
      .sort((left, right) => (Number(right.versionNumber) || 0) - (Number(left.versionNumber) || 0))[0];
  if (!active) return null;
  // A revision from a different phase or strategy is historical context.
  if (phaseId && active.phaseId && active.phaseId !== phaseId) return null;
  if (strategyId && active.strategyId && active.strategyId !== strategyId) return null;
  return active;
}

function resolveOperatingState({ goal, phase, strategy, energy }) {
  const strategyId = strategy?.id ?? strategy?.strategyId ?? null;
  if (strategy && phase?.status === "active") {
    return Object.freeze({
      value: CurrentStrategyOperatingState.PHASE_EXECUTION,
      source: "active_phase_strategy",
      strategyRevisionId: strategyId,
      energyMode: energy?.mode ?? null,
    });
  }
  const opening = goal?.openingApproach?.value ?? null;
  return Object.freeze({
    value: opening ? CurrentStrategyOperatingState.LEGACY_OPENING_APPROACH
      : CurrentStrategyOperatingState.UNRESOLVED,
    source: opening ? "goal_opening_approach_fallback" : "none",
    strategyRevisionId: null,
    energyMode: null,
  });
}

function resolveBodyFatGuardrailAuthority({ goal, strategy }) {
  const accepted = strategy?.domains?.guardrailResponse?.acceptedBodyFatRange;
  if (Number.isFinite(accepted?.min) && Number.isFinite(accepted?.max)) {
    return Object.freeze({
      metric: "body_fat_percentage",
      minimum: accepted.min,
      maximum: accepted.max,
      unit: accepted.unit === "percent" ? "%" : accepted.unit ?? "%",
      approximate: accepted.approximate === true,
      source: "phase_strategy_guardrail_response",
    });
  }
  const text = (goal?.guardrails ?? [])
    .filter((item) => item?.accepted !== false)
    .map((item) => `${item.text ?? ""} ${item.label ?? ""}`)
    .find((value) => /body.?fat/i.test(value) && /\d/.test(value));
  const match = text?.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
  return match ? Object.freeze({
    metric: "body_fat_percentage",
    minimum: Number(match[1]),
    maximum: Number(match[2]),
    unit: "%",
    approximate: /approximately|about|~/i.test(text),
    source: "goal_guardrail_text",
  }) : null;
}

function target(value) {
  return Number.isFinite(value?.value)
    ? Object.freeze({ value: Number(value.value), unit: value.unit ?? "kcal/day" }) : null;
}
