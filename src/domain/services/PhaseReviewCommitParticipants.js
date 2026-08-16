import {
  CanonicalGoalPhaseStatus,
  PhaseReviewState,
  canonicalPhaseRevision,
  isActivePhaseStatus,
} from "../models/canonicalGoalPhase";
import { PhaseReviewUserDecision } from "../models/phaseReviewDecision";
import { ProtocolVersionStatus } from "../models/protocolVersion";
import { createPhaseReviewMilestone } from "../models/phaseReviewMilestone";
import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { validatePhaseStrategy } from "../models/phaseStrategy";
import { validatePhaseExpectedTrajectory } from "../models/phaseExpectedTrajectory";
import { resolvePhaseTransitionDate } from "./PhaseTransitionDatePolicy";
import { createPhase2StartingForecastInputPackage } from
  "./Phase2StartingForecastInputPackageService";

export const PhaseReviewParticipantName = Object.freeze({
  PHASE_REVIEW: "phase_review",
  GOAL: "goal",
  CURRENT_PHASE: "current_phase",
  NEXT_PHASE: "next_phase",
  STRATEGY: "strategy",
  EXPECTED_TRAJECTORY: "expected_trajectory",
  EXECUTION_TARGETS: "execution_targets",
  STARTING_FORECAST: "starting_forecast",
  READ_MODELS: "read_models",
});

export const PHASE_REVIEW_PARTICIPANT_ORDER = Object.freeze([
  PhaseReviewParticipantName.PHASE_REVIEW,
  PhaseReviewParticipantName.GOAL,
  PhaseReviewParticipantName.CURRENT_PHASE,
  PhaseReviewParticipantName.NEXT_PHASE,
  PhaseReviewParticipantName.STRATEGY,
  PhaseReviewParticipantName.EXPECTED_TRAJECTORY,
  PhaseReviewParticipantName.EXECUTION_TARGETS,
  PhaseReviewParticipantName.STARTING_FORECAST,
  PhaseReviewParticipantName.READ_MODELS,
]);

