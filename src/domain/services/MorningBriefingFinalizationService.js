import {
  createFounderBriefingReconciliationService,
} from "./FounderBriefingReconciliationService";
import {
  createMorningPriorityReconciliationService,
} from "./MorningPriorityReconciliationService";
import {
  MORNING_EVIDENCE_RECOVERY_STATUSES,
} from "./MorningEvidenceRecoveryService";
import {
  resolveCurrentPublishedBriefing,
} from "./CurrentPublishedBriefingService";
import {
  createCoachingUpdatesReadService,
} from "./CoachingUpdatesReadService";

export function createMorningBriefingFinalizationService({
  priorityService,
  createBriefingService,
  listPublications,
  listWorkItems,
  getCoachingUpdates = async () => null,
} = {}) {
  if (!priorityService || !createBriefingService || !listPublications ||
      !listWorkItems) {
    throw new Error("Morning briefing finalization services are required.");
  }

  return Object.freeze({
    async finalize({ userId, timeZone, at }) {
      const selection = await priorityService.getSelection({
        userId,
        timeZone,
        at,
      });
      const waiting = selection.evidenceRecoveryItems.some((item) =>
        item.status ===
          MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION
      );

      if (waiting) {
        return Object.freeze({
          status: "waiting",
          evidenceDate: selection.window.previousLocalDate,
          attempted: 0,
          completed: 0,
          failed: 0,
          results: Object.freeze([]),
        });
      }

      const [publications, workItems, coachingUpdates] = await Promise.all([
        listPublications(userId),
        listWorkItems(userId),
        getCoachingUpdates(userId),
      ]);
      const currentPublication = resolveCurrentPublishedBriefing({
        publications,
        at,
        timeZone,
        coachingUpdates,
      });
      const workItemIds = currentPublication
        ? selectCurrentWorkItemIds({
            evidenceDate: selection.window.previousLocalDate,
            publicationRootId: currentPublication.id,
            workItems,
          })
        : [];
      if (!workItemIds.length) {
        return Object.freeze({
          status: "current",
          evidenceDate: selection.window.previousLocalDate,
          attempted: 0,
          completed: 0,
          failed: 0,
          results: Object.freeze([]),
        });
      }
      const result = await createBriefingService().finalizePending({
        userId,
        workItemIds,
      });

      return Object.freeze({
        ...result,
        evidenceDate: selection.window.previousLocalDate,
        status: result.failed > 0
          ? "failed"
          : result.attempted > 0
            ? "completed"
            : "current",
      });
    },
  });
}

export function createFounderMorningBriefingFinalizationService({
  repositories,
  now = () => new Date(),
} = {}) {
  return createMorningBriefingFinalizationService({
    priorityService: createMorningPriorityReconciliationService({
      repositories,
      now,
    }),
    listPublications: (userId) =>
      repositories.dailyBriefings.listDailyBriefings(userId),
    listWorkItems: (userId) =>
      repositories.briefingReconciliationWorkItems.listWorkItems(userId),
    getCoachingUpdates: (userId) =>
      createCoachingUpdatesReadService({ repositories }).getCurrent({ userId }),
    createBriefingService: () => createFounderBriefingReconciliationService({
      repositories, now,
    }),
  });
}

function selectCurrentWorkItemIds({
  evidenceDate,
  publicationRootId,
  workItems = [],
}) {
  return workItems
    .filter((item) => item.publicationRootId === publicationRootId)
    .filter((item) => ["revision_pending", "failed"].includes(item.status))
    .filter((item) => item.status !== "failed" ||
      item.failure?.retryable !== false)
    .filter((item) => item.affectedDependencies?.some((dependency) =>
      dependency.observedDate === evidenceDate
    ))
    .sort((left, right) =>
      String(left.enqueuedAt).localeCompare(String(right.enqueuedAt))
    )
    .slice(0, 3)
    .map((item) => item.id);
}
