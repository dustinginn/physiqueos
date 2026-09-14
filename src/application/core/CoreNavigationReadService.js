import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../../platform/migration/foundationSourceCollections.js";
import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createGoalsHubReadService } from "../goals/GoalsHubReadService.js";
import { createLogReadService } from "../log/LogReadService.js";
import { createOperatingPlanReadService } from "../plan/OperatingPlanReadService.js";
import { createYouProfileService } from "../../domain/services/YouProfileService.js";
import { listCanonicalTrainingExerciseIdentities } from "../../domain/models/trainingExerciseIdentity.js";
import { createMorningPriorityReconciliationService } from "../../domain/services/MorningPriorityReconciliationService.js";
import { createBriefingReconciliationPresentation } from "../../domain/services/BriefingReconciliationPresentationService.js";
import { MORNING_EVIDENCE_RECOVERY_STATUSES } from "../../domain/services/MorningEvidenceRecoveryService.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../../domain/utils/localDate.js";
import { resolveMorningWeighInSupport } from "../../domain/services/TrackingSupportService.js";
import { createRecurringSupportHydrationModel } from "../../domain/services/RecurringSupportManagementService.js";
import { formatSupportScheduleSummary } from "../../domain/models/SupportScheduleModel.js";
import { canonicalWeightEntries } from "../../domain/weight/canonicalWeight.js";
import { selectCanonicalActiveGoal } from "../../domain/services/CanonicalGoalRelationshipService.js";
import { resolveCanonicalGoalPhaseChronology } from "../../domain/services/CanonicalGoalPhaseChronologyService.js";
import {
  createTrainingLoggerProgressionRecommendation,
  TRAINING_LOGGER_PROGRESSION_STATUS,
} from "../../domain/services/TrainingLoggerProgressionService.js";

export const CORE_NAVIGATION_COLLECTIONS = Object.freeze({
  home: Object.freeze([
    "user", "goals", "weightEntries", "dexaScans", "protocols", "protocolVersions",
    "executionItems", "reminders", "nutritionContext", "operatingPlan", "progressPhotos",
    "dailyCheckIns", "dailyBriefings", "analyses", "canonicalEvidenceObjects",
    "goalConfidenceSnapshots", "goalConfidenceHistory", "goalConfidenceContinuitySeeds",
  ]),
  log: Object.freeze([
    "user", "evidenceReviews", "canonicalEvidenceObjects",
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
  trainingLogger: Object.freeze(["user", "goals", "canonicalEvidenceObjects"]),
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
        return createLogReadService({ repositories, now }).getLog({
          principal,
          timeZone: user?.timeZone ?? user?.timezone,
        });
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
        createOperatingPlanReadService({ repositories }).getOperatingPlan({ principal }));
    },
    async getTrainingLogger() {
      const canonicalExercises = await ensureCanonicalExerciseRegistry();
      return withContext("core.navigation.training-logger", "trainingLogger", ({ runtime }) => {
        const user = runtime.user;
        const initialDate = getLocalDateKey(now(), user?.timeZone ?? user?.timezone ?? "America/Los_Angeles");
        const confirmedTrainingRecords = (runtime.canonicalEvidenceObjects ?? []).filter((record) =>
          evidenceType(record) === "training" &&
          record.quality?.status !== "superseded" &&
          !record.quality?.supersededBy
        );
        const performedExerciseIds = [...new Set(confirmedTrainingRecords
          .flatMap((record) => (record.payload ?? record).exercises ?? [])
          .map((exercise) => exercise.canonicalExerciseId)
          .filter(Boolean))];
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
          initialCanonicalExercises: canonicalExercises,
          initialDate,
          initialHistorySessions: historySessions,
          initialPerformedExerciseIds: performedExerciseIds,
          initialProgressionRecommendations,
        });
      });
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
        const reminder = (runtime.reminders ?? []).find((item) =>
          item.userId === ownerUserId && item.linkedEntityId === protocol.id &&
          ["protocol_reminder", "recovery_reminder"].includes(item.type)
        ) ?? null;
        const hydration = createRecurringSupportHydrationModel({ executionItem, protocol, reminder });
        return Object.freeze({
          protocolId: protocol.id,
          protocolCategory: protocol.category,
          executionId: executionItem.id,
          reminderId: reminder?.id ?? null,
          title: executionItem.title ?? protocol.name ?? "",
          purpose: executionItem.description ?? "",
          supportSummary: formatSupportScheduleSummary(hydration.supportSchedule),
          hydration,
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
    return store.run(readModel, async ({ readCollections }) => {
      const ownerUserId = store.getOwnerUserId();
      if (!ownerUserId) throw new Error("Core navigation owner is unavailable.");
      const collections = await readCollections(CORE_NAVIGATION_COLLECTIONS[surface]);
      const runtime = createCompactRuntime(collections, surface);
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
