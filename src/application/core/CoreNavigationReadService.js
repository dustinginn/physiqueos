import { classifyTrainingSetLoad, resolveExerciseDefaultLoadType } from "../../domain/models/trainingSetLoadSemantics.js";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../../platform/migration/foundationSourceCollections.js";
import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createGoalsHubReadService } from "../goals/GoalsHubReadService.js";
import { createLogReadService } from "../log/LogReadService.js";
import { createOperatingPlanReadService } from "../plan/OperatingPlanReadService.js";
import { createYouProfileService } from "../../domain/services/YouProfileService.js";
import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { getPrimaryTrainingNavigationGroup } from "../../navigation/trainingNavigationMapping.js";
import { createMorningPriorityReconciliationService } from "../../domain/services/MorningPriorityReconciliationService.js";
import { createBriefingReconciliationPresentation } from "../../domain/services/BriefingReconciliationPresentationService.js";
import { MORNING_EVIDENCE_RECOVERY_STATUSES } from "../../domain/services/MorningEvidenceRecoveryService.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../../domain/utils/localDate.js";
import { resolveMorningWeighInSupport } from "../../domain/services/TrackingSupportService.js";
import { createRecurringSupportHydrationModel } from "../../domain/services/RecurringSupportManagementService.js";
import {
  classifyPeptideExecutionState,
  createPeptideSupportHydrationModel,
  PeptideExecutionState,
} from "../../domain/services/PeptideExecutionManagementService.js";
import { formatSupportScheduleSummary } from "../../domain/models/SupportScheduleModel.js";
import { ReminderType } from "../../domain/models/reminder.js";
import { composeOperatingPlanStrategyDetail } from "../../domain/services/OperatingPlanStrategyDetailService.js";
import { createStrategyEditorModel, TRAINING_AREAS } from "../../domain/services/StrategyEditorService.js";
import { canonicalWeightEntries } from "../../domain/weight/canonicalWeight.js";
import { selectCanonicalActiveGoal } from "../../domain/services/CanonicalGoalRelationshipService.js";
import { resolveCanonicalGoalPhaseChronology } from "../../domain/services/CanonicalGoalPhaseChronologyService.js";
import {
  createTrainingLoggerProgressionRecommendation,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "../../domain/services/TrainingLoggerProgressionService.js";
import { createTrainingLoggerSuggestion } from "../../domain/services/TrainingLoggerSuggestionService.js";
import {
  buildStrategyDomainModel,
  STRATEGY_DOMAIN_PRESENTATION,
} from "../../domain/services/StrategyDomainReadService.js";
import {
  createSupplementSupportHydrationModel,
  formatSupplementSupportSummary,
} from "../../domain/services/SupplementSupportManagementService.js";
import { createCoachingUpdatesReadService } from "../../domain/services/CoachingUpdatesReadService.js";
import { createCoachingUpdatesEditorModel } from "../../domain/services/CoachingUpdatesEditorService.js";
import { resolveCoachingUpdatesGoalCadencePolicy } from "../../domain/services/CoachingUpdatesGoalCadencePolicyService.js";
import { createCoachingUpdatesSemanticDigest } from "../../domain/services/FounderRuntimeSemanticDigest.js";
import { createProgressPhotosExecutionHydrationModel } from "../../domain/services/ProgressPhotosExecutionScheduleService.js";
import { DEXA_APPOINTMENT_ID } from "../../domain/services/DexaAppointmentManagementService.js";
import { isCurrentScheduledDexaAppointment } from "../../domain/services/DexaAppointmentLifecycleService.js";
import {
  isReminderOccurrenceCompleted,
  resolveScheduledTime,
} from "../../domain/services/ReminderOccurrenceCompletion.js";
import { indexConfirmedHealthKitWorkoutAttachments } from "../../domain/services/HealthKitWorkoutPresentationService.js";

export const CORE_NAVIGATION_COLLECTIONS = Object.freeze({
  home: Object.freeze([
    "user", "goals", "weightEntries", "dexaScans", "protocols", "protocolVersions",
    "executionItems", "reminders", "nutritionContext", "operatingPlan", "progressPhotos",
    "dailyCheckIns", "dailyBriefings", "analyses", "canonicalEvidenceObjects",
    "goalConfidenceSnapshots", "goalConfidenceHistory", "goalConfidenceContinuitySeeds",
  ]),
  log: Object.freeze([
    "user", "evidenceReviews", "canonicalEvidenceObjects",
    "healthKitCanonicalWorkouts", "healthKitWorkoutLinks", "healthKitWorkoutLinkClaims",
  ]),
  goals: Object.freeze([
    "user", "goals", "goalTransitionDrafts", "goalProtocolTransitionDrafts",
    "operatingPlan",
    "weightEntries", "dexaScans", "protocols", "nutritionContext", "progressPhotos",
    "dailyBriefings", "analyses", "canonicalEvidenceObjects",
    "goalConfidenceSnapshots", "goalConfidenceHistory", "goalConfidenceContinuitySeeds",
  ]),
  operatingPlan: Object.freeze([
    "user", "goals", "operatingPlan", "protocols", "protocolVersions",
    "executionItems", "reminders", "nutritionContext", "canonicalEvidenceObjects",
  ]),
  trainingLogger: Object.freeze(["user", "goals", "canonicalEvidenceObjects", "myLibraryMemberships"]),
  morningCheckIn: Object.freeze([
    "user", "weightEntries", "reminders", "dailyCheckIns", "dexaScans",
    "progressPhotos", "canonicalEvidenceObjects", "evidenceReviews", "executionItems",
    "protocols", "protocolVersions", "briefingReconciliationWorkItems",
  ]),
  profile: Object.freeze([
    "user", "goals", "protocols", "reminders", "nutritionContext",
    "weightEntries", "dexaScans", "progressPhotos",
  ]),
  tracking: Object.freeze(["user", "executionItems", "protocols", "reminders"]),
  coachingUpdates: Object.freeze([
    "user", "goals", "protocols", "protocolVersions", "executionItems", "reminders",
    "dexaScans", "progressPhotos", "evidenceReviews",
  ]),
});

export function createCoreNavigationReadService({
  store,
  now = () => new Date(),
  readCanonicalExerciseRegistry = null,
} = {}) {
  if (!store?.run || !store?.getOwnerUserId) {
    throw new Error("Core navigation requires a read store.");
  }

  return Object.freeze({
    async getHome() {
      await ensureCanonicalExerciseRegistry();
      return withContext("core.navigation.home", "home", async ({ ownerUserId, repositories, runtime }) =>
        createHomeBriefingService({ repositories, readRuntimeStore: () => runtime, now })
          .getHomeBriefing(ownerUserId));
    },
    getLog() {
      return withContext("core.navigation.log", "log", async ({ ownerUserId, principal, repositories, runtime }) => {
        const user = runtime.user?.id === ownerUserId ? runtime.user : null;
        const log = await createLogReadService({ repositories, now }).getLog({
          principal,
          timeZone: user?.timeZone ?? user?.timezone,
        });
        return projectConfirmedHealthKitLogProvenance(log, runtime);
      });
    },
    async getGoals() {
      await ensureCanonicalExerciseRegistry();
      return withContext("core.navigation.goals", "goals", ({ principal, repositories, runtime }) =>
        createGoalsHubReadService({ repositories, readRuntimeStore: () => runtime })
          .getGoalsHub({ principal }));
    },
    getOperatingPlan() {
      return withContext("core.navigation.operating-plan", "operatingPlan", ({ principal, repositories }) =>
        createOperatingPlanReadService({ repositories }).getOperatingPlan({ principal, includePausedSupplements: true }));
    },
    getOperatingPlanProtocolDomain({ protocolId }) {
      return withContext("core.navigation.operating-plan-protocol-domain", "operatingPlan", ({ ownerUserId, runtime }) => {
        const representative = (runtime.protocols ?? []).find((item) =>
          item.id === protocolId && item.userId === ownerUserId &&
          (item.status === "active" || (item.category === "supplement" && item.status === "paused")) &&
          ["recovery", "peptide", "supplement"].includes(item.category)
        );
        if (!representative) return null;
        const protocols = (runtime.protocols ?? []).filter((item) =>
          item.userId === ownerUserId &&
          (item.status === "active" || (representative.category === "supplement" && item.status === "paused")) &&
          item.category === representative.category
        );
        if (protocols.some((protocol) => hasAmbiguousDomainExecution(protocol, runtime.executionItems ?? []))) return null;
        const currentVersionIds = new Set(protocols.map((item) => item.currentVersionId).filter(Boolean));
        const model = buildStrategyDomainModel({
          category: representative.category,
          executionItems: runtime.executionItems ?? [],
          goals: runtime.goals ?? [],
          localDate: getLocalDateKey(now(), resolveLocalTimeZone(runtime.user?.timeZone ?? runtime.user?.timezone)),
          protocols,
          versions: (runtime.protocolVersions ?? []).filter((item) => currentVersionIds.has(item.id)),
          includePaused: representative.category === "supplement",
        });
        if (!model) return null;
        return Object.freeze({
          category: model.category,
          title: STRATEGY_DOMAIN_PRESENTATION[model.category].title,
          purpose: model.purpose,
          methods: Object.freeze(model.methods.map((method) => Object.freeze({
            id: method.id,
            protocolId: method.protocolId,
            lifecycleState: method.lifecycleState,
            currentVersionId: method.currentVersionId,
            name: method.name,
            purpose: method.purpose,
            supportSummary: method.supportSummary,
            currentDose: method.currentDose ?? null,
            currentSchedule: method.currentSchedule ?? null,
            reminderEnabled: projectMethodReminderEnabled({
              category: model.category, method, ownerUserId, runtime,
            }),
            editDestination: domainSupportDestination(model.category, method),
          }))),
        });
      });
    },
    async getTrainingLogger() {
      const canonicalExercises = await ensureCanonicalExerciseRegistry();
      return withContext("core.navigation.training-logger", "trainingLogger", ({ runtime }) => {
        const user = runtime.user;
        const initialDate = getLocalDateKey(now(), resolveLocalTimeZone(user?.timeZone ?? user?.timezone));
        const confirmedTrainingRecords = (runtime.canonicalEvidenceObjects ?? []).filter((record) =>
          evidenceType(record) === "training" &&
          record.quality?.status !== "superseded" &&
          !record.quality?.supersededBy
        );
        const performedExerciseIds = [...new Set(confirmedTrainingRecords
          .flatMap((record) => (record.payload ?? record).exercises ?? [])
          .map((exercise) => exercise.canonicalExerciseId)
          .filter(Boolean))];
        /// My Library = performed OR explicitly added — the server computes
        /// the union so Native only ever needs a single membership id list,
        /// never Recovery-style local derivation. Explicit additions
        /// (`myLibraryMemberships`) are the only state that can't be
        /// inferred from history; a performed exercise needs no membership
        /// record of its own.
        const myLibraryExerciseIds = projectTrainingMyLibrary(runtime);
        const historySessions = confirmedTrainingRecords
          .map(projectTrainingHistorySession)
          .sort((left, right) => String(right.observed_at).localeCompare(String(left.observed_at)))
          .slice(0, 120);
        const goalContext = projectGoalContext(selectCanonicalActiveGoal(runtime.goals ?? [], {
          ownerUserId: runtime.user?.id,
        }), initialDate);
        const initialProgressionRecommendations = canonicalExercises
          .map((exercise) => projectTrainingLoggerRecommendation({
            exercise,
            goalContext,
            initialDate,
            sessions: confirmedTrainingRecords,
          }))
          .filter(Boolean);
        return Object.freeze({
          goalContext,
          initialCanonicalExercises: canonicalExercises.map((exercise) => ({
            ...exercise,
            primaryNavigationCategory: getPrimaryTrainingNavigationGroup({
              canonicalExerciseId: exercise.id,
              label: exercise.name,
              primaryMuscleGroups: exercise.primary_muscle_groups,
              regionLabel: exercise.body_region,
            }),
          })),
          initialDate,
          initialCategorySuggestion: createTrainingLoggerSuggestion({
            date: initialDate,
            sessions: confirmedTrainingRecords,
          }),
          initialHistorySessions: historySessions,
          initialPerformedExerciseIds: performedExerciseIds,
          initialMyLibraryExerciseIds: myLibraryExerciseIds,
          initialProgressionRecommendations,
        });
      });
    },
    getTrainingMyLibrary() {
      return withContext("core.navigation.training-my-library", "trainingLogger", ({ runtime }) =>
        projectTrainingMyLibrary(runtime));
    },
    getMorningCheckIn() {
      return withContext("core.navigation.morning-check-in", "morningCheckIn", async ({ ownerUserId, repositories, runtime }) => {
        const user = runtime.user;
        const current = now();
        const timeZone = resolveLocalTimeZone(user?.timeZone ?? user?.timezone);
        const today = getLocalDateKey(current, timeZone);
        const reconciliationSelection = await createMorningPriorityReconciliationService({
          repositories,
          now: () => current,
        }).getSelection({ userId: ownerUserId, timeZone, at: current });
        const ordered = canonicalWeightEntries(runtime.weightEntries ?? []).reverse();
        const existing = ordered.find((item) => String(item.measuredAt).slice(0, 10) === today) ?? null;
        const previous = ordered.find((item) => String(item.measuredAt).slice(0, 10) < today) ?? null;
        const existingCheckIn = (runtime.dailyCheckIns ?? []).find((item) => item.date === today) ?? null;
        return Object.freeze({
          briefingReconciliation: createBriefingReconciliationPresentation({
            evidenceDate: reconciliationSelection.window.previousLocalDate,
            hasPendingConfirmation: reconciliationSelection.evidenceRecoveryItems.some(
              (item) => item.status === MORNING_EVIDENCE_RECOVERY_STATUSES.PENDING_CONFIRMATION
            ),
            workItems: runtime.briefingReconciliationWorkItems ?? [],
          }),
          existingRecovery: existingCheckIn?.recovery ?? null,
          today,
          existingWeight: existing?.weight?.value ?? null,
          previousWeight: previous?.weight?.value ?? null,
          reconciliationItems: reconciliationSelection.items,
        });
      });
    },
    getProfile() {
      return withContext("core.navigation.profile", "profile", ({ repositories }) =>
        createYouProfileService({ repositories }).getYouProfile());
    },
    getTracking() {
      return withContext("core.navigation.tracking", "tracking", ({ ownerUserId, runtime }) => Object.freeze({
        morningWeighIn: resolveMorningWeighInSupport({
          executionItems: runtime.executionItems ?? [],
          protocols: runtime.protocols ?? [],
          reminders: runtime.reminders ?? [],
          userId: ownerUserId,
        }),
      }));
    },
    /// The one canonical Operating Plan "recurring support" detail read —
    /// covers both Recovery (e.g. Foam Rolling) and Tracking (Morning
    /// Weigh-In), since both are the exact same execution-item+reminder
    /// shape `RecurringSupportManagementService` already owns end to end.
    /// Mirrors `execution/[executionId]/page.js`'s own lookup (protocol via
    /// the execution item's own linked/root protocol id, reminder via
    /// `linkedEntityId === protocol.id`) generically rather than
    /// hardcoding each known execution id, so a future recurring-support
    /// item needs no new Native read plumbing.
    getRecurringSupport({ executionId }) {
      return withContext("core.navigation.recurring-support", "tracking", ({ ownerUserId, runtime }) => {
        const executionItem = (runtime.executionItems ?? []).find(
          (item) => item.id === executionId && item.userId === ownerUserId && item.active !== false
        );
        if (!executionItem) return null;
        const protocolId = executionItem.protocolRootId ?? executionItem.linkedProtocolId;
        const protocol = (runtime.protocols ?? []).find((item) =>
          item.id === protocolId && item.userId === ownerUserId && item.status === "active"
        );
        if (!protocol) return null;
        const reminderTypes = recurringSupportReminderTypes({ protocol, executionItem });
        const reminders = (runtime.reminders ?? []).filter((item) =>
          item.userId === ownerUserId && item.linkedEntityId === protocol.id &&
          reminderTypes.has(item.type)
        );
        // A recurring Support editor must never silently shed its canonical
        // reminder identity. Missing or ambiguous linkage is an unavailable
        // read, not an editable object with `reminderId: null` that Native
        // can only reject before reaching the server.
        if (reminders.length !== 1) return null;
        const reminder = reminders[0];
        const hydration = createRecurringSupportHydrationModel({ executionItem, protocol, reminder });
        return Object.freeze({
          protocolId: protocol.id,
          protocolCategory: protocol.category,
          executionId: executionItem.id,
          reminderId: reminder.id,
          title: executionItem.title ?? protocol.name ?? "",
          purpose: executionItem.description ?? "",
          supportSummary: formatSupportScheduleSummary(hydration.supportSchedule),
          nextDue: projectNextSupportDue({
            schedule: hydration.supportSchedule, reminder,
            localDate: getLocalDateKey(now(), resolveLocalTimeZone(runtime.user?.timeZone ?? runtime.user?.timezone)),
          }),
          hydration,
        });
      });
    },
    /// Typed peptide Support read for Native. It reuses the same
    /// classification and hydration functions as Web's detail/editor route,
    /// while projecting only editable fields and presentation-ready phases
    /// rather than exposing execution/reminder runtime records.
    getPeptideSupport({ protocolId }) {
      return withContext("core.navigation.peptide-support", "operatingPlan", ({ ownerUserId, runtime }) => {
        const protocol = (runtime.protocols ?? []).find((item) =>
          item.id === protocolId && item.userId === ownerUserId && item.category === "peptide" && item.status === "active"
        );
        if (!protocol) return null;
        const classification = classifyPeptideExecutionState({ protocol, executionItems: runtime.executionItems ?? [] });
        if (classification.state === PeptideExecutionState.INVALID) return null;
        const executionItem = classification.record;
        const reminders = (runtime.reminders ?? []).filter((item) =>
          item.userId === ownerUserId && item.type === "protocol_reminder" && item.linkedEntityId === protocol.id
        );
        if (reminders.length > 1) return null;
        const reminder = reminders[0] ?? null;
        const hydration = createPeptideSupportHydrationModel({ executionItem, protocol, reminder });
        const localDate = getLocalDateKey(now(), resolveLocalTimeZone(runtime.user?.timeZone ?? runtime.user?.timezone));
        return Object.freeze({
          protocolId: protocol.id,
          executionId: executionItem?.id ?? null,
          executionRevision: hydration.executionRevision,
          name: protocol.name ?? executionItem?.title ?? "Peptide Support",
          purpose: protocol.purpose ?? protocol.description ?? executionItem?.description ?? "",
          state: classification.state.toUpperCase(),
          supportSchedule: hydration.supportSchedule,
          dosing: projectPeptideDosingStrategy(hydration.dosingStrategy),
          timeline: projectPeptideTimeline(hydration.legacyTimeline, localDate, executionItem?.id ?? protocol.id),
          reminderPreference: hydration.reminderPreference,
          timingContext: hydration.timingContext,
          notes: hydration.notes,
          nextDue: projectNextSupportDue({ schedule: hydration.supportSchedule, reminder, localDate }),
        });
      });
    },
    getSupplementSupport({ protocolId }) {
      return withContext("core.navigation.supplement-support", "operatingPlan", ({ ownerUserId, runtime }) => {
        const protocol = (runtime.protocols ?? []).find((item) =>
          item.id === protocolId && item.userId === ownerUserId && item.category === "supplement" && item.status === "active"
        );
        const version = (runtime.protocolVersions ?? []).find((item) =>
          item.id === protocol?.currentVersionId && item.protocolId === protocol?.id && item.status === "active" && !item.endedAt
        );
        if (!protocol || !version) return null;
        const executions = (runtime.executionItems ?? []).filter((item) =>
          item.type === "supplement" && item.protocolRootId === protocol.id
        );
        const reminders = (runtime.reminders ?? []).filter((item) =>
          item.userId === ownerUserId && item.type === "supplement_reminder" && item.linkedEntityId === protocol.id
        );
        if (executions.length > 1 || reminders.length > 1) return null;
        const executionItem = executions[0] ?? null;
        const hydration = createSupplementSupportHydrationModel({
          executionItem,
          protocol,
          reminder: reminders[0] ?? null,
        });
        if (hydration.compatibilityIssue) return null;
        const goalId = version.goalLinks?.[0]?.goalId ?? protocol.currentGoalIds?.[0] ?? protocol.relatedGoalIds?.[0] ?? null;
        if (!goalId || !(runtime.goals ?? []).some((goal) =>
          goal.id === goalId && goal.userId === ownerUserId && goal.status === "active"
        )) return null;
        return Object.freeze({
          protocolId: protocol.id,
          supplementVersionId: version.id,
          goalId,
          executionId: executionItem?.id ?? null,
          executionRevision: hydration.executionRevision,
          name: protocol.name,
          supportSummary: formatSupplementSupportSummary(executionItem),
          doseAmount: hydration.draft.dose.amount,
          doseUnit: hydration.draft.dose.unit,
          supportSchedule: hydration.draft.supportSchedule,
          reminderPreference: hydration.draft.reminderPreference,
          notes: hydration.draft.notes,
          nextDue: projectNextSupportDue({
            schedule: hydration.draft.supportSchedule, reminder: reminders[0] ?? null,
            localDate: getLocalDateKey(now(), resolveLocalTimeZone(runtime.user?.timeZone ?? runtime.user?.timezone)),
          }),
        });
      });
    },
    getSupplementStrategyEditor({ protocolId = null } = {}) {
      return withContext("core.navigation.supplement-strategy-editor", "operatingPlan", ({ ownerUserId, runtime }) => {
        const activeGoals = (runtime.goals ?? []).filter((goal) =>
          goal.userId === ownerUserId && goal.status === "active"
        );
        if (!protocolId) {
          return Object.freeze({
            mode: "create",
            protocolId: null,
            expectedCurrentVersionId: null,
            lifecycleState: "active",
            goalId: activeGoals[0]?.id ?? "",
            goalOptions: Object.freeze(activeGoals.map((goal) => Object.freeze({ id: goal.id, title: goal.title }))),
            name: "",
            purpose: "",
            role: "",
            startDate: getLocalDateKey(now(), resolveLocalTimeZone(runtime.user?.timeZone ?? runtime.user?.timezone)),
            initialStatus: "active",
          });
        }
        const protocol = (runtime.protocols ?? []).find((item) =>
          item.id === protocolId && item.userId === ownerUserId && item.category === "supplement" && item.status === "active"
        );
        const version = (runtime.protocolVersions ?? []).find((item) =>
          item.id === protocol?.currentVersionId && item.protocolId === protocol?.id && item.status === "active" && !item.endedAt
        );
        if (!protocol || !version) return null;
        const goals = activeGoals.filter((goal) => protocol.relatedGoalIds?.includes(goal.id));
        const strategy = version.supplementStrategy ?? {};
        return Object.freeze({
          mode: "edit",
          protocolId: protocol.id,
          expectedCurrentVersionId: version.id,
          lifecycleState: protocol.status,
          goalId: version.goalLinks?.[0]?.goalId ?? goals[0]?.id ?? "",
          goalOptions: Object.freeze(goals.map((goal) => Object.freeze({ id: goal.id, title: goal.title }))),
          name: strategy.name ?? protocol.name,
          purpose: strategy.purpose ?? protocol.purpose ?? "",
          role: strategy.role ?? protocol.notes ?? "",
          startDate: protocol.startDate ?? String(version.effectiveAt ?? "").slice(0, 10),
          initialStatus: "active",
        });
      });
    },
    getEnergyStrategyDetail({ strategyId }) {
      return withContext("core.navigation.energy-strategy-detail", "operatingPlan", async ({ ownerUserId, repositories }) => {
        const protocol = await repositories.protocols.getProtocolById(strategyId);
        if (!protocol || protocol.userId !== ownerUserId || protocol.status !== "active" ||
            (protocol.protocolType ?? protocol.category) !== "energy") return null;
        const [version, goals, nutritionContext] = await Promise.all([
          protocol.currentVersionId ? repositories.protocolVersions.getVersionById(protocol.currentVersionId) : null,
          repositories.goals.listGoals(ownerUserId),
          repositories.nutritionContext.getNutritionContext(ownerUserId),
        ]);
        const detail = composeOperatingPlanStrategyDetail({ goals, nutritionContext, protocol, strategyType: "energy", version });
        if (!detail) return null;
        return Object.freeze({ ...projectOperatingPlanStrategyDetail(protocol, detail), intentionallyReadOnly: true });
      });
    },
    getCoachingUpdatesDetail({ strategyId }) {
      return withContext("core.navigation.coaching-updates-detail", "coachingUpdates", async ({ ownerUserId, repositories, runtime }) => {
        const protocol = await repositories.protocols.getProtocolById(strategyId);
        if (!protocol || protocol.userId !== ownerUserId || protocol.status !== "active" ||
            (protocol.protocolType ?? protocol.category) !== "briefings") return null;
        const [version, goals, goal, readModel] = await Promise.all([
          protocol.currentVersionId ? repositories.protocolVersions.getVersionById(protocol.currentVersionId) : null,
          repositories.goals.listGoals(ownerUserId),
          repositories.goals.getActiveGoal(ownerUserId),
          createCoachingUpdatesReadService({ repositories }).getCurrent({ protocolId: protocol.id, userId: ownerUserId }),
        ]);
        const photoHydration = createProgressPhotosExecutionHydrationModel(runtime);
        const dexa = runtime.executionItems?.find((item) => item.id === DEXA_APPOINTMENT_ID);
        if (!version || !goal || !readModel || !photoHydration || !dexa) return null;
        // A completed DEXA execution is history, not the next appointment.
        // Do not feed its past date back into the composite editor: the
        // atomic transition correctly validates this field as a future next
        // scan and would otherwise reject an unrelated Coaching edit.
        const scheduledDexa = isCurrentScheduledDexaAppointment(dexa) ? dexa : null;
        const editor = createCoachingUpdatesEditorModel({
          readModel,
          policy: resolveCoachingUpdatesGoalCadencePolicy(goal),
          photos: {
            cadence: photoHydration.item.recurrence.interval === 2 ? "weekly_interval_2" : "weekly",
            day: photoHydration.item.recurrence.weekdays[0],
            timeOfDay: /^\d{2}:\d{2}$/.test(photoHydration.item.recurrence.timeOfDay ?? "")
              ? "specific" : photoHydration.item.recurrence.timeOfDay,
            specificTime: /^\d{2}:\d{2}$/.test(photoHydration.item.recurrence.timeOfDay ?? "")
              ? photoHydration.item.recurrence.timeOfDay : null,
            reminderEnabled: photoHydration.item.reminderEnabled,
            timeOptions: ["morning", "afternoon", "evening"],
          },
          dexa: {
            plannedDate: scheduledDexa?.preferredSchedule?.date ?? "",
            localTime: scheduledDexa?.preferredSchedule?.timeOfDay ?? "",
            reminderPreferences: structuredClone(scheduledDexa?.reminderPreferences ?? []),
            uploadReminder: scheduledDexa?.uploadReminder === true,
            preparationNote: scheduledDexa?.preparationNote ?? "",
          },
        });
        const detail = composeOperatingPlanStrategyDetail({ goals, protocol, strategyType: "briefings", version });
        if (!editor || !detail) return null;
        return Object.freeze({
          ...projectOperatingPlanStrategyDetail(protocol, detail),
          context: Object.freeze({
            expectedCurrentVersionId: version.id,
            expectedRevision: runtime.revision,
            expectedSemanticDigest: createCoachingUpdatesSemanticDigest(runtime),
            photoExpectedCurrentVersionId: photoHydration.context.expectedCurrentVersionId,
            photoExpectedSemanticDigest: photoHydration.context.expectedSemanticDigest,
            dexaExpectedRevision: dexa.executionRevision ?? 1,
          }),
          editor: Object.freeze({
            strategyId: protocol.id,
            midweek: editor.midweek,
            weekly: editor.weekly,
            monthly: editor.monthly,
            photos: Object.freeze({
              cadence: editor.photos.cadence,
              day: editor.photos.day,
              timeOfDay: editor.photos.timeOfDay,
              specificTime: editor.photos.specificTime,
              reminderEnabled: editor.photos.reminderEnabled,
            }),
            dexa: editor.dexa,
            photoEventBriefingEnabled: editor.eventBriefings.photo,
            dexaEventBriefingEnabled: editor.eventBriefings.dexa,
            notificationPreference: editor.notificationPreference,
          }),
        });
      });
    },
    /// The Nutrition Operating Plan strategy detail + editor read, combined
    /// into one payload so Native can render the detail screen and prime
    /// the editor from a single fetch. Reuses the exact same display
    /// composition (`composeOperatingPlanStrategyDetail`) and editor-field
    /// derivation (`createStrategyEditorModel`) Web's own strategy detail
    /// and edit pages already call — no parallel Nutrition read logic.
    /// `expectedCurrentVersionId` is Nutrition's actual concurrency token
    /// (the protocol's `currentVersionId`), matching
    /// `ActiveProtocolSuccessorService`'s own model rather than Recovery's
    /// `expectedRevision` counter.
    getNutritionStrategyDetail({ strategyId }) {
      return withContext("core.navigation.nutrition-strategy-detail", "operatingPlan", async ({ ownerUserId, repositories }) => {
        const protocol = await repositories.protocols.getProtocolById(strategyId);
        if (!protocol || protocol.userId !== ownerUserId || protocol.status !== "active" ||
            (protocol.protocolType ?? protocol.category) !== "nutrition") {
          return null;
        }
        const version = protocol.currentVersionId
          ? await repositories.protocolVersions.getVersionById(protocol.currentVersionId)
          : null;
        if (!version) return null;
        const [goals, nutritionContext] = await Promise.all([
          repositories.goals.listGoals(ownerUserId),
          repositories.nutritionContext.getNutritionContext(ownerUserId),
        ]);
        const detail = composeOperatingPlanStrategyDetail({
          goals, nutritionContext, protocol, strategyType: "nutrition", version,
        });
        const editorModel = createStrategyEditorModel({ protocol, strategyType: "nutrition", version });
        if (!detail || !editorModel) return null;
        return Object.freeze({
          protocolId: protocol.id,
          title: detail.title,
          purpose: detail.purpose,
          goal: detail.goal,
          startedDate: detail.startedDate,
          status: detail.status,
          fields: detail.sections,
          editor: Object.freeze({
            expectedCurrentVersionId: protocol.currentVersionId,
            proteinBasis: editorModel.proteinBasis,
            proteinRatio: editorModel.proteinRatio,
            fixedProteinGrams: editorModel.fixedProtein ?? 150,
            carbohydrateStrategy: editorModel.carbohydrateStrategy,
            fatStrategy: editorModel.fatStrategy,
          }),
        });
      });
    },
    /// The Training Operating Plan strategy detail + editor read — same
    /// composition pattern as Nutrition above (Web's own detail/edit pages
    /// reused verbatim), but Training's editor field shape is genuinely
    /// different (weekly area frequencies + priorities + progression
    /// pace, not macro targets), preserved here rather than forced into
    /// Nutrition's shape. `frequencies` is projected from
    /// `createStrategyEditorModel`'s object map into an ordered array so
    /// Native's `TrainingAreaFrequency` list decodes directly.
    getTrainingStrategyDetail({ strategyId }) {
      return withContext("core.navigation.training-strategy-detail", "operatingPlan", async ({ ownerUserId, repositories }) => {
        const protocol = await repositories.protocols.getProtocolById(strategyId);
        if (!protocol || protocol.userId !== ownerUserId || protocol.status !== "active" ||
            (protocol.protocolType ?? protocol.category) !== "training") {
          return null;
        }
        const version = protocol.currentVersionId
          ? await repositories.protocolVersions.getVersionById(protocol.currentVersionId)
          : null;
        if (!version) return null;
        const goals = await repositories.goals.listGoals(ownerUserId);
        const detail = composeOperatingPlanStrategyDetail({
          goals, protocol, strategyType: "training", version,
        });
        const editorModel = createStrategyEditorModel({ protocol, strategyType: "training", version });
        if (!detail || !editorModel) return null;
        return Object.freeze({
          protocolId: protocol.id,
          title: detail.title,
          purpose: detail.purpose,
          goal: detail.goal,
          startedDate: detail.startedDate,
          status: detail.status,
          fields: detail.sections,
          editor: Object.freeze({
            expectedCurrentVersionId: protocol.currentVersionId,
            frequencies: Object.freeze(TRAINING_AREAS.map((area) => Object.freeze({
              area, count: editorModel.frequencies[area] ?? 0,
            }))),
            priorities: Object.freeze([...editorModel.priorities]),
            progression: editorModel.progression,
          }),
        });
      });
    },
  });

  async function ensureCanonicalExerciseRegistry() {
    return readCanonicalExerciseRegistry
      ? readCanonicalExerciseRegistry()
      : listCanonicalTrainingExerciseIdentities();
  }

  function withContext(readModel, surface, callback) {
    return store.run(readModel, async ({ readCollections, readRuntimeMetadata }) => {
      const ownerUserId = store.getOwnerUserId();
      if (!ownerUserId) throw new Error("Core navigation owner is unavailable.");
      const collections = await readCollections(CORE_NAVIGATION_COLLECTIONS[surface]);
      const runtime = createCompactRuntime(collections, surface);
      if (surface === "coachingUpdates") {
        if (!readRuntimeMetadata) throw new Error("Canonical Coaching Updates revision authority is unavailable.");
        Object.assign(runtime, await readRuntimeMetadata());
      }
      const repositories = createSeedRepositories(runtime, { allowStagedMutations: false });
      return callback({
        ownerUserId,
        principal: createReadPrincipal(ownerUserId),
        repositories,
        runtime,
      });
    });
  }
}

export function createCompactRuntime(collections = {}, surface = null) {
  const runtime = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, []]));
  for (const [name, values] of Object.entries(collections)) {
    runtime[name] = projectCollection(name, values, surface);
  }
  runtime.user = runtime.user?.[0] ?? null;
  runtime.nutritionContext = runtime.nutritionContext?.at(-1) ?? null;
  runtime.operatingPlan = runtime.operatingPlan?.at(-1) ?? null;
  return runtime;
}

