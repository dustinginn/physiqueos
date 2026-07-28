"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../../../../data/repositories/founderRuntimeStore";
import { validateExecutionItem } from "../../../../../domain/models/executionItem";
import {
  createProgressPhotosExecutionScheduleService,
} from "../../../../../domain/services/ProgressPhotosExecutionScheduleService";

const PROGRESS_PHOTOS_ID = "execution_progress_photos";

export async function saveExecutionItem(previousState, submittedFormData) {
  const formData = submittedFormData ?? previousState;
  const id = String(formData.get("id"));

  if (id === PROGRESS_PHOTOS_ID) {
    const result = await saveProgressPhotosExecution(formData);

    if (result.committed || ["success", "unchanged"].includes(result.outcome)) {
      revalidateExecutionRoutes(id);
      redirect("/profile/operating-plan?execution=saved");
    }

    return {
      outcome: result.outcome,
      message: viewerMessage(result),
      values: Object.fromEntries(formData.entries()),
    };
  }

  const existing = await FounderRepositories.executionItems.getExecutionItemById(id);
  if (!existing) throw new Error("This Execution commitment is no longer available.");
  const cadenceType = String(formData.get("cadence"));
  const timeChoice = String(formData.get("timeChoice") || "");
  const item = {
    ...existing,
    cadence: { type: cadenceType },
    preferredSchedule: {
      date: cadenceType === "scheduled_date" ? String(formData.get("date") || "") : "",
      daysOfWeek: ["weekly", "specific_weekdays"].includes(cadenceType)
        ? String(formData.get("days") || "").split(",").filter(Boolean)
        : [],
      timeOfDay: timeChoice === "specific"
        ? String(formData.get("specificTime") || "")
        : timeChoice,
    },
    reminderPreference: String(formData.get("support") || existing.reminderPreference),
    notes: String(formData.get("notes") || ""),
    updatedAt: new Date().toISOString(),
  };
  const validation = validateExecutionItem(item);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  await FounderRepositories.executionItems.saveExecutionItem(item);
  revalidatePath("/profile/operating-plan");
  redirect("/profile/operating-plan?execution=saved");
}

export async function saveProgressPhotosExecution(formData, {
  repositories = FounderRepositories,
  runtimeStorePath = resolveFounderRuntimeStorePath(),
  liveStore = getFounderRuntimeStore(),
  createService = createProgressPhotosExecutionScheduleService,
} = {}) {
  const existing = await repositories.executionItems.getExecutionItemById(
    PROGRESS_PHOTOS_ID,
  );
  if (!existing) {
    return {
      outcome: "validation_failure",
      committed: false,
      reason: "This Execution commitment is no longer available.",
    };
  }
  const user = await repositories.users.getCurrentUser();
  const cadence = String(formData.get("cadence"));
  const timeChoice = String(formData.get("timeChoice") || "");

  return createService({ runtimeStorePath, liveStore }).save({
    protocolId: String(formData.get("protocolId")),
    expectedCurrentVersionId: String(formData.get("expectedCurrentVersionId")),
    expectedRevision: Number(formData.get("expectedRevision")),
    expectedSemanticDigest: String(formData.get("expectedSemanticDigest")),
    expectedLastCommitId: String(formData.get("expectedLastCommitId") || ""),
    expectedFileHash: String(formData.get("expectedFileHash") || ""),
    effectiveDate: String(formData.get("effectiveDate")),
    recurrence: {
      frequency: "weekly",
      interval: cadence === "weekly_interval_2" ? 2 : 1,
      weekdays: String(formData.get("days") || "").split(",").filter(Boolean),
      timeOfDay: timeChoice === "specific"
        ? String(formData.get("specificTime") || "")
        : timeChoice,
      timezone: String(formData.get("timezone")),
      anchorDate: String(formData.get("anchorDate")),
    },
    author: {
      type: "user",
      id: user.id,
      displayName: user.name ?? user.displayName ?? "Founder",
    },
  });
}

function revalidateExecutionRoutes(id) {
  revalidatePath("/profile/operating-plan");
  revalidatePath(`/profile/operating-plan/execution/${id}`);
  revalidatePath("/profile/operating-plan/execution");
}

function viewerMessage(result) {
  if (result.outcome === "baseline_conflict") {
    return "The plan changed while you were editing. Reload it before saving.";
  }
  if (result.outcome === "current_version_conflict") {
    return "The Progress Photos schedule changed. Reload it before saving.";
  }
  if (result.outcome === "validation_failure" || result.outcome === "invalid") {
    return result.reason ?? "Review the schedule and try again.";
  }
  if (result.outcome === "committed_publication_failure") {
    return "The schedule was saved, but this page could not refresh automatically.";
  }
  return result.reason ?? "We could not update this schedule. Nothing was changed.";
}
