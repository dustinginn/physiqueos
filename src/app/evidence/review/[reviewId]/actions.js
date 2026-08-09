"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createEvidenceReviewService } from "../../../../domain/services/EvidenceReviewService";
import { createWeightEntry } from "../../../../domain/models/weightEntry";
import { createDEXAScan } from "../../../../domain/models/dexaScan";
import { createProgressPhoto } from "../../../../domain/models/progressPhoto";
import { createAnalysis } from "../../../../domain/models/analysis";
import { createCanonicalPhotoSession } from "../../../../domain/models/photoSession";
import { createPostConfirmationOrchestrator } from "../../../../domain/services/PostConfirmationOrchestrator";
import { evaluateScheduledCompletion } from "../../../../domain/services/ScheduledCompletionService";
import {
  reconcileDexaAppointmentFromConfirmedEvidence,
  reconcileHistoricalDexaExecutionFromConfirmedEvidence,
} from "../../../../domain/services/DexaAppointmentLifecycleService";
import { synthesizePhotoSessionObservations } from "../../../../domain/services/PhotoSessionService";
import { createTrainingPerformanceIntelligenceReport } from "../../../../domain/services/TrainingPerformanceIntelligenceService";
import { interpretPhotoSetWithVision } from "../../../../domain/interpreters/PhotoInterpreterService";
import { normalizePhotoInterpretationToStructuredObservations } from "../../../../domain/interpreters/PhotoObservationModel";
import { createDEXAInterpretation } from "../../../../domain/services/DEXAInterpretationService";
import { GoalEvaluationService } from "../../../../domain/services/GoalEvaluationService";
import { createFounderDEXAEventNarrativeService } from "../../../../domain/services/DEXAEventNarrativeService";
import { createFounderPhotoEventNarrativeService } from "../../../../domain/services/PhotoEventNarrativeService";
import { filterEligibleEventBriefingTypes, resolveEventBriefingPreferencesFromStore } from "../../../../domain/services/CoachingUpdatesReadService";
import {
  createPhotoInterpreterGoalContext,
  resolvePhotoEventContext,
} from "../../../../domain/services/PhotoEventContextService";
import { createPendingEvidenceReviewReprocessingService } from "../../../../domain/services/PendingEvidenceReviewReprocessingService";
import { produceTrainingPerformanceEvents } from "../../../../domain/services/TrainingPerformanceEventProducer";
import {
  createTrainingPerformanceEventPersistenceService,
  TrainingPerformanceEventPersistenceOutcome,
} from "../../../../domain/services/TrainingPerformanceEventPersistenceService";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../../../data/repositories/founderRuntimeStore";
import {
  createPILowerLevelCanonicalEvidenceCommitService,
} from "../../../../domain/services/PILowerLevelCanonicalEvidenceCommitService";
import {
  createPILowerLevelConfidenceWorkEnqueueService,
  isPIEnergyConfidenceEnqueueEnabled,
  isPITrainingConfidenceEnqueueEnabled,
} from "../../../../domain/services/PILowerLevelConfidenceWorkEnqueueService";
import {
  createPISemanticFingerprint,
} from "../../../../domain/services/PILowerLevelConfidenceContracts";
import { resolveConfirmedCanonicalTrainingSession } from "../../../../domain/services/ConfirmedCanonicalTrainingSessionResolver";
import { assertValidDexaScan } from "../../../../domain/services/DEXAContract";
import { toDexaReadModel, selectValidDexaScans } from "../../../../domain/services/DEXAReadModelAdapter";
import { arePhotoPoseIdentitiesCompatible } from "../../../../domain/models/progressPhotoPoseVocabulary";
import { satisfyPhotoPriorityFromCanonicalSession } from "../../../../domain/services/PhotoPrioritySatisfactionService";
import { getCanonicalProgressPhotoCategory } from "../../../../domain/models/progressPhotoPoseVocabulary";
import { createCanonicalExerciseWorkoutCommitService } from "../../../../domain/services/CanonicalExerciseWorkoutCommitService";
import {
  assertNoUnresolvedProvisionalExercises,
  canonicalDefinitionsPendingCreation,
  prepareCanonicalExerciseIdentitiesForConfirmation,
} from "../../../../domain/services/CanonicalExerciseLibraryService";
import {
  appendEvidenceRecoveryContext,
  createEvidenceRecoveryContext,
  evidenceReviewMatchesRecoveryContext,
  parseEvidenceRecoveryFormData,
} from "../../../../domain/services/EvidenceRecoveryContext";

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export async function reprocessEvidenceReview(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!review || !user || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  const recoveryContext = resolveRecoveryContext(review, formData);
  let outcome = "failed";
  try {
    const result = await createPendingEvidenceReviewReprocessingService({ repositories: FounderRepositories })
      .reprocessPendingReviewInPlace(reviewId);
    outcome = result.changed ? "updated" : "current";
  } catch (error) {
    console.warn("[EvidenceReview] Pending review re-read failed.", {
      code: error?.code ?? "REPROCESS_FAILED",
      reviewId,
    });
  }
  revalidatePath(`/evidence/review/${reviewId}`);
  redirect(appendEvidenceRecoveryContext(
    `/evidence/review/${reviewId}?reprocess=${outcome}`,
    recoveryContext
  ));
}

