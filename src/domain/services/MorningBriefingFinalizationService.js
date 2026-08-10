import {
  createFounderBriefingReconciliationService,
} from "./FounderBriefingReconciliationService";
import {
  createMorningPriorityReconciliationService,
} from "./MorningPriorityReconciliationService";
import {
  MORNING_EVIDENCE_RECOVERY_STATUSES,
} from "./MorningEvidenceRecoveryService";

export function createMorningBriefingFinalizationService({
  priorityService,
  briefingService,
} = {}) {
  if (!priorityService || !briefingService) {
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

      const result = await briefingService.finalizePending({
        userId,
        evidenceDate: selection.window.previousLocalDate,
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
    briefingService: createFounderBriefingReconciliationService({
      repositories,
      now,
    }),
  });
}
