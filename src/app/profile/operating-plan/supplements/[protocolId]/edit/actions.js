"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { loadApplicationRuntimeBindings } from "../../../../../../application/runtime/ApplicationCanonicalRuntime";
import { createSupplementStrategyManagementService } from "../../../../../../domain/services/SupplementStrategyManagementService";
import { buildSupplementProvenance, readSupplementFormValues, supplementManagementMessage } from "../../../../../../domain/services/SupplementStrategyFormService";
import { getLocalDateKey } from "../../../../../../domain/utils/localDate";

export async function saveSupplementStrategy(context, _priorState, formData) {
  const values = readSupplementFormValues(formData, ["name", "purpose", "role", "goalId"]);
  const user = await FounderRepositories.users.getCurrentUser();
  const result = await createSupplementStrategyManagementService({
    ...(await loadApplicationRuntimeBindings()),
  }).edit({
    ...context,
    ...values,
    userId: user.id,
    effectiveDate: getLocalDateKey(),
    provenance: buildSupplementProvenance(user, "Update supplement strategy.", "direct_supplement_strategy_edit"),
  });
  if (result.outcome !== "success") return { message: supplementManagementMessage(result.outcome), values };
  revalidatePath("/profile/operating-plan");
  revalidatePath(`/profile/protocols/${context.protocolId}`);
  redirect(`/profile/protocols/${encodeURIComponent(context.protocolId)}?from=operating-plan&saved=1`);
}