export async function confirmEvidenceReview(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!review || !user || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  const recoveryContext = resolveRecoveryContext(review, formData);
  let evidencePackage;
  try { evidencePackage = JSON.parse(String(formData.get("evidenceJson") ?? "")); }
  catch { throw new Error("The reviewed evidence contains invalid JSON."); }
  let submittedItemDecisions;
  try { submittedItemDecisions = JSON.parse(String(formData.get("itemDecisionsJson") ?? "{}")); }
  catch { throw new Error("The evidence selection is invalid."); }
  evidencePackage = mergeAuthoritativePhotoSessions(evidencePackage, review.interpretedEvidence);
  evidencePackage = mergeAuthoritativeTrainingSessions(evidencePackage, review.interpretedEvidence);
  evidencePackage = mergeAuthoritativeNutritionDays(
    evidencePackage,
    review.interpretedEvidence,
    reviewId
  );
  evidencePackage = prepareCanonicalExerciseIdentitiesForConfirmation(evidencePackage);
  evidencePackage = applyPersistedItemDecisions(evidencePackage, submittedItemDecisions);
  assertNoUnresolvedProvisionalExercises(evidencePackage);
  assertIncludedPhotoSessionsReady(evidencePackage);
  validateDexaObjectsBeforeCommit(evidencePackage);

  const service = createEvidenceReviewService({ repositories: FounderRepositories });
  await service.beginCommit(reviewId, { evidencePackage });
  let orchestrationResult;
  try {
    const currentReview = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
    const orchestrator = createPostConfirmationOrchestrator({ reviewService: service, handlers: createHandlers({ evidencePackage, reviewId, user }) });
    orchestrationResult = await orchestrator.run({ reviewId, evidencePackage, userId: user.id, commitProgress: currentReview.commitProgress ?? {} });
    await service.confirm(reviewId, { evidencePackage, confirmedBy: user.id });
  } catch (error) {
    await service.failCommit(reviewId, error);
    throw error;
  }
  const publication = publishPostConfirmationRefreshes(orchestrationResult);
  if (recoveryContext) {
    revalidatePath(recoveryContext.returnTo);
    redirect(recoveryContext.returnTo);
  }
  const photoSessionId = orchestrationResult?.briefingResult?.photoSessionIds?.[0];
  if (photoSessionId) {
    const photoPath = `/briefings/photo/${photoSessionId}${publication?.warning ? `?refresh=${encodeURIComponent(publication.warning)}` : ""}`;
    redirect(photoPath);
  }
  const confirmedPath = `/evidence/review/${reviewId}?confirmed=1${publication?.warning ? `&refresh=${encodeURIComponent(publication.warning)}` : ""}`;
  redirect(confirmedPath);
}

export async function resolveEvidenceReviewExercise(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!user || !review || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  const recoveryContext = resolveRecoveryContext(review, formData);
  const mode = String(formData.get("resolutionMode") ?? "new");
  await createEvidenceReviewService({ repositories: FounderRepositories })
    .resolveProvisionalExercise(reviewId, {
      expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
      provisionalExerciseId: String(formData.get("provisionalExerciseId") ?? ""),
      mode,
      canonicalExerciseId: String(formData.get("canonicalExerciseId") ?? ""),
      definition: {
        canonicalName: formData.get("canonicalName"),
        primaryMuscleGroupId: formData.get("primaryMuscleGroupId"),
        movementPattern: formData.get("movementPattern"),
        equipment: formData.get("equipment"),
        laterality: formData.get("laterality"),
        aliases: formData.get("aliases"),
      },
      updatedBy: user.id,
    });
  revalidatePath(`/evidence/review/${reviewId}`);
  redirect(appendEvidenceRecoveryContext(
    `/evidence/review/${reviewId}?exercise=resolved`,
    recoveryContext
  ));
}

export async function updateEvidenceReviewExerciseVariant(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!user || !review || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  const recoveryContext = resolveRecoveryContext(review, formData);
  await createEvidenceReviewService({ repositories: FounderRepositories })
    .updateTrainingExecutionVariant(reviewId, {
      evidenceObjectId: String(formData.get("evidenceObjectId") ?? ""),
      exerciseIndex: Number(formData.get("exerciseIndex")),
      expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
      mode: String(formData.get("variantMode") ?? "save"),
      rawLabel: String(formData.get("variantLabel") ?? ""),
      updatedBy: user.id,
    });
  revalidatePath(`/evidence/review/${reviewId}`);
  redirect(appendEvidenceRecoveryContext(
    `/evidence/review/${reviewId}?variant=updated`,
    recoveryContext
  ));
}

export async function updateEvidenceReviewItemDecision(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!user || !review || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  await createEvidenceReviewService({ repositories: FounderRepositories }).setItemDecision(reviewId, {
    itemId, included: String(formData.get("included")) === "true", decidedBy: user.id,
  });
  revalidatePath(`/evidence/review/${reviewId}`);
}

export async function updateEvidenceReviewPhotoPose(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!user || !review || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  const recoveryContext = resolveRecoveryContext(review, formData);
  await createEvidenceReviewService({ repositories: FounderRepositories }).setPhotoPose(reviewId, {
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    photoId: String(formData.get("photoId") ?? ""),
    poseId: String(formData.get("poseId") ?? ""),
    sourceArtifactRef: String(formData.get("sourceArtifactRef") ?? ""),
    updatedBy: user.id,
  });
  revalidatePath(`/evidence/review/${reviewId}`);
  redirect(appendEvidenceRecoveryContext(
    `/evidence/review/${reviewId}?pose=saved`,
    recoveryContext
  ));
}

function applyPersistedItemDecisions(evidencePackage, decisions = {}) {
  return { ...evidencePackage, evidence_objects: (evidencePackage.evidence_objects ?? []).map((item) => ({
    ...item, removed: decisions[item.id]?.included === false,
  })) };
}

function mergeAuthoritativePhotoSessions(submitted = {}, authoritative = {}) {
  const photoSessions = new Map(
    (authoritative.evidence_objects ?? [])
      .filter((item) => item.evidence_type === "photo_session")
      .map((item) => [item.id, item])
  );
  return {
    ...submitted,
    evidence_objects: (submitted.evidence_objects ?? []).map((item) =>
      item.evidence_type === "photo_session" && photoSessions.has(item.id)
        ? structuredClone(photoSessions.get(item.id))
        : item
    ),
  };
}

