"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../../../../data/repositories/founderRuntimeStore";
import { buildRecurringSupportDraftFromFormData, createRecurringSupportManagementService } from "../../../../../domain/services/RecurringSupportManagementService";
import { MORNING_WEIGH_IN_EXECUTION_ID, MORNING_WEIGH_IN_REMINDER_ID } from "../../../../../domain/services/TrackingSupportService";

export async function saveMorningWeighInSupport(context, _previousState, formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  const [execution, protocol, reminders] = await Promise.all([
    FounderRepositories.executionItems.getExecutionItemById(context.executionId),
    FounderRepositories.protocols.getProtocolById(context.protocolId),
    FounderRepositories.reminders.listReminders(user.id),
  ]);
  const reminder = reminders.find((item) => item.id === context.reminderId);
  if (!execution || execution.userId !== user.id || execution.id !== MORNING_WEIGH_IN_EXECUTION_ID ||
      !protocol || protocol.userId !== user.id || protocol.status !== "active" ||
      ![protocol.category, protocol.protocolType].includes("weight") ||
      !reminder || reminder.id !== MORNING_WEIGH_IN_REMINDER_ID || reminder.linkedEntityId !== protocol.id) {
    return { message: "Morning Weigh-In Support is no longer available." };
  }
  if (Number(context.expectedRevision) !== Number(execution.executionRevision ?? 1)) {
    return { message: "This Support schedule changed while you were editing it. Review the latest version and try again." };
  }
  const result = await createRecurringSupportManagementService({
    runtimeStorePath: resolveFounderRuntimeStorePath(),
    liveStore: getFounderRuntimeStore(),
  }).save({
    protocolId: protocol.id,
    protocolCategory: protocol.category,
    executionId: execution.id,
    reminderId: reminder.id,
    userId: user.id,
    expectedRevision: execution.executionRevision ?? 1,
    draft: buildRecurringSupportDraftFromFormData(formData),
  });
  if (result.outcome !== "success") {
    return { message: result.outcome === "unchanged" ? "No changes to save." : result.reason ?? "Review the Support settings and try again." };
  }
  revalidatePath("/profile/operating-plan", "page");
  revalidatePath("/profile/operating-plan/tracking", "page");
  revalidatePath("/profile/operating-plan/tracking/morning-weigh-in", "page");
  revalidatePath(`/priorities/${MORNING_WEIGH_IN_REMINDER_ID}`, "page");
  revalidatePath("/", "page");
  redirect("/profile/operating-plan/tracking");
}
