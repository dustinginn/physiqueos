import {
  createCanonicalEvidenceSemanticDescriptor,
} from "./BriefingDependencyManifestService";
import {
  planAffectedBriefingPublications,
} from "./BriefingAffectedPublicationPlannerService";
import {
  enqueueBriefingReconciliationWorkItems,
} from "./BriefingReconciliationWorkItemService";
import {
  resolveCurrentPublishedBriefing,
} from "./CurrentPublishedBriefingService";
import {
  resolveCoachingUpdatesReadModel,
} from "./CoachingUpdatesReadService";

const CADENCE_REVISIONS = new Set(["weekly", "midweek", "monthly"]);
const PENDING_COMMIT_ID = "pending_source_commit";

export function createBriefingReconciliationEnqueueService({
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    stageCanonicalEvidenceChanges(candidate, {
      canonicalChanges = [],
      confirmedAt = now().toISOString(),
      sourceEvidencePackageId = null,
      sourceReviewId = null,
      userId = null,
    } = {}) {
      const publications = candidate.dailyBriefings ?? [];
      const directChanges = canonicalChanges
        .filter(isActiveCanonicalEvidence)
        .map((record) => descriptorWithConfirmation(record, {
          confirmedAt,
          pendingSourceCommit: true,
          sourceEvidencePackageId,
          sourceReviewId,
        }))
        .filter(Boolean);
      if (!directChanges.length || !publications.length) {
        return emptyResult(candidate.briefingReconciliationWorkItems);
      }

      const currentPublication = resolveCurrentPublishedBriefing({
        publications,
        at: new Date(confirmedAt),
        timeZone: resolveTimeZone(candidate, userId, publications),
        coachingUpdates: resolveCoachingUpdates(candidate, userId),
      });
      if (!currentPublication) {
        return emptyResult(candidate.briefingReconciliationWorkItems);
      }
      const currentPublications = [currentPublication];

      const directPlans = cadencePlans(planAffectedBriefingPublications({
        publications: currentPublications,
        evidenceChanges: directChanges,
        confirmedAt,
      }));
      if (!directPlans.length) {
        return emptyResult(candidate.briefingReconciliationWorkItems);
      }

      // A legacy publication has no dependency manifest to compare against.
      // On its first post-deployment confirmation, include other canonical
      // dependencies that demonstrably changed after publication inside the
      // same following-day grace window. This makes the compatibility revision
      // complete without mutating anything merely because code was deployed.
      const legacyRoots = new Set(directPlans
        .filter((plan) => plan.driftReason === "legacy_manifest_missing")
        .map((plan) => plan.publicationRootId));
      const compatibilityChanges = legacyRoots.size
        ? collectLegacyCompatibilityChanges({
            candidate,
            directChanges,
            legacyRoots,
            publications: currentPublications,
          })
        : [];
      const evidenceChanges = coalesceDescriptors([
        ...directChanges,
        ...compatibilityChanges,
      ]);
      const plans = cadencePlans(planAffectedBriefingPublications({
        publications: currentPublications,
        evidenceChanges,
        confirmedAt,
      })).filter((plan) => directPlans.some((direct) =>
        direct.publicationRootId === plan.publicationRootId
      ));
      const existingItems = candidate.briefingReconciliationWorkItems ?? [];
      const workItems = enqueueBriefingReconciliationWorkItems({
        existingItems,
        plans,
        enqueuedAt: confirmedAt,
      });
      candidate.briefingReconciliationWorkItems = workItems
        .map((item) => structuredClone(item));
      const changedIds = changedWorkItemIds(existingItems, workItems);

      return Object.freeze({
        affectedPublicationIds: plans.map((plan) => plan.publicationRootId),
        changed: changedIds.length > 0,
        plans,
        workItemIds: changedIds,
        workItems,
        userId,
      });
    },

    stampSourceCommit(candidate, commitId) {
      if (!commitId) return;
      candidate.briefingReconciliationWorkItems =
        (candidate.briefingReconciliationWorkItems ?? []).map((item) => {
        const sourceCommitLinks = (item.sourceCommitLinks ?? []).map((link) =>
          link === PENDING_COMMIT_ID ? commitId : link
        );
        const affectedDependencies = (item.affectedDependencies ?? [])
          .map((dependency) => ({
            ...dependency,
            sourceLinkage: dependency.sourceLinkage?.commitId === PENDING_COMMIT_ID
              ? { ...dependency.sourceLinkage, commitId }
              : dependency.sourceLinkage,
          }));
        const changed = sourceCommitLinks.some((link, index) =>
          link !== item.sourceCommitLinks?.[index]
        ) || affectedDependencies.some((dependency, index) =>
          dependency.sourceLinkage !== item.affectedDependencies?.[index]
            ?.sourceLinkage
        );
        return changed
          ? { ...item, sourceCommitLinks, affectedDependencies }
          : item;
      });
    },
  });
}

