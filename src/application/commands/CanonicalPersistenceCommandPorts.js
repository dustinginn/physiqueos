import { reconcileConfirmedEvidencePackage } from "../../domain/services/CanonicalEvidenceService.js";
import { ApplicationProblem, staleVersionProblem } from "../../contracts/v1/problem.js";
import {
  MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
  MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
  createMorningCheckInPersistenceService,
} from "../../domain/services/MorningCheckInPersistenceService.js";
import { createPILowerLevelCanonicalEvidenceCommitService } from "../../domain/services/PILowerLevelCanonicalEvidenceCommitService.js";
import {
  buildTrainingLoggerEvidencePackage,
  createProductionAppleHealthReconciliation,
} from "../../domain/services/TrainingLoggerAppleHealthService.js";
import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { normalizeTrainingExecutionVariant } from "../../domain/models/trainingExecutionVariant.js";
import { createTrainingExerciseRelationshipGroup } from "../../domain/models/trainingExerciseRelationship.js";
import {
  createCanonicalExerciseDefinition,
  findCanonicalExerciseConflict,
} from "../../domain/services/CanonicalExerciseLibraryService.js";
import { applyDexaReviewMeasurements } from "../../domain/services/DexaPdfIntakeService.js";
import { assertValidDexaScan } from "../../domain/services/DEXAContract.js";
import { createReminderRepository } from "../../data/repositories/ReminderRepository.js";
import {
  createPriorityOccurrenceKey,
  isReminderOccurrenceCompleted,
  resolvePriorityExecutionContract,
} from "../../domain/services/ReminderOccurrenceCompletion.js";

export const CANONICAL_PERSISTENCE_PORT_NAMES = Object.freeze([
  "submitWeight", "submitCheckIn", "createEvidenceIntake", "editEvidenceReview",
  "confirmEvidenceReview", "disposeEvidenceReview", "completePriority", "reconcilePreviousDay",
  "editProtocol", "editGoal", "transitionGoal", "createTrainingSession", "correctTrainingSession",
  "completeTrainingLogger", "confirmNutritionEvidence", "confirmPhotoEvidence", "confirmDexaEvidence",
  "upsertNutritionDay", "syncActivityDay", "commitTrainingSession", "upsertActivityDay",
  "editDexaReview", "requestEvidenceReviewConfirmation",
]);

