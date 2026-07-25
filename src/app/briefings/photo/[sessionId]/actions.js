"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createVisibleAbsGoalCompletionService } from "../../../../domain/services/VisibleAbsGoalCompletionService";

export async function completeVisibleAbsGoal(formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  const photoSessionId = String(formData.get("photoSessionId") ?? "");
  const photoEventBriefingId = String(formData.get("photoEventBriefingId") ?? "");
  if (!user || !photoSessionId || !photoEventBriefingId) {
    throw new Error("Goal completion requires a user, PhotoSession, and Photo Event.");
  }
  await createVisibleAbsGoalCompletionService({ repositories: FounderRepositories }).complete({
    userId: user.id,
    photoSessionId,
    photoEventBriefingId,
  });
  revalidatePath("/");
  revalidatePath("/goals/visible-abs");
  revalidatePath(`/briefings/photo/${photoSessionId}`);
  redirect(`/briefings/photo/${photoSessionId}?completed=1`);
}