function projectOperatingPlanStrategyDetail(protocol, detail) {
  return Object.freeze({
    protocolId: protocol.id,
    title: detail.title,
    purpose: detail.purpose,
    goal: detail.goal ?? "",
    startedDate: detail.startedDate ?? "",
    status: detail.status,
    fields: Object.freeze(detail.sections.filter(Boolean)),
    editLabel: detail.editHref ? detail.editLabel : null,
  });
}

function projectCollection(name, values, surface) {
  if (name === "analyses") return (values ?? []).map(projectAnalysis);
  if (name === "dailyBriefings") return (values ?? []).map(projectBriefing);
  if (name === "canonicalEvidenceObjects") {
    if (["home", "goals"].includes(surface)) {
      return (values ?? []).filter((record) => evidenceType(record) === "training");
    }
    if (surface === "operatingPlan") {
      return (values ?? []).filter((record) => evidenceType(record) === "activity_day");
    }
  }
  return values;
}

function projectAnalysis(analysis = {}) {
  const output = compactObject({
    id: analysis.id,
    createdAt: analysis.createdAt,
    observedAt: analysis.observedAt,
    updatedAt: analysis.updatedAt,
    importedAt: analysis.importedAt,
    evidenceTypes: analysis.evidenceTypes,
    metadata: analysis.metadata?.structuredObservations
      ? { structuredObservations: analysis.metadata.structuredObservations }
      : undefined,
    structuredObservations: analysis.structuredObservations,
  });
  return Object.freeze(output);
}