export function createCanonicalPersistenceCommandPorts({ records, now = () => new Date() } = {}) {
  if (!records?.get || !records?.put) throw new Error("Canonical command ports require a record store.");
  const edit = (collection, idField) => async (context) => mutateExisting(
    context,
    collection,
    context.payload[idField],
    context.payload.changes ?? context.payload.patch ?? { corrections: context.payload.corrections }
  );
  const review = (status) => async (context) => mutateExisting(context, "evidenceReviews", context.payload.reviewId, { ...(context.payload.changes ?? {}), status });

  return Object.freeze({
    submitWeight: (context) => commitMorningCheckIn(context, { reconcilePreviousDayPriorities: false }),
    submitCheckIn: (context) => commitMorningCheckIn(context, { reconcilePreviousDayPriorities: true }),
    createEvidenceIntake: (context) => create(context, "evidencePackages", context.payload.submissionId, {
      id: context.payload.submissionId, userId: context.ownerUserId, status: "pending_review",
      ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.submissionId),
    editEvidenceReview: edit("evidenceReviews", "reviewId"),
    confirmEvidenceReview: review("confirmed"),
    disposeEvidenceReview,
    completePriority: completeCanonicalPriority,
    reconcilePreviousDay: async (context) => create(context, "dailyCheckIns", `reconciliation:${context.payload.localDate}`, {
      id: `reconciliation:${context.payload.localDate}`, userId: context.ownerUserId,
      localDate: context.payload.localDate, items: context.payload.items, status: "reconciled", provenance: commandProvenance(context),
    }),
    editProtocol: edit("protocols", "protocolId"),
    editGoal: edit("goals", "goalId"),
    transitionGoal: async (context) => mutateExisting(context, "goals", context.payload.goalId, {
      status: context.payload.status ?? "completed", transitionId: context.payload.transitionId,
      transitionedAt: now().toISOString(),
    }),
    createTrainingSession: (context) => create(context, "trainingPerformanceEvents", context.payload.sessionId, {
      id: context.payload.sessionId, userId: context.ownerUserId, observedAt: context.payload.observedAt,
      status: "recorded", ...context.payload, provenance: commandProvenance(context),
    }, context.payload.sourceIdentity ?? context.payload.sessionId),
    correctTrainingSession: edit("trainingPerformanceEvents", "sessionId"),
    completeTrainingLogger: completeOccurrence("trainingPerformanceEvents", "draftId", "reconciliations", "localDate"),
    confirmNutritionEvidence: review("confirmed_nutrition"),
    confirmPhotoEvidence: review("confirmed_photo"),
    confirmDexaEvidence: review("confirmed_dexa"),
    upsertNutritionDay: (context) => commitDailyEvidence(context, {
      evidenceType: "nutrition",
      payload: {
        id: `native-nutrition-${context.payload.localDate}`,
        evidence_type: "nutrition",
        observed_at: context.payload.localDate,
        daily_totals: context.payload.dailyTotals,
        meals: context.payload.meals ?? [],
        metadata: {
          date: context.payload.localDate,
          time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          daily_totals_scope: "full_day_summary",
        },
        reconciliation: {
          nutrition: {
            disposition: "replace",
            replacementScope: "full_day",
            expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
          },
        },
        source: context.payload.source ?? { application: "PhysiqueOS", modality: "manual" },
      },
    }),
    syncActivityDay: (context) => upsertCanonicalDay(context, {
      evidenceType: "activity_day",
      payload: {
        id: String(context.payload.sourceIdentity),
        evidence_type: "activity_day",
        observed_at: context.payload.localDate,
        daily_activity: context.payload.dailyActivity,
        metadata: {
          date: context.payload.localDate,
          time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          sync_checkpoint: context.payload.checkpoint ?? null,
        },
        reconciliation: {
          activity: {
            expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
          },
        },
        source: context.payload.source ?? { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      },
    }),
    upsertActivityDay: async (context) => {
      assertManualActivitySource(context.payload.source);
      return commitDailyEvidence(context, {
        evidenceType: "activity_day",
        payload: {
          id: String(context.payload.sourceIdentity),
          evidence_type: "activity_day",
          observed_at: context.payload.localDate,
          daily_activity: context.payload.dailyActivity,
          metadata: {
            date: context.payload.localDate,
            time_zone: context.metadata.clientTimeZone ?? context.payload.timeZone ?? "America/Los_Angeles",
          },
          reconciliation: {
            activity: {
              expectedPriorSemanticFingerprint: context.payload.expectedSemanticFingerprint ?? null,
            },
          },
          source: structuredClone(context.payload.source),
        },
      });
    },
    commitTrainingSession,
    editDexaReview,
    requestEvidenceReviewConfirmation,
  });

  async function commitMorningCheckIn(context, { reconcilePreviousDayPriorities }) {
    const date = context.payload.localDate;
    const weightId = `weight_${date.replaceAll("-", "_")}`;
    const existingWeight = await records.get({
      ownerUserId: context.ownerUserId,
      collection: "weightEntries",
      recordId: weightId,
    });
    if (existingWeight && Number(existingWeight.weight?.value) !== Number(context.payload.value)) {
      requireExpectedVersion(context, existingWeight, `weight:${date}`);
    }
    const collections = [...new Set([
      ...MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
      ...MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
    ])];
    const { candidate, before } = await loadCandidate(collections, context.ownerUserId);
    const recordedAt = context.payload.recordedAt ?? context.metadata.clientOccurredAt ?? now().toISOString();
    const result = await createMorningCheckInPersistenceService({
      runtimeStorePath: "/tmp/physiqueos-native-morning-check-in.json",
      liveStore: candidate,
      now: () => new Date(recordedAt),
      mutateCanonicalRuntime: (input) => mutateCandidateRuntime(candidate, context.metadata.commandId, input),
    }).save({
      user: candidate.user,
      weightValue: Number(context.payload.value),
      measurementDate: date,
      createdAt: recordedAt,
      at: recordedAt,
      notes: context.payload.notes ?? null,
      protocolChangeNote: context.payload.protocolChangeNote ?? null,
      estimatedCalories: finiteOrNull(context.payload.estimatedCalories),
      estimatedCaloriesBurned: finiteOrNull(context.payload.estimatedCaloriesBurned),
      proteinTarget: finiteOrNull(context.payload.proteinTarget),
      proteinAchieved: finiteOrNull(context.payload.proteinAchieved),
      weighInContext: context.payload.weighInContext ?? null,
      reconcilePreviousDayPriorities,
      reconciliationSubmissions: context.payload.reconciliationSubmissions ?? [],
    });
    const persisted = await persistCandidateCollections({
      before,
      candidate,
      collections: MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    const weight = candidate.weightEntries?.find((item) => item.id === weightId) ?? null;
    const checkInId = `daily_check_in_${date.replaceAll("-", "_")}`;
    const checkIn = candidate.dailyCheckIns?.find((item) => item.id === checkInId) ?? null;
    return {
      status: "committed",
      result: {
        status: result.status,
        weightId: weight?.id ?? null,
        weightRevision: persisted.get(`weightEntries:${weightId}`)?.version ?? existingWeight?.version ?? null,
        checkInId: checkIn?.id ?? null,
        checkInRevision: persisted.get(`dailyCheckIns:${checkInId}`)?.version ?? checkIn?.version ?? null,
        analysisId: result.analysisId ?? null,
        intendedDate: date,
        goalIds: weight?.relatedGoalIds ?? [],
        continuationWorkItemIds: result.briefingReconciliation?.workItemIds ?? [],
      },
      outbox: [],
    };
  }

  async function completeCanonicalPriority(context) {
    const id = String(context.payload.priorityId);
    const current = await ownedRecord(context, "reminders", id);
    const occurrenceDate = String(context.payload.occurrenceDate);
    if (isReminderOccurrenceCompleted(current, { occurrenceDate, timeZone: context.metadata.clientTimeZone })) {
      return {
        status: "committed",
        result: {
          status: "already_completed",
          priorityId: id,
          occurrenceDate,
          occurrenceKey: createPriorityOccurrenceKey(id, occurrenceDate),
          execution: resolvePriorityExecutionContract({ reminder: current, occurrenceDate }),
          revision: current.version,
        },
        outbox: [],
      };
    }
    requireExpectedVersion(context, current, `priority:${id}`);
    const reminders = [structuredClone(current)];
    const repository = createReminderRepository(reminders);
    const completedAt = context.payload.completedAt ?? now().toISOString();
    if (context.payload.dose && context.payload.protocolId) {
      await repository.completeReminderFromEvidence(id, {
        id: `${id}:${occurrenceDate}`,
        completedAt,
        evidenceDate: occurrenceDate,
        effectiveDose: context.payload.dose,
        protocolId: context.payload.protocolId,
        satisfactionType: "scheduled_protocol_execution",
        canonicalEvidenceId: null,
      });
    } else {
      await repository.completeReminder(id, completedAt, { occurrenceDate });
    }
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "reminders",
      recordId: id,
      expectedVersion: current.version,
      payload: { ...reminders[0], provenance: commandProvenance(context) },
    });
    return {
      status: "committed",
      result: {
        status: "completed",
        priorityId: id,
        occurrenceDate,
        occurrenceKey: createPriorityOccurrenceKey(id, occurrenceDate),
        execution: resolvePriorityExecutionContract({ reminder: updated, occurrenceDate }),
        completedAt,
        revision: updated.version,
      },
      outbox: [],
    };
  }

  async function commitTrainingSession(context) {
    const prepared = await createNativeTrainingPackage(context);
    const packageAndObject = prepared.evidencePackage;
    const supportingReview = prepared.supportingReview;
    const existingCanonicalObjects = await records.list({
      ownerUserId: context.ownerUserId,
      collection: "canonicalEvidenceObjects",
    });
    const goals = await records.list({ ownerUserId: context.ownerUserId, collection: "goals" });
    let preview;
    try {
      preview = reconcileConfirmedEvidencePackage({
        evidencePackage: packageAndObject,
        existingCanonicalObjects,
        goals,
        userId: context.ownerUserId,
        mutationReason: "native_training_session_commit",
      });
    } catch (error) {
      throw canonicalValidationProblem(error);
    }
    const existingById = new Map(existingCanonicalObjects.map((item) => [item.canonicalId, item]));
    for (const changed of preview.changedObjects) {
      const existing = existingById.get(changed.canonicalId);
      if (existing) requireExpectedVersion(context, existing, `training-session:${changed.canonicalId}`);
    }
    const reviewId = supportingReview?.id ?? `native_training_review_${context.metadata.commandId}`;
    const existingReview = await records.get({
      ownerUserId: context.ownerUserId,
      collection: "evidenceReviews",
      recordId: reviewId,
    });
    let reviewRevision = existingReview?.version ?? 1;
    if (!existingReview || supportingReview) {
      const packageId = `${packageAndObject.package_id}_${context.metadata.commandId}`;
      const evidencePackage = {
        ...packageAndObject,
        package_id: packageId,
        review_metadata: {
          ...(packageAndObject.review_metadata ?? {}),
          sourceReviewId: reviewId,
        },
      };
      await records.put({
        ownerUserId: context.ownerUserId,
        collection: "evidencePackages",
        recordId: packageId,
        sourceIdentity: context.metadata.idempotencyKey,
        payload: evidencePackage,
      });
      if (!existingReview) {
        await records.put({
          ownerUserId: context.ownerUserId,
          collection: "evidenceReviews",
          recordId: reviewId,
          sourceIdentity: context.metadata.idempotencyKey,
          payload: {
            id: reviewId,
            userId: context.ownerUserId,
            source: "training_logger",
            status: "pending",
            createdAt: now().toISOString(),
            updatedAt: now().toISOString(),
            interpretedEvidence: evidencePackage,
            evidenceTypes: ["training"],
            confirmation: null,
            commitProgress: {},
            itemDecisions: {},
            provenance: commandProvenance(context),
          },
        });
      } else {
        const updated = await records.put({
          ownerUserId: context.ownerUserId,
          collection: "evidenceReviews",
          recordId: reviewId,
          expectedVersion: existingReview.version,
          sourceIdentity: context.metadata.idempotencyKey,
          payload: {
            ...existingReview,
            source: "training_logger",
            status: "pending",
            updatedAt: now().toISOString(),
            interpretedEvidence: evidencePackage,
            evidenceTypes: ["training"],
            confirmation: null,
            commitProgress: {},
            itemDecisions: {},
            provenance: commandProvenance(context),
          },
        });
        reviewRevision = updated.version;
      }
    }
    return {
      status: "committed",
      result: {
        status: supportingReview ? "confirmation_requested" : existingReview ? "confirmation_resumed" : "confirmation_requested",
        reviewId,
        reviewRevision,
        sessionId: context.payload.sessionId,
        intendedDate: context.payload.localDate,
        exerciseIds: packageAndObject.evidence_objects
          .find((item) => item.evidence_type === "training")?.exercises
          ?.map((item) => item.canonicalExerciseId) ?? [],
      },
      outbox: [],
    };
  }

  async function commitDailyEvidence(context, { evidenceType, payload }) {
    const packageId = `${evidenceType}|native|${context.metadata.idempotencyKey}`;
    const evidencePackage = {
      id: packageId,
      package_id: packageId,
      userId: context.ownerUserId,
      source: { type: "native", deviceId: context.principal.deviceId },
      evidence_objects: [payload],
      review_metadata: {
        confirmedAt: context.metadata.clientOccurredAt ?? now().toISOString(),
        origin: "native_structured_write",
      },
    };
    const commit = await commitCanonicalEvidencePackage(context, evidencePackage);
    const record = commit.canonicalEvidenceObjects.find((item) => item.evidence_type === evidenceType) ?? null;
    return {
      status: "committed",
      result: {
        status: commit.outcome,
        canonicalId: record?.canonicalId ?? null,
        revision: record?.nutritionRevision?.revision ?? record?.activityRevision?.revision ?? null,
        recordVersion: record?.version ?? null,
        semanticFingerprint: record?.nutritionRevision?.semanticFingerprint ?? record?.activityRevision?.semanticFingerprint ?? null,
        intendedDate: context.payload.localDate,
        goalId: record?.goalId ?? null,
        phaseId: record?.phaseId ?? null,
        continuationWorkItemIds: commit.briefingReconciliation?.workItemIds ?? [],
        lowerLevelWorkItemIds: (commit.lowerLevelWork ?? []).map((item) => item.workId).filter(Boolean),
      },
      outbox: [],
    };
  }

  async function editDexaReview(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed"].includes(review.status)) {
      throw problem(409, "DEXA_REVIEW_NOT_EDITABLE", "This DEXA review cannot be edited.");
    }
    let matched = 0;
    const interpretedEvidence = {
      ...review.interpretedEvidence,
      evidence_objects: (review.interpretedEvidence?.evidence_objects ?? []).map((object) => {
        if (object.id !== context.payload.evidenceObjectId || !["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)) return object;
        matched += 1;
        const updated = applyDexaReviewMeasurements(object, context.payload.measurements);
        assertValidDexaScan(updated, { production: true });
        return updated;
      }),
    };
    if (matched !== 1) throw problem(404, "DEXA_EVIDENCE_UNAVAILABLE", "The DEXA scan is unavailable in this review.");
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "evidenceReviews",
      recordId: review.id,
      expectedVersion: review.version,
      payload: {
        ...review,
        interpretedEvidence,
        updatedAt: now().toISOString(),
        dexaMeasurementEditing: { updatedAt: now().toISOString(), updatedBy: context.ownerUserId },
      },
    });
    return {
      status: "committed",
      result: { status: "updated", reviewId: review.id, revision: updated.version, updatedAt: updated.updatedAt },
      outbox: [],
    };
  }

  async function requestEvidenceReviewConfirmation(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    if (review.status === "confirmed") {
      return { status: "committed", result: { status: "confirmed", reviewId: review.id, revision: review.version }, outbox: [] };
    }
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed", "partially_committed", "committing"].includes(review.status)) {
      throw problem(409, "EVIDENCE_REVIEW_NOT_COMMITTABLE", "This evidence review cannot be committed.");
    }
    return {
      status: "committed",
      result: { status: "confirmation_requested", reviewId: review.id, revision: review.version },
      outbox: [],
    };
  }

  async function disposeEvidenceReview(context) {
    const review = await ownedRecord(context, "evidenceReviews", context.payload.reviewId);
    requireExpectedVersion(context, review, `evidence-review:${review.id}`);
    if (!["pending", "commit_failed"].includes(review.status)) {
      throw problem(409, "EVIDENCE_REVIEW_NOT_DISMISSIBLE", "This evidence review cannot be dismissed.");
    }
    const updatedAt = now().toISOString();
    const updated = await records.put({
      ownerUserId: context.ownerUserId,
      collection: "evidenceReviews",
      recordId: review.id,
      expectedVersion: review.version,
      payload: {
        ...review,
        status: "discarded",
        updatedAt,
        disposition: { discardedAt: updatedAt, discardedBy: context.ownerUserId },
        provenance: commandProvenance(context),
      },
    });
    return {
      status: "committed",
      result: { status: "discarded", reviewId: review.id, revision: updated.version, updatedAt },
      outbox: [],
    };
  }

  async function createNativeTrainingPackage(context) {
    const supportingReviewId = context.payload.supportingEvidenceReviewId ?? null;
    const supportingReviewVersion = context.payload.supportingEvidenceReviewVersion ?? null;
    if (Boolean(supportingReviewId) !== (supportingReviewVersion != null)) {
      throw problem(400, "TRAINING_SUPPORTING_EVIDENCE_INCOMPLETE", "Supporting workout evidence requires both review identity and version.");
    }
    let supportingReview = null;
    if (supportingReviewId) {
      supportingReview = await ownedRecord(context, "evidenceReviews", supportingReviewId);
      if (Number(supportingReviewVersion) !== Number(supportingReview.version)) {
        throw staleVersionProblem({
          expectedVersion: supportingReviewVersion,
          actualVersion: supportingReview.version,
          resource: `evidence-review:${supportingReview.id}`,
        });
      }
      if (!["pending", "commit_failed"].includes(supportingReview.status)) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_UNAVAILABLE", "The supporting workout evidence is no longer available.");
      }
      const boundSessionId = supportingReview.interpretedEvidence?.review_metadata?.nativeTrainingSessionId;
      if (boundSessionId && String(boundSessionId) !== String(context.payload.sessionId)) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_ALREADY_BOUND", "The supporting evidence is already bound to another Training session.");
      }
      const evidenceTypes = new Set([
        ...(supportingReview.evidenceTypes ?? []),
        ...(supportingReview.interpretedEvidence?.evidence_objects ?? []).map((item) => item?.evidence_type),
      ].filter(Boolean));
      if (evidenceTypes.size === 0 || [...evidenceTypes].some((type) => type !== "training")) {
        throw problem(400, "TRAINING_SUPPORTING_EVIDENCE_TYPE_MISMATCH", "Only Training screenshot evidence can be bound to a Training session.");
      }
      const evidenceDate = String(
        supportingReview.interpretedEvidence?.observed_date ??
        supportingReview.interpretedEvidence?.provenance?.evidence_date ?? "",
      ).slice(0, 10);
      if (evidenceDate !== context.payload.localDate) {
        throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_DATE_MISMATCH", "Supporting evidence must match the Training session date.");
      }
    }
    const runtimeDefinitions = await records.list({
      ownerUserId: context.ownerUserId,
      collection: "canonicalExerciseLibrary",
    });
    const definitions = new Map([
      ...listCanonicalTrainingExerciseIdentities(),
      ...runtimeDefinitions,
    ].map((item) => [item.id, item]));
    const occurrences = context.payload.exercises.map((exercise, index) => {
      let definition = definitions.get(String(exercise.canonicalExerciseId));
      let createsCanonicalDefinition = false;
      if (!definition && exercise.provisionalExercise) {
        let candidate;
        try {
          candidate = createCanonicalExerciseDefinition({
            canonicalName: exercise.provisionalExercise.name,
            primaryMuscleGroupId: exercise.provisionalExercise.primaryMuscleGroupId,
          });
        } catch (error) {
          throw canonicalValidationProblem(error);
        }
        definition = findCanonicalExerciseConflict(candidate, runtimeDefinitions) ?? candidate;
        createsCanonicalDefinition = definition === candidate;
        definitions.set(definition.id, definition);
      }
      if (!definition) {
        throw problem(400, "CANONICAL_EXERCISE_UNAVAILABLE", `Exercise ${index + 1} does not identify a canonical exercise.`);
      }
      const occurrenceId = String(exercise.occurrenceId ?? `native_${context.payload.sessionId}_exercise_${index + 1}`);
      const sets = (exercise.sets ?? []).map((set, setIndex) => {
        const reps = Number(set.reps);
        const load = Number(set.load ?? 0);
        if (!Number.isFinite(reps) || reps <= 0 || !Number.isFinite(load) || load < 0) {
          throw problem(400, "TRAINING_SET_INVALID", `Exercise ${index + 1}, set ${setIndex + 1} has invalid reps or load.`);
        }
        const unit = String(set.unit ?? (definition.defaultLoadType === "bodyweight" ? "bodyweight" : "lb"));
        if (!["lb", "kg", "bodyweight"].includes(unit)) {
          throw problem(400, "TRAINING_SET_UNIT_INVALID", "Training set unit must be lb, kg, or bodyweight.");
        }
        return {
          id: String(set.setId ?? `${occurrenceId}_set_${setIndex + 1}`),
          reps,
          load: unit === "bodyweight" ? 0 : load,
          unit,
          confirmed: true,
        };
      });
      if (sets.length === 0) throw problem(400, "TRAINING_SETS_REQUIRED", `Exercise ${index + 1} requires at least one performed set.`);
      const occurrence = {
        id: occurrenceId,
        canonicalExerciseId: definition.id,
        name: definition.name,
        bodyRegion: definition.body_region,
        equipment: definition.equipment,
        executionVariant: exercise.executionVariant
          ? normalizeTrainingExecutionVariant(exercise.executionVariant)
          : null,
        sets,
      };
      if (exercise.provisionalExercise) {
        occurrence.resolutionStatus = createsCanonicalDefinition
          ? "resolved_new_canonical"
          : "resolved_existing_canonical";
        if (createsCanonicalDefinition) {
          occurrence.provisionalExercise = {
            provisionalExerciseId: `native_${context.payload.sessionId}_${occurrenceId}`,
            rawSubmittedName: exercise.provisionalExercise.name,
            normalizedDisplayName: definition.name,
            resolutionStatus: "resolved_new_canonical",
            resolutionMode: "new",
            resolvedCanonicalExerciseId: definition.id,
            confirmedDefinition: definition,
          };
        }
      }
      return occurrence;
    });
    const occurrenceIds = new Set(occurrences.map((item) => item.id));
    const exerciseRelationshipGroups = (context.payload.supersets ?? []).map((group, index) => {
      const members = (group.memberExerciseIds ?? []).map(String);
      if (members.length < 2 || members.some((id) => !occurrenceIds.has(id))) {
        throw problem(400, "TRAINING_SUPERSET_INVALID", `Superset ${index + 1} must reference at least two exercise occurrences in this session.`);
      }
      return createTrainingExerciseRelationshipGroup({
        id: group.id ?? `${context.payload.sessionId}_superset_${index + 1}`,
        memberExerciseIds: members,
        provenance_ref: `training_logger_draft_${context.payload.sessionId}`,
        relationshipType: "superset",
      });
    });
    const capturedAt = context.payload.capturedAt ?? context.metadata.clientOccurredAt ?? `${context.payload.localDate}T12:00:00.000Z`;
    const canonicalObjects = await records.list({ ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects" });
    const supportingReconciliation = supportingReview ? createProductionAppleHealthReconciliation({
      batchId: supportingReview.interpretedEvidence?.package_id,
      canonicalObjects,
      evidenceObjects: supportingReview.interpretedEvidence?.evidence_objects ?? [],
      workoutDate: context.payload.localDate,
    }) : null;
    if (supportingReconciliation && supportingReconciliation.matchState !== "strong_match") {
      throw problem(409, "TRAINING_SUPPORTING_EVIDENCE_MATCH_REQUIRED", "Supporting screenshots must identify exactly one unlinked strength workout for this date.");
    }
    const evidencePackage = buildTrainingLoggerEvidencePackage({
      canonicalObjects,
      draft: {
        draftVersion: "training_logger_web_v1",
        draftId: context.payload.sessionId,
        mode: context.payload.mode ?? "retrospective",
        workoutDate: context.payload.localDate,
        startedAt: context.payload.startedAt ?? null,
        finishedAt: context.payload.finishedAt ?? null,
        exercises: occurrences,
        exerciseRelationshipGroups,
        reconciliation: supportingReconciliation ? {
          ...supportingReconciliation,
          finalized: true,
        } : {
          normalizedEvidence: [],
          selectedStrengthSourceId: null,
          continueWithoutStrength: true,
          additionalEvidenceActions: [],
          finalized: true,
        },
      },
      sourcePackage: supportingReview?.interpretedEvidence ?? null,
      userId: context.ownerUserId,
    });
    return {
      supportingReview,
      evidencePackage: {
        ...evidencePackage,
        captured_at: capturedAt,
        review_metadata: {
          ...(evidencePackage.review_metadata ?? {}),
          confirmedAt: capturedAt,
          origin: "native_training_logger",
          nativeTrainingSessionId: context.payload.sessionId,
          supportingEvidenceReviewId: supportingReview?.id ?? null,
        },
        evidence_objects: evidencePackage.evidence_objects.map((item) => ({
          ...item,
          captured_at: capturedAt,
        })),
      },
    };
  }

  async function commitCanonicalEvidencePackage(context, evidencePackage) {
    const collections = [
      "user", "goals", "protocols", "protocolVersions", "dailyBriefings",
      "evidencePackages", "canonicalExerciseLibrary", "canonicalEvidenceObjects",
      "piEnergyConfidenceWorkItems", "piTrainingConfidenceWorkItems",
      "briefingReconciliationWorkItems",
    ];
    const { candidate, before } = await loadCandidate(collections, context.ownerUserId);
    let commit;
    try {
      commit = await createPILowerLevelCanonicalEvidenceCommitService({
        mutateCanonicalRuntime: (input) => mutateCandidateRuntime(candidate, context.metadata.commandId, input),
        now,
      }).commitConfirmedEvidencePackage(evidencePackage, context.ownerUserId);
    } catch (error) {
      throw canonicalValidationProblem(error);
    }
    if (["baseline_conflict", "persistence_failure", "committed_publication_failure"].includes(commit.outcome)) {
      throw new ApplicationProblem({
        status: commit.outcome === "baseline_conflict" ? 412 : 500,
        code: commit.errorCode ?? "CANONICAL_EVIDENCE_COMMIT_FAILED",
        title: commit.outcome === "baseline_conflict"
          ? "The canonical evidence changed before this command committed."
          : "The canonical evidence could not be committed.",
        detail: `Canonical evidence outcome: ${commit.outcome}.`,
      });
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: [
        "evidencePackages", "canonicalExerciseLibrary", "canonicalEvidenceObjects",
        "piEnergyConfidenceWorkItems", "piTrainingConfidenceWorkItems",
        "briefingReconciliationWorkItems",
      ],
      ownerUserId: context.ownerUserId,
    });
    const objectIds = new Set((evidencePackage.evidence_objects ?? []).map((item) => item.id));
    const packageId = evidencePackage.package_id;
    const canonicalEvidenceObjects = (candidate.canonicalEvidenceObjects ?? []).filter((item) =>
      item.provenance?.evidence_package_ids?.includes(packageId) ||
      item.provenance?.contributing_evidence_object_ids?.some((id) => objectIds.has(id))
    );
    return { ...commit, canonicalEvidenceObjects };
  }

  async function loadCandidate(collections, ownerUserId) {
    const candidate = {};
    const before = new Map();
    await Promise.all(collections.map(async (collection) => {
      const values = await records.list({ ownerUserId, collection });
      before.set(collection, structuredClone(values));
      if (collection === "user") candidate.user = structuredClone(values[0] ?? null);
      else candidate[collection] = structuredClone(values);
    }));
    if (!candidate.user?.id || String(candidate.user.id) !== String(ownerUserId)) {
      throw problem(404, "RESOURCE_NOT_FOUND", "The canonical owner is unavailable.");
    }
    return { candidate, before };
  }

  async function persistCandidateCollections({ before, candidate, collections, ownerUserId }) {
    const persisted = new Map();
    for (const collection of collections) {
      const priorById = new Map((before.get(collection) ?? []).map((item, index) => [recordIdentity(item, index), item]));
      for (const [index, item] of (candidate[collection] ?? []).entries()) {
        const id = recordIdentity(item, index);
        const prior = priorById.get(id);
        if (prior && comparableRecord(prior) === comparableRecord(item)) continue;
        const stored = await records.put({
          ownerUserId,
          collection,
          recordId: id,
          payload: item,
          expectedVersion: prior?.version ?? null,
          sourceIdentity: item.provenance?.sourceIdentity ?? null,
        });
        candidate[collection][index] = structuredClone(stored);
        persisted.set(`${collection}:${id}`, stored);
      }
    }
    return persisted;
  }

  async function mutateCandidateRuntime(candidate, commandId, { mutate }) {
    const result = await mutate(candidate, { commandId });
    candidate.revision = Number(candidate.revision ?? 0) + 1;
    candidate.updatedAt = now().toISOString();
    candidate.lastCommitId = commandId;
    return {
      result,
      revision: candidate.revision,
      commitId: commandId,
      changedCollections: [],
      memoryProfile: null,
    };
  }

  function requireExpectedVersion(context, record, resource) {
    if (context.metadata.expectedVersion == null) {
      throw problem(428, "PRECONDITION_REQUIRED", "If-Match is required to correct an existing canonical resource.");
    }
    if (Number(context.metadata.expectedVersion) !== Number(record.version)) {
      throw staleVersionProblem({
        expectedVersion: context.metadata.expectedVersion,
        actualVersion: record.version,
        resource,
      });
    }
  }

  async function upsertCanonicalDay(context, { evidenceType, payload }) {
    const [existingCanonicalObjects, goals] = await Promise.all([
      records.list({ ownerUserId: context.ownerUserId, collection: "canonicalEvidenceObjects" }),
      records.list({ ownerUserId: context.ownerUserId, collection: "goals" }),
    ]);
    const packageId = `${evidenceType}|native|${context.metadata.idempotencyKey}`;
    const evidencePackage = {
      id: packageId,
      package_id: packageId,
      userId: context.ownerUserId,
      source: { type: "native", deviceId: context.principal.deviceId },
      evidence_objects: [payload],
    };
    const reconciliation = reconcileConfirmedEvidencePackage({
      evidencePackage,
      existingCanonicalObjects,
      goals,
      userId: context.ownerUserId,
      mutationReason: `native_${evidenceType}_write`,
    });
    const existingById = new Map(existingCanonicalObjects.map((record) => [record.canonicalId, record]));
    const stored = [];
    for (const record of reconciliation.changedObjects) {
      const previous = existingById.get(record.canonicalId);
      stored.push(await records.put({
        ownerUserId: context.ownerUserId,
        collection: "canonicalEvidenceObjects",
        recordId: record.canonicalId,
        payload: record,
        expectedVersion: previous?.version ?? null,
        sourceIdentity: String(context.payload.sourceIdentity ?? packageId),
      }));
    }
    const current = stored.find((record) => record.evidence_type === evidenceType) ??
      reconciliation.changedObjects.find((record) => record.evidence_type === evidenceType) ??
      existingCanonicalObjects.find((record) => record.evidence_type === evidenceType && String(record.lastObservedAt).slice(0, 10) === context.payload.localDate) ?? null;
    return {
      status: "committed",
      result: {
        status: reconciliation.semanticChangedObjects.length > 0 ? "changed" : "unchanged",
        canonicalId: current?.canonicalId ?? null,
        revision: current?.nutritionRevision?.revision ?? current?.activityRevision?.revision ?? current?.version ?? null,
        semanticFingerprint: current?.nutritionRevision?.semanticFingerprint ?? current?.activityRevision?.semanticFingerprint ?? null,
      },
      outbox: [],
    };
  }

  function completeOccurrence(collection, idField, historyField, dateField = "occurrenceDate") {
    return async (context) => {
      const id = context.payload[idField];
      const current = await ownedRecord(context, collection, id);
      const occurrence = String(context.payload[dateField]);
      const history = Array.isArray(current[historyField]) ? current[historyField] : [];
      if (history.some((entry) => String(entry.occurrenceDate ?? entry.localDate) === occurrence)) {
        return outcome(context, current, "already_completed", collection, id);
      }
      return putExisting(context, collection, id, current, {
        [historyField]: [...history, { occurrenceDate: occurrence, localDate: occurrence, completedAt: now().toISOString(), commandId: context.metadata.commandId }],
        status: "completed",
      });
    };
  }

  async function mutateExisting(context, collection, id, changes) {
    const current = await ownedRecord(context, collection, id);
    return putExisting(context, collection, id, current, changes);
  }

  async function putExisting(context, collection, id, current, changes) {
    const updated = await records.put({
      ownerUserId: context.ownerUserId, collection, recordId: String(id),
      expectedVersion: context.metadata.expectedVersion,
      payload: { ...current, ...structuredClone(changes), id: current.id ?? id, userId: context.ownerUserId, provenance: commandProvenance(context) },
    });
    return outcome(context, updated, "committed", collection, id);
  }

  async function create(context, collection, id, payload, sourceIdentity = null) {
    const existing = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (existing) return outcome(context, existing, "already_exists", collection, id);
    const created = await records.put({ ownerUserId: context.ownerUserId, collection, recordId: String(id), payload, sourceIdentity });
    return outcome(context, created, "committed", collection, id);
  }

  async function ownedRecord(context, collection, id) {
    const record = await records.get({ ownerUserId: context.ownerUserId, collection, recordId: String(id) });
    if (!record || (record.userId != null && String(record.userId) !== String(context.ownerUserId))) {
      throw problem(404, "RESOURCE_NOT_FOUND", `Canonical ${collection} record is unavailable.`);
    }
    return record;
  }

  function outcome(context, record, status = "committed", collection = "unknown", recordId = record?.id ?? "unknown") {
    return {
      status: "committed",
      result: { status, record },
      outbox: [],
    };
  }
  function commandProvenance(context) { return { source: "phase4-application-command", commandId: context.metadata.commandId, deviceId: context.principal.deviceId, ...(context.canonicalStoreEpoch ? { canonicalStoreEpoch: context.canonicalStoreEpoch } : {}) }; }
}

