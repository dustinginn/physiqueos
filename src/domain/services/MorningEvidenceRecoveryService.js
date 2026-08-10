import {
  EVIDENCE_RECOVERY_RETURN_PATH,
  appendEvidenceRecoveryContext,
  createEvidenceRecoveryContext,
  normalizeEvidenceRecoveryType,
} from "./EvidenceRecoveryContext";
import {
  resolveNutritionEvidenceCompleteness,
} from "./EnergyEvidenceCompletenessService";

export const MORNING_RECONCILIATION_ITEM_KINDS = Object.freeze({
  EXECUTION: "execution_reconciliation",
  EVIDENCE: "evidence_recovery",
});

export const MORNING_EVIDENCE_RECOVERY_STATUSES = Object.freeze({
  MISSING: "missing",
  PENDING_CONFIRMATION: "pending_confirmation",
  PRESENT_PARTIAL: "present_partial",
  PRESENT_INCOMPLETE: "present_incomplete",
  PRESENT_COMPLETE: "present_complete",
});

const ACTIVE_REVIEW_STATUSES = new Set([
  "pending",
  "commit_failed",
  "partially_committed",
]);
const TERMINAL_EXECUTION_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "dismissed",
  "moved",
  "resolved",
  "skipped",
  "superseded",
]);
const RECOVERY_ORDER = ["photo_session", "training", "activity_day", "nutrition"];

export function createMorningEvidenceRecoverySelection({
  canonicalObjects = [],
  executionItems = [],
  previousDate,
  priorityItems = [],
  protocolVersions = [],
  protocols = [],
  reviews = [],
} = {}) {
  const activeCanonical = canonicalObjects.filter(
    (item) => item?.quality?.status !== "superseded"
  );
  const pendingByType = pendingReviewsByType(reviews, previousDate);
  const expectations = collectExpectations({
    executionItems,
    previousDate,
    priorityItems,
    protocolVersions,
    protocols,
  });
  const evidencePriorityKeys = new Set(
    priorityItems
      .filter((item) => normalizeEvidenceRecoveryType(item.linkedEvidenceType))
      .map((item) => item.occurrenceKey)
  );
  const executionReconciliationItems = priorityItems
    .filter((item) => !evidencePriorityKeys.has(item.occurrenceKey))
    .map((item) => Object.freeze({
      ...item,
      kind: MORNING_RECONCILIATION_ITEM_KINDS.EXECUTION,
    }));
  const evidenceRecoveryItems = [];

  for (const evidenceType of RECOVERY_ORDER) {
    const expectation = expectations.get(evidenceType) ?? null;
    const pendingReview = pendingByType.get(evidenceType) ?? null;
    const canonical = canonicalForDate(activeCanonical, evidenceType, previousDate);
    const status = classifyStatus({ canonical, evidenceType, pendingReview });
    const actionable = actionFor({ evidenceType, expectation, pendingReview, previousDate, status });
    const shouldSurface = Boolean(
      pendingReview ||
      status === MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_PARTIAL ||
      expectation && status === MORNING_EVIDENCE_RECOVERY_STATUSES.MISSING
    );

    if (!shouldSurface || !actionable) continue;
    evidenceRecoveryItems.push(Object.freeze({
      id: `evidence_recovery_${evidenceType}_${previousDate}`,
      kind: MORNING_RECONCILIATION_ITEM_KINDS.EVIDENCE,
      evidenceType,
      occurrenceDate: previousDate,
      date: previousDate,
      dateLabel: "Yesterday",
      occurrenceKey: actionable.context.recoveryKey,
      expectationKey: actionable.context.recoveryKey,
      status,
      title: copyFor(evidenceType, status).title,
      statusLabel: copyFor(evidenceType, status).statusLabel,
      primaryAction: Object.freeze({
        label: actionable.label,
        href: actionable.href,
      }),
      pendingReviewId: pendingReview?.id ?? null,
      recoveryContext: actionable.context,
    }));
  }

  return Object.freeze({
    executionReconciliationItems: Object.freeze(executionReconciliationItems),
    evidenceRecoveryItems: Object.freeze(evidenceRecoveryItems),
    items: Object.freeze([
      ...executionReconciliationItems,
      ...evidenceRecoveryItems,
    ]),
  });
}