export function createCanonicalPhaseReviewParticipants({
  forecastFinalizer = createBriefingForecastFinalizer({ publicationService: null }),
  acceptanceService = null,
} = {}) {
  return Object.freeze([
    participant(PhaseReviewParticipantName.PHASE_REVIEW, {
      prepare: ({ decision }) => structuredClone(decision),
      validate: ({ prepared }) => Boolean(prepared.decisionId && prepared.idempotencyKey),
      commit: ({ stagedState, prepared }) => {
        stagedState.phaseReviewDecisions ??= [];
        stagedState.phaseReviewDecisions.push(structuredClone(prepared));
      },
    }),
    participant(PhaseReviewParticipantName.GOAL, {
      prepare: ({ baseline, decision }) => {
        const goal = activeGoal(baseline, decision.goalId);
        return { goalId: goal.id, before: structuredClone(goal) };
      },
      validate: ({ prepared, decision }) => prepared.goalId === decision.goalId,
      commit: ({ stagedState, decision, preparedByName }) => {
        const goal = activeGoal(stagedState, decision.goalId);
        if (isBegin(decision)) {
          goal.currentPhaseId = decision.nextPhaseId;
          goal.projectedNextPhaseId = null;
          goal.timeline = {
            ...goal.timeline,
            currentPhaseId: decision.nextPhaseId,
            currentPhaseStartedAt: effectiveStart(decision),
            projectedNextPhaseStart: null,
          };
        } else {
          const next = preparedByName.get(PhaseReviewParticipantName.NEXT_PHASE);
          goal.currentPhaseId = decision.currentPhaseId;
          goal.projectedNextPhaseId = next.phaseId;
          goal.timeline = {
            ...goal.timeline,
            currentPhaseId: decision.currentPhaseId,
            plannedReviewAt: decision.selectedReviewAt,
            projectedNextPhaseStart: decision.selectedReviewAt,
          };
        }
        goal.updatedAt = decision.decidedAt;
      },
    }),
    participant(PhaseReviewParticipantName.CURRENT_PHASE, {
      prepare: ({ baseline, decision }) => {
        const phase = phaseById(activeGoal(baseline, decision.goalId), decision.currentPhaseId);
        if (!isActivePhaseStatus(phase.status)) fail("CURRENT_PHASE_INACTIVE", "The reviewed phase is not active.");
        if (phase.status !== decision.expectedCurrentPhaseStatus ||
            canonicalPhaseRevision(phase) !== decision.expectedCurrentPhaseRevision) {
          fail("EXPECTED_PHASE_MISMATCH", "The reviewed phase revision or status changed.");
        }
        const originalReview = phase.originalPlannedReviewAt ??
          phase.reviewMilestone?.originatingMilestoneAt ??
          phase.reviewMilestone?.plannedAt ?? phase.plannedReviewAt;
        if (originalReview !== decision.originalPlannedReviewAt) {
          fail("PLANNED_REVIEW_MISMATCH", "The original planned review changed.");
        }
        if (!isBegin(decision) && decision.selectedReviewAt <= phase.plannedReviewAt) {
          fail("EXTENSION_REVIEW_NOT_LATER", "An extension must move the current planned review forward.");
        }
        return { phaseId: phase.id, before: structuredClone(phase) };
      },
      validate: ({ prepared, decision }) => prepared.phaseId === decision.currentPhaseId,
      commit: ({ stagedState, decision }) => {
        const phase = phaseById(activeGoal(stagedState, decision.goalId), decision.currentPhaseId);
        if (isBegin(decision)) {
          phase.status = CanonicalGoalPhaseStatus.COMPLETED;
          phase.completedAt = decision.decidedAt;
          phase.lastReviewedAt = decision.decidedAt;
          phase.reviewState = PhaseReviewState.DECISION_COMMITTED;
          phase.completionDecisionId = decision.decisionId;
          if (phase.reviewMilestone) phase.reviewMilestone = {
            ...phase.reviewMilestone, consumed: true,
            resolvedReviewId: decision.decisionId,
            revision: Number(phase.reviewMilestone.revision ?? 0) + 1,
          };
        } else {
          phase.status = CanonicalGoalPhaseStatus.ACTIVE;
          phase.originalPlannedReviewAt ??= decision.originalPlannedReviewAt;
          const priorMilestone = phase.reviewMilestone ?? legacyMilestone(phase, decision);
          phase.reviewMilestoneHistory ??= [];
          phase.reviewMilestoneHistory.push({ ...structuredClone(priorMilestone),
            consumed: true, resolvedReviewId: decision.decisionId,
            revision: Number(priorMilestone.revision ?? 0) + 1 });
          phase.reviewMilestone = createPhaseReviewMilestone({
            ...priorMilestone,
            milestoneId: `${priorMilestone.milestoneId}|extension|${decision.decisionId}`,
            earliestEligibleDate: decision.selectedReviewAt,
            unresolvedReviewId: `${priorMilestone.unresolvedReviewId}|extension|${decision.decisionId}`,
            designatedArtifactIdentity: null,
            designatedEvidenceIdentity: null,
            resolvedReviewId: null, consumed: false,
            lineage: [...priorMilestone.lineage,
              { type: "phase_review_extension", id: decision.decisionId }],
            revision: Number(priorMilestone.revision ?? 0) + 1,
          });
          phase.plannedReviewAt = decision.selectedReviewAt;
          phase.lastReviewedAt = decision.decidedAt;
          phase.reviewState = PhaseReviewState.EXTENDED;
          phase.extensionCount = Number(phase.extensionCount ?? 0) + 1;
          phase.latestExtensionDecisionId = decision.decisionId;
          phase.currentRecommendedReviewAt = decision.recommendedReviewAt ?? null;
          phase.projectedNextReviewAt = decision.selectedReviewAt;
        }
        phase.revision = canonicalPhaseRevision(phase) + 1;
        phase.updatedAt = decision.decidedAt;
      },
    }),
    participant(PhaseReviewParticipantName.NEXT_PHASE, {
      prepare: ({ baseline, decision }) => {
        const goal = activeGoal(baseline, decision.goalId);
        const current = phaseById(goal, decision.currentPhaseId);
        const phase = decision.nextPhaseId ? phaseById(goal, decision.nextPhaseId) :
          goal.phases.find((item) => Number(item.order) === Number(current.order) + 1);
        if (!phase) fail("NEXT_PHASE_MISSING", "The projected next phase is missing.");
        if (isBegin(decision) && (phase.status !== CanonicalGoalPhaseStatus.PLANNED ||
            phase.startedAt || phase.startDate)) {
          fail("NEXT_PHASE_INELIGIBLE", "The next phase is not eligible for activation.");
        }
        return { phaseId: phase.id, before: structuredClone(phase) };
      },
      validate: ({ prepared }) => Boolean(prepared.phaseId),
      commit: ({ stagedState, decision, prepared }) => {
        const phase = phaseById(activeGoal(stagedState, decision.goalId), prepared.phaseId);
        if (isBegin(decision)) {
          const start = effectiveStart(decision);
          phase.status = CanonicalGoalPhaseStatus.ACTIVE;
          phase.startedAt = start;
          phase.startDate = start;
          phase.projectedNextPhaseStart = null;
          phase.strategicReviewCadence = decision.phaseEstablishment?.executionTargets?.strategicReviewCadence ?? null;
          phase.strategicReviewAnchor = decision.phaseEstablishment?.executionTargets?.strategicReviewAnchor ?? null;
          phase.monitoringCadence = decision.phaseEstablishment?.executionTargets?.monitoringCadence ?? null;
          phase.automaticStrategyAdjustmentAllowed = false;
          phase.reviewState = phase.plannedReviewAt ?
            PhaseReviewState.SCHEDULED : PhaseReviewState.NOT_REQUIRED;
        } else {
          phase.status = CanonicalGoalPhaseStatus.PLANNED;
          phase.startedAt = null;
          phase.startDate = null;
          phase.projectedNextPhaseStart = decision.selectedReviewAt;
        }
        phase.revision = canonicalPhaseRevision(phase) + 1;
        phase.updatedAt = decision.decidedAt;
      },
    }),
    participant(PhaseReviewParticipantName.STRATEGY, {
      prepare: ({ baseline, decision }) => {
        const records = baseline.phaseStrategies ?? [];
        if (!isBegin(decision)) return { mode: "retain", fingerprint: JSON.stringify(records) };
        const embedded = decision.phaseEstablishment?.strategy;
        const accepted = embedded ? [embedded] : records.filter((item) => item.goalId === decision.goalId &&
          item.phaseId === decision.nextPhaseId && item.status === "accepted");
        if (accepted.length !== 1) {
          fail("ACCEPTED_STRATEGY_REQUIRED", "Exactly one accepted Phase Strategy is required.");
        }
        try { validatePhaseStrategy(accepted[0], { expectedGoalId: decision.goalId,
          expectedPhaseId: decision.nextPhaseId }); }
        catch (error) { fail("ACCEPTED_STRATEGY_INVALID", error.message); }
        try { acceptanceService?.assertAcceptedStrategyUnchanged(accepted[0]); }
        catch (error) { fail("ACCEPTED_STRATEGY_INVALID", error.message); }
        if (accepted[0].revision !== decision.expectedStrategyRevision) {
          fail("STRATEGY_REVISION_MISMATCH", "The accepted Phase Strategy revision changed.");
        }
        if (embedded && records.some((item) => item.id === embedded.id)) {
          fail("STRATEGY_ID_CONFLICT", "The Phase Strategy identity already exists.");
        }
        return { mode: embedded ? "create_and_activate" : "activate", accepted: structuredClone(accepted[0]) };
      },
      validate: ({ prepared }) => prepared.mode === "retain" ||
        prepared.accepted?.status === "accepted",
      commit: ({ stagedState, decision, prepared }) => {
        if (prepared.mode === "retain") return;
        const records = stagedState.phaseStrategies ??= [];
        if (prepared.mode === "create_and_activate") records.push(structuredClone(prepared.accepted));
        const accepted = requiredRecord(records, prepared.accepted.id, "Accepted Strategy");
        if (JSON.stringify(accepted) !== JSON.stringify(prepared.accepted)) {
          fail("ACCEPTED_STRATEGY_MUTATED", "Accepted Strategy content changed during activation.");
        }
        const goal = activeGoal(stagedState, decision.goalId);
        goal.activePhaseStrategyId = accepted.id;
        goal.timeline = { ...goal.timeline, activePhaseStrategyId: accepted.id };
      },
    }),
    participant(PhaseReviewParticipantName.EXPECTED_TRAJECTORY, {
      prepare: ({ baseline, decision }) => {
        const records = baseline.phaseExpectedTrajectories ?? [];
        if (!isBegin(decision)) return { mode: "retain", fingerprint: JSON.stringify(records) };
        const embedded = decision.phaseEstablishment?.trajectory;
        const accepted = embedded ? [embedded] : records.filter((item) => item.goalId === decision.goalId &&
          item.phaseId === decision.nextPhaseId && item.status === "accepted");
        if (accepted.length !== 1) {
          fail("ACCEPTED_TRAJECTORY_REQUIRED", "Exactly one accepted Phase Expected Trajectory is required.");
        }
        try { validatePhaseExpectedTrajectory(accepted[0], { expectedGoalId: decision.goalId,
          expectedPhaseId: decision.nextPhaseId }); }
        catch (error) { fail("ACCEPTED_TRAJECTORY_INVALID", error.message); }
        try { acceptanceService?.assertAcceptedTrajectoryUnchanged(accepted[0]); }
        catch (error) { fail("ACCEPTED_TRAJECTORY_INVALID", error.message); }
        if (accepted[0].revision !== decision.expectedTrajectoryRevision) {
          fail("TRAJECTORY_REVISION_MISMATCH", "The accepted Phase Expected Trajectory revision changed.");
        }
        if (embedded && records.some((item) => item.id === embedded.id)) {
          fail("TRAJECTORY_ID_CONFLICT", "The Expected Trajectory identity already exists.");
        }
        return { mode: embedded ? "create_and_activate" : "activate", accepted: structuredClone(accepted[0]) };
      },
      validate: ({ prepared }) => prepared.mode === "retain" ||
        prepared.accepted?.status === "accepted",
      commit: ({ stagedState, decision, prepared }) => {
        if (prepared.mode === "retain") return;
        const records = stagedState.phaseExpectedTrajectories ??= [];
        if (prepared.mode === "create_and_activate") records.push(structuredClone(prepared.accepted));
        const accepted = requiredRecord(records, prepared.accepted.id, "Accepted Expected Trajectory");
        if (JSON.stringify(accepted) !== JSON.stringify(prepared.accepted)) {
          fail("ACCEPTED_TRAJECTORY_MUTATED", "Accepted Expected Trajectory content changed during activation.");
        }
        const goal = activeGoal(stagedState, decision.goalId);
        goal.activeExpectedTrajectoryId = accepted.id;
        goal.timeline = {
          ...goal.timeline,
          activeExpectedTrajectoryId: accepted.id,
          plannedReviewAt: accepted.plannedReviewAt ?? goal.timeline?.plannedReviewAt ?? null,
          nextMilestoneAt: accepted.nextMilestoneAt ?? null,
        };
      },
    }),
    participant(PhaseReviewParticipantName.EXECUTION_TARGETS, {
      prepare: ({ baseline, decision }) => {
        if (!isBegin(decision)) return { mode: "retain" };
        const targets = decision.phaseEstablishment?.executionTargets;
        if (!targets?.caloricIntake || !targets?.activityExpenditure) return { mode: "retain_legacy" };
        const candidates = (baseline.protocols ?? []).filter((protocol) =>
          protocol.status === "active" && (protocol.protocolType === "energy" || protocol.category === "energy") &&
          supportsGoal(protocol, decision.goalId));
        if (candidates.length !== 1) fail("ENERGY_PROTOCOL_REQUIRED", "Exactly one active Goal Energy protocol is required.");
        const protocol = structuredClone(candidates[0]);
        const versions = (baseline.protocolVersions ?? []).filter((item) => item.protocolId === protocol.id);
        const nextVersion = Math.max(0, ...versions.map((item) => Number(item.versionNumber ?? 0))) + 1;
        const versionId = `${protocol.id}_v${nextVersion}`;
        if ((baseline.protocolVersions ?? []).some((item) => item.id === versionId)) {
          fail("ENERGY_VERSION_CONFLICT", "The next Energy protocol version identity already exists.");
        }
        const previousVersion = versions.find((item) => item.id === protocol.currentVersionId);
        if (!previousVersion || previousVersion.status !== ProtocolVersionStatus.ACTIVE ||
            previousVersion.endedAt) {
          fail("ENERGY_CURRENT_VERSION_INVALID",
            "The current Energy protocol version must be active before replacement.");
        }
        return { mode: "version", protocolId: protocol.id,
          expectedCurrentVersionId: protocol.currentVersionId,
          previousVersionId: previousVersion.id,
          version: { id: versionId, protocolId: protocol.id, versionNumber: nextVersion,
            status: "active", effectiveAt: effectiveStart(decision), activatedAt: decision.decidedAt,
            goalLinks: [{ goalId: decision.goalId, relationship: "supports" }],
            phaseId: decision.nextPhaseId, strategyId: decision.phaseEstablishment.strategy.id,
            confirmation: { authority: "authorized_phase_review", decisionId: decision.decisionId },
            change: { reason: "Activate user-authorized phase execution targets.",
              previousVersionId: protocol.currentVersionId ?? null,
              reviewedChanges: phaseExecutionStrategy(decision) } },
          effectiveStrategy: phaseExecutionStrategy(decision) };
      },
      validate: ({ prepared }) => ["retain", "retain_legacy"].includes(prepared.mode) ||
        (prepared.mode === "version" && Boolean(prepared.protocolId && prepared.version?.id)),
      commit: ({ stagedState, decision, prepared }) => {
        if (["retain", "retain_legacy"].includes(prepared.mode)) return;
        const protocol = requiredRecord(stagedState.protocols ?? [], prepared.protocolId, "Energy protocol");
        if (protocol.currentVersionId !== prepared.expectedCurrentVersionId) {
          fail("ENERGY_PROTOCOL_STALE", "The active Energy protocol changed during transition.");
        }
        stagedState.protocolVersions ??= [];
        const previous = requiredRecord(stagedState.protocolVersions ?? [],
          prepared.previousVersionId, "Previous Energy protocol version");
        if (previous.status !== ProtocolVersionStatus.ACTIVE || previous.endedAt) {
          fail("ENERGY_CURRENT_VERSION_INVALID",
            "The previous Energy protocol version changed during transition.");
        }
        previous.status = ProtocolVersionStatus.SUPERSEDED;
        previous.endedAt = effectiveStart(decision);
        previous.supersededByVersionId = prepared.version.id;
        stagedState.protocolVersions.push(structuredClone(prepared.version));
        protocol.currentVersionId = prepared.version.id;
        protocol.effectiveStrategy = structuredClone(prepared.effectiveStrategy);
        protocol.phaseId = decision.nextPhaseId;
        protocol.phaseStrategyId = decision.phaseEstablishment.strategy.id;
        protocol.updatedAt = decision.decidedAt;
      },
    }),
    participant(PhaseReviewParticipantName.STARTING_FORECAST, {
      prepare: async ({ baseline, decision, preparedByName }) => {
        if (!isBegin(decision)) {
          return { mode: "timing_only", selectedReviewAt: decision.selectedReviewAt };
        }
        const strategy = preparedByName.get(PhaseReviewParticipantName.STRATEGY).accepted;
        const trajectory = preparedByName.get(PhaseReviewParticipantName.EXPECTED_TRAJECTORY).accepted;
        const prospectiveGoal = prospectiveActivatedGoal(baseline, decision);
        const nextPhase = phaseById(prospectiveGoal, decision.nextPhaseId);
        const inputPackage = createPhase2StartingForecastInputPackage({ store: baseline,
          goal: prospectiveGoal, activePhase: nextPhase, acceptedStrategy: strategy,
          acceptedTrajectory: trajectory, decision });
        const context = inputPackage.startingForecastContext;
        const goalContract = inputPackage.goalContract;
        const artifactId = `phase_starting_forecast|${decision.decisionId}`;
        const prepared = await forecastFinalizer.finalize({
          publisherType: "goal_initialization",
          userId: prospectiveGoal.userId,
          occurrenceId: decision.decisionId,
          artifactId,
          cadenceOrEventType: "goal_initialization",
          goalContract,
          phaseId: nextPhase.id,
          evidenceWindow: {
            id: `phase_initialization_window|${decision.decisionId}`,
            start: decision.decidedAt,
            cutoff: decision.decidedAt,
            closed: true,
          },
          strategyContext: strategy.strategyHypothesis,
          executionContext: {
            adequacy: context.historicalExecution,
            elapsedTimeAdequacy: "not_started",
            refs: context.historyRefs,
          },
          evidenceDescriptors: inputPackage.startingEvidenceDescriptors,
          previousCanonicalAssessment: null,
          publicationCutoff: decision.decidedAt,
          finalizedAt: decision.decidedAt,
          idempotencyKey: `confidence_v2|phase_initialization|${decision.idempotencyKey}`,
          expectedPriorAssessmentId: null,
          expectedPriorArtifactId: null,
          startingForecastContext: context,
          sourceLineage: {
            phaseReviewDecisionId: decision.decisionId,
            recommendationLineage: structuredClone(decision.reasoningLineage),
            strategyId: strategy.id,
            expectedTrajectoryId: trajectory.id,
            previousGoalRefs: context.priorGoalRefs,
            historicalExecutionRefs: context.historyRefs,
            currentBaselineRef: inputPackage.goalBaseline?.baselineId ?? null,
            latestConfidenceAssessmentId: inputPackage.latestConfidenceContext?.assessmentId ?? null,
            inputPackageFingerprint: inputPackage.inputFingerprint,
          },
          elapsedTimeAdequacy: "not_started",
          composeArtifact: ({ forecastAssessment, confidenceAssessment }) => ({
            artifact: {
              id: artifactId,
              artifactType: "phase_starting_forecast",
              schemaVersion: "phase_starting_forecast_v1",
              userId: prospectiveGoal.userId,
              goalId: prospectiveGoal.id,
              phaseId: nextPhase.id,
              occurrenceId: decision.decisionId,
              activatedAt: decision.decidedAt,
              forecastAssessment,
              confidenceAssessmentId: confidenceAssessment.id,
              inputSummary: context,
              inputPackageFingerprint: inputPackage.inputFingerprint,
              inputPackageSchemaVersion: inputPackage.schemaVersion,
            },
          }),
        });
        if (prepared.status !== "prepared" || !prepared.confidenceAssessment ||
            prepared.confidenceAssessment.priorAssessmentId != null) {
          fail("STARTING_FORECAST_PREPARATION_FAILED", "A canonical first Starting Forecast could not be prepared.");
        }
        return { mode: "create", inputPackage, ...prepared };
      },
      validate: ({ prepared, decision }) => prepared.mode === "timing_only" ||
        prepared.confidenceAssessment?.phaseId === decision.nextPhaseId,
      commit: ({ stagedState, prepared }) => {
        if (prepared.mode === "timing_only") return;
        stageStartingForecast(stagedState, prepared);
      },
    }),
    participant(PhaseReviewParticipantName.READ_MODELS, {
      prepare: ({ decision, preparedByName }) => ({
        decisionId: decision.decisionId,
        strategyId: preparedByName.get(PhaseReviewParticipantName.STRATEGY).accepted?.id ?? null,
        expectedTrajectoryId: preparedByName.get(PhaseReviewParticipantName.EXPECTED_TRAJECTORY).accepted?.id ?? null,
        executionProtocolVersionId: preparedByName.get(PhaseReviewParticipantName.EXECUTION_TARGETS).version?.id ?? null,
        startingForecastAssessmentId: preparedByName.get(PhaseReviewParticipantName.STARTING_FORECAST)
          .confidenceAssessment?.id ?? null,
      }),
      validate: ({ prepared, decision }) => prepared.decisionId === decision.decisionId,
      commit: ({ stagedState, decision, prepared, preparedByName }) => {
        stagedState.phaseLifecycleReadModels ??= [];
        const goal = activeGoal(stagedState, decision.goalId);
        const activePhase = goal.phases.find((item) => isActivePhaseStatus(item.status)) ?? null;
        const nextPhase = goal.phases.find((item) => item.status === CanonicalGoalPhaseStatus.PLANNED) ?? null;
        const record = {
          id: `phase_lifecycle_read_model|${decision.goalId}`,
          schemaVersion: "phase_lifecycle_read_model_v1",
          goalId: decision.goalId,
          decisionId: decision.decisionId,
          activePhaseId: activePhase?.id ?? null,
          activePhaseStatus: activePhase?.status ?? null,
          activePhaseStartedAt: activePhase?.startedAt ?? activePhase?.startDate ?? null,
          plannedReviewAt: activePhase?.plannedReviewAt ?? null,
          reviewState: activePhase?.reviewState ?? null,
          projectedNextPhaseId: nextPhase?.id ?? null,
          projectedNextPhaseStart: nextPhase?.projectedNextPhaseStart ?? null,
          strategyId: prepared.strategyId ?? goal.activePhaseStrategyId ?? null,
          expectedTrajectoryId: prepared.expectedTrajectoryId ?? goal.activeExpectedTrajectoryId ?? null,
          startingForecastAssessmentId: prepared.startingForecastAssessmentId,
          executionProtocolVersionId: prepared.executionProtocolVersionId,
          forecastTiming: {
            phaseId: activePhase?.id ?? null,
            reviewAt: activePhase?.plannedReviewAt ?? null,
            mode: isBegin(decision) ? "starting_forecast" : "extension_timing_update",
          },
          confidenceGoalContext: {
            goalId: goal.id,
            phaseId: activePhase?.id ?? null,
            assessmentId: prepared.startingForecastAssessmentId,
          },
          briefingContext: { goalId: goal.id, phaseId: activePhase?.id ?? null },
          notificationProjection: {
            reviewAt: activePhase?.plannedReviewAt ?? null,
            unresolvedDecision: false,
          },
          protocolScheduling: {
            phaseId: activePhase?.id ?? null,
            definitionsChanged: false,
            mode: isBegin(decision) ? "phase_activation" : "retain_current",
          },
          strategyScheduling: {
            strategyId: prepared.strategyId ?? goal.activePhaseStrategyId ?? null,
            mode: isBegin(decision) ? "activated_accepted" : "retain_current",
          },
          consumerContexts: ["home", "goal_page", "goal_timeline", "phase_timeline",
            "forecast", "confidence", "briefing", "notification", "protocol", "strategy"],
          updatedAt: decision.decidedAt,
          revision: Number((stagedState.phaseLifecycleReadModels.find((item) =>
            item.goalId === decision.goalId)?.revision) ?? 0) + 1,
        };
        const index = stagedState.phaseLifecycleReadModels.findIndex((item) =>
          item.goalId === decision.goalId);
        if (index < 0) stagedState.phaseLifecycleReadModels.push(record);
        else stagedState.phaseLifecycleReadModels.splice(index, 1, record);
        preparedByName.set(PhaseReviewParticipantName.READ_MODELS, record);
      },
    }),
  ]);
}

