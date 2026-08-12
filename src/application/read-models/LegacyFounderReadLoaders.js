import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createEvidenceReviewPresentation } from "../../domain/services/EvidenceReviewPresentationService.js";
import { createPriorityDetailService } from "../../domain/services/PriorityDetailService.js";
import { createProgressReportingService } from "../../domain/services/ProgressReportingService.js";
import { resolveActiveGoalConfidencePresentation } from "../../domain/services/ActiveGoalConfidencePresentationReadService.js";
import { createYouProfileService } from "../../domain/services/YouProfileService.js";
import { createBriefingReadService } from "../briefings/BriefingReadService.js";
import { createGoalsHubReadService } from "../goals/GoalsHubReadService.js";
import { createLogReadService } from "../log/LogReadService.js";
import { createOperatingPlanReadService } from "../plan/OperatingPlanReadService.js";
import { Phase3ReadModel } from "./Phase3ReadModelService.js";
import { createTrainingReadService } from "../training/TrainingReadService.js";

export function createLegacyFounderReadLoaders({ repositories, readRuntimeStore, now = () => new Date() } = {}) {
  const goals = createGoalsHubReadService({ repositories, readRuntimeStore });
  const plan = createOperatingPlanReadService({ repositories });
  const log = createLogReadService({ repositories, now });
  const briefings = createBriefingReadService({ repositories });
  const training = createTrainingReadService({ repositories });
  const progress = createProgressReportingService({ repositories });
  const profile = createYouProfileService({ repositories });
  const home = createHomeBriefingService({ repositories, readRuntimeStore });
  return Object.freeze({
    [Phase3ReadModel.HOME]: ({ principal }) => home.getHomeBriefing(principal.userId),
    [Phase3ReadModel.LOG]: ({ principal, timeZone }) => log.getLog({ principal, timeZone }),
    [Phase3ReadModel.EVIDENCE_REVIEW]: async ({ principal, reviewId }) => {
      const review = await repositories.evidenceReviews.getReviewById(reviewId);
      if (!review || review.userId !== principal.userId) return null;
      return { id: review.id, status: review.status, version: String(review.version ?? review.updatedAt ?? "1"), ...createEvidenceReviewPresentation({ evidencePackage: review.interpretedEvidence, itemDecisions: review.itemDecisions }) };
    },
    [Phase3ReadModel.GOALS]: ({ principal }) => goals.getGoalsHub({ principal }),
    [Phase3ReadModel.OPERATING_PLAN]: ({ principal }) => plan.getOperatingPlan({ principal }),
    [Phase3ReadModel.PRIORITIES]: ({ principal, priorityId }) => createPriorityDetailService({ repositories, now }).getPriorityDetail(priorityId, principal.userId),
    [Phase3ReadModel.PROGRESS]: ({ principal, streamId = null }) => streamId ? progress.getPlaceholderReport(streamId, principal.userId) : progress.getProgressHub(principal.userId),
    [Phase3ReadModel.CONFIDENCE]: async ({ principal }) => { const activeGoal = await repositories.goals.getActiveGoal(principal.userId); return activeGoal ? resolveActiveGoalConfidencePresentation({ activeGoal, store: readRuntimeStore() }) : null; },
    [Phase3ReadModel.BRIEFINGS]: ({ principal, briefingId = null, limit }) => briefingId ? briefings.getBriefing({ principal, briefingId }) : briefings.listBriefings({ principal, limit }),
    [Phase3ReadModel.TRAINING]: ({ principal, sessionId = null, limit }) => sessionId ? training.getSession({ principal, sessionId }) : training.listHistory({ principal, limit }),
    [Phase3ReadModel.PROFILE]: ({ principal }) => profile.getYouProfile(principal.userId),
  });
}
