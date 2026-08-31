"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadApplicationCanonicalCommitBindings } from "../../../application/runtime/ApplicationCanonicalRuntime";
import { createPriorityCompletionService } from "../../../application/priorities/PriorityCompletionService";

export async function completePriority(formData) {
  const priorityId = String(formData.get("priorityId") ?? "");

  if (!priorityId) {
    throw new Error("Priority id is required.");
  }

  const occurrenceDate = String(formData.get("occurrenceDate") ?? "");
  const dose = String(formData.get("dose") ?? "");
  const protocolId = String(formData.get("protocolId") ?? "");
  const bindings = await loadApplicationCanonicalCommitBindings();
  await createPriorityCompletionService({
    mutateCanonicalRuntime: bindings.mutateCanonicalRuntime,
  }).complete({ priorityId, occurrenceDate, dose, protocolId });

  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath(`/priorities/${priorityId}`);
  redirect("/");
}
