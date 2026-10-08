export const OPERATING_PLAN_ENERGY_PHASE_HISTORY_SCHEMA_VERSION =
  "operating_plan_energy_phase_history_v1";

const HISTORICAL_PHASE_STATUSES = new Set(["completed", "superseded"]);
const HISTORICAL_VERSION_STATUSES = new Set(["superseded", "archived"]);

/**
 * Projects only explicitly phase- and Goal-bound immutable Energy protocol
 * versions. The mutable protocol root and current effectiveStrategy are never
 * historical sources. A phase without a trustworthy version remains visible
 * as chronology with an explicit unavailable state.
 */
export function resolveOperatingPlanEnergyPhaseHistory({
  goal = null,
  protocols = [],
  protocolVersions = [],
  ownerUserId,
  ownerTimeZone = null,
} = {}) {
  if (!goal?.id || goal.userId !== ownerUserId) return Object.freeze([]);

  const energyProtocols = protocols.filter((protocol) =>
    protocol?.userId === ownerUserId &&
    (protocol.protocolType === "energy" || protocol.category === "energy") &&
    protocolSupportsGoal(protocol, goal.id)
  );
  const protocolIds = new Set(energyProtocols.map((protocol) => protocol.id));
  const phases = (goal.phases ?? [])
    .filter((phase) => HISTORICAL_PHASE_STATUSES.has(phase?.status))
    .map((phase, index) => normalizePhase(phase, index, ownerTimeZone))
    .filter(Boolean)
    .sort((left, right) => left.phaseOrder - right.phaseOrder || left.phaseId.localeCompare(right.phaseId));

  return deepFreeze(phases.map((phase) => projectPhase({
    phase,
    goalId: goal.id,
    protocolIds,
    protocolVersions,
    ownerTimeZone,
  })));
}

function projectPhase({ phase, goalId, protocolIds, protocolVersions, ownerTimeZone }) {
  const phaseCandidates = protocolVersions.filter((version) =>
    protocolIds.has(version?.protocolId) && version?.phaseId === phase.phaseId
  );
  const wrongGoal = phaseCandidates.some((version) => !versionSupportsGoal(version, goalId));
  const attributable = phaseCandidates.filter((version) => versionSupportsGoal(version, goalId));
  const normalized = attributable.map((version) => normalizeRevision({
    version,
    phase,
    goalId,
    ownerTimeZone,
  }));
  const trustworthy = normalized.filter((entry) => entry.trustworthy);
  const rejected = normalized.filter((entry) => !entry.trustworthy);
  const hasConflict = conflictingRanges(trustworthy);

  if (wrongGoal || rejected.length || hasConflict) {
    return phaseProjection(phase, {
      goalId,
      availability: "untrusted",
      absenceKind: "source_untrusted",
      reason: hasConflict ? "conflicting_effective_ranges"
        : wrongGoal ? "goal_attribution_conflict"
          : rejected[0]?.reason ?? "invalid_historical_revision",
      revisions: [],
    });
  }
  if (!trustworthy.length) {
    return phaseProjection(phase, {
      goalId,
      availability: "unavailable",
      absenceKind: "unknown",
      reason: "no_authoritative_phase_strategy_revision",
      revisions: [],
    });
  }

  const revisions = trustworthy
    .sort(compareRevisions)
    .map(({ trustworthy: _trustworthy, reason: _reason, ...revision }) => revision);
  const availableFields = revisions.flatMap((revision) => [
    revision.caloricIntakeTarget.availability,
    revision.activityExpenditureTarget.availability,
  ]).filter((availability) => availability === "available").length;
  const totalFields = revisions.length * 2;
  return phaseProjection(phase, {
    goalId,
    availability: availableFields === totalFields ? "available"
      : availableFields > 0 ? "partial" : "unavailable",
    absenceKind: availableFields === totalFields ? null : "recorded_without_targets",
    reason: availableFields === totalFields ? null : "one_or_more_target_fields_not_recorded",
    revisions,
  });
}

