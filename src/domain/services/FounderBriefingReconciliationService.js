import {
  createBriefingRevisionExecutionService,
} from "./BriefingRevisionExecutionService";
import {
  planAffectedBriefingPublications,
} from "./BriefingAffectedPublicationPlannerService";
import {
  createFounderBriefingReconciliationPersistenceService,
} from "./BriefingReconciliationPersistenceService";
import {
  createFounderMidweekBriefingService,
} from "./MidweekBriefingService";
import {
  createFounderMonthlyBriefingService,
} from "./MonthlyBriefingService";
import {
  createFounderWeeklyNarrativeService,
} from "./WeeklyNarrativeService";

const EXECUTABLE = new Set(["revision_pending", "failed"]);
const MAX_AUTOMATIC_ATTEMPTS = 3;

export function createFounderBriefingReconciliationService({
  repositories,
  now = () => new Date(),
  persistence = createFounderBriefingReconciliationPersistenceService({ now }),
  cadenceServices = null,
} = {}) {
  if (!repositories) {
    throw new Error("Founder briefing reconciliation repositories are required.");
  }
  const services = cadenceServices ?? {
    weekly: createFounderWeeklyNarrativeService({ repositories, now }),
    midweek: createFounderMidweekBriefingService({ repositories, now }),
    monthly: createFounderMonthlyBriefingService({ repositories, now }),
  };
  const execution = createBriefingRevisionExecutionService({
    cadenceServices: services,
    getCurrentPublication: async ({ publicationRootId, userId }) =>
      (await repositories.dailyBriefings.listDailyBriefings(userId))
        .find((item) => item.id === publicationRootId) ?? null,
    validateEligibility: validateCurrentEligibility,
    saveWorkItem: (workItem) => persistence.saveWorkItem(workItem),
    now,
  });

  return Object.freeze({
    async finalizePending({ userId, workItemIds = [] } = {}) {
      const requestedIds = new Set(workItemIds);
      if (!requestedIds.size) return emptyFinalization();
      const workItems = await repositories.briefingReconciliationWorkItems
        .listWorkItems(userId);
      const selected = workItems
        .filter(isExecutable)
        .filter((item) => requestedIds.has(item.id))
        .sort((left, right) =>
          String(left.enqueuedAt).localeCompare(String(right.enqueuedAt))
        )
        .slice(0, 3);
      const results = [];
      for (const workItem of selected) {
        results.push(await execution.execute({ workItem, userId }));
      }
      return Object.freeze({
        attempted: results.length,
        completed: results.filter((result) =>
          ["completed", "completed_no_op"].includes(result.status)
        ).length,
        failed: results.filter((result) => result.status === "failed").length,
        results: Object.freeze(results),
        status: results.some((result) => result.status === "failed")
          ? "completed_with_failures"
          : results.length ? "completed" : "current",
      });
    },
  });
}

function emptyFinalization() {
  return Object.freeze({
    attempted: 0,
    completed: 0,
    failed: 0,
    results: Object.freeze([]),
    status: "current",
  });
}

function validateCurrentEligibility({ publication, workItem }) {
  if (manifestContainsChanges(publication.dependencyManifest,
    workItem.affectedDependencies)) {
    return {
      current: true,
      dependencyManifest: publication.dependencyManifest,
      eligible: true,
    };
  }
  const plan = planAffectedBriefingPublications({
    automatic: false,
    publications: [publication],
    evidenceChanges: workItem.affectedDependencies,
  }).find((candidate) =>
    candidate.publicationRootId === workItem.publicationRootId &&
    candidate.cadence === workItem.cadence
  );
  return plan
    ? { eligible: true, plan }
    : { eligible: false, reason: "dependency_drift_not_found" };
}

function manifestContainsChanges(manifest, dependencies = []) {
  if (!manifest?.canonicalDependencies || !dependencies.length) return false;
  const current = new Map(manifest.canonicalDependencies.map((item) =>
    [item.logicalIdentity, item]
  ));
  return dependencies.every((requested) => {
    const reflected = current.get(requested.logicalIdentity);
    if (!reflected) return false;
    if (reflected.semanticDigest === requested.semanticDigest) return true;
    if (Number.isInteger(reflected.semanticRevision) &&
        Number.isInteger(requested.semanticRevision)) {
      return reflected.semanticRevision > requested.semanticRevision;
    }
    return Boolean(reflected.semanticChangedAt && requested.semanticChangedAt &&
      reflected.semanticChangedAt > requested.semanticChangedAt);
  });
}

function isExecutable(item) {
  if (!EXECUTABLE.has(item.status)) return false;
  if ((item.attempts ?? 0) >= MAX_AUTOMATIC_ATTEMPTS) return false;
  return item.status !== "failed" || item.failure?.retryable !== false;
}
