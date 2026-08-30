import { createSeedRepositories } from "../../data/repositories/createSeedRepositories";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createDailyCheckIn } from "../models/dailyCheckIn";
import { createCanonicalMorningWeightEvidenceObject } from "../models/morningWeightEvidence";
import { createWeightEntry } from "../models/weightEntry";
import { createAnalysisFromEvidence } from "./AnalysisService";
import { extractManualNoteEvidence } from "./DailyEventService";
import {
  MorningPriorityReconciliationValidationError,
  createMorningPriorityReconciliationService,
} from "./MorningPriorityReconciliationService";
import {
  createBriefingReconciliationEnqueueService,
} from "./BriefingReconciliationEnqueueService";
import {
  getLocalDateKey,
  getLocalDayWindow,
  resolveLocalTimeZone,
} from "../utils/localDate";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export const MORNING_CHECK_IN_BOUNDED_COLLECTIONS = Object.freeze([
  "weightEntries",
  "dailyCheckIns",
  "canonicalEvidenceObjects",
  "analyses",
  "reminders",
  "briefingReconciliationWorkItems",
]);

export const MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS = Object.freeze([
  "user",
  "goals",
  "weightEntries",
  "dexaScans",
  "protocols",
  "protocolVersions",
  "executionItems",
  "reminders",
  "progressPhotos",
  "dailyCheckIns",
  "dailyBriefings",
  "briefingReconciliationWorkItems",
  "analyses",
  "evidencePackages",
  "evidenceReviews",
  "canonicalEvidenceObjects",
]);

export class MorningCheckInPersistenceValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MorningCheckInPersistenceValidationError";
    this.code = code;
  }
}