function participant(name, methods) {
  return Object.freeze({
    name,
    async prepare(context) { return methods.prepare(context); },
    async validate(context) { return methods.validate(context); },
    async commit(context) { return methods.commit(context); },
    async rollback(context) { context.rollbackEvents.push(name); },
  });
}

function prospectiveActivatedGoal(store, decision) {
  const goal = structuredClone(activeGoal(store, decision.goalId));
  const current = phaseById(goal, decision.currentPhaseId);
  const next = phaseById(goal, decision.nextPhaseId);
  current.status = CanonicalGoalPhaseStatus.COMPLETED;
  current.completedAt = decision.decidedAt;
  current.completionDecisionId = decision.decisionId;
  next.status = CanonicalGoalPhaseStatus.ACTIVE;
  next.startedAt = effectiveStart(decision);
  next.startDate = next.startedAt;
  next.projectedNextPhaseStart = null;
  goal.currentPhaseId = next.id;
  goal.projectedNextPhaseId = null;
  goal.updatedAt = decision.decidedAt;
  goal.timeline = { ...goal.timeline, currentPhaseId: next.id,
    currentPhaseStartedAt: next.startedAt, projectedNextPhaseStart: null };
  return goal;
}

function stageStartingForecast(store, prepared) {
  store.goalConfidenceSnapshots ??= [];
  store.goalConfidenceHistory ??= [];
  store.confidenceInitializationArtifacts ??= [];
  const assessment = prepared.confidenceAssessment;
  if (store.goalConfidenceSnapshots.some((item) => item.goalId === assessment.goalId &&
      item.phaseId === assessment.phaseId) || store.goalConfidenceHistory.some((item) =>
      item.assessmentId === assessment.id || item.assessment?.idempotencyKey === assessment.idempotencyKey)) {
    fail("STARTING_FORECAST_ALREADY_EXISTS", "The Phase confidence series is already initialized.");
  }
  const historyId = `goal_confidence_history_v2|${assessment.id}`;
  store.goalConfidenceHistory.push({
    id: historyId,
    schemaVersion: "goal_confidence_history_record_v2",
    assessmentId: assessment.id,
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    predecessorAssessmentId: null,
    originatingArtifactId: assessment.briefingArtifactId,
    publisherType: "goal_initialization",
    persistedAt: null,
    commitId: null,
    assessment: structuredClone(assessment),
  });
  store.goalConfidenceSnapshots.push({
    id: `goal_confidence_snapshot_v2|${assessment.goalId}|${assessment.phaseId}`,
    schemaVersion: "goal_confidence_snapshot_v2",
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    goalContractId: assessment.goalContract.id,
    goalContractVersion: assessment.goalContract.version,
    currentAssessmentId: assessment.id,
    currentScore: assessment.currentPercentage,
    scoreBand: assessment.confidenceBand,
    previousCanonicalAssessmentId: null,
    historyRecordId: historyId,
    originatingArtifactId: assessment.briefingArtifactId,
    publisherType: "goal_initialization",
    evidenceCutoff: assessment.sourceCutoff,
    createdAt: null,
    updatedAt: null,
    commitId: null,
  });
  store.confidenceInitializationArtifacts.push(structuredClone(prepared.briefingArtifact));
}

