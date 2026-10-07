"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadApplicationCanonicalCommitBindings } from "../../../application/runtime/ApplicationCanonicalRuntime";
import { createPriorityCompletionService } from "../../../application/priorities/PriorityCompletionService";
import { createPrioritySkipService } from "../../../application/priorities/PrioritySkipService";

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

export async function skipPriority(_previousState, formData) {
  const command = {
    commandType: String(formData.get("commandType") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    payload: {
      priorityId: String(formData.get("priorityId") ?? ""),
      occurrenceDate: String(formData.get("occurrenceDate") ?? ""),
    },
  };
  try {
    const bindings = await loadApplicationCanonicalCommitBindings();
    const result = await createPrioritySkipService({
      mutateCanonicalRuntime: bindings.mutateCanonicalRuntime,
    }).skip(command);
    revalidatePath("/");
    revalidatePath(`/priorities/${command.payload.priorityId}`);
    return Object.freeze({ ok: true, status: result.status });
  } catch (error) {
    console.error("priority.skip.failed", { code: error?.code ?? "PRIORITY_SKIP_FAILED" });
    return Object.freeze({ ok: false, error: "That priority was not skipped. Refresh and try again." });
  }
}