function collectExpectations({
  executionItems,
  previousDate,
  priorityItems,
  protocolVersions,
  protocols,
}) {
  const result = new Map();
  for (const item of priorityItems) {
    const evidenceType = normalizeEvidenceRecoveryType(item.linkedEvidenceType);
    if (!evidenceType) continue;
    result.set(evidenceType, {
      key: item.occurrenceKey,
      source: "scheduled_priority",
    });
  }

  for (const evidenceType of ["activity_day", "nutrition"]) {
    if (hasDailyProtocolExpectation({
      evidenceType,
      previousDate,
      protocols,
      protocolVersions,
    })) {
      result.set(evidenceType, {
        key: `protocol:${evidenceType}:${previousDate}`,
        source: "active_daily_protocol",
      });
    }
  }

  const datedTraining = executionItems.find((item) =>
    isDatedTrainingExpectation(item, previousDate, protocols)
  );
  if (datedTraining) {
    result.set("training", {
      key: `execution:${datedTraining.id}:${previousDate}`,
      source: "dated_execution",
    });
  }
  return result;
}

function hasDailyProtocolExpectation({
  evidenceType,
  previousDate,
  protocols,
  protocolVersions,
}) {
  const matchingRoots = protocols.filter((protocol) => {
    if (protocol?.status !== "active") return false;
    const type = String(protocol.protocolType ?? protocol.category ?? "").toLowerCase();
    return evidenceType === "activity_day"
      ? type === "activity" || protocol.category === "lifestyle"
      : type === "nutrition";
  });
  return matchingRoots.some((root) => {
    const current = protocolVersions.find((item) =>
      item?.id === root.currentVersionId || item?.protocolId === root.id && item?.status === "active"
    );
    const sourceVersionId = root.activationProvenance?.sourceVersionId ??
      current?.change?.previousVersionId ??
      null;
    const source = sourceVersionId
      ? protocolVersions.find((item) => item?.id === sourceVersionId) ?? null
      : null;
    const candidates = Array.isArray(current?.expectations)
      ? [current]
      : [current, source].filter(Boolean);
    return candidates.some((version) =>
      String(version.effectiveAt ?? "0000-00-00").slice(0, 10) <= previousDate &&
      (version.expectations ?? []).some((expectation) => {
      if (expectation.cadence !== "daily") return false;
      const included = (expectation.includedEvidenceTypes ?? [])
        .map(normalizeEvidenceRecoveryType);
      return included.includes(evidenceType);
      })
    );
  });
}

function isDatedTrainingExpectation(item, previousDate, protocols) {
  if (!item?.id || item.active === false || TERMINAL_EXECUTION_STATUSES.has(
    String(item.status ?? "").toLowerCase()
  )) return false;
  const linkedProtocol = protocols.find((protocol) =>
    [item.linkedProtocolId, item.protocolRootId, item.sourceProtocolId]
      .filter(Boolean)
      .includes(protocol.id)
  );
  const type = String(
    item.linkedEvidenceType ?? item.evidenceType ?? item.type ?? linkedProtocol?.protocolType ?? ""
  ).toLowerCase();
  const isTraining = ["training", "training_session", "workout"].includes(type) ||
    linkedProtocol?.category === "training";
  if (!isTraining) return false;
  const explicitDate = [
    item.occurrenceDate,
    item.scheduledDate,
    item.scheduledLocalDate,
    item.date,
    item.scheduledFor,
    item.preferredSchedule?.date,
    item.schedule?.date,
  ].find(Boolean);
  return String(explicitDate ?? "").slice(0, 10) === previousDate;
}

