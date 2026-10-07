"use server";

import { revalidatePath } from "next/cache";
import { loadApplicationCanonicalCommitBindings } from "../application/runtime/ApplicationCanonicalRuntime";
import { createPriorityCompletionService } from "../application/priorities/PriorityCompletionService";
import { createPrioritySkipService } from "../application/priorities/PrioritySkipService";

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

export async function skipHomePriority(_previousState, formData) {
  const command = projectedSkipCommand(formData);
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

function projectedSkipCommand(formData) {
  return Object.freeze({
    commandType: String(formData.get("commandType") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
    payload: Object.freeze({
      priorityId: String(formData.get("priorityId") ?? ""),
      occurrenceDate: String(formData.get("occurrenceDate") ?? ""),
    }),
  });
}
