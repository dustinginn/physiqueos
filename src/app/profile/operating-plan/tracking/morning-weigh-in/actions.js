"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadProductionBoundedFounderReadContext } from "../../../../../application/composition/productionApplicationComposition";
import { finishDurableOperatingPlanSave } from "../../../../../application/plan/OperatingPlanSaveCompletion";
import { loadApplicationCanonicalCommitBindings } from "../../../../../application/runtime/ApplicationCanonicalRuntime";
import { buildRecurringSupportDraftFromFormData, createRecurringSupportManagementService } from "../../../../../domain/services/RecurringSupportManagementService";
import { MORNING_WEIGH_IN_EXECUTION_ID, MORNING_WEIGH_IN_REMINDER_ID } from "../../../../../domain/services/TrackingSupportService";

export async function saveMorningWeighInSupport(context, _previousState, formData) {
  const { repositories } = await loadProductionBoundedFounderReadContext({
    collections: ["user", "protocols"],
  });
  const user = await repositories.users.getCurrentUser();
  const protocol = await repositories.protocols.getProtocolById(context.protocolId);
  if (context.executionId !== MORNING_WEIGH_IN_EXECUTION_ID ||
      !protocol || protocol.userId !== user.id || protocol.status !== "active" ||
      ![protocol.category, protocol.protocolType].includes("weight") ||
      context.reminderId !== MORNING_WEIGH_IN_REMINDER_ID) {
    return { message: "Morning Weigh-In Support is no longer available." };
  }
  const result = await createRecurringSupportManagementService({
    ...(await loadApplicationCanonicalCommitBindings()),
  }).save({
    protocolId: protocol.id,
    protocolCategory: protocol.category,
    executionId: context.executionId,
    reminderId: context.reminderId,
    userId: user.id,
    expectedRevision: context.expectedRevision,
    draft: buildRecurringSupportDraftFromFormData(formData),
  });
  if (result.outcome !== "success") {
    return { message: result.outcome === "unchanged" ? "No changes to save." : result.reason ?? "Review the Support settings and try again." };
  }
  const refresh = finishDurableOperatingPlanSave({
    paths: [
      "/profile/operating-plan",
      "/profile/operating-plan/tracking",
      "/profile/operating-plan/tracking/morning-weigh-in",
      `/priorities/${MORNING_WEIGH_IN_REMINDER_ID}`,
      "/",
    ],
    revalidate: revalidatePath,
  });
  if (!refresh.refreshed) {
    return {
      saved: true,
      message: "Saved. This page could not refresh automatically.",
    };
  }
  redirect("/profile/operating-plan/tracking");
}