function pendingReviewsByType(reviews, previousDate) {
  const result = new Map();
  const ordered = reviews
    .filter((review) => ACTIVE_REVIEW_STATUSES.has(review.status))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  for (const review of ordered) {
    for (const object of review.interpretedEvidence?.evidence_objects ?? []) {
      if (object.removed === true || review.itemDecisions?.[object.id]?.included === false) continue;
      const evidenceType = normalizeEvidenceRecoveryType(object.evidence_type);
      if (!evidenceType || evidenceDate(object) !== previousDate || result.has(evidenceType)) continue;
      result.set(evidenceType, review);
    }
  }
  return result;
}

function canonicalForDate(objects, evidenceType, previousDate) {
  return objects.filter((object) =>
    normalizeEvidenceRecoveryType(object.evidence_type ?? object.payload?.evidence_type) === evidenceType &&
    evidenceDate(object) === previousDate
  );
}

function classifyStatus({ canonical, evidenceType, pendingReview }) {
  if (pendingReview) return MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION;
  if (!canonical.length) return MORNING_EVIDENCE_RECOVERY_STATUSES.MISSING;
  if (evidenceType === "training" && canonical.every(isPartialTrainingShell)) {
    return MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_PARTIAL;
  }
  if (evidenceType === "nutrition" && canonical.every((item) =>
    resolveNutritionEvidenceCompleteness(item) !== "complete"
  )) {
    return MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_INCOMPLETE;
  }
  return MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_COMPLETE;
}

function isPartialTrainingShell(object) {
  const payload = object.payload ?? object;
  const activityType = String(
    payload.metadata?.activity_type ?? payload.activityType ?? ""
  ).toLowerCase();
  const strength = /strength|resistance|weightlift/.test(activityType);
  return strength && (payload.exercises?.length ?? 0) === 0;
}

function actionFor({ evidenceType, expectation, pendingReview, previousDate, status }) {
  const recoveryKey = expectation?.key ??
    `review:${pendingReview?.id ?? evidenceType}:${previousDate}`;
  const context = createEvidenceRecoveryContext({
    date: previousDate,
    expectedEvidenceType: evidenceType,
    recoveryKey,
    returnTo: EVIDENCE_RECOVERY_RETURN_PATH,
  });
  if (!context) return null;
  if (pendingReview) {
    return {
      context,
      label: "Resume review",
      href: appendEvidenceRecoveryContext(
        `/evidence/review/${pendingReview.id}`,
        context
      ),
    };
  }
  if (status === MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_PARTIAL &&
      evidenceType === "training") {
    return {
      context,
      label: "Add workout details",
      href: appendEvidenceRecoveryContext("/log", context),
    };
  }
  if (status !== MORNING_EVIDENCE_RECOVERY_STATUSES.MISSING) return null;
  const labels = {
    activity_day: "Add Activity",
    nutrition: "Add Nutrition",
    photo_session: "Upload Photos",
    training: "Add Workout",
  };
  return {
    context,
    label: labels[evidenceType],
    href: appendEvidenceRecoveryContext(
      evidenceType === "photo_session" ? "/evidence/photos" : "/log",
      context
    ),
  };
}

function copyFor(evidenceType, status) {
  const labels = {
    activity_day: "Activity",
    nutrition: "Nutrition",
    photo_session: "Progress Photos",
    training: "Workout",
  };
  const title = labels[evidenceType];
  if (status === MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION) {
    return { title, statusLabel: `${title} awaiting confirmation` };
  }
  if (status === MORNING_EVIDENCE_RECOVERY_STATUSES.PRESENT_PARTIAL) {
    return { title, statusLabel: "Workout recorded; details incomplete" };
  }
  const missing = {
    activity_day: "Yesterday’s activity hasn’t been logged",
    nutrition: "Yesterday’s nutrition hasn’t been logged",
    photo_session: "Yesterday’s Progress Photos are still missing",
    training: "Yesterday’s workout hasn’t been logged",
  };
  return { title, statusLabel: missing[evidenceType] };
}

function evidenceDate(value) {
  const payload = value?.payload ?? value ?? {};
  return String(
    payload.observed_at ?? payload.date ?? payload.captureDate ?? payload.capturedAt ??
    value?.lastObservedAt ?? value?.observedAt ?? ""
  ).slice(0, 10);
}
