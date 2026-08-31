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

export function createCoreNavigationReadService({ store, now = () => new Date() } = {}) {
  if (!store?.run || !store?.getOwnerUserId) {
    throw new Error("Core navigation requires a read store.");
  }

  return Object.freeze({
    getHome() {
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
    getGoals() {
      return withContext("core.navigation.goals", "goals", ({ principal, repositories, runtime }) =>
        createGoalsHubReadService({ repositories, readRuntimeStore: () => runtime })
          .getGoalsHub({ principal }));
    },
    getOperatingPlan() {
      return withContext("core.navigation.operating-plan", "operatingPlan", ({ principal, repositories }) =>
        createOperatingPlanReadService({ repositories }).getOperatingPlan({ principal }));
    },
    getTrainingLogger() {
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
        return Object.freeze({
          goalContext: projectGoalContext((runtime.goals ?? []).find((goal) => goal.status === "active") ?? null, initialDate),
          initialCanonicalExercises: listCanonicalTrainingExerciseIdentities(),
          initialDate,
          initialHistorySessions: historySessions,
          initialPerformedExerciseIds: performedExerciseIds,
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
        const ordered = [...(runtime.weightEntries ?? [])]
          .sort((left, right) => String(right.measuredAt).localeCompare(String(left.measuredAt)));
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
  });

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
        reps: set.reps,
        weight: set.weight ?? set.load,
        weight_unit: set.weight_unit ?? set.unit ?? "lb",
      })),
    })),
    exerciseRelationshipGroups: session.exerciseRelationshipGroups ?? [],
  };
}

function projectGoalContext(goal, date) {
  if (!goal) return null;
  const phases = goal.phasePlan?.phases ?? goal.phases ?? goal.phaseTimeline ?? [];
  const phase = phases.find((candidate) =>
    (!candidate.startDate || candidate.startDate <= date) &&
    (!candidate.endDate || date <= candidate.endDate)
  ) ?? goal.currentPhase ?? null;
  return {
    id: goal.id,
    title: goal.title,
    type: goal.type,
    strategy: goal.strategy?.type ?? goal.strategy ?? null,
    phase: phase ? {
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