function mergeAuthoritativeTrainingSessions(submitted = {}, authoritative = {}) {
  const training = new Map(
    (authoritative.evidence_objects ?? [])
      .filter((item) => item.evidence_type === "training")
      .map((item) => [item.id, item])
  );
  return {
    ...submitted,
    evidence_objects: (submitted.evidence_objects ?? []).map((item) =>
      item.evidence_type === "training" &&
      training.get(item.id)?.exercises?.some((exercise) => exercise.provisionalExercise)
        ? structuredClone(training.get(item.id))
        : item
    ),
  };
}

function mergeAuthoritativeNutritionDays(
  submitted = {},
  authoritative = {},
  reviewId = null
) {
  const nutrition = new Map(
    (authoritative.evidence_objects ?? [])
      .filter((item) => item.evidence_type === "nutrition")
      .map((item) => [item.id, item])
  );
  return {
    ...submitted,
    review_metadata: {
      ...(authoritative.review_metadata ?? {}),
      ...(submitted.review_metadata ?? {}),
      sourceReviewId: reviewId,
    },
    evidence_objects: (submitted.evidence_objects ?? []).map((item) => {
      const source = nutrition.get(item.id);
      if (item.evidence_type !== "nutrition" || !source) return item;
      return {
        ...structuredClone(source),
        removed: item.removed,
        reconciliation: {
          ...(source.reconciliation ?? {}),
          nutrition: {
            ...(item.reconciliation?.nutrition ?? {}),
            sourceReviewId: reviewId,
          },
        },
      };
    }),
  };
}

function assertIncludedPhotoSessionsReady(evidencePackage) {
  for (const object of evidencePackage.evidence_objects ?? []) {
    if (object.removed || object.evidence_type !== "photo_session") continue;
    const unresolved = (object.photos ?? []).filter((photo) =>
      photo.active !== false && !getCanonicalProgressPhotoCategory(photo)
    );
    if (unresolved.length) {
      throw new Error(`Choose a pose for ${unresolved.length === 1 ? "the remaining photo" : `all ${unresolved.length} remaining photos`} before saving.`);
    }
  }
}