export function createMorningCheckInPersistenceService({
  runtimeStorePath,
  liveStore,
  mutateCanonicalRuntime = null,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  briefingCoordinator = createBriefingReconciliationEnqueueService({ now }),
  faults = {},
} = {}) {
  if ((!runtimeStorePath || !liveStore) &&
      typeof mutateCanonicalRuntime !== "function") {
    throw new Error("Morning Check-In persistence requires a bound Founder store.");
  }

  return {
    async save(command = {}) {
      const recordedAt = toDate(command.at ?? now());
      const createdAt = command.createdAt ?? recordedAt.toISOString();

      if (typeof mutateCanonicalRuntime === "function") {
        const committed = await mutateCanonicalRuntime({
          operation: "direct-weigh-in",
          allowedCollections: MORNING_CHECK_IN_BOUNDED_COLLECTIONS,
          readCollections: MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
          readApplicationContext: false,
          readImportMetadata: false,
          allowApplicationContextMutation: false,
          async mutate(candidate, { commandId }) {
            const boundedService = createMorningCheckInPersistenceService({
              runtimeStorePath: "/tmp/physiqueos-bounded-direct-weigh-in.json",
              liveStore: candidate,
              now: () => recordedAt,
              createUnitOfWork: () => createBoundedCandidateUnitOfWork({
                candidate,
                commandId,
              }),
              briefingCoordinator,
              faults,
            });
            return boundedService.save(resolveCandidateCommand({
              candidate,
              command,
              createdAt,
              recordedAt,
            }));
          },
        });
        return Object.freeze({
          ...committed.result,
          committed: committed.changedCollections.length > 0,
          revision: committed.revision,
          commitId: committed.commitId,
          changedCollections: Object.freeze([...committed.changedCollections]),
          memoryProfile: committed.memoryProfile,
        });
      }

      command = resolveCandidateCommand({
        candidate: liveStore,
        command,
        createdAt,
        recordedAt,
      });
      const transaction = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now: () => recordedAt,
        stageFrom: liveStore,
        binding: {
          storeIdentity: "founder_runtime_store",
          storeKind: "production",
          isolated: false,
          productionAllowed: true,
        },
        lockContext: {
          operation: "morning_check_in",
          requestId: command.requestId ?? null,
        },
      }).begin();

      try {
        const stagedResult = await transaction.mutate(async (candidate) => {
          const repositories = createSeedRepositories(candidate);
          const weights = await repositories.weights.listWeightEntries(
            command.user.id
          );
          const previousWeight = [...weights]
            .filter(
              (item) => String(item.measuredAt).slice(0, 10) < command.today
            )
            .sort((left, right) =>
              String(right.measuredAt).localeCompare(String(left.measuredAt))
            )[0] ?? null;
          const existingSameDayWeight = weights.find(
            (item) =>
              String(item.measuredAt).slice(0, 10) === command.today
          ) ?? null;
          const reconciliationService =
            createMorningPriorityReconciliationService({
              repositories,
              now: () => recordedAt,
            });
          const reconciliation = await reconciliationService.save({
            userId: command.user.id,
            timeZone: command.timeZone,
            submissions: command.reconciliationSubmissions ?? [],
            at: recordedAt,
          });

          if (
            existingSameDayWeight?.weight?.value === command.weightValue
          ) {
            return {
              status: "unchanged",
              changed: reconciliation.persisted.length > 0,
              analysisId: null,
              reconciliation: reconciliationDescriptor(
                reconciliation,
                command.reconciliationSubmissions
              ),
            };
          }

          const contextAdjusted = command.weighInContext.isDefault === false;
          const evidenceConfidence = contextAdjusted ? "medium" : "high";
          const noteEvidence = extractManualNoteEvidence(command.notes);
          const weightEntry = createWeightEntry({
            id: `weight_${command.today.replaceAll("-", "_")}`,
            userId: command.user.id,
            measuredAt: command.today,
            weight: {
              value: command.weightValue,
              unit: command.user.preferences?.weightUnit ?? "lb",
            },
            relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
            source: {
              type: "manual",
              name: "Morning Check-In",
              externalId: null,
              importedAt: null,
              confidence: evidenceConfidence,
              notes: contextAdjusted
                ? "Manual weight recorded under different conditions; still overrides imported weight for the same day."
                : "Manual morning weight overrides imported weight for the same day.",
            },
            fieldProvenance: {
              imported: [
                "measuredAt",
                "weight.value",
                "weight.unit",
                "relatedGoalIds",
                "context",
                "notes",
              ],
              computed: [],
            },
            reliability: evidenceConfidence,
            context: command.weighInContext,
            notes: command.notes,
            createdAt,
            updatedAt: createdAt,
          });

          await repositories.weights.addWeightEntry(weightEntry);
          await faults.afterWeightMutation?.({
            candidate,
            repositories,
            weightEntry,
          });

          const existingTodayCheckIn =
            await repositories.dailyCheckIns.getCheckInForDate(
              command.user.id,
              command.today
            );
          const dailyCheckIn = await repositories.dailyCheckIns.saveCheckIn(
            createDailyCheckIn({
              ...existingTodayCheckIn,
              id: `daily_check_in_${command.today.replaceAll("-", "_")}`,
              userId: command.user.id,
              date: command.today,
              weightEntryId: weightEntry.id,
              relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
              nutrition: {
                proteinTargetHit: getTargetHit(
                  command.proteinAchieved,
                  command.proteinTarget
                ),
                calorieTargetHit: null,
                estimatedCalories: command.estimatedCalories,
                estimatedCaloriesIn: command.estimatedCalories,
                estimatedCaloriesBurned: command.estimatedCaloriesBurned,
                proteinTarget: command.proteinTarget,
                proteinAchieved: command.proteinAchieved,
                relatedGoalIds: [LEAN_MASS_GOAL_ID],
                notes: "",
              },
              recovery: {
                sleepHours: null,
                sleepQuality:
                  noteEvidence?.category === "recovery"
                    ? noteEvidence.sleepQuality
                    : null,
                sleepTargetHit:
                  noteEvidence?.category === "recovery"
                    ? noteEvidence.sleepTargetHit
                    : null,
                notes:
                  noteEvidence?.category === "recovery"
                    ? noteEvidence.originalNote
                    : null,
              },
              protocols: {
                completedProtocolIds: [],
                changeNote: command.protocolChangeNote,
              },
              notes: command.notes,
              source: {
                type: "manual",
                name: "Morning Check-In",
                externalId: null,
                importedAt: null,
                confidence: "high",
                notes: "Founder Alpha morning check-in.",
              },
              fieldProvenance: {
                imported: [
                  "date",
                  "weightEntryId",
                  "relatedGoalIds",
                  "nutrition.estimatedCalories",
                  "nutrition.estimatedCaloriesIn",
                  "nutrition.estimatedCaloriesBurned",
                  "nutrition.proteinTarget",
                  "nutrition.proteinAchieved",
                  "nutrition.relatedGoalIds",
                  "protocols.changeNote",
                  "notes",
                ],
                computed: [
                  "recovery.sleepQuality",
                  "recovery.sleepTargetHit",
                  "recovery.notes",
                ],
              },
              createdAt,
              updatedAt: createdAt,
            })
          );
          await faults.afterDailyCheckInMutation?.({
            candidate,
            dailyCheckIn,
            repositories,
            weightEntry,
          });

          const canonicalObject =
            createCanonicalMorningWeightEvidenceObject({
              createdAt,
              dailyCheckIn,
              userId: command.user.id,
              weightEntry,
            });
          if (canonicalObject) {
            await repositories.canonicalEvidence
              .upsertCanonicalEvidenceObjects([canonicalObject]);
          }
          const briefingReconciliation = canonicalObject
            ? briefingCoordinator.stageCanonicalEvidenceChanges(candidate, {
                canonicalChanges: [canonicalObject],
                confirmedAt: createdAt,
                userId: command.user.id,
              })
            : null;
          await faults.afterCanonicalEvidenceMutation?.({
            candidate,
            canonicalObject,
            briefingReconciliation,
            dailyCheckIn,
            repositories,
            weightEntry,
          });

          const analysis = createAnalysisFromEvidence({
            id: weightEntry.id,
            type: "weight",
            createdAt,
            analysisId:
              `analysis_morning_weight_${createdAt.replace(/\D/g, "")}`,
            value: weightEntry.weight.value,
            unit: weightEntry.weight.unit,
            measuredAt: weightEntry.measuredAt,
            previousValue: previousWeight?.weight?.value ?? null,
            previousMeasuredAt: previousWeight?.measuredAt ?? null,
            context: command.weighInContext,
            notes: command.notes,
            confidenceBefore: previousWeight ? 0.62 : 0.52,
            confidenceAfter: getConfidenceAfter({
              hasPreviousWeight: Boolean(previousWeight),
              contextAdjusted,
            }),
          });
          await repositories.analyses.createAnalysis(analysis);
          await faults.afterAnalysisMutation?.({
            analysis,
            candidate,
            canonicalObject,
            dailyCheckIn,
            repositories,
            weightEntry,
          });

          return {
            status: "saved",
            changed: true,
            analysisId: analysis.id,
            analysis,
            canonicalObject,
            briefingReconciliation,
            dailyCheckIn,
            reconciliation: reconciliationDescriptor(
              reconciliation,
              command.reconciliationSubmissions
            ),
            weightEntry,
          };
        });

        if (!stagedResult.changed) {
          transaction.abort();
          return Object.freeze({
            status: stagedResult.status,
            committed: false,
            analysisId: stagedResult.analysisId,
            date: command.today,
            currentDate: command.currentDate,
            revision: liveStore.revision ?? 0,
            commitId: liveStore.lastCommitId ?? null,
          });
        }

        const committed = await transaction.commit({
          finalizeCandidate({ stagedState, commitId }) {
            briefingCoordinator.stampSourceCommit(stagedState, commitId);
          },
          validateFinalized(candidate) {
            faults.beforeFinalValidation?.(candidate, stagedResult);
            return validateCandidate(candidate, stagedResult, command);
          },
        });
        return Object.freeze({
          status: stagedResult.status,
          committed: true,
          analysisId: stagedResult.analysisId,
          date: command.today,
          currentDate: command.currentDate,
          briefingReconciliation: freezeBriefingReconciliation(
            stagedResult.briefingReconciliation
          ),
          revision: committed.revision,
          commitId: committed.commitId,
        });
      } catch (error) {
        const reconciliationError = findCause(
          error,
          MorningPriorityReconciliationValidationError
        );
        if (reconciliationError) throw reconciliationError;
        throw error;
      }
    },
  };
}