function resolveCoachingUpdates(candidate, userId) {
  const protocol = (candidate.protocols ?? []).find((item) =>
    item.status === "active" &&
    (item.protocolType ?? item.category) === "briefings" &&
    (!userId || !item.userId || item.userId === userId)
  );
  const version = (candidate.protocolVersions ?? []).find((item) =>
    item.id === protocol?.currentVersionId
  );
  const goal = (candidate.goals ?? []).find((item) =>
    item.status === "active" && (!userId || !item.userId || item.userId === userId)
  );
  const user = candidate.user?.id === userId
    ? candidate.user
    : (candidate.users ?? []).find((item) => item.id === userId);
  return resolveCoachingUpdatesReadModel({
    protocol,
    version,
    goal,
    timeZone: user?.timeZone ?? user?.timezone,
  });
}

function resolveTimeZone(candidate, userId, publications) {
  const user = candidate.user?.id === userId
    ? candidate.user
    : (candidate.users ?? []).find((item) => item.id === userId);
  return user?.timeZone ?? user?.timezone ??
    publications.find((item) => item.userId === userId)?.evidenceWindow?.timeZone ??
    "America/Los_Angeles";
}

function collectLegacyCompatibilityChanges({
  candidate,
  directChanges,
  legacyRoots,
  publications,
}) {
  const directIdentities = new Set(directChanges.map((item) => item.logicalIdentity));
  const eligiblePublications = publications.filter((publication) =>
    legacyRoots.has(publication.id)
  );
  return (candidate.canonicalEvidenceObjects ?? [])
    .filter(isActiveCanonicalEvidence)
    .map((record) => {
      const descriptor = descriptorWithConfirmation(record, {
        confirmedAt: semanticChangedAt(record),
        pendingSourceCommit: false,
        sourceEvidencePackageId: null,
        sourceReviewId: null,
      });
      if (!descriptor || directIdentities.has(descriptor.logicalIdentity)) return null;
      return cadencePlans(planAffectedBriefingPublications({
        publications: eligiblePublications,
        evidenceChanges: [descriptor],
        confirmedAt: descriptor.confirmedAt,
      })).length ? descriptor : null;
    })
    .filter(Boolean);
}

function descriptorWithConfirmation(record, {
  confirmedAt,
  pendingSourceCommit = true,
  sourceEvidencePackageId,
  sourceReviewId,
}) {
  const descriptor = createCanonicalEvidenceSemanticDescriptor({
    ...record,
    ...(pendingSourceCommit ? { commitId: PENDING_COMMIT_ID } : {}),
    sourceEvidencePackageId,
    sourceReviewId,
  });
  const timestamp = isoOrNull(confirmedAt ?? descriptor?.semanticChangedAt);
  if (!descriptor || !timestamp) return null;
  return Object.freeze({
    ...descriptor,
    confirmedAt: timestamp,
    sourceLinkage: Object.freeze({
      ...(descriptor.sourceLinkage ?? {}),
      ...(pendingSourceCommit ? { commitId: PENDING_COMMIT_ID } : {}),
      ...(sourceEvidencePackageId ? { sourceEvidencePackageId } : {}),
      ...(sourceReviewId ? { sourceReviewId } : {}),
    }),
  });
}

function cadencePlans(plans) {
  return plans.filter((plan) => CADENCE_REVISIONS.has(plan.cadence));
}

function coalesceDescriptors(descriptors) {
  const byIdentity = new Map();
  for (const descriptor of descriptors) {
    const prior = byIdentity.get(descriptor.logicalIdentity);
    if (!prior || String(prior.semanticChangedAt ?? "") <=
      String(descriptor.semanticChangedAt ?? "")) {
      byIdentity.set(descriptor.logicalIdentity, descriptor);
    }
  }
  return [...byIdentity.values()];
}

function changedWorkItemIds(before = [], after = []) {
  const prior = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  return after.filter((item) => prior.get(item.id) !== JSON.stringify(item))
    .map((item) => item.id);
}

function semanticChangedAt(record) {
  return record.nutritionRevision?.replacedAt ?? record.updatedAt ??
    record.createdAt ?? record.payload?.updatedAt ?? record.payload?.createdAt ?? null;
}

function isActiveCanonicalEvidence(record) {
  return record?.quality?.status !== "superseded" &&
    record?.payload?.quality?.status !== "superseded";
}

function isoOrNull(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function emptyResult(items = []) {
  return Object.freeze({
    affectedPublicationIds: [],
    changed: false,
    plans: [],
    workItemIds: [],
    workItems: Object.freeze((items ?? []).map((item) => structuredClone(item))),
  });
}
