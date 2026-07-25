const DOMAINS = {
  activity: "Activity",
  briefings: "Coaching Updates",
  dexa: "Other recurring execution commitments",
  energy: "Energy",
  lifestyle: "Activity",
  nutrition: "Nutrition",
  peptide: "Peptides",
  photos: "Other recurring execution commitments",
  recovery: "Recovery",
  supplement: "Supplements",
  training: "Training",
  weight: "Other recurring execution commitments",
};

const PROTOCOL_EXECUTION_TYPES = new Set(["peptide", "protocol", "supplement"]);

export function diagnoseProtocolState(store = {}) {
  const transition = latestConsumedTransition(store.goalProtocolTransitionDrafts);
  const reviews = new Map(
    (transition?.protocolReviews ?? []).map((item) => [
      item.sourceProtocolId,
      item,
    ])
  );
  const inventory = (store.protocols ?? []).map((protocol) =>
    inventoryItem(protocol, reviews, store)
  );
  const groups = Object.groupBy(inventory, (item) => item.domain);
  const authority = diagnoseAuthority({
    executions: store.executionItems ?? [],
    goals: store.goals ?? [],
    protocols: store.protocols ?? [],
    versions: store.protocolVersions ?? [],
  });
  const duplicates = authority.issues
    .filter((issue) => issue.code === "duplicate_active_protocol")
    .map((issue) => ({
      domain: DOMAINS[issue.category] ?? issue.category,
      activeIds: issue.recordIds,
      conflict: issue.code,
    }));
  const retatrutide = peptideDiagnostic(
    store,
    inventory,
    transition,
    "execution_retatrutide"
  );
  const activeEnergy = authoritativeProtocol(store.protocols, "energy");
  const operatingPlan = {
    energyRecordId: activeEnergy?.id ?? null,
    energyGoalId:
      activeEnergy?.currentGoalIds?.[0] ??
      activeEnergy?.relatedGoalIds?.[0] ??
      null,
    nutritionContextId: store.nutritionContext?.id ?? null,
    calorieRange: store.nutritionContext?.estimatedDailyCaloricIntake ?? null,
    supplementRecordIds: inventory
      .filter((item) => item.category === "supplement" && item.active)
      .map((item) => item.id)
      .sort(),
    executionItemIds: authority.executions
      .filter((item) => item.status === "healthy")
      .map((item) => item.id)
      .sort(),
  };
  const foamExecution = (store.executionItems ?? []).find(
    (item) => item.id === "execution_foam_roll"
  );
  const foamProtocol = foamExecution?.linkedProtocolId
    ? (store.protocols ?? []).find(
        (item) => item.id === foamExecution.linkedProtocolId
      )
    : null;
  const foamReminder = (store.reminders ?? []).find(
    (item) => item.linkedEntityId === foamProtocol?.id
  );

  return Object.freeze({
    inventory,
    groups,
    duplicates,
    authority,
    transition: {
      id: transition?.id ?? null,
      status: transition?.status ?? null,
      sourceGoalId: transition?.sourceGoalId ?? null,
      targetGoalId: transition?.pendingGoalDraftId ?? null,
      activationFingerprint:
        transition?.activationConsumption?.activationPlanFingerprint ?? null,
      draftFingerprint:
        transition?.activationConsumption?.draftFingerprintAtConsumption ?? null,
      reviews: [...reviews.values()].map((item) => ({
        sourceProtocolId: item.sourceProtocolId,
        type: item.protocolType,
        disposition: item.intendedDisposition,
        recommendation: item.recommendation,
        outcome: outcomeFor(item, inventory),
      })),
    },
    retatrutide,
    operatingPlan,
    foamRolling: {
      protocol: foamProtocol,
      executionItem: foamExecution ?? null,
      reminder: foamReminder ?? null,
      status:
        foamProtocol?.status === "active" && foamExecution?.active === true
          ? "healthy"
          : foamExecution || foamReminder
            ? "incomplete"
            : "absent",
    },
    counts: {
      protocols: inventory.length,
      activeProtocols: inventory.filter((item) => item.status === "active").length,
      plannedProtocols: inventory.filter((item) => item.status === "planned").length,
      activeCommitments: (store.executionItems ?? []).filter(
        (item) => item.active !== false
      ).length,
    },
    migrationContext: {
      markerPresent: Boolean(store.protocolReconciliationMigrations?.length),
      determinesAuthority: false,
    },
  });
}