function createBoundedCandidateUnitOfWork({ candidate, commandId }) {
  return {
    begin() {
      let status = "open";
      let result;
      const assertOpen = () => {
        if (status !== "open") throw new Error("The bounded direct-weigh-in transaction is closed.");
      };
      return {
        get status() {
          return status;
        },
        async mutate(callback) {
          assertOpen();
          result = await callback(candidate);
          return result;
        },
        abort() {
          assertOpen();
          status = "aborted";
          return { status };
        },
        async commit({ finalizeCandidate, validateFinalized } = {}) {
          assertOpen();
          status = "committing";
          await finalizeCandidate?.({ stagedState: candidate, commitId: commandId });
          if (typeof validateFinalized === "function" &&
              await validateFinalized(candidate) === false) {
            throw Object.assign(
              new Error("Finalized bounded direct-weigh-in candidate was rejected."),
              { code: "VALIDATION_FAILED" }
            );
          }
          status = "committed";
          return {
            status,
            committed: true,
            revision: Number(candidate.revision ?? 0) + 1,
            commitId: commandId,
            result,
          };
        },
      };
    },
  };
}

function resolveCandidateCommand({ candidate, command, createdAt, recordedAt }) {
  const user = command.user ?? candidate.user;
  if (!user?.id) {
    throw new MorningCheckInPersistenceValidationError(
      "Founder user is not available.",
      "founder_unavailable"
    );
  }
  const timeZone = resolveLocalTimeZone(
    command.timeZone ?? user.timeZone ?? user.timezone
  );
  const currentDate = getLocalDateKey(recordedAt, timeZone);
  let measurementDate = command.today ?? currentDate;
  if (command.measurementDate != null) {
    try {
      measurementDate = getLocalDayWindow({
        dateKey: String(command.measurementDate).trim(),
        timeZone,
      }).dateKey;
    } catch {
      throw new MorningCheckInPersistenceValidationError(
        "Choose a valid weigh-in date.",
        "invalid_date"
      );
    }
  }
  if (measurementDate > currentDate) {
    throw new MorningCheckInPersistenceValidationError(
      "A weigh-in cannot be logged for a future date.",
      "future_date"
    );
  }
  return {
    ...command,
    user,
    timeZone,
    today: measurementDate,
    currentDate,
    createdAt,
    at: recordedAt,
    weighInContext: resolveCandidateWeighInContext(
      user,
      command.weighInContext
    ),
  };
}