function createHandlers({ evidencePackage, reviewId, user }) {
  let canonical = null;
  let analyses = [];
  let trainingAnalysis = null;
  const committedPackage = { ...evidencePackage, evidence_objects: (evidencePackage.evidence_objects ?? []).filter((item) => item.removed !== true) };
  return {
    canonical_commit: async () => {
      const energySourceCommit = committedPackage.evidence_objects.some(
        (item) => [
          "nutrition", "activity", "activity_day",
          "dexa", "dexa_scan", "body_composition",
        ]
          .includes(item.evidence_type)
      );
      const newExerciseDefinitions = canonicalDefinitionsPendingCreation(committedPackage);
      const scopedResult =
        energySourceCommit && isPIEnergyConfidenceEnqueueEnabled()
          ? await createPILowerLevelCanonicalEvidenceCommitService({
              runtimeStorePath: resolveFounderRuntimeStorePath(),
              liveStore: getFounderRuntimeStore(),
            }).commitConfirmedEvidencePackage(committedPackage, user.id, {
              canonicalExerciseDefinitions: newExerciseDefinitions,
            })
          : newExerciseDefinitions.length > 0
          ? await createCanonicalExerciseWorkoutCommitService({
              runtimeStorePath: resolveFounderRuntimeStorePath(),
              liveStore: getFounderRuntimeStore(),
            }).commit(committedPackage, user.id)
          : await FounderRepositories.canonicalEvidence
              .reconcileConfirmedEvidencePackage(committedPackage, user.id);
      if (
        energySourceCommit &&
        isPIEnergyConfidenceEnqueueEnabled() &&
        scopedResult.committed !== true &&
        scopedResult.outcome !== "source_matched"
      ) {
        throw new Error(`Canonical evidence commit failed: ${scopedResult.outcome}`);
      }
      canonical = await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      if (committedPackage.evidence_objects.some((item) => item.evidence_type === "photo_session")) {
        canonical = expandCanonicalPhotoSessions(canonical, committedPackage, user.id);
        await FounderRepositories.canonicalEvidence.upsertCanonicalEvidenceObjects(canonical);
      }
      return {
        status: "completed",
        canonicalEvidenceIds: canonical
          .filter((item) => item.quality?.status !== "superseded")
          .map((item) => item.canonicalId),
        canonicalCommitResults: buildCanonicalCommitResults({
          committedPackage,
          canonical,
          report: scopedResult.report ?? {},
        }),
        reconciliationScope: scopedResult.scope ?? scopedResult.reconciliationScope,
        lowerLevelWork: scopedResult.lowerLevelWork ?? [],
        ...scopedResult.report,
      };
    },
    compatibility_writes: async () => ({ status: "completed", records: await commitCompatibilityRepositories({ evidencePackage, user }) }),
    scheduled_completion: async () => {
      canonical ??= await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      const results = evaluateScheduledCompletion({ canonicalObjects: canonical, evidencePackage });
      const completionRecords = [];
      for (const result of results.filter((item) => item.satisfied)) {
        if (result.evidenceType === "photo_session") {
          const session = canonical.find((item) => item.canonicalId === result.canonicalEvidenceId);
          const satisfaction = await satisfyPhotoPriorityFromCanonicalSession({
            repositories: FounderRepositories, userId: user.id, canonicalSession: session,
            evidenceDate: result.observedDate,
          });
          if (satisfaction.record) completionRecords.push(satisfaction.record.id);
          continue;
        }
        if (result.evidenceType === "dexa") {
          const confirmation = {
            repositories: FounderRepositories,
            canonicalEvidenceId: result.canonicalEvidenceId,
            confirmedAt: new Date().toISOString(),
            evidenceDate: result.observedDate,
          };
          const current = await reconcileDexaAppointmentFromConfirmedEvidence(confirmation);
          const reconciliation = current.matched
            ? current
            : await reconcileHistoricalDexaExecutionFromConfirmedEvidence(confirmation);
          if (reconciliation.matched) completionRecords.push(reconciliation.completionId);
          continue;
        }
        const reminderId = { weight: "reminder_morning_weight" }[result.evidenceType];
        if (!reminderId) continue;
        const completion = { id: `${reminderId}:${result.observedDate}:${result.canonicalEvidenceId}`, completedAt: `${result.observedDate}T12:00:00.000Z`, canonicalEvidenceId: result.canonicalEvidenceId, evidenceType: result.evidenceType, source: "PostConfirmationOrchestrator" };
        const record = await FounderRepositories.reminders.completeReminderFromEvidence(reminderId, completion);
        if (record) completionRecords.push(record.id);
      }
      return { status: "completed", results, completionRecordIds: completionRecords };
    },
    analysis: async () => {
      canonical ??= await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      analyses = await runDomainAnalysis({ canonical, evidencePackage, user });
      trainingAnalysis =
        analyses.find((analysis) => analysis.id === `analysis_training_${evidencePackage.package_id}`) ??
        null;
      return { status: "completed", analysisIds: analyses.map((item) => item.id), synthesisIds: analyses.filter((item) => item.metadata?.photoSessionSynthesis).map((item) => item.id) };
    },
    training_performance_events: async ({ results }) => {
      const trainingObjects = committedPackage.evidence_objects.filter(
        (item) => item.evidence_type === "training" && (item.exercises ?? []).length > 0
      );
      if (trainingObjects.length === 0) {
        return {
          status: "completed",
          outcome: TrainingPerformanceEventPersistenceOutcome.NO_EVENTS,
          newlyCreatedEvents: [],
          existingEvents: [],
        };
      }
      canonical ??= await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      const analysisId =
        trainingAnalysis?.id ??
        results.analysis?.analysisIds?.find((id) => id === `analysis_training_${evidencePackage.package_id}`);
      trainingAnalysis ??=
        analyses.find((analysis) => analysis.id === analysisId) ??
        (analysisId ? await FounderRepositories.analyses.getAnalysisById(analysisId) : null);
      if (!trainingAnalysis) {
        throw new Error("Persisted Training analysis is unavailable for performance-event generation.");
      }
      const canonicalCommitResults = results.canonical_commit?.canonicalCommitResults ?? [];
      const resolvedTrainingSessions = trainingObjects.map((session) => {
        const resolution = resolveConfirmedCanonicalTrainingSession({
          reviewItem: session,
          canonicalEvidenceObjects: canonical,
          canonicalCommitResults,
        });
        if (resolution.status !== "resolved" || !resolution.canonicalSession) {
          throw new Error(`Confirmed canonical Training session is unavailable: ${session.id}`);
        }
        return { reviewItem: session, canonicalSession: resolution.canonicalSession };
      });
      const events = resolvedTrainingSessions.flatMap(({ canonicalSession }) =>
        produceTrainingPerformanceEvents({
          canonicalTrainingSession: canonicalSession,
          trainingAnalysis,
          sourceReviewId: reviewId,
          sourceEvidencePackageId: evidencePackage.package_id,
        })
      );
      const lowerLevelEnabled = isPITrainingConfidenceEnqueueEnabled();
      const coordinator =
        createPILowerLevelConfidenceWorkEnqueueService();
      const eventIds = events.map((event) => event.id).sort();
      const batchId = `training_event_batch|${createPISemanticFingerprint({
        packageId: evidencePackage.package_id,
        analysisId: trainingAnalysis.id,
        sessionIds: resolvedTrainingSessions.map((item) => item.canonicalSession.canonicalId).sort(),
        eventIds,
      }).slice(7)}`;
      const batch = {
        id: batchId,
        status: "finalized",
        sourceCommitId: "pending_source_commit",
        sourceEvidencePackageId: evidencePackage.package_id,
        sourceReviewId: reviewId,
        finalizedReportId: trainingAnalysis.id,
        canonicalTrainingSessionIds:
          resolvedTrainingSessions.map((item) => item.canonicalSession.canonicalId).sort(),
        performanceEventIds: eventIds,
        zeroEventCompletion: eventIds.length === 0,
        finalizedAt: trainingAnalysis.createdAt,
      };
      const persistence = await createTrainingPerformanceEventPersistenceService({
        runtimeStorePath: resolveFounderRuntimeStorePath(),
        liveStore: getFounderRuntimeStore(),
      }).persistEventBatch(events, lowerLevelEnabled ? {
        batchId,
        batch,
        mutateCandidate: (candidate) => {
          for (const { reviewItem: session, canonicalSession } of resolvedTrainingSessions) {
            const sessionEvents = events.filter((event) => event.sourceSessionId === session.id);
            coordinator.stageTrainingFinalization(candidate, {
              canonicalTrainingSessionId: canonicalSession.canonicalId,
              finalizedTrainingReportId: trainingAnalysis.id,
              sourceTrainingEvidenceIds: [
                canonicalSession.canonicalId,
              ],
              performanceEventBatchId: batchId,
              performanceEventIds: sessionEvents.map((event) => event.id),
              zeroEventCompletion: sessionEvents.length === 0,
              categoryRollupFingerprint: createPISemanticFingerprint(
                trainingAnalysis.metadata?.trainingPerformance
                  ?.categoryObservations ?? []
              ),
              sourceSemanticFingerprint: createPISemanticFingerprint({
                canonicalSession,
                finalizedReportId: trainingAnalysis.id,
                performanceEventIds:
                  sessionEvents.map((event) => event.id).sort(),
              }),
              evidenceCutoff: `${String(session.observed_at).slice(0, 10)}T23:59:59.999Z`,
            });
          }
        },
        finalizeCandidate: ({ stagedState, commitId }) => {
          const persistedBatch = stagedState.trainingPerformanceEventBatches
            ?.find((item) => item.id === batchId);
          if (persistedBatch) persistedBatch.sourceCommitId = commitId;
          for (const work of stagedState.piTrainingConfidenceWorkItems ?? []) {
            work.sourceCommitLinks = (work.sourceCommitLinks ?? []).map(
              (link) => link.commitId === "pending_source_commit"
                ? { ...link, commitId }
                : link
            );
          }
        },
        validateFinalized: (candidate) =>
          resolvedTrainingSessions.every(({ canonicalSession }) =>
            candidate.piTrainingConfidenceWorkItems?.some(
              (work) =>
                work.canonicalTrainingSessionId === canonicalSession.canonicalId &&
                work.performanceEventBatchId === batchId
            )
          ),
      } : {});
      if (
        [
          TrainingPerformanceEventPersistenceOutcome.COLLISION,
          TrainingPerformanceEventPersistenceOutcome.CONCURRENCY_CONFLICT,
          TrainingPerformanceEventPersistenceOutcome.PERSISTENCE_FAILURE,
          TrainingPerformanceEventPersistenceOutcome
            .COMMITTED_PUBLICATION_FAILURE,
        ].includes(persistence.outcome)
      ) {
        throw new Error(`Training performance-event persistence failed: ${persistence.outcome}`);
      }
      return {
        status: "completed",
        outcome: persistence.outcome,
        newlyCreatedEvents: persistence.newEvents,
        existingEvents: persistence.existingEvents,
        performanceEventBatchId: persistence.batch?.id ?? null,
        lowerLevelWorkIds: lowerLevelEnabled
          ? resolvedTrainingSessions.map(({ canonicalSession }) =>
              getFounderRuntimeStore().piTrainingConfidenceWorkItems
                ?.find((work) =>
                  work.canonicalTrainingSessionId === canonicalSession.canonicalId &&
                  work.performanceEventBatchId === batchId
                )?.id
            ).filter(Boolean)
          : [],
      };
    },
    goal_evaluation: async () => refreshGoalEvaluations({ evidencePackage, user }),
    event_eligibility: async () => {
      const eventObjects = (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed && ["photo_session", "dexa", "dexa_scan", "body_composition"].includes(item.evidence_type));
      return { status: "completed", eligible: eventObjects.filter((item) => item.evidence_type !== "photo_session" || isCompletePhotoSession(item)).map((item) => item.evidence_type) };
    },
    briefing: async ({ results }) => {
      const eligible = results.event_eligibility?.eligible ?? [];
      const eventPreferences = resolveEventBriefingPreferencesFromStore(getFounderRuntimeStore());
      const briefable = filterEligibleEventBriefingTypes(eligible, eventPreferences);
      const artifacts = [];
      const photoSessionIds = [];
      for (const type of briefable) {
        const object = (evidencePackage.evidence_objects ?? []).find((item) => item.evidence_type === type || (type === "dexa" && ["dexa_scan", "body_composition"].includes(item.evidence_type)));
        const canonicalId = getStableCanonicalId(object, user.id);
        if (type === "photo_session") {
          const result = await createFounderPhotoEventNarrativeService({ repositories: FounderRepositories }).getOrCreateResult({ userId: user.id, sessionId: canonicalId });
          if (result.status !== "completed" || !result.artifactId) {
            throw new Error(`${result.code ?? "photo_event_briefing_failed"}: ${result.message ?? "Photo Event briefing was not created."}`);
          }
          artifacts.push(result.artifactId);
          photoSessionIds.push(result.sessionId);
          continue;
        }
        const artifact = await createFounderDEXAEventNarrativeService({ repositories: FounderRepositories }).generate({ userId: user.id, scanId: canonicalId });
        if (!artifact?.artifactId && !artifact?.id) throw new Error("dexa_event_briefing_failed: DEXA Event briefing was not created.");
        artifacts.push(artifact.artifactId ?? artifact.id);
      }
      return { status: "completed", artifactIds: artifacts, photoSessionIds, freshness: briefable.length ? "event_generated" : "scheduled_preserved" };
    },
    home_refresh: async ({ results }) => {
      return {
        status: "completed",
        pathsToRevalidate: ["/", "/briefing/daily", "/progress", "/progress/photos", "/progress/dexa", "/progress/training", "/timeline"],
        tagsToRevalidate: [],
        redirectPath: `/evidence/review/${reviewId}?confirmed=1`,
        refreshKey: `home_${evidencePackage.package_id}`,
        artifactIds: results.briefing?.artifactIds ?? [],
      };
    },
  };
}