function normalizeRevision({ version, phase, goalId, ownerTimeZone }) {
  const effectiveFrom = dateKey(version.effectiveAt, ownerTimeZone);
  const effectiveTo = dateKey(version.endedAt, ownerTimeZone);
  const base = {
    id: version.id,
    protocolId: version.protocolId,
    protocolVersionId: version.id,
    protocolVersionNumber: finiteInteger(version.versionNumber),
    goalId,
    phaseId: phase.phaseId,
    effectiveFrom,
    effectiveTo,
    dateSemantics: "owner_local_calendar_date",
    timeZone: ownerTimeZone,
    caloricIntakeTarget: targetAvailability(
      version.change?.reviewedChanges?.caloricIntakeTarget
    ),
    activityExpenditureTarget: targetAvailability(
      version.change?.reviewedChanges?.activityExpenditureTarget
    ),
    provenance: {
      source: "canonical_protocol_version",
      phaseAttribution: "protocol_version.phaseId",
      goalAttribution: "protocol_version.goalLinks",
      targetAttribution: "protocol_version.change.reviewedChanges",
      strategyId: clean(version.strategyId),
      confirmationAuthority: clean(version.confirmation?.authority),
    },
  };
  if (!HISTORICAL_VERSION_STATUSES.has(version.status)) {
    return { ...base, trustworthy: false, reason: "version_not_historical" };
  }
  if (!effectiveFrom || !effectiveTo || effectiveTo <= effectiveFrom) {
    return { ...base, trustworthy: false, reason: "invalid_effective_range" };
  }
  if (phase.startedOn && effectiveFrom < phase.startedOn) {
    return { ...base, trustworthy: false, reason: "revision_predates_phase" };
  }
  if (phase.endedOn && effectiveTo > phase.endedOn) {
    return { ...base, trustworthy: false, reason: "revision_exceeds_phase" };
  }
  return { ...base, trustworthy: true, reason: null };
}

function normalizePhase(phase, index, ownerTimeZone) {
  const phaseId = clean(phase.id ?? phase.phaseId);
  if (!phaseId) return null;
  return {
    phaseId,
    phaseName: clean(phase.name ?? phase.canonicalName ?? phase.title) ?? `Phase ${index + 1}`,
    phaseOrder: (finiteInteger(phase.order) ?? index) + 1,
    phaseStatus: phase.status,
    startedOn: dateKey(phase.startedAt ?? phase.startDate, ownerTimeZone),
    endedOn: dateKey(phase.completedAt ?? phase.supersededAt ?? phase.endDate, ownerTimeZone),
    dateSemantics: "owner_local_calendar_date",
    timeZone: ownerTimeZone,
  };
}

function phaseProjection(phase, details) {
  return {
    id: phase.phaseId,
    goalId: details.goalId,
    phaseId: phase.phaseId,
    phaseName: phase.phaseName,
    phaseOrder: phase.phaseOrder,
    phaseStatus: phase.phaseStatus,
    startedOn: phase.startedOn,
    endedOn: phase.endedOn,
    dateSemantics: phase.dateSemantics,
    timeZone: phase.timeZone,
    availability: details.availability,
    absenceKind: details.absenceKind,
    reason: details.reason,
    revisions: details.revisions,
  };
}

function targetAvailability(value) {
  if (!value || !Object.hasOwn(value, "value")) {
    return { availability: "not_recorded", value: null, unit: null };
  }
  const amount = Number(value.value);
  const unit = clean(value.unit);
  if (!Number.isFinite(amount) || !unit) {
    return { availability: "unavailable", value: null, unit: null };
  }
  return { availability: "available", value: amount, unit };
}

function conflictingRanges(revisions) {
  const ordered = [...revisions].sort(compareRevisions);
  return ordered.some((revision, index) => {
    const next = ordered[index + 1];
    return next && revision.effectiveTo > next.effectiveFrom;
  });
}

function compareRevisions(left, right) {
  return left.effectiveFrom.localeCompare(right.effectiveFrom) ||
    (left.protocolVersionNumber ?? 0) - (right.protocolVersionNumber ?? 0) ||
    left.protocolVersionId.localeCompare(right.protocolVersionId);
}

function versionSupportsGoal(version, goalId) {
  return Array.isArray(version.goalLinks) && version.goalLinks.some((link) =>
    link?.goalId === goalId && (!link.relationship || link.relationship === "supports")
  );
}

function protocolSupportsGoal(protocol, goalId) {
  return [
    ...(protocol.currentGoalIds ?? []),
    ...(protocol.relatedGoalIds ?? []),
    ...(protocol.goalIds ?? []),
    ...(protocol.goalLinks ?? []).map((link) => link?.goalId),
  ].includes(goalId);
}

function dateKey(value, ownerTimeZone) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return validDateKey(value) ? value : null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || !ownerTimeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ownerTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const key = `${byType.year}-${byType.month}-${byType.day}`;
    return validDateKey(key) ? key : null;
  } catch {
    return null;
  }
}

function validDateKey(value) {
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