export function finalizePhaseReviewCandidate({ stagedState, decisionId, commitId,
  candidateRevision }) {
  const transaction = (stagedState.phaseReviewTransactions ?? []).find((item) =>
    item.decisionId === decisionId);
  if (!transaction) fail("TRANSACTION_LOG_MISSING", "The Phase Review transaction log is missing.");
  transaction.status = "committed";
  transaction.commitId = commitId;
  transaction.committedRevision = candidateRevision;
  transaction.committedAt = stagedState.updatedAt;
  const artifact = (stagedState.confidenceInitializationArtifacts ?? []).find((item) =>
    item.occurrenceId === decisionId);
  if (!artifact) return;
  artifact.commitId = commitId;
  artifact.committedAt = stagedState.updatedAt;
  const assessmentId = artifact.confidencePublication?.assessmentId;
  const history = (stagedState.goalConfidenceHistory ?? []).find((item) =>
    item.assessmentId === assessmentId);
  const snapshot = (stagedState.goalConfidenceSnapshots ?? []).find((item) =>
    item.currentAssessmentId === assessmentId);
  if (!history || !snapshot) fail("STARTING_FORECAST_RECORD_MISSING",
    "The staged Starting Forecast records are incomplete.");
  history.persistedAt = stagedState.updatedAt;
  history.commitId = commitId;
  snapshot.createdAt = stagedState.updatedAt;
  snapshot.updatedAt = stagedState.updatedAt;
  snapshot.commitId = commitId;
}

