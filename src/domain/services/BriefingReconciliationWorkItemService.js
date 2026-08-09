import { createHash } from "node:crypto";
import { stableSerialize } from
  "../../data/repositories/DailyBriefingHistory";

export const BRIEFING_RECONCILIATION_WORK_ITEM_VERSION =
  "briefing_reconciliation_work_item_v1";

export const BriefingReconciliationState = Object.freeze({
  CURRENT: "current",
  REVISION_PENDING: "revision_pending",
  REVISING: "revising",
  CURRENT_AFTER_REVISION: "current_after_revision",
  FAILED: "failed",
});

export function enqueueBriefingReconciliationWorkItems({
  existingItems = [],
  plans = [],
  enqueuedAt = new Date().toISOString(),
} = {}) {
  const items = existingItems.map((item) => structuredClone(item));
  for (const plan of plans.filter((item) => item?.eligible)) {
    const identityFingerprint = fingerprint({
      publicationRootId: plan.publicationRootId,
      occurrenceIdentity: plan.occurrenceIdentity,
      cadence: plan.cadence,
    });
    const id = `briefing_reconciliation|${identityFingerprint.slice(7, 31)}`;
    const index = items.findIndex((item) => item.id === id &&
      ![BriefingReconciliationState.CURRENT_AFTER_REVISION,
        BriefingReconciliationState.CURRENT].includes(item.status));
    const prior = index >= 0 ? items[index] : null;
    const affected = coalesceDependencies([
      ...(prior?.affectedDependencies ?? []),
      ...(plan.affectedDependencies ?? []),
    ]);
    const next = {
      schemaVersion: BRIEFING_RECONCILIATION_WORK_ITEM_VERSION,
      id,
      publicationRootId: plan.publicationRootId,
      occurrenceIdentity: plan.occurrenceIdentity,
      cadence: plan.cadence,
      reason: plan.reason,
      status: BriefingReconciliationState.REVISION_PENDING,
      stableIdentityFingerprint: identityFingerprint,
      inputFingerprint: fingerprint(affected.map((item) => ({
        logicalIdentity: item.logicalIdentity,
        semanticDigest: item.semanticDigest,
      }))),
      sourceDependencyFingerprint: plan.currentDependencyFingerprint ?? null,
      affectedDependencies: affected,
      sourceCommitLinks: unique(affected.flatMap((item) =>
        [item.sourceLinkage?.commitId].filter(Boolean))),
      attempts: prior?.attempts ?? 0,
      enqueuedAt: prior?.enqueuedAt ?? enqueuedAt,
      updatedAt: enqueuedAt,
      startedAt: null,
      completedAt: null,
      failure: null,
      result: null,
    };
    if (index >= 0) items.splice(index, 1, next);
    else items.push(next);
  }
  return Object.freeze(items.map(freeze));
}

export function beginBriefingReconciliation(item, startedAt) {
  assertWorkItem(item);
  if (![BriefingReconciliationState.REVISION_PENDING,
    BriefingReconciliationState.FAILED].includes(item.status)) {
    throw new Error("Only pending or failed briefing reconciliation can begin.");
  }
  return freeze({
    ...structuredClone(item),
    status: BriefingReconciliationState.REVISING,
    attempts: (item.attempts ?? 0) + 1,
    startedAt,
    updatedAt: startedAt,
    failure: null,
  });
}

export function completeBriefingReconciliation(item, {
  completedAt,
  publicationArtifactId,
  dependencyManifestFingerprint = null,
  noOp = false,
} = {}) {
  assertWorkItem(item);
  return freeze({
    ...structuredClone(item),
    status: BriefingReconciliationState.CURRENT_AFTER_REVISION,
    updatedAt: completedAt,
    completedAt,
    failure: null,
    result: {
      publicationArtifactId,
      dependencyManifestFingerprint,
      noOp,
    },
  });
}

export function failBriefingReconciliation(item, error, failedAt) {
  assertWorkItem(item);
  return freeze({
    ...structuredClone(item),
    status: BriefingReconciliationState.FAILED,
    updatedAt: failedAt,
    failure: {
      code: error?.code ?? "briefing_revision_failed",
      message: String(error?.message ?? error),
      retryable: true,
      failedAt,
    },
  });
}

function coalesceDependencies(items) {
  const byIdentity = new Map();
  for (const item of items) {
    const existing = byIdentity.get(item.logicalIdentity);
    if (!existing || String(existing.semanticChangedAt ?? "") <=
      String(item.semanticChangedAt ?? "")) {
      byIdentity.set(item.logicalIdentity, structuredClone(item));
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.logicalIdentity.localeCompare(right.logicalIdentity));
}

function assertWorkItem(item) {
  if (item?.schemaVersion !== BRIEFING_RECONCILIATION_WORK_ITEM_VERSION) {
    throw new Error("Invalid briefing reconciliation work item.");
  }
}

function fingerprint(value) {
  return `sha256_${createHash("sha256").update(stableSerialize(value)).digest("hex")}`;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