function projectBriefing(artifact = {}) {
  const {
    briefing,
    replacedBriefingHistory: _replacedBriefingHistory,
    replacementHistory: _replacementHistory,
    priorVersions: _priorVersions,
    previousEntry: _previousEntry,
    previousEntries: _previousEntries,
    ...identity
  } = artifact;
  if (!briefing) return Object.freeze(identity);
  const photo = briefing.photoEventNarrative;
  const compactBriefing = compactObject({
    date: briefing.date,
    evidenceReconciliation: briefing.evidenceReconciliation,
    hero: briefing.hero,
    weeklyNarrative: briefing.weeklyNarrative?.cards?.hero
      ? { cards: { hero: briefing.weeklyNarrative.cards.hero } }
      : undefined,
    monthlyPresentation: briefing.monthlyPresentation?.hero
      ? { hero: briefing.monthlyPresentation.hero }
      : undefined,
    photoEventNarrative: photo ? compactObject({
      eventDate: photo.eventDate,
      goalCompletionHandoff: photo.goalCompletionHandoff,
      completionExperience: photo.completionExperience?.journeyComparison?.final
        ? { journeyComparison: { final: photo.completionExperience.journeyComparison.final } }
        : undefined,
      cardContent: photo.cardContent?.progress?.comparisons
        ? { progress: { comparisons: photo.cardContent.progress.comparisons } }
        : undefined,
      hero: photo.hero,
    }) : undefined,
    dexaEventNarrative: briefing.dexaEventNarrative?.hero
      ? { hero: briefing.dexaEventNarrative.hero }
      : undefined,
  });
  return Object.freeze({ ...identity, briefing: compactBriefing });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function evidenceType(record) {
  return (record?.payload ?? record)?.evidence_type ?? null;
}

function projectTrainingMyLibrary(runtime) {
  const historyIds = (runtime.canonicalEvidenceObjects ?? [])
    .filter((record) => evidenceType(record) === "training" &&
      record.quality?.status !== "superseded" && !record.quality?.supersededBy)
    .flatMap((record) => (record.payload ?? record).exercises ?? [])
    .map((exercise) => exercise.canonicalExerciseId);
  const explicitIds = (runtime.myLibraryMemberships ?? [])
    .map((membership) => membership.canonicalExerciseId);
  return Object.freeze([...new Set([...historyIds, ...explicitIds].filter(Boolean))].sort());
}

function projectTrainingHistorySession(record) {
  const session = record.payload ?? record;
  return {
    id: session.id ?? record.canonicalId,
    evidence_type: "training",
    observed_at: session.observed_at ?? record.lastObservedAt,
    exercises: (session.exercises ?? []).map((exercise) => ({
      id: exercise.id,
      canonicalExerciseId: exercise.canonicalExerciseId,
      name: exercise.name,
      body_region: exercise.body_region,
      equipment: exercise.equipment,
      ...(exercise.executionVariant ? { executionVariant: exercise.executionVariant } : {}),
      sets: (exercise.sets ?? []).map((set) => ({
        duration_seconds: set.duration_seconds ?? set.durationSeconds ?? null,
        load_type: set.load_type ?? set.loadType ?? null,
        measurement_type: set.measurement_type ?? set.measurementType ?? null,
        reps: set.reps,
        weight: set.weight ?? set.load,
        weight_unit: set.weight_unit ?? set.unit ??
          (set.load_type === "bodyweight" || set.loadType === "bodyweight" ? "bodyweight" : "lb"),
        // Additive read-time contract: the Server-owned set-level load
        // semantics (bodyweight, weighted_bodyweight, external_load, unknown).
        load_semantics: classifyTrainingSetLoad(set, {
          defaultLoadType: resolveExerciseDefaultLoadType(exercise),
        }).semantics,
      })),
    })),
    exerciseRelationshipGroups: session.exerciseRelationshipGroups ?? [],
  };
}

function projectTrainingLoggerRecommendation({ exercise, goalContext, initialDate, sessions }) {
  const result = createTrainingLoggerProgressionRecommendation({
    canonicalExerciseId: exercise.id,
    goalContext,
    nowDate: initialDate,
    sessions,
  });
  if (result.status === TRAINING_LOGGER_PROGRESSION_STATUS.INSUFFICIENT) return null;
  const state = result.status === TRAINING_LOGGER_PROGRESSION_STATUS.OPPORTUNITY
    ? "opportunity"
    : result.status === TRAINING_LOGGER_PROGRESSION_STATUS.RECOVER
      ? "recover"
      : "maintain";
  const eyebrow = state === "opportunity"
    ? "Progression opportunity"
    : state === "recover"
      ? "Recovery opportunity"
      : "Maintain current performance";
  const hasTarget = result.recommendedReps != null;
  const bodyweight = result.recommendedLoadType === "bodyweight";
  const loadLabel = bodyweight
    ? "BW"
    : result.recommendedLoad != null
      ? `${result.recommendedLoad} ${result.recommendedUnit ?? "lb"}`
      : null;
  return Object.freeze({
    canonicalExerciseId: exercise.id,
    state,
    eyebrow,
    message: result.reason,
    prescription: hasTarget
      ? `${loadLabel ?? "No added load"} x ${result.recommendedReps}`
      : result.recommendedAction === "consider_progression"
        ? "Progress manually if today’s performance supports it"
        : "Repeat the latest comparable performance",
    suggestedLoad: bodyweight ? null : result.recommendedLoad,
    suggestedLoadType: result.recommendedLoadType,
    suggestedReps: result.recommendedReps,
    suggestedUnit: bodyweight ? null : result.recommendedUnit,
  });
}

function projectGoalContext(goal, date) {
  if (!goal) return null;
  const phaseGoal = Array.isArray(goal.phases)
    ? goal
    : { ...goal, phases: goal.phasePlan?.phases ?? goal.phaseTimeline ?? [] };
  const phase = phaseGoal.phases.length
    ? resolveCanonicalGoalPhaseChronology(phaseGoal, { asOf: date }).effectivePhase
    : goal.currentPhase ?? null;
  return {
    id: goal.id,
    title: goal.title,
    type: goal.type,
    strategy: goal.strategy?.type ?? goal.strategy ?? null,
    phase: phase ? {
      id: phase.id ?? phase.phaseId ?? null,
      type: phase.type ?? null,
      label: phase.label ?? phase.name ?? phase.title ?? null,
      name: phase.name ?? null,
    } : null,
  };
}

function projectPeptideDosingStrategy(strategy = {}) {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return Object.freeze({
    pattern: strategy.pattern,
    startingDoseAmount: number(strategy.startingDose?.amount),
    startingDoseUnit: strategy.startingDose?.unit ?? "",
    startDate: strategy.startDate ?? "",
    stepAmount: number(strategy.stepAmount),
    stepInterval: number(strategy.stepInterval),
    stepUnit: strategy.stepUnit,
    targetDoseAmount: number(strategy.targetDose),
    holdDuration: number(strategy.holdDuration),
    holdUnit: strategy.holdUnit,
    decreaseAmount: number(strategy.decreaseAmount),
    decreaseInterval: number(strategy.decreaseInterval),
    decreaseUnit: strategy.decreaseUnit,
    landingDoseAmount: number(strategy.landingDose),
    endDate: strategy.endDate ?? null,
  });
}

function projectPeptideTimeline(timeline = [], localDate, identity) {
  return Object.freeze(timeline.map((phase, index) => {
    const status = phase.startDate > localDate
      ? "upcoming"
      : phase.endDate && phase.endDate < localDate
        ? "completed"
        : "active";
    return Object.freeze({
      id: `${identity}:phase:${index + 1}:${phase.startDate}`,
      label: phase.notes || `Phase ${index + 1}`,
      window: `${formatPeptideDate(phase.startDate)} – ${phase.endDate ? formatPeptideDate(phase.endDate) : "Until changed"}`,
      doseAmount: Number.isFinite(Number(phase.dose?.amount)) ? Number(phase.dose.amount) : 0,
      doseUnit: phase.dose?.unit ?? "",
      status,
    });
  }));
}

function formatPeptideDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return String(value ?? "");
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function hasAmbiguousDomainExecution(protocol, executionItems) {
  const matches = executionItems.filter((item) => {
    if (item.active !== true) return false;
    const linked = [item.protocolRootId, item.linkedProtocolId].includes(protocol.id);
    if (!linked) return false;
    if (protocol.category === "peptide") return ["peptide", "protocol"].includes(item.type);
    return item.type === protocol.category;
  });
  return matches.length > 1;
}

function recurringSupportReminderTypes({ protocol, executionItem }) {
  const result = new Set([ReminderType.PROTOCOL_REMINDER, "recovery_reminder"]);
  const trackingEvidenceTypes = new Set(executionItem.linkedEvidenceTypes ?? []);
  const isMorningWeighIn = protocol.category === "weight" || protocol.protocolType === "weight" ||
    trackingEvidenceTypes.has("morning_weight");
  if (isMorningWeighIn) {
    result.add(ReminderType.EVIDENCE_REMINDER);
    result.add(ReminderType.MORNING_WEIGH_IN);
  }
  return result;
}

function projectMethodReminderEnabled({ category, method, ownerUserId, runtime }) {
  const protocol = (runtime.protocols ?? []).find((item) =>
    item.id === method.protocolId && item.userId === ownerUserId
  );
  const executions = (runtime.executionItems ?? []).filter((item) =>
    item.userId === ownerUserId &&
    [item.protocolRootId, item.linkedProtocolId].includes(method.protocolId)
  );
  if (!protocol || executions.length > 1) return false;
  const executionItem = executions[0] ?? null;
  const expectedTypes = category === "supplement"
    ? new Set(["supplement_reminder"])
    : category === "peptide"
      ? new Set([ReminderType.PROTOCOL_REMINDER])
      : recurringSupportReminderTypes({ protocol, executionItem: executionItem ?? {} });
  const reminders = (runtime.reminders ?? []).filter((item) =>
    item.userId === ownerUserId && item.linkedEntityId === method.protocolId &&
    expectedTypes.has(item.type)
  );
  if (reminders.length > 1) return false;
  const reminder = reminders[0] ?? null;
  if (category === "supplement") {
    return createSupplementSupportHydrationModel({ executionItem, protocol, reminder })
      .draft.reminderPreference === "remind";
  }
  if (category === "peptide") {
    return createPeptideSupportHydrationModel({ executionItem, protocol, reminder })
      .reminderPreference === "remind";
  }
  return createRecurringSupportHydrationModel({ executionItem, protocol, reminder })
    .reminderPreference === "remind";
}

function projectNextSupportDue({ schedule, reminder, localDate }) {
  // "Next due" belongs to the canonical execution schedule, not to iOS
  // reminder delivery. Turning reminders off must hide the bell without
  // erasing when the Support itself is next due. Completion history still
  // comes from the reminder occurrence anchor when one exists.
  if (!schedule || !localDate) return null;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(schedule.startDate ?? "") ? schedule.startDate : localDate;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(schedule.endDate ?? "") ? schedule.endDate : null;
  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = shiftDate(localDate, offset);
    if (candidate < start) continue;
    if (end && candidate > end) return null;
    if (!supportScheduleIncludesDate(schedule, candidate, start)) continue;
    if (offset === 0 && isReminderOccurrenceCompleted(reminder, { occurrenceDate: candidate })) continue;
    const time = resolveScheduledTime(schedule.timing === "specific" ? schedule.specificTime : schedule.timing);
    const date = new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    }).format(new Date(`${candidate}T12:00:00Z`));
    return `${date}${time ? ` · ${formatClock(time)}` : ""}`;
  }
  return null;
}

