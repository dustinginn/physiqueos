import { createHash } from "node:crypto";
import { stableSerialize } from
  "../../data/repositories/DailyBriefingHistory";

export const BRIEFING_RECONCILIATION_WORK_ITEM_VERSION =
  "briefing_reconciliation_work_item_v1";
export const BRIEFING_RECONCILIATION_CLAIM_LEASE_MS = 15 * 60 * 1000;

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
    const index = items.findIndex((item) => item.id === id);
    const prior = index >= 0 ? items[index] : null;
    const reopening = [BriefingReconciliationState.CURRENT_AFTER_REVISION,
      BriefingReconciliationState.CURRENT].includes(prior?.status);
    const affected = coalesceDependencies([
      ...(reopening ? [] : prior?.affectedDependencies ?? []),
      ...(plan.affectedDependencies ?? []),
    ]);
    const next = {
      schemaVersion: BRIEFING_RECONCILIATION_WORK_ITEM_VERSION,
      id,
      publicationRootId: plan.publicationRootId,
      userId: plan.userId ?? prior?.userId ?? null,
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
      attempts: reopening ? 0 : prior?.attempts ?? 0,
      enqueuedAt: reopening ? enqueuedAt : prior?.enqueuedAt ?? enqueuedAt,
      updatedAt: enqueuedAt,
      startedAt: null,
      completedAt: null,
      failure: null,
      result: null,
      completionHistory: prior?.result
        ? [...(prior.completionHistory ?? []), {
            completedAt: prior.completedAt,
            result: structuredClone(prior.result),
          }]
        : prior?.completionHistory ?? [],
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

export function resumeBriefingReconciliation(item, resumedAt, {
  claimLeaseMs = BRIEFING_RECONCILIATION_CLAIM_LEASE_MS,
} = {}) {
  assertWorkItem(item);
  if (item.status !== BriefingReconciliationState.REVISING ||
      !isBriefingReconciliationClaimAvailable(item, {
        at: resumedAt,
        claimLeaseMs,
      })) {
    const error = new Error(
      "Only an expired briefing reconciliation claim can resume."
    );
    error.code = "briefing_reconciliation_claim_active";
    throw error;
  }
  return freeze({
    ...structuredClone(item),
    updatedAt: resumedAt,
    failure: null,
  });
}

export function isBriefingReconciliationClaimAvailable(item, {
  at = new Date(),
  claimLeaseMs = BRIEFING_RECONCILIATION_CLAIM_LEASE_MS,
  maxAttempts = 3,
} = {}) {
  if (!item || (item.attempts ?? 0) >= maxAttempts) return false;
  if (item.status === BriefingReconciliationState.REVISION_PENDING) return true;
  if (item.status === BriefingReconciliationState.FAILED) {
    return item.failure?.retryable !== false;
  }
  if (item.status !== BriefingReconciliationState.REVISING) return false;
  const claimedAt = Date.parse(item.updatedAt ?? item.startedAt);
  const evaluatedAt = Date.parse(at);
  return Number.isFinite(claimedAt) && Number.isFinite(evaluatedAt) &&
    evaluatedAt - claimedAt >= claimLeaseMs;
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
      retryable: !PERMANENT_FAILURE_CODES.has(error?.code),
      failedAt,
    },
  });
}

const PERMANENT_FAILURE_CODES = new Set([
  "cadence_revision_unavailable",
  "publication_not_current",
  "revision_no_longer_eligible",
]);

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
