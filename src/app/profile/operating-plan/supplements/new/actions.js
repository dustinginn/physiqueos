"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { loadApplicationRuntimeBindings } from "../../../../../application/runtime/ApplicationCanonicalRuntime";
import { createSupplementStrategyManagementService } from "../../../../../domain/services/SupplementStrategyManagementService";
import { buildSupplementProvenance, readSupplementFormValues, supplementManagementMessage } from "../../../../../domain/services/SupplementStrategyFormService";

export async function addSupplement(_priorState, formData) {
  const values = readSupplementFormValues(formData);
  const user = await FounderRepositories.users.getCurrentUser();
  const slug = values.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "supplement";
  const result = await createSupplementStrategyManagementService({
    ...(await loadApplicationRuntimeBindings()),
  }).create({
    ...values,
    userId: user.id,
    protocolId: `protocol_supplement_${slug}_${randomUUID().slice(0, 8)}`,
    provenance: buildSupplementProvenance(user, "Add supplement strategy.", "direct_supplement_creation"),
  });
  if (result.outcome !== "success") return { message: supplementManagementMessage(result.outcome), values };
  revalidatePath("/profile/operating-plan");
  redirect(`/profile/protocols/${encodeURIComponent(result.protocolId)}?from=operating-plan&created=1`);
}