function supportScheduleIncludesDate(schedule, candidate, start) {
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "every_x_days") {
    const elapsed = Math.floor((Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    return elapsed >= 0 && elapsed % Math.max(1, Number(schedule.intervalDays ?? 1)) === 0;
  }
  if (["weekly", "specific_days"].includes(schedule.frequency)) {
    const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${candidate}T12:00:00Z`).getUTCDay()];
    return (schedule.daysOfWeek ?? []).includes(weekday);
  }
  return false;
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function formatClock(value) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function domainSupportDestination(category, method) {
  if (category === "peptide") {
    return Object.freeze({
      id: "native.operating-plan.protocol.peptide",
      parameters: Object.freeze({ protocolId: method.protocolId }),
    });
  }
  if (category === "supplement") {
    return Object.freeze({
      id: "native.operating-plan.protocol.supplement.support",
      parameters: Object.freeze({ protocolId: method.protocolId }),
    });
  }
  if (!method.executionId) return null;
  return Object.freeze({
    id: "native.operating-plan.protocol.recovery",
    parameters: Object.freeze({ executionId: method.executionId }),
  });
}

export function projectConfirmedHealthKitLogProvenance(log, runtime = {}) {
  if (!log?.loggedToday?.rows) return log;
  const attachments = indexConfirmedHealthKitWorkoutAttachments({
    canonicalEvidenceObjects: runtime.canonicalEvidenceObjects ?? [],
    canonicalWorkouts: runtime.healthKitCanonicalWorkouts ?? [],
    workoutLinks: runtime.healthKitWorkoutLinks ?? [],
    workoutLinkClaims: runtime.healthKitWorkoutLinkClaims ?? [],
  });
  const confirmedSessionIds = new Set(attachments.keys());
  const confirmedTrainingToday = (runtime.canonicalEvidenceObjects ?? []).some((record) => {
    const payload = record.payload ?? record;
    const id = String(record.canonicalId ?? payload.id ?? "");
    return confirmedSessionIds.has(id) &&
      record?.quality?.status !== "superseded" && payload?.quality?.status !== "superseded" &&
      String(payload.observed_at ?? "").slice(0, 10) === log.loggedToday.dateKey;
  });
  return Object.freeze({
    ...log,
    loggedToday: Object.freeze({
      ...log.loggedToday,
      rows: Object.freeze(log.loggedToday.rows.map((row) => {
        const confirmed = row.recordId
          ? attachments.has(String(row.recordId))
          : confirmedTrainingToday;
        if (row.id !== "training" || !confirmed || /Apple Health/i.test(String(row.summary ?? ""))) return row;
        const base = String(row.summary ?? "Workout").replace(/ logged$/i, "");
        return Object.freeze({ ...row, summary: `${base} · Apple Health` });
      })),
    }),
  });
}

function createReadPrincipal(userId) {
  return Object.freeze({
    userId,
    deviceId: "provider-core-navigation-read",
    sessionId: "provider-core-navigation-read",
    scopes: Object.freeze([]),
    authenticatedAt: null,
    authenticationMethod: "provider-owner",
    transport: "server-read",
  });
}
