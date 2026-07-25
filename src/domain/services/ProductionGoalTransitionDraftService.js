import { activationFingerprint } from "./GoalTransitionActivationCanonicalization";
import { buildGoalTransitionDraft } from "./GoalTransitionService";

export function createProductionGoalTransitionDraftService({
  repositories,
  readStore,
  now = () => new Date(),
} = {}) {
  return Object.freeze({
    async getOrCreateFresh({ userId, sourceGoalId }) {
      const store = await readStore();
      const existing = (store.goalTransitionDrafts ?? []).find(
        (draft) => draft.userId === userId
          && draft.sourceGoalId === sourceGoalId
          && draft.liveProduction === true
          && ["draft", "ready"].includes(draft.status)
          && !draft.superseded
      );
      if (existing) return structuredClone(existing);
      const source = (store.goals ?? []).find((goal) => goal.id === sourceGoalId);
      if (!source || source.status !== "active" || source.primary !== true
        || source.completedAt) {
        throw new Error("Visible Abs is no longer the active primary goal.");
      }
      if ((store.goals ?? []).some(
        (goal) => goal.type === "build_lean_mass" || /build lean mass/i.test(goal.title ?? "")
      )) {
        throw new Error("Build Lean Mass already exists.");
      }
      for (const stale of (store.goalTransitionDrafts ?? []).filter(
        (draft) => draft.sourceGoalId === sourceGoalId
          && ["draft", "ready"].includes(draft.status)
          && !draft.superseded
      )) {
        await repositories.goalTransitionDrafts.save({
          ...stale,
          status: "abandoned",
          superseded: true,
          supersededAt: now().toISOString(),
          supersededReason: "fresh_live_production_walkthrough",
        });
      }
      const context = await loadContext(repositories, userId, sourceGoalId);
      const preview = buildGoalTransitionDraft(context, now());
      const sourceFingerprint = activationFingerprint({
        source,
        protocols: store.protocols ?? [],
        protocolVersions: store.protocolVersions ?? [],
        executionItems: store.executionItems ?? [],
        reminders: store.reminders ?? [],
        cadence: store.operatingPlan?.coachingCadence ?? null,
        completionRecommendation:
          store.completionRecommendation ?? source.completionRecommendation ?? null,
      });
      const id = `goal_transition_live_${sourceGoalId}_${sourceFingerprint.slice(0, 16)}`;
      const draft = replaceIdentity(preview, preview.id, id);
      const fresh = {
        ...draft,
        id,
        liveProduction: true,
        draftVersion: "goal_transition_live_v1",
        sourceStateFingerprint: sourceFingerprint,
        sourceStateUpdatedAt: store.updatedAt ?? null,
        consumed: false,
        superseded: false,
      };
      return repositories.goalTransitionDrafts.save(fresh);
    },
  });
}

async function loadContext(repositories, userId, sourceGoalId) {
  const [goal, scans, artifacts, protocols, weights] = await Promise.all([
    repositories.goals.getGoalById(sourceGoalId),
    repositories.dexaScans.listDEXAScans(userId),
    repositories.dailyBriefings.listDailyBriefings(userId),
    repositories.protocols.listActiveProtocols(userId),
    repositories.weights.listWeightEntries(userId),
  ]);
  const dexa = [...scans].sort(
    (a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt))
  )[0] ?? null;
  const photoEvent = artifacts.filter(
    (item) => item.trigger?.evidenceType === "photo_session"
  ).sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0] ?? null;
  return {
    userId,
    goal,
    dexa,
    photoEvent,
    protocols,
    weights: [...weights].sort(
      (a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt))
    ),
  };
}

function replaceIdentity(value, oldId, newId) {
  return JSON.parse(JSON.stringify(value).replaceAll(oldId, newId));
}