function publishPostConfirmationRefreshes(orchestrationResult) {
  const publication = orchestrationResult?.homeRefreshResult ?? orchestrationResult?.results?.home_refresh ?? null;
  const paths = uniqueStrings(publication?.pathsToRevalidate ?? []);
  const tags = uniqueStrings(publication?.tagsToRevalidate ?? []);
  try {
    paths.forEach((path) => revalidatePath(path));
    return { status: "published", paths, tags, warning: null, redirectPath: publication?.redirectPath ?? null };
  } catch (error) {
    const isRequestContextError = String(error?.message ?? error).includes("static generation store missing in revalidatePath");
    if (!isRequestContextError) {
      throw error;
    }
    return {
      status: "deferred",
      paths,
      tags,
      warning: "refresh_deferred",
      redirectPath: publication?.redirectPath ?? null,
    };
  }
}

async function commitCompatibilityRepositories({ evidencePackage, user }) {
  const records = [];
  for (const object of evidencePackage.evidence_objects ?? []) {
    if (object.removed === true) continue;
    if (["morning_weight", "weight"].includes(object.evidence_type)) {
      const date = String(object.observed_at).slice(0, 10);
      const entry = createWeightEntry({
        id: `weight_${date.replaceAll("-", "_")}`,
        userId: user.id, measuredAt: date,
        weight: { value: Number(object.value), unit: object.unit ?? "lb" },
        context: object.context ?? {}, notes: object.notes ?? null,
        reliability: "confirmed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await FounderRepositories.weights.addWeightEntry(entry);
      records.push(entry.id);
    }
    if (["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)) {
      const canonicalId = getStableCanonicalId(object, user.id);
      const scan = toDexaReadModel(object, { canonicalId, userId: user.id });
      await (FounderRepositories.dexaScans.upsertDEXAScan?.(scan) ?? FounderRepositories.dexaScans.addDEXAScan(scan));
      records.push(scan.id);
    }
    if (object.evidence_type === "photo_session") {
      const date = String(object.observed_at).slice(0, 10);
      const existing = await FounderRepositories.progressPhotos.getPhotosByDate(user.id, date);
      for (const photo of (object.photos ?? []).filter((item) => item.active !== false)) {
        const id = `progress_photo_${user.id}_${date}_${photo.view}_${photo.pose}`;
        if (existing.some((item) => item.imagePath === photo.storage_path)) continue;
        const record = createProgressPhoto({ id, userId: user.id, date, capturedAt: date, uploadedAt: object.created_at ?? new Date().toISOString(), imagePath: photo.storage_path, view: photo.view, pose: photo.pose, conditions: object.conditions, source: { type: "manual", name: "Confirmed Photo Session", confidence: "high" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await FounderRepositories.progressPhotos.upsertPhoto(record);
        records.push(id);
      }
    }
  }
  return records;
}

function expandCanonicalPhotoSessions(canonicalObjects, evidencePackage, userId) {
  const byId = new Map(canonicalObjects.map((item) => [item.canonicalId, item]));
  for (const object of (evidencePackage.evidence_objects ?? []).filter((item) => item.evidence_type === "photo_session" && !item.removed)) {
    const date = String(object.observed_at).slice(0, 10);
    const photos = (object.photos ?? []).map((photo, index) => ({ ...photo,
      canonicalPhotoId: photo.canonicalPhotoId ?? `canonical_photo_${userId}_${date}_${stablePhotoIdentity(photo.id ?? photo.source_hash ?? index)}`,
      stableViewId: photo.stableViewId ?? photo.id, captureDate: date, occurrenceTimestamp: date,
      sourceIds: [photo.id], sourceHashes: [photo.source_hash].filter(Boolean),
      status: photo.active === false ? "inactive" : "active", sourceOrder: photo.sourceOrder ?? photo.order ?? index,
    }));
    const session = createCanonicalPhotoSession({ ...object, confirmationIntent: evidencePackage.review_metadata?.confirmationIntent ?? null, provisional: false, captureDate: date, sessionId: `photo_session_${userId}_${date}`, userId, photos });
    const sessionObject = { canonicalId: session.sessionId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence_type: "photo_session", firstObservedAt: date, lastObservedAt: date, payload: { ...session, evidence_type: "photo_session", observed_at: date }, provenance: object.provenance ?? {}, quality: { status: "active" }, userId };
    byId.set(sessionObject.canonicalId, preserveCanonicalTimestamps(byId.get(sessionObject.canonicalId), sessionObject));
    photos.forEach((photo) => {
      const candidate = { canonicalId: photo.canonicalPhotoId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence_type: "progress_photo", firstObservedAt: date, lastObservedAt: date, payload: { ...photo, evidence_type: "progress_photo", observed_at: date }, provenance: { source_artifact_refs: photo.sourceIds, source_hashes: photo.sourceHashes }, quality: { status: photo.status }, userId };
      byId.set(photo.canonicalPhotoId, preserveCanonicalTimestamps(byId.get(photo.canonicalPhotoId), candidate));
    });
  }
  return [...byId.values()];
}

function preserveCanonicalTimestamps(existing, candidate) {
  if (!existing) return candidate;
  const semantic = ({ createdAt: _createdAt, updatedAt: _updatedAt, ...record }) => record;
  if (JSON.stringify(semantic(existing)) === JSON.stringify(semantic(candidate))) return existing;

  return { ...candidate, createdAt: existing.createdAt ?? candidate.createdAt };
}

async function runDomainAnalysis({ canonical, evidencePackage, user }) {
  const created = [];
  const completionIntent = evidencePackage.review_metadata?.confirmationIntent;
  for (const object of (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed)) {
    if (object.evidence_type === "photo_session") {
      const photoEventContext = await resolvePhotoEventContext({
        repositories: FounderRepositories,
        userId: user.id,
        evidenceDate: object.observed_at,
      });
      const photoGoalContext = createPhotoInterpreterGoalContext(photoEventContext, completionIntent);
      const sessionId = `photo_session_${user.id}_${String(object.observed_at).slice(0, 10)}`;
      const perView = [];
      for (const photo of (object.photos ?? []).filter((item) => item.active !== false)) {
        const canonicalPhotoId = photo.canonicalPhotoId ?? `canonical_photo_${user.id}_${String(object.observed_at).slice(0, 10)}_${stablePhotoIdentity(photo.id ?? photo.source_hash)}`;
        const prior = findPriorCanonicalPhoto(canonical, photo, object.observed_at);
        const currentInput = await photoInterpreterInput(photo, object);
        const priorInput = prior ? await canonicalPhotoInterpreterInput(prior) : null;
        const interpretationResult = await interpretPhotoSetWithVision({ captureDate: object.observed_at, goalContext: photoGoalContext, photoSetId: canonicalPhotoId, photos: [currentInput], previousPhotoSet: priorInput ? { photoSetId: prior.canonicalId, captureDate: prior.lastObservedAt, photos: [priorInput] } : null });
        if (interpretationResult.provider !== "openai") throw new Error(`Photo Interpreter provider did not complete canonical analysis for ${canonicalPhotoId}: ${interpretationResult.warning ?? "provider unavailable"}`);
        const interpretation = interpretationResult.interpretation;
        const structuredObservations = interpretation.structured_observations ?? normalizePhotoInterpretationToStructuredObservations(interpretation);
        const interpreterVersion = interpretation.interpreter_version ?? "photo-interpreter-production-v1";
        const analysis = createAnalysis({ id: stableAnalysisId([canonicalPhotoId, "v1", prior?.canonicalId ?? "baseline", interpreterVersion]), createdAt: new Date().toISOString(), title: `${photo.view} ${photo.pose} interpreted`, summary: interpretation.user_facing_summary, evidenceIds: [canonicalPhotoId], evidenceTypes: ["progress_photo"], findings: structuredObservations.map((item) => ({ title: item.region, detail: item.change })), metadata: { canonicalPhotoId, canonicalVersion: "v1", interpreterVersion, priorComparisonId: prior?.canonicalId ?? null, provider: interpretationResult.provider, warning: interpretationResult.warning, photoInterpretation: interpretation, structuredObservations } });
        await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis); perView.push({ evidenceIds: analysis.evidenceIds, structuredObservations, analysisId: analysis.id });
      }
      if (perView.length === 0) throw new Error("PhotoSession synthesis requires at least one successful per-view analysis.");
      const synthesis = synthesizePhotoSessionObservations(perView);
      const synthesisId = stableAnalysisId([sessionId, "v1", ...perView.map((item) => item.analysisId).sort(), "synthesis-v1"]);
      const analysis = createAnalysis({ id: synthesisId, createdAt: new Date().toISOString(), title: "Photo Session Synthesis", summary: `Canonical multi-view synthesis completed from ${perView.length} production Photo Interpreter ${perView.length===1?"analysis":"analyses"}.`, evidenceIds: [sessionId], evidenceTypes: ["photo_session"], metadata: { photoSessionSynthesis: synthesis, sourceAnalysisIds: perView.map((item) => item.analysisId), synthesisVersion: "synthesis-v2" } });
      await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
    } else if (["dexa", "dexa_scan", "body_composition"].includes(object.evidence_type)) {
      const canonicalScan = canonical.find((item) => ["dexa", "dexa_scan", "body_composition"].includes(item.evidence_type) && String(item.lastObservedAt).slice(0, 10) === String(object.observed_at).slice(0, 10));
      if (!canonicalScan) throw new Error("Confirmed canonical DEXA was not available for interpretation.");
      const canonicalPrior = canonical.filter((item) => ["dexa", "dexa_scan", "body_composition"].includes(item.evidence_type) && item.quality?.status !== "superseded" && String(item.lastObservedAt) < String(canonicalScan.lastObservedAt)).sort((a, b) => String(b.lastObservedAt).localeCompare(String(a.lastObservedAt)))[0] ?? null;
      const legacyPrior = selectValidDexaScans(await FounderRepositories.dexaScans.listDEXAScans(user.id))
        .filter((item) => String(item.measuredAt) < String(canonicalScan.lastObservedAt))
        .at(-1) ?? null;
      const priorScan = canonicalPrior ?? (legacyPrior ? { canonicalId: legacyPrior.canonicalId ?? legacyPrior.id, payload: legacyPrior } : null);
      const analysis = createDEXAInterpretation({ canonicalScan, priorScan });
      await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
    }
  }
  if ((evidencePackage.evidence_objects ?? []).some((item) => item.evidence_type === "training" && !item.removed)) {
    const report = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonical });
    const analysis = createAnalysis({ id: `analysis_training_${evidencePackage.package_id}`, createdAt: new Date().toISOString(), title: "Training Performance Refreshed", summary: report.summary, evidenceIds: canonical.filter((item) => item.evidence_type === "training").map((item) => item.canonicalId), evidenceTypes: ["training"], metadata: { trainingPerformance: report } });
    await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
  }
  return created;
}

function buildCanonicalCommitResults({ committedPackage, canonical = [], report = {} } = {}) {
  const canonicalTrainingSessions = canonical.filter(
    (item) => item?.evidence_type === "training" && item?.quality?.status === "active"
  );
  const reviewItems = (committedPackage?.evidence_objects ?? []).filter(
    (item) => item?.evidence_type === "training" && item?.removed !== true
  );
  const reportTrainingIds = uniqueStrings([
    ...(report.addedCanonicalIds ?? []),
    ...(report.updatedCanonicalIds ?? []),
  ]).filter((id) => canonicalTrainingSessions.some((item) => item.canonicalId === id));

  return reviewItems.map((reviewItem, index) => {
    const sourceRefs = uniqueStrings([
      reviewItem.id,
      ...(reviewItem.source?.source_artifact_refs ?? []),
      ...(reviewItem.provenance?.source_artifact_refs ?? []),
      ...(reviewItem.references?.source_artifact_refs ?? []),
    ]);
    const match = canonicalTrainingSessions.find((candidate) => {
      const candidateRefs = uniqueStrings([
        ...(candidate?.provenance?.source_artifact_refs ?? []),
        ...(candidate?.provenance?.contributing_evidence_object_ids ?? []),
        ...(candidate?.source?.source_artifact_refs ?? []),
      ]);
      return sourceRefs.length > 0 && sourceRefs.every((ref) => candidateRefs.includes(ref));
    });
    const fallbackId = reportTrainingIds[index];
    const fallback = canonicalTrainingSessions.find((candidate) => candidate.canonicalId === fallbackId);
    const selected = match ?? fallback;
    if (!selected) return null;
    return [
      {
        canonicalEntityType: "training",
        canonicalEntityId: selected.canonicalId,
        reviewItemId: reviewItem.id,
        sourceEvidenceId: sourceRefs[0] ?? reviewItem.id,
        originalNormalizedId: reviewItem.id,
        canonicalSourceReferences: uniqueStrings([
          ...(selected?.provenance?.source_artifact_refs ?? []),
          ...(selected?.provenance?.contributing_evidence_object_ids ?? []),
          ...(selected?.source?.source_artifact_refs ?? []),
        ]),
      },
    ];
  }).filter(Boolean);
}

function validateDexaObjectsBeforeCommit(evidencePackage) {
  for (const object of (evidencePackage.evidence_objects ?? []).filter((item) =>
    !item.removed && ["dexa_scan", "dexa", "body_composition"].includes(item.evidence_type)
  )) {
    assertValidDexaScan(object, { production: true });
  }
}

function isCompletePhotoSession(object) {
  return (object.photos ?? []).some((photo) =>
    photo.active !== false && photo.identityStatus === "confirmed" && photo.userConfirmedIdentity === true
  );
}

function getStableCanonicalId(object, userId) {
  const date = String(object?.observed_at ?? "").slice(0, 10);
  return object?.evidence_type === "photo_session" ? `photo_session_${userId}_${date}` : object?.id ?? `dexa_${userId}_${date}`;
}

async function refreshGoalEvaluations({ evidencePackage, user }) {
  const [goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext] = await Promise.all([
    FounderRepositories.goals.listGoals(user.id), FounderRepositories.dexaScans.listDEXAScans(user.id), FounderRepositories.weights.listWeightEntries(user.id), FounderRepositories.progressPhotos.listPhotos(user.id), FounderRepositories.protocols.listProtocols(user.id), FounderRepositories.nutritionContext.getNutritionContext?.(user.id),
  ]);
  const evaluations = GoalEvaluationService.getGoalEvaluations({ goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext });
  const versionId = `goal_evaluation_${evidencePackage.package_id}`;
  const record = createAnalysis({ id: versionId, createdAt: new Date().toISOString(), title: "Goal Evaluation Refreshed", summary: "Goal Evaluation recomputed from confirmed canonical-compatible evidence.", evidenceIds: (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed).map((item) => item.id), evidenceTypes: [...new Set((evidencePackage.evidence_objects ?? []).map((item) => item.evidence_type))], metadata: { evaluationVersion: versionId, evaluations, source: "GoalEvaluationService" } });
  await FounderRepositories.analyses.createAnalysis(record);
  return { status: "completed", evaluationVersionId: versionId, affectedGoalIds: evaluations.map((item) => item.goalId ?? item.id).filter(Boolean) };
}

function findPriorCanonicalPhoto(canonical, photo, observedAt) {
  return canonical.filter((item) => item.evidence_type === "progress_photo" && item.quality?.status === "active" &&
    arePhotoPoseIdentitiesCompatible(item.payload, photo) && String(item.lastObservedAt) < String(observedAt))
    .sort((left, right) => String(right.lastObservedAt).localeCompare(String(left.lastObservedAt)))[0] ?? null;
}

async function photoInterpreterInput(photo, session) {
  return { fileName: path.basename(photo.storage_path ?? photo.imagePath ?? "photo.jpg"), dataUrl: await privateImagePathToDataUrl(photo.storage_path ?? photo.imagePath), mimeType: mimeType(photo.storage_path ?? photo.imagePath), view: photo.view, pose: photo.pose, capturedAt: session.observed_at, conditions: session.conditions ?? {} };
}

async function canonicalPhotoInterpreterInput(canonical) {
  const photo = canonical.payload ?? {};
  const sourcePath = photo.storage_path ?? photo.imagePath ?? photo.sourcePath;
  if (!sourcePath) return null;
  return { fileName: path.basename(sourcePath), dataUrl: await privateImagePathToDataUrl(sourcePath), mimeType: mimeType(sourcePath), view: photo.view, pose: photo.pose, capturedAt: canonical.lastObservedAt, conditions: photo.conditions ?? {} };
}

async function privateImagePathToDataUrl(filePath) {
  if (!filePath) throw new Error("Confirmed photo storage path is missing.");
  const root = path.resolve(process.cwd(), "private", "founder");
  const relative = String(filePath).replace(/^private[\\/]founder[\\/]/i, "");
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root)) throw new Error("Confirmed photo path is outside private evidence storage.");
  const buffer = await fs.readFile(absolute);
  return `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function mimeType(filePath) {
  const extension = path.extname(String(filePath)).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function stableAnalysisId(parts) {
  return `analysis_${parts.join("|").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}`;
}

function stablePhotoIdentity(value) {
  return String(value ?? "view").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

export async function discardEvidenceReview(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  const recoveryContext = resolveRecoveryContext(review, formData);
  await createEvidenceReviewService({ repositories: FounderRepositories }).discard(reviewId, { confirmedBy: user?.id });
  if (recoveryContext) {
    revalidatePath(recoveryContext.returnTo);
    redirect(recoveryContext.returnTo);
  }
  redirect(`/evidence/review/${reviewId}?discarded=1`);
}

function resolveRecoveryContext(review, formData) {
  const candidate = createEvidenceRecoveryContext(
    review?.interpretedEvidence?.review_metadata?.recoveryContext
  ) ?? parseEvidenceRecoveryFormData(formData);
  return evidenceReviewMatchesRecoveryContext(review, candidate)
    ? candidate
    : null;
}
