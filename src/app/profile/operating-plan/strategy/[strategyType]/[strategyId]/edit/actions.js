"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FounderRepositories } from "../../../../../../../data/repositories/founderRepositories";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../../../../../../data/repositories/founderRuntimeStore";
import { createActiveProtocolSuccessorService } from "../../../../../../../domain/services/ActiveProtocolSuccessorService";
import {
  buildStrategySuccessorPayload,
  strategyEditorMessage,
} from "../../../../../../../domain/services/StrategyEditorService";
import { getLocalDateKey } from "../../../../../../../domain/utils/localDate";
import { createCoachingUpdatesReadService } from "../../../../../../../domain/services/CoachingUpdatesReadService";
import { resolveCoachingUpdatesGoalCadencePolicy } from "../../../../../../../domain/services/CoachingUpdatesGoalCadencePolicyService";
import {
  buildCoachingUpdatesRequest,
  createCoachingUpdatesEditorModel,
} from "../../../../../../../domain/services/CoachingUpdatesEditorService";
import { createCoachingUpdatesTransactionService } from "../../../../../../../domain/services/CoachingUpdatesTransactionService";
import { coachingUpdatesEditorMessage } from "../../../../../../../domain/services/StrategyEditorService";

export async function saveStrategy(context, _priorState, formData) {
  const protocolId = String(context?.protocolId ?? "");
  const strategyType = String(context?.strategyType ?? "");
  const expectedCurrentVersionId = String(context?.expectedCurrentVersionId ?? "");
  if (!["briefings", "nutrition", "training"].includes(strategyType)) return { message: "This strategy cannot be edited here." };
  const user = await FounderRepositories.users.getCurrentUser();
  const protocol = await FounderRepositories.protocols.getProtocolById(protocolId);
  if (!protocol || protocol.userId !== user.id || protocol.status !== "active" ||
      (protocol.protocolType ?? protocol.category) !== strategyType) {
    return { message: "This strategy is no longer available." };
  }
  const version = await FounderRepositories.protocolVersions.getCurrentVersion(protocol.id);
  if (!version) return { message: "This strategy is not ready to edit." };
  if (strategyType === "briefings") {
    const goal = await FounderRepositories.goals.getActiveGoal(user.id);
    const readModel = await createCoachingUpdatesReadService({ repositories: FounderRepositories })
      .getCurrent({ protocolId, userId: user.id });
    const model = createCoachingUpdatesEditorModel({
      readModel,
      policy: resolveCoachingUpdatesGoalCadencePolicy(goal),
    });
    if (!model || !goal) return { message: "These coaching settings are not available right now." };
    const requested = buildCoachingUpdatesRequest(formData, model);
    const liveStore = getFounderRuntimeStore();
    const result = await createCoachingUpdatesTransactionService({
      runtimeStorePath: resolveFounderRuntimeStorePath(),
      liveStore,
    }).update({
      protocolId,
      expectedCurrentVersionId,
      effectiveDate: getLocalDateKey(),
      ...requested,
      goalAssociation: { goalId: goal.id, relationship: "supports" },
      provenance: {
        author: { type: "user", id: user.id, displayName: user.displayName ?? "Founder" },
        reason: "Update active Coaching Updates strategy.",
        confirmation: { confirmedByUser: true, authority: "founder_direct_strategy_edit" },
        details: { source: "direct_coaching_updates_edit" },
      },
    });
    if (result.outcome !== "success") return { message: coachingUpdatesEditorMessage(result.outcome) };
    const detailPath = `/profile/operating-plan/strategy/briefings/${encodeURIComponent(protocolId)}`;
    revalidatePath(detailPath);
    revalidatePath("/profile/operating-plan");
    revalidatePath("/");
    revalidatePath("/briefing/daily");
    redirect(`${detailPath}?saved=1`);
  }
  const built = buildStrategySuccessorPayload({ form: formData, protocol, strategyType, version });
  if (!built.valid) return { message: built.outcome ? strategyEditorMessage(built.outcome) : built.error };
  const goalId = protocol.currentGoalIds?.[0];
  const liveStore = getFounderRuntimeStore();
  const result = await createActiveProtocolSuccessorService({
    runtimeStorePath: resolveFounderRuntimeStorePath(),
    liveStore,
  }).createSuccessor({
    protocolId,
    expectedCurrentVersionId,
    successorVersion: built.successorVersion,
    effectiveDate: getLocalDateKey(),
    goalAssociation: { goalId, relationship: "supports" },
    provenance: {
      author: { type: "user", id: user.id, displayName: user.name ?? "Founder" },
      reason: `Update active ${strategyType} strategy.`,
      confirmation: { confirmedByUser: true, authority: "founder_direct_strategy_edit" },
      details: { source: "direct_strategy_edit" },
    },
  });
  if (result.outcome !== "success") return { message: strategyEditorMessage(result.outcome) };
  const detailPath = `/profile/operating-plan/strategy/${strategyType}/${encodeURIComponent(protocolId)}`;
  revalidatePath(detailPath);
  revalidatePath("/profile/operating-plan");
  redirect(`${detailPath}?saved=1`);
}
