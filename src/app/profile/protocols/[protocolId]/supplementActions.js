"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from "../../../../data/repositories/founderRuntimeStore";
import { createSupplementStrategyManagementService } from "../../../../domain/services/SupplementStrategyManagementService";
import { getLocalDateKey } from "../../../../domain/utils/localDate";

export async function pauseSupplement(context) {
  return changeLifecycle("pause", context);
}
export async function restoreSupplement(context) {
  return changeLifecycle("restore", context);
}
async function changeLifecycle(method, context) {
  const user = await FounderRepositories.users.getCurrentUser();
  const service = createSupplementStrategyManagementService({
    runtimeStorePath: resolveFounderRuntimeStorePath(),
    liveStore: getFounderRuntimeStore(),
  });
  const result = await service[method]({
    ...context,
    userId: user.id,
    effectiveDate: getLocalDateKey(),
    provenance: {
      author: { type: "user", id: user.id, displayName: user.name ?? user.displayName ?? "Founder" },
      reason: `${method === "pause" ? "Pause" : "Restore"} supplement strategy.`,
      confirmation: { confirmedByUser: true, authority: "founder_direct_supplement_management" },
      details: { source: "direct_supplement_lifecycle" },
    },
  });
  if (result.outcome !== "success") redirect(`/profile/protocols/${encodeURIComponent(context.protocolId)}?from=operating-plan&unavailable=1`);
  revalidatePath("/profile/operating-plan");
  revalidatePath(`/profile/protocols/${context.protocolId}`);
  redirect(method === "pause" ? "/profile/operating-plan?supplement=paused" : `/profile/protocols/${encodeURIComponent(context.protocolId)}?from=operating-plan&restored=1`);
}
