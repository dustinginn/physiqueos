"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../data/repositories/founderRepositories";
import { loadApplicationRuntimeBindings } from "../../../../../application/runtime/ApplicationCanonicalRuntime";
import { validateExecutionItem } from "../../../../../domain/models/executionItem";
import {
  createProgressPhotosExecutionScheduleService,
} from "../../../../../domain/services/ProgressPhotosExecutionScheduleService";
import {
  buildRecurringSupportDraftFromFormData,
  createRecurringSupportManagementService,
} from "../../../../../domain/services/RecurringSupportManagementService";

const PROGRESS_PHOTOS_ID = "execution_progress_photos";

export async function saveFoamRollingSupport(context, _previousState, formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  const [execution, protocol, reminders] = await Promise.all([
    FounderRepositories.executionItems.getExecutionItemById(context.executionId),
    FounderRepositories.protocols.getProtocolById(context.protocolId),
    FounderRepositories.reminders.listReminders(user.id),
  ]);
  const reminder = reminders.find((item) => item.id === context.reminderId);
  const draft = buildRecurringSupportDraftFromFormData(formData);

  if (
    !execution ||
    execution.userId !== user.id ||
    execution.id !== "execution_foam_roll" ||
    !protocol ||
    protocol.userId !== user.id ||
    protocol.category !== "recovery" ||
    protocol.status !== "active" ||
    !reminder ||
    reminder.linkedEntityId !== protocol.id
  ) {
    return { message: "Foam Rolling Support is no longer available." };
  }
  if (
    Number(context.expectedRevision) !==
    Number(execution.executionRevision ?? 1)
  ) {
    return {
      message: "This Support schedule changed while you were editing it. Review the latest version and try again.",
    };
  }

  const result = await createRecurringSupportManagementService({
    ...(await loadApplicationRuntimeBindings()),
  }).save({
    protocolId: protocol.id,
    protocolCategory: "recovery",
    executionId: execution.id,
    reminderId: reminder.id,
    userId: user.id,
    expectedRevision: execution.executionRevision ?? 1,
    draft,
  });

  if (result.outcome !== "success") {
    return {
      message:
        result.outcome === "unchanged"
          ? "No changes to save."
          : result.reason ?? "Review the Support settings and try again.",
    };
  }

  const strategyPath = `/profile/protocols/${encodeURIComponent(protocol.id)}?from=operating-plan`;
  revalidatePath("/profile/operating-plan", "page");
  revalidatePath(`/profile/operating-plan/execution/${encodeURIComponent(execution.id)}`, "page");
  revalidatePath(`/priorities/${encodeURIComponent(reminder.id)}`, "page");
  revalidatePath(strategyPath, "page");
  revalidatePath("/", "page");
  redirect(strategyPath);
}

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
  runtimeStorePath = null,
  liveStore = null,
  createUnitOfWork = null,
  createService = createProgressPhotosExecutionScheduleService,
} = {}) {
  if (!runtimeStorePath || !liveStore || !createUnitOfWork) {
    const bindings = await loadApplicationRuntimeBindings();
    runtimeStorePath ??= bindings.runtimeStorePath;
    liveStore ??= bindings.liveStore;
    createUnitOfWork ??= bindings.createUnitOfWork;
  }
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

  return createService({ runtimeStorePath, liveStore, createUnitOfWork }).save({
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