function resolveCandidateWeighInContext(user, override) {
  const defaults = user.preferences?.defaultWeighInContext ?? {};
  const base = {
    timing: defaults.timing ?? "morning",
    nutritionState: defaults.nutritionState ?? "fasted",
    intakeState: defaults.intakeState ?? "before_food_water",
    scale: defaults.scale ?? "normal_home_scale",
    confidence: defaults.confidence ?? "high",
  };
  if (!override) {
    return {
      ...base,
      conditions: [],
      notes: null,
      isDefault: true,
    };
  }
  if (override.isDefault !== false) {
    return {
      ...base,
      ...Object.fromEntries(
        Object.entries(override).filter(([, value]) => value != null && value !== "")
      ),
      conditions: override.conditions ?? [],
      notes: override.notes ?? null,
      isDefault: true,
    };
  }
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(override).filter(([, value]) => value != null && value !== "")
    ),
    conditions: override.conditions ?? [],
    notes: override.notes ?? null,
    confidence: "context_adjusted",
    isDefault: false,
  };
}

function freezeBriefingReconciliation(value) {
  if (!value) return Object.freeze({
    affectedPublicationIds: Object.freeze([]),
    changed: false,
    workItemIds: Object.freeze([]),
  });
  return Object.freeze({
    affectedPublicationIds: Object.freeze([
      ...(value.affectedPublicationIds ?? []),
    ]),
    changed: value.changed === true,
    workItemIds: Object.freeze([...(value.workItemIds ?? [])]),
  });
}