function activeGoal(store, goalId) {
  const goal = (store.goals ?? []).find((item) => item.id === goalId);
  if (!goal || goal.status !== "active" || goal.primary !== true) {
    fail("ACTIVE_GOAL_MISMATCH", "The active primary Goal does not match the decision.");
  }
  return goal;
}
function phaseById(goal, phaseId) {
  const phase = goal.phases?.find((item) => item.id === phaseId);
  if (!phase) fail("PHASE_MISSING", `Phase ${String(phaseId)} is missing.`);
  return phase;
}
function requiredRecord(records, id, label) {
  const record = records.find((item) => item.id === id);
  if (!record) fail("PARTICIPANT_RECORD_MISSING", `${label} disappeared during staging.`);
  return record;
}
function effectiveStart(decision) {
  return decision.projectedNextPhaseStart ?? resolvePhaseTransitionDate({
    reviewMilestoneDate: decision.originalPlannedReviewAt,
  }).effectiveDate;
}
function isBegin(decision) {
  return decision.selectedOutcome === PhaseReviewUserDecision.BEGIN_NEXT_PHASE;
}
function supportsGoal(protocol, goalId) {
  return [...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? []),
    ...(protocol.goalIds ?? []), ...(protocol.goalLinks ?? []).map((item) => item.goalId)]
    .includes(goalId);
}
function phaseExecutionStrategy(decision) {
  const targets = decision.phaseEstablishment.executionTargets;
  return {
    mode: "Phase Execution",
    phaseId: decision.nextPhaseId,
    phaseStrategyId: decision.phaseEstablishment.strategy.id,
    caloricIntakeTarget: structuredClone(targets.caloricIntake),
    activityExpenditureTarget: structuredClone(targets.activityExpenditure),
    evaluationCadence: targets.strategicReviewCadence ?? targets.evaluationCadence,
    monitoringCadence: targets.monitoringCadence,
    strategicReviewCadence: targets.strategicReviewCadence,
    strategicReviewAnchor: targets.strategicReviewAnchor,
    adjustmentMethod: targets.adjustmentMethod,
    automaticAdjustmentAllowed: targets.automaticAdjustmentAllowed === true,
    adjustmentAuthorization: "user_required",
    signals: ["Weight trend", "Nutrition", "Activity", "Training performance",
      "Recovery", "Body composition"],
    uncertainty: "The targets remain reviewable as new evidence arrives",
  };
}
function legacyMilestone(phase, decision) {
  return createPhaseReviewMilestone({
    milestoneId: decision.milestoneId ?? `phase_review_milestone|${phase.goalId}|${phase.id}|${decision.originalPlannedReviewAt}`,
    goalId: phase.goalId, phaseId: phase.id, milestoneType: "planned_phase_review",
    reviewType: "phase_completion_review", requiredEvidence: [],
    eligibleArtifactTypes: ["legacy_artifact"], designatedArtifactIdentity: null,
    designatedEvidenceIdentity: null, earliestEligibleDate: decision.originalPlannedReviewAt,
    latestEligibleDate: null, earlyReviewPolicy: "prohibited", reviewRequired: true,
    unresolvedReviewId: decision.unresolvedReviewId ?? `phase_review|${phase.goalId}|${phase.id}|${decision.originalPlannedReviewAt}`,
    resolvedReviewId: null, decisionRequired: true, recommendationRequired: true,
    consumed: false, lineage: [{ type: "legacy_coordinator_compatibility", id: decision.decisionId }],
    revision: 0,
  });
}
function fail(code, message) {
  const error = new Error(message);
  error.code = `PHASE_REVIEW_PARTICIPANT_${code}`;
  throw error;
}
