"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { loadApplicationRuntimeBindings } from "../../../../../../application/runtime/ApplicationCanonicalRuntime";
import {
  buildPeptideExecutionDraftFromFormData,
  buildPeptideSupportDraftFromFormData,
  classifyPeptideExecutionState,
  createPeptideExecutionManagementService,
  PeptideExecutionState,
} from "../../../../../../domain/services/PeptideExecutionManagementService";

export async function savePeptideExecution(context, _state, formData) {
  const user = await FounderRepositories.users.getCurrentUser();
  const protocol = await FounderRepositories.protocols.getProtocolById(
    context.protocolId
  );

  if (
    !protocol ||
    protocol.userId !== user.id ||
    protocol.category !== "peptide" ||
    protocol.status !== "active"
  ) {
    return {
      message: "This peptide is no longer available.",
    };
  }
  const supportEditor = context.supportEditor === "peptide_support_v1";
  const draft = supportEditor
    ? buildPeptideSupportDraftFromFormData(formData)
    : buildPeptideExecutionDraftFromFormData(formData);

  const items =
    await FounderRepositories.executionItems.listExecutionItems(user.id);
  const classification = classifyPeptideExecutionState({
    protocol,
    executionItems: items,
  });
  if (classification.state === PeptideExecutionState.INVALID) {
    return {
      message: "This peptide schedule is not available to edit right now.",
      values: draft,
    };
  }

  const existing = classification.record;
  if (
    (existing &&
      Number(context.expectedRevision) !==
        Number(existing.executionRevision ?? 1)) ||
    (!existing && context.expectedRevision != null)
  ) {
    return {
      message:
        "This peptide schedule changed while you were editing it. Review the latest version and try again.",
      values: draft,
    };
  }

  const result = await createPeptideExecutionManagementService({
    ...(await loadApplicationRuntimeBindings()),
  }).save({
    protocolId: protocol.id,
    userId: user.id,
    expectedRevision:
      existing?.executionRevision ?? (existing ? 1 : null),
    draft,
    author: {
      type: "user",
      id: user.id,
      displayName: user.displayName ?? "Founder",
    },
    synchronizeReminder: supportEditor,
    preservePriority: supportEditor,
    preserveTimelineHistory: supportEditor,
  });

  if (result.outcome !== "success") {
    return {
      message: viewerMessage(result),
      values: draft,
    };
  }

  const path =
    `/profile/operating-plan/execution/peptides/${encodeURIComponent(protocol.id)}`;
  const reminders =
    (await FounderRepositories.reminders?.listReminders?.(user.id)) ?? [];

  revalidatePath(path, "page");
  revalidatePath(`${path}?edit=1`, "page");
  revalidatePath("/profile/operating-plan", "page");
  revalidatePath("/", "page");
  reminders
    .filter(
      (reminder) =>
        reminder.type === "protocol_reminder" &&
        reminder.linkedEntityId === protocol.id
    )
    .forEach((reminder) => {
      revalidatePath(
        `/priorities/${encodeURIComponent(reminder.id)}`,
        "page"
      );
    });

  redirect(path);
}

function viewerMessage(result) {
  if (result.outcome === "unchanged") return "No changes to save.";
  if (result.outcome === "version_conflict") {
    return "This peptide schedule changed while you were editing it. Review the latest version and try again.";
  }
  if (
    result.outcome === "invalid" &&
    result.reason ===
      "Only the final dosing phase can continue until changed."
  ) {
    return "Add an end date to the previous phase before adding another phase.";
  }
  if (
    result.outcome === "invalid" &&
    [
      "Review each dosing phase and try again.",
      "Add a dose and unit for every phase.",
      "Check the start and end dates for each phase.",
      "Dosing phases cannot overlap.",
      "Arrange dosing phases in chronological order.",
    ].includes(result.reason)
  ) {
    return result.reason;
  }
  if (
    result.outcome === "invalid" &&
    /dosing phase|chronological/i.test(result.reason ?? "")
  ) {
    return "Review the dosing timeline and try again.";
  }
  if (result.outcome === "invalid") {
    return "Review the schedule and try again.";
  }

  return "We could not update this peptide schedule. Nothing was changed.";
}
