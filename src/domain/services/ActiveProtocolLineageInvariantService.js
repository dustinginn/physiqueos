export const ActiveProtocolLineageClassification = Object.freeze({
  VALID: "valid_active_lineage",
  MISSING_CURRENT_VERSION: "missing_current_version",
  ZERO_ACTIVE_VERSIONS: "zero_active_versions",
  MULTIPLE_ACTIVE_VERSIONS: "multiple_active_versions",
  CURRENT_VERSION_MISSING: "current_version_missing",
  CURRENT_VERSION_CROSS_ROOT: "current_version_cross_root",
  CURRENT_VERSION_NOT_ACTIVE: "current_version_not_active",
  CURRENT_VERSION_SUPERSEDED: "current_version_superseded",
  TRANSITION_CANDIDATE: "single_planned_transition_candidate",
  VERSIONLESS_LEGACY_ROOT: "versionless_legacy_root",
  GOAL_MISMATCH: "root_version_goal_mismatch",
  TYPE_MISMATCH: "root_version_type_mismatch",
  EXECUTION_CONFLICT: "execution_projection_conflict",
  REMINDER_CONFLICT: "reminder_projection_conflict",
});

export function classifyActiveProtocolLineage(store, rootOrId) {
  const root = typeof rootOrId === "string"
    ? store.protocols?.find((item) => item.id === rootOrId)
    : rootOrId;
  if (!root || root.status !== "active") return null;

  const versions = (store.protocolVersions ?? []).filter((item) => item.protocolId === root.id);
  const active = versions.filter(isActive);
  const planned = versions.filter((item) => item.status === "planned" && !item.endedAt);
  const pointed = root.currentVersionId
    ? (store.protocolVersions ?? []).find((item) => item.id === root.currentVersionId)
    : null;
  const base = {
    rootId: root.id,
    name: root.name ?? root.protocolType ?? root.category ?? root.id,
    protocolType: root.protocolType ?? root.category ?? null,
    goalIds: rootGoalIds(root),
    currentVersionId: root.currentVersionId ?? null,
    totalVersionCount: versions.length,
    activeVersionCount: active.length,
    plannedVersionCount: planned.length,
    candidateVersionId: planned.length === 1 ? planned[0].id : null,
  };
  const result = (classification, blocker = null) => Object.freeze({
    ...base,
    classification,
    repairEligible: classification === ActiveProtocolLineageClassification.TRANSITION_CANDIDATE,
    repairClass: classification === ActiveProtocolLineageClassification.TRANSITION_CANDIDATE
      ? "transition_initial_version"
      : classification === ActiveProtocolLineageClassification.VERSIONLESS_LEGACY_ROOT
        ? "legacy_versionless_peptide"
        : null,
    blocker,
  });

  if (versions.length === 0) {
    return result(ActiveProtocolLineageClassification.VERSIONLESS_LEGACY_ROOT,
      "The active legacy root has no version history.");
  }
  if (root.currentVersionId && !pointed) {
    return result(ActiveProtocolLineageClassification.CURRENT_VERSION_MISSING,
      "The current-version record does not exist.");
  }
  if (pointed && pointed.protocolId !== root.id) {
    return result(ActiveProtocolLineageClassification.CURRENT_VERSION_CROSS_ROOT,
      "The current-version pointer belongs to another root.");
  }
  if (active.length > 1) {
    return result(ActiveProtocolLineageClassification.MULTIPLE_ACTIVE_VERSIONS,
      "More than one active version exists.");
  }

  const candidate = pointed ?? (planned.length === 1 ? planned[0] : active[0]);
  if (candidate) {
    if (!sameGoals(root, candidate)) {
      return result(ActiveProtocolLineageClassification.GOAL_MISMATCH,
        "Root and version Goal associations differ.");
    }
    if (!sameType(root, candidate)) {
      return result(ActiveProtocolLineageClassification.TYPE_MISMATCH,
        "Root and version protocol types differ.");
    }
    if (!executionCompatible(store, root)) {
      return result(ActiveProtocolLineageClassification.EXECUTION_CONFLICT,
        "A linked execution projection points at a different protocol.");
    }
    if (!remindersCompatible(store, root)) {
      return result(ActiveProtocolLineageClassification.REMINDER_CONFLICT,
        "A linked reminder projection points at a different protocol.");
    }
  }

  if (!root.currentVersionId && active.length === 0 && planned.length === 1
      && versions.length === 1 && acceptedTransition(root, planned[0])) {
    return result(ActiveProtocolLineageClassification.TRANSITION_CANDIDATE);
  }
  if (!root.currentVersionId) {
    return result(active.length === 0
      ? ActiveProtocolLineageClassification.ZERO_ACTIVE_VERSIONS
      : ActiveProtocolLineageClassification.MISSING_CURRENT_VERSION,
    "The active root has no authoritative version pointer.");
  }
  if (pointed?.status === "superseded" || pointed?.endedAt) {
    return result(ActiveProtocolLineageClassification.CURRENT_VERSION_SUPERSEDED,
      "The pointed version is terminal.");
  }
  if (!isActive(pointed)) {
    return result(ActiveProtocolLineageClassification.CURRENT_VERSION_NOT_ACTIVE,
      "The pointed version is not active.");
  }
  if (active.length === 0) {
    return result(ActiveProtocolLineageClassification.ZERO_ACTIVE_VERSIONS,
      "The active root has no active version.");
  }
  return result(ActiveProtocolLineageClassification.VALID);
}

