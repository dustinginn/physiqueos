"use server";

import { revalidatePath } from "next/cache";
import { loadApplicationCanonicalCommitBindings } from "../application/runtime/ApplicationCanonicalRuntime";
import { createPriorityCompletionService } from "../application/priorities/PriorityCompletionService";

export async function completeHomePriority(_previousState, formData) {
  const priorityId = String(formData.get("priorityId") ?? "");

  if (!priorityId) return Object.freeze({ ok: false, error: "Priority id is required." });

  const occurrenceDate = String(formData.get("occurrenceDate") ?? "");
  const dose = String(formData.get("dose") ?? "");
  const protocolId = String(formData.get("protocolId") ?? "");
  try {
    const bindings = await loadApplicationCanonicalCommitBindings();
    const result = await createPriorityCompletionService({
      mutateCanonicalRuntime: bindings.mutateCanonicalRuntime,
    }).complete({ priorityId, occurrenceDate, dose, protocolId });

    revalidatePath("/");
    revalidatePath("/log");
    revalidatePath(`/priorities/${priorityId}`);
    return Object.freeze({
      ok: true,
      priorityId,
      status: result.status,
      completedAt: result.completion?.completedAt ?? null,
    });
  } catch (error) {
    console.error("priority.completion.failed", {
      code: error?.code ?? "PRIORITY_COMPLETION_FAILED",
    });
    return Object.freeze({
      ok: false,
      error: "That completion was not saved. Try again.",
    });
  }
}