function validateCandidate(candidate, result, command) {
  if (!validateReconciliation(candidate, result.reconciliation, command)) {
    return false;
  }
  if (result.status === "unchanged") return true;

  const weights = (candidate.weightEntries ?? []).filter(
    (item) =>
      item.userId === command.user.id &&
      String(item.measuredAt).slice(0, 10) === command.today
  );
  const checkIns = (candidate.dailyCheckIns ?? []).filter(
    (item) => item.userId === command.user.id && item.date === command.today
  );
  const evidence = (candidate.canonicalEvidenceObjects ?? []).filter(
    (item) => item.canonicalId === result.canonicalObject?.canonicalId
  );
  const analyses = (candidate.analyses ?? []).filter(
    (item) => item.id === result.analysis.id
  );
  const briefingWorkValid = (result.briefingReconciliation?.workItemIds ?? [])
    .every((workId) => candidate.briefingReconciliationWorkItems?.some(
      (item) => item.id === workId &&
        !item.sourceCommitLinks?.includes("pending_source_commit")
    ));

  return (
    weights.length === 1 &&
    weights[0].id === result.weightEntry.id &&
    weights[0].weight?.value === command.weightValue &&
    checkIns.length === 1 &&
    checkIns[0].id === result.dailyCheckIn.id &&
    checkIns[0].weightEntryId === result.weightEntry.id &&
    evidence.length === 1 &&
    evidence[0].evidence_type === "morning_weight" &&
    evidence[0].payload?.provenance?.weight_entry_ids?.includes(
      result.weightEntry.id
    ) &&
    evidence[0].payload?.provenance?.daily_check_in_ids?.includes(
      result.dailyCheckIn.id
    ) &&
    analyses.length === 1 &&
    analyses[0].evidenceTypes?.includes("weight") &&
    analyses[0].evidenceIds?.includes(result.weightEntry.id) &&
    briefingWorkValid
  );
}

function validateReconciliation(candidate, descriptor, command) {
  if (!descriptor?.persisted?.length) return true;
  const checkIn = (candidate.dailyCheckIns ?? []).find(
    (item) =>
      item.userId === command.user.id && item.date === descriptor.date
  );
  if (!checkIn) return false;

  return descriptor.persisted.every((submission) => {
    const persisted = (checkIn.reconciliation ?? []).find(
      (item) => item.key === submission.occurrenceKey
    );
    if (
      !persisted ||
      persisted.status !== submission.disposition ||
      (persisted.note ?? null) !== (submission.note ?? null)
    ) {
      return false;
    }
    if (submission.disposition !== "completed") return true;
    return (candidate.reminders ?? []).some(
      (item) =>
        item.id === submission.priorityId &&
        item.completedAt === `${submission.occurrenceDate}T20:00:00`
    );
  });
}

function reconciliationDescriptor(reconciliation, submissions = []) {
  const persistedKeys = new Set(reconciliation.persisted ?? []);
  const persisted = submissions.filter((item) =>
    persistedKeys.has(item.occurrenceKey)
  );
  return {
    date: persisted[0]?.occurrenceDate ?? null,
    persisted,
  };
}

function getConfidenceAfter({ hasPreviousWeight, contextAdjusted }) {
  if (contextAdjusted) return hasPreviousWeight ? 0.6 : 0.52;
  return hasPreviousWeight ? 0.68 : 0.58;
}

function getTargetHit(achieved, target) {
  if (achieved == null || target == null) return null;
  return achieved >= target;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Morning Check-In requires a valid recorded time.");
  }
  return date;
}

function findCause(error, ErrorType) {
  let current = error;
  while (current) {
    if (current instanceof ErrorType) return current;
    current = current.cause;
  }
  return null;
}