export function diagnoseAuthority({
  executions = [],
  executionItems,
  goals = [],
  protocols = [],
  versions = [],
  protocolVersions,
} = {}) {
  const resolvedExecutions = executionItems ?? executions;
  const resolvedVersions = protocolVersions ?? versions;
  const activeGoals = new Set(
    goals.filter((goal) => goal.status === "active").map((goal) => goal.id)
  );
  const activeProtocols = protocols
    .filter((protocol) => protocol.status === "active")
    .slice()
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const activeById = new Map(
    activeProtocols.map((protocol) => [protocol.id, protocol])
  );
  const issues = [];
  const semanticGroups = Object.groupBy(activeProtocols, semanticProtocolKey);

  Object.entries(semanticGroups).forEach(([key, records]) => {
    if (records.length > 1) {
      issues.push({
        code: "duplicate_active_protocol",
        category: key.split("|")[0],
        recordIds: records.map((record) => record.id).sort(),
      });
    }
  });

  const protocolResults = activeProtocols.map((protocol) => {
    const currentVersion = protocol.currentVersionId
      ? resolvedVersions.find((version) => version.id === protocol.currentVersionId)
      : null;
    const activeVersions = resolvedVersions.filter(
      (version) =>
        version.protocolId === protocol.id && version.status === "active"
    );
    const goalIds = currentGoalIds(protocol);
    const protocolIssues = [];
    let status = "healthy";

    if (goalIds.length === 0 || activeGoals.size && !goalIds.some((id) => activeGoals.has(id))) {
      protocolIssues.push("missing_active_goal_ownership");
      status = "incomplete";
    }
    if (activeVersions.length > 1) {
      protocolIssues.push("conflicting_active_versions");
      status = "invalid";
    } else if (protocol.currentVersionId) {
      if (
        !currentVersion ||
        currentVersion.protocolId !== protocol.id ||
        currentVersion.status !== "active"
      ) {
        protocolIssues.push("invalid_current_version");
        status = "incomplete";
      }
    } else {
      protocolIssues.push("legacy_version_pointer_absent");
      if (status === "healthy") status = "legacy_compatible";
    }

    return {
      id: protocol.id,
      category: protocol.category ?? protocol.protocolType ?? "other",
      status,
      currentVersionId: protocol.currentVersionId ?? null,
      currentGoalIds: goalIds,
      issues: protocolIssues,
    };
  });

  const executionResults = resolvedExecutions
    .filter((execution) => execution.active === true)
    .map((execution) => {
      const protocolId =
        execution.protocolRootId ?? execution.linkedProtocolId ?? null;
      if (!PROTOCOL_EXECUTION_TYPES.has(execution.type)) {
        return { id: execution.id, protocolId, status: "healthy", issues: [] };
      }
      if (!protocolId || !activeById.has(protocolId)) {
        const issue = {
          code: "orphaned_protocol_execution",
          executionId: execution.id,
          protocolId,
        };
        issues.push(issue);
        return {
          id: execution.id,
          protocolId,
          status: "invalid",
          issues: [issue.code],
        };
      }
      return {
        id: execution.id,
        protocolId,
        status: "healthy",
        issues: [],
      };
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  protocolResults.forEach((result) => {
    result.issues.forEach((code) => {
      if (code !== "legacy_version_pointer_absent") {
        issues.push({ code, protocolId: result.id });
      }
    });
  });

  const status = issues.some((issue) =>
    ["duplicate_active_protocol", "conflicting_active_versions", "orphaned_protocol_execution"].includes(
      issue.code
    )
  )
    ? "invalid"
    : issues.length
      ? "incomplete"
      : protocolResults.some((result) => result.status === "legacy_compatible")
        ? "legacy_compatible"
        : "healthy";

  return Object.freeze({
    status,
    protocols: protocolResults,
    executions: executionResults,
    issues: issues.slice().sort(compareIssues),
  });
}

function inventoryItem(protocol, reviews, store) {
  const sourceProtocolId = findSourceProtocolId(protocol, reviews);
  const review = reviews.get(sourceProtocolId);
  const goals = currentGoalIds(protocol);
  const priorityIds = (store.reminders ?? [])
    .filter((item) => item.linkedEntityId === protocol.id)
    .map((item) => item.id)
    .sort();
  return {
    id: protocol.id,
    name: protocol.name,
    category: protocol.category ?? protocol.protocolType ?? "other",
    domain:
      DOMAINS[protocol.category ?? protocol.protocolType] ??
      "Other recurring execution commitments",
    subtype: protocol.protocolType ?? null,
    status: protocol.status,
    active: protocol.status === "active",
    createdAt: protocol.createdAt ?? null,
    updatedAt: protocol.updatedAt ?? null,
    startDate: protocol.startDate ?? null,
    endDate: protocol.endDate ?? null,
    schedule: protocol.schedule ?? protocol.frequency ?? null,
    dose: protocol.dose ?? null,
    doseHistory: protocol.doseHistory ?? [],
    goalIds: goals,
    phaseIds: [
      protocol.phaseContext?.id,
      ...(protocol.phaseIds ?? []),
    ].filter(Boolean),
    sourceProtocolId,
    transitionDraftId: review ? review.id.split("_review_")[0] : null,
    transitionDisposition: review?.intendedDisposition ?? null,
    priorityIds,
    appearsInOperatingPlan:
      protocol.category === "supplement" ||
      ["activity", "training", "nutrition"].includes(protocol.protocolType),
    semanticKey: semanticProtocolKey(protocol),
  };
}

function findSourceProtocolId(protocol, reviews) {
  if (reviews.has(protocol.id)) return protocol.id;
  return (
    protocol.sourceProtocolId ??
    protocol.activationProvenance?.sourceProtocolId ??
    null
  );
}

function outcomeFor(review, inventory) {
  const original = inventory.find((item) => item.id === review.sourceProtocolId);
  const created = inventory.filter(
    (item) =>
      item.sourceProtocolId === review.sourceProtocolId &&
      item.id !== review.sourceProtocolId
  );
  return {
    originalStatus: original?.status ?? "virtual",
    createdIds: created.map((item) => item.id).sort(),
    createdStatuses: created.map((item) => item.status).sort(),
    originalRetired: Boolean(original) && original.status !== "active",
    actual: created.length
      ? original?.status === "active"
        ? "new_record_created_original_left_active"
        : "new_record_created"
      : original?.status === "active"
        ? "original_left_active_without_relink"
        : "no_persisted_protocol",
  };
}

function peptideDiagnostic(store, inventory, transition, executionId) {
  const execution = (store.executionItems ?? []).find(
    (item) => item.id === executionId
  );
  const original = inventory.find(
    (item) => item.id === execution?.protocolRootId
  );
  const planned = inventory.filter(
    (item) =>
      item.sourceProtocolId === original?.id && item.id !== original.id
  );
  const reminder = (store.reminders ?? []).find(
    (item) => item.linkedEntityId === original?.id
  );
  const doseChange = original?.doseHistory?.find(
    (item) => item.status === "active"
  );
  return {
    originalProtocolId: original?.id ?? null,
    originalGoalIds: original?.goalIds ?? [],
    activeProtocolIds: original?.active ? [original.id] : [],
    plannedProtocolIds: planned.map((item) => item.id).sort(),
    reminderPriorityId: reminder?.id ?? null,
    doseChangePriorityId: doseChange
      ? `dose-change-${original.id}-${doseChange.startDate}`
      : null,
    currentDose: original?.dose ?? null,
    nextDoseChange: doseChange ?? null,
    authoritativeCandidate: original?.id ?? null,
    transitionDisposition: transition?.protocolReviews?.find(
      (item) => item.sourceProtocolId === original?.id
    )?.intendedDisposition ?? null,
  };
}

function latestConsumedTransition(drafts = []) {
  return drafts
    .filter((item) => item.activationConsumption?.consumed)
    .slice()
    .sort((left, right) =>
      String(left.consumedAt ?? left.updatedAt).localeCompare(
        String(right.consumedAt ?? right.updatedAt)
      )
    )
    .at(-1) ?? null;
}

function authoritativeProtocol(protocols = [], type) {
  const matches = protocols.filter(
    (protocol) =>
      protocol.status === "active" &&
      (protocol.category === type || protocol.protocolType === type)
  );
  return matches.length === 1 ? matches[0] : null;
}

function currentGoalIds(protocol) {
  return [
    ...(protocol.currentGoalIds ?? []),
    ...(protocol.relatedGoalIds ?? []),
    ...(protocol.goalIds ?? []),
    ...(protocol.goalLinks ?? []).map((item) => item.goalId),
  ].filter(Boolean);
}

function semanticProtocolKey(protocol) {
  return [
    protocol.category ?? protocol.protocolType ?? "other",
    protocol.protocolType ?? protocol.category ?? "other",
    protocol.sourceProtocolId ??
      protocol.activationProvenance?.sourceProtocolId ??
      protocol.id,
  ].join("|");
}

function compareIssues(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
