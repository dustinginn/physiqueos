import { notFound } from "next/navigation";
import { FounderRepositories } from "../../../../../../../data/repositories/founderRepositories";
import { createStrategyEditorModel } from "../../../../../../../domain/services/StrategyEditorService";
import { createCoachingUpdatesReadService } from "../../../../../../../domain/services/CoachingUpdatesReadService";
import { resolveCoachingUpdatesGoalCadencePolicy } from "../../../../../../../domain/services/CoachingUpdatesGoalCadencePolicyService";
import { createCoachingUpdatesEditorModel } from "../../../../../../../domain/services/CoachingUpdatesEditorService";
import { loadApplicationCanonicalRuntime } from "../../../../../../../application/runtime/ApplicationCanonicalRuntime";
import { createFounderRuntimeSemanticDigest } from "../../../../../../../domain/services/FounderRuntimeSemanticDigest";
import { getFounderStoreRevision } from "../../../../../../../data/repositories/FounderStoreUnitOfWork";
import { createProgressPhotosExecutionHydrationModel } from "../../../../../../../domain/services/ProgressPhotosExecutionScheduleService";
import { DEXA_APPOINTMENT_ID } from "../../../../../../../domain/services/DexaAppointmentManagementService";
import StrategyEditorScreen from "../../../../../../../screens/StrategyEditorScreen";
import { saveStrategy } from "./actions";

export const dynamic = "force-dynamic";

export default async function StrategyEditPage({ params }) {
  const { strategyId, strategyType } = await params;
  if (!["briefings", "nutrition", "training"].includes(strategyType)) notFound();
  const user = await FounderRepositories.users.getCurrentUser();
  const protocol = await FounderRepositories.protocols.getProtocolById(strategyId);
  if (!protocol || protocol.userId !== user.id || protocol.status !== "active" ||
      (protocol.protocolType ?? protocol.category) !== strategyType) notFound();
  const version = await FounderRepositories.protocolVersions.getCurrentVersion(protocol.id);
  let model;
  let coachingContext;
  if (strategyType === "briefings") {
    const store = await loadApplicationCanonicalRuntime();
    const photoHydration = createProgressPhotosExecutionHydrationModel(store);
    const dexaItem = store.executionItems?.find((item) => item.id === DEXA_APPOINTMENT_ID);
    const [readModel, goal] = await Promise.all([
      createCoachingUpdatesReadService({ repositories: FounderRepositories })
        .getCurrent({ protocolId: protocol.id, userId: user.id }),
      FounderRepositories.goals.getActiveGoal(user.id),
    ]);
    model = createCoachingUpdatesEditorModel({
      readModel,
      policy: resolveCoachingUpdatesGoalCadencePolicy(goal),
      photos: photoHydration ? {
        cadence: photoHydration.item.recurrence.interval === 2 ? "weekly_interval_2" : "weekly",
        day: photoHydration.item.recurrence.weekdays[0],
        timeOfDay: photoHydration.item.recurrence.timeOfDay,
        reminderEnabled: photoHydration.item.reminderEnabled,
        timeOptions: ["morning", "afternoon", "evening"],
      } : null,
      dexa: dexaItem ? {
        plannedDate: dexaItem.preferredSchedule?.date ?? "",
        localTime: dexaItem.preferredSchedule?.timeOfDay ?? "",
        reminderPreferences: structuredClone(dexaItem.reminderPreferences ?? []),
        uploadReminder: dexaItem.uploadReminder === true,
        preparationNote: dexaItem.preparationNote ?? "",
      } : null,
    });
    if (!photoHydration || !dexaItem) notFound();
    if (model) {
      coachingContext = {
        expectedRevision: getFounderStoreRevision(store),
        expectedSemanticDigest: createFounderRuntimeSemanticDigest(store),
        photo: photoHydration.context,
        photoRecurrence: photoHydration.item.recurrence,
        dexaExpectedRevision: dexaItem.executionRevision ?? 1,
      };
    }
  } else {
    model = createStrategyEditorModel({ protocol, strategyType, version });
  }
  if (!model) notFound();
  const action = saveStrategy.bind(null, {
    expectedCurrentVersionId: version.id,
    protocolId: protocol.id,
    strategyType,
    coachingContext,
  });
  return <StrategyEditorScreen action={action} model={model}/>;
}