export function classifyAllActiveProtocolLineages(store) {
  return (store.protocols ?? [])
    .filter((item) => item.status === "active")
    .map((root) => classifyActiveProtocolLineage(store, root));
}

export function validateActiveProtocolLineage(store, rootId) {
  const report = classifyActiveProtocolLineage(store, rootId);
  return Object.freeze({
    valid: report?.classification === ActiveProtocolLineageClassification.VALID,
    report,
  });
}

function acceptedTransition(root, version) {
  return Boolean(
    root.activationIdentity?.transitionId
    && root.activationProvenance?.sourceProtocolId
    && version.confirmation?.authority === "accepted_goal_transition"
    && (version.change?.previousVersionId == null
      || version.change.previousVersionId === root.activationProvenance?.sourceVersionId),
  );
}
function isActive(version) {
  return version?.status === "active" && !version.endedAt;
}
function rootGoalIds(root) {
  return unique(root.currentGoalIds?.length ? root.currentGoalIds : root.relatedGoalIds);
}
function versionGoalIds(version) {
  return unique((version.goalLinks ?? []).map((item) => item.goalId));
}
function sameGoals(root, version) {
  const owned = unique([...(root.currentGoalIds ?? []), ...(root.relatedGoalIds ?? []),
    ...(root.historicalGoalIds ?? [])]);
  const versionGoals = versionGoalIds(version);
  return versionGoals.length > 0 && versionGoals.every((id) => owned.includes(id));
}
function sameType(root, version) {
  const versionType = version.protocolType ?? version.protocolCategory ?? version.category;
  return !versionType || (root.protocolType ?? root.category) === versionType;
}
function executionCompatible(store, root) {
  return (store.executionItems ?? []).every((item) =>
    item.linkedProtocolId !== root.id || item.linkedProtocolId === root.id);
}
function remindersCompatible(store, root) {
  const executionIds = new Set((store.executionItems ?? [])
    .filter((item) => item.linkedProtocolId === root.id).map((item) => item.id));
  return (store.reminders ?? []).every((item) => {
    const linked = item.linkedProtocolId === root.id
      || item.protocolId === root.id
      || item.linkedEntityId === root.id
      || item.sourceProtocolId === root.id
      || executionIds.has(item.linkedEntityId);
    return !linked || !item.linkedProtocolId || item.linkedProtocolId === root.id;
  });
}
function unique(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}
