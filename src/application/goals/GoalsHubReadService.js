import { GoalEvaluationService } from "../../domain/services/GoalEvaluationService.js";
import { GoalIntelligenceService } from "../../domain/services/GoalIntelligenceService.js";
import { createTrainingPerformanceIntelligenceReport } from "../../domain/services/TrainingPerformanceIntelligenceService.js";
import { safelyGetProductionGoalTransitionEntryPointState } from "../../domain/services/ProductionGoalTransitionEntryPointService.js";
import { resolveGoalNavigationHref } from "../../domain/services/GoalNavigationRouteResolver.js";
import { composeCompletedGoalPreview } from "../../domain/services/CompletedGoalPreviewService.js";
import { resolveActiveGoalConfidencePresentation } from "../../domain/services/ActiveGoalConfidencePresentationReadService.js";
import { resolveCommittedPhaseContext } from "../../domain/services/FounderPhaseCorrectionService.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";
import { scopeRepositoryReadService } from "../read-models/RepositoryReadScope.js";

const COMPLETED_GOAL_ID = "goal_visible_abs_at_rest";

export function createGoalsHubReadService({ repositories, readRuntimeStore } = {}) {
  return scopeRepositoryReadService({ repositories, namespace: "goals", service: Object.freeze({
    async getGoalsHub({ principal } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const [goals, activeGoal, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext, analyses, canonicalEvidence, briefings] = await Promise.all([
        repositories.goals.listGoals(actor.userId),
        repositories.goals.getActiveGoal(actor.userId),
        repositories.dexaScans.listDEXAScans(actor.userId),
        repositories.weights.listWeightEntries(actor.userId),
        repositories.progressPhotos.listPhotos(actor.userId),
        repositories.protocols.listActiveProtocols(actor.userId),
        repositories.nutritionContext.getNutritionContext(actor.userId),
        repositories.analyses.listAnalyses(),
        repositories.canonicalEvidence.listCanonicalEvidenceObjects(actor.userId),
        repositories.dailyBriefings.listDailyBriefings(actor.userId),
      ]);
      const trainingPerformance = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence });
      const evaluations = GoalEvaluationService.getGoalEvaluations({ goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext, photoAnalyses: analyses, trainingPerformance });
      const intelligence = GoalIntelligenceService.getGoalIntelligence({ evaluations, activeGoal });
      const runtimeStore = readRuntimeStore();
      const canonicalConfidence = activeGoal?.type === "build_lean_mass"
        ? resolveActiveGoalConfidencePresentation({ activeGoal, store: runtimeStore })
        : null;
      const summaries = intelligence.goals.map((summary) => mapGoalSummary(
        summary,
        evaluations.find((item) => item.goalId === summary.id),
        goals.find((goal) => goal.id === summary.id),
        summary.id === activeGoal?.id ? canonicalConfidence : null
      ));
      const completedGoal = goals.find((goal) => goal.id === COMPLETED_GOAL_ID && goal.status === "completed");
      const completed = completedGoal
        ? composeCompletedGoalPreview({ goals, dexaScans, progressPhotos, briefings, currentGoal: activeGoal })
        : null;
      return Object.freeze({
        activeGoals: Object.freeze(summaries.filter((goal) => goal.id === activeGoal?.id)),
        completedGoals: Object.freeze(completed ? [{
          id: completed.preview.canonicalGoalId,
          title: completed.hero.title,
          status: completed.hero.status,
          dates: completed.hero.dates,
          achievement: completed.hero.achievement,
          href: "/goals/visible-abs",
        }] : []),
        transitionEntry: safelyGetProductionGoalTransitionEntryPointState(structuredClone(runtimeStore)),
      });
    },
  }) });
}

export function mapGoalSummary(summary, evaluation, sourceGoal, canonicalConfidence) {
  const navigation = resolveGoalNavigationHref({
    id: summary.id,
    type: sourceGoal?.type,
    goalType: sourceGoal?.goalType,
    title: summary.title,
    lifecycleState: summary.lifecycleState,
    status: sourceGoal?.status,
  });
  const phase = sourceGoal?.phases?.length ? resolveCommittedPhaseContext(sourceGoal).activePhase : null;
  return Object.freeze({
    ...summary,
    status: "active",
    title: normalizeGoalTitle(summary.title),
    confidence: Number.isFinite(canonicalConfidence?.value) ? {
      value: canonicalConfidence.value,
      band: canonicalConfidence.band,
      source: canonicalConfidence.source,
      explanation: canonicalConfidence.explanation ?? canonicalConfidence.rationale ?? null,
    } : null,
    goalType: sourceGoal?.type ?? sourceGoal?.goalType ?? null,
    navigation,
    phase: phase ? {
      id: phase.id, name: phase.name, status: phase.status, startedAt: phase.startedAt,
      plannedReviewAt: phase.plannedReviewAt,
      reviewState: phase.effectiveReviewState ?? phase.reviewState,
    } : null,
    statusLabel: normalizeJourneyState(summary.primary ? evaluation?.projection?.completionStageLabel ?? "On Track" : summary.presentation?.status ?? summary.current),
    visualKind: summary.id === COMPLETED_GOAL_ID ? "target" : "compass",
    visualTone: summary.id === COMPLETED_GOAL_ID ? "primary" : "evidence",
  });
}

function normalizeGoalTitle(title) {
  return ({ "Visible Abs": "Visible Abs at Rest", Maintenance: "Maintain 8-9%", "Lean Mass": "Preserve Lean Mass" })[title] ?? title;
}

function normalizeJourneyState(state) {
  return ({
    "Visual confirmation developing": "Visual Confirmation Developing",
    "Entering target range": "Entering Target Range",
    "Entering Target Range": "Entering Target Range",
    Stable: "Stable",
    "Final Stage": "Final Stage",
  })[state] ?? state;
}