function assertManualActivitySource(source) {
  const descriptor = `${source?.application ?? ""} ${source?.integration ?? ""} ${source?.modality ?? ""}`.toLowerCase();
  if (!descriptor.trim()) {
    throw problem(400, "ACTIVITY_SOURCE_REQUIRED", "Activity writes must explicitly declare screenshot or manual provenance.");
  }
  if (/healthkit|apple health|\bdirect\b/.test(descriptor)) {
    throw problem(400, "ACTIVITY_HEALTHKIT_FORBIDDEN", "The Native production contract accepts screenshot or manual Activity evidence only.");
  }
  if (!/manual|screenshot|typed/.test(descriptor)) {
    throw problem(400, "ACTIVITY_SOURCE_INVALID", "Activity source modality must be manual, typed, or screenshot.");
  }
}

function recordIdentity(record, index = 0) {
  return String(record?.id ?? record?.canonicalId ?? record?.package_id ?? record?.review_id ?? `@index:${index}`);
}

function comparableRecord(record) {
  const { version: _version, ...value } = structuredClone(record ?? {});
  return JSON.stringify(value);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function problem(status, code, title) {
  return new ApplicationProblem({ status, code, title });
}

function canonicalValidationProblem(error) {
  if (error instanceof ApplicationProblem) return error;
  return new ApplicationProblem({
    status: 400,
    code: error?.code ?? "CANONICAL_EVIDENCE_INVALID",
    title: "The canonical evidence payload is invalid.",
    detail: error?.message ?? null,
    cause: error,
  });
}
